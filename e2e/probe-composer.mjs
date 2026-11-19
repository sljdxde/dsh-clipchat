#!/usr/bin/env node
/**
 * Real-browser probe for the composer changes: three-row autosize, long-paste
 * folding, attachments, and "the view does not chase the answer".
 *
 * It boots the same throwaway DSH home / mock provider / fixture session as the
 * E2E suite, then drives the real Web surface with Chrome. Prints a JSON report
 * and exits non-zero when an assertion fails.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { launchBrowser } from './lib/browser.mjs'
import { assertDshBin, dumpConfig, resolveDshBin, startWeb } from './lib/dsh.mjs'
import { generateSeedSession, purgeProjectionCache, TARGET_TURN } from './lib/fixture.mjs'
import { startMockLlm } from './lib/mock-llm.mjs'
import { findFreePort } from './lib/port.mjs'
import { assertPluginLink, writeProfiles } from './lib/profile.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A long answer, so the end of it is past the visible thread. */
const LONG_ANSWER = Array.from({ length: 14 }, (_, index) => `第 ${index + 1} 段：这里故意写长一点，用来验证回答变长时视图不会被拉走。`).join('\n\n')

function patch() {
  return `# Composer probe: plaintext logs, a local mock provider, no telemetry.
- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('sessions')
    compression: none
- id: llm-pi-ai
  config:
    providers:
      local-demo:
        displayName: 本地演示
        apiKeyEnv: E2E_MOCK_API_KEY
        api: openai-completions
        baseURL: !!js process.env.E2E_MOCK_BASE_URL
        models:
          - id: demo
            name: 本地演示模型
            contextWindow: 200000
            maxTokens: 8192
            input: [text, image]
- id: agent-default-model
  config:
    provider: local-demo
    model: demo
- id: session-telemetry-otel
  disabled: true
`
}

async function click(page, selector) {
  return await page.evaluate((css) => {
    const element = document.querySelector(css)
    if (element === null) return false
    element.click()
    return true
  }, selector)
}

async function openSession(page, sessionId) {
  const selector = `[data-row-key="session:${sessionId}"]`
  await page.waitForSelector(selector, { timeout: 30_000 })
  await click(page, selector)
  await page.waitForSelector('[data-chat-turn]', { timeout: 30_000 })
  await sleep(1200)
}

async function jumpToTurn(page, turn) {
  await page.evaluate((wanted) => {
    const marks = [...document.querySelectorAll('button[data-index][aria-label]')]
      .filter((mark) => (mark.getAttribute('aria-label') ?? '').includes('轮'))
    if (marks.length === 0) return
    const anchor = marks[0]
    let scroller = anchor.parentElement
    while (scroller !== null) {
      const style = getComputedStyle(scroller)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && scroller.scrollHeight > scroller.clientHeight) break
      scroller = scroller.parentElement
    }
    if (scroller === null) return
    const index = Number.parseInt(anchor.getAttribute('data-index') ?? '', 10)
    const offset = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const pitch = Number.isInteger(index) && index > 0 && offset > 0 ? offset / index : 10
    scroller.scrollTop = Math.max(0, (wanted - 1) * pitch - scroller.clientHeight / 2)
  }, turn)
  await sleep(700)
  await page.evaluate((wanted) => {
    const label = [...document.querySelectorAll('button[aria-label]')]
      .find((candidate) => (candidate.getAttribute('aria-label') ?? '') === `加载并跳转到第 ${wanted} 轮`
        || (candidate.getAttribute('aria-label') ?? '') === `跳转到第 ${wanted} 轮`)
    label?.click()
  }, turn)
  await page.waitForSelector(`[data-chat-turn="${turn}"]`, { timeout: 20_000 })
  await sleep(6000)
}

async function openCardOnTurn(page, turn) {
  await page.evaluate((wanted) => {
    document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
      ?.scrollIntoView({ block: 'center' })
  }, turn)
  await sleep(600)
  const box = await page.evaluate((wanted) => {
    for (const paragraph of document.querySelectorAll(
      `[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"] [data-text-interaction-source] p`,
    )) {
      const rect = paragraph.getBoundingClientRect()
      if (rect.height > 0 && rect.width > 0) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return null
  }, turn)
  if (box === null) throw new Error('no assistant paragraph')
  const middle = box.y + box.height / 2
  await page.mouse.move(box.x + 1, middle)
  await page.mouse.down()
  await page.mouse.move(box.x + 10, middle)
  await page.mouse.move(box.x + box.width - 2, middle, { steps: 12 })
  await page.mouse.up()
  await page.waitForSelector('.clipchat-menu__ask', { timeout: 5000 })
  await sleep(600)
  await click(page, '.clipchat-menu__ask')
  await page.waitForSelector('.clipchat-card__ta', { timeout: 10_000 })
  await sleep(600)
}

async function main() {
  const runId = `${Date.now()}-${process.pid}`
  const root = join(tmpdir(), `dsh-clipchat-probe-${runId}`)
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await mkdir(home, { recursive: true, mode: 0o700 })

  const dshBin = resolveDshBin()
  await assertDshBin(dshBin)
  await writeProfiles({ home, dshBin })
  await assertPluginLink(join(home, 'profiles', 'e2e-web'))
  for (const profile of ['e2e-web', 'e2e-headless']) {
    await writeFile(join(home, 'profiles', profile, 'cordis.patch.yml'), patch())
  }
  const env = { ...process.env, DSH_HOME: home, E2E_MOCK_API_KEY: 'mock-e2e' }
  await dumpConfig({ dshBin, env, profile: 'e2e-web' })

  const mock = await startMockLlm({ log: async () => {}, answer: () => LONG_ANSWER })
  env.E2E_MOCK_BASE_URL = mock.baseUrl

  const report = { steps: [], ok: true }
  const record = (name, detail) => report.steps.push({ name, ...detail })

  let web = null
  let browser = null
  try {
    const seed = await generateSeedSession({ dshBin, env, cwd: workspace, logPath: join(root, 'fixture.log') })
    await purgeProjectionCache(home, seed.sessionId)
    const port = await findFreePort()
    web = await startWeb({ dshBin, env, cwd: workspace, port, logPath: join(root, 'web.log') })

    browser = await launchBrowser({})
    const page = await browser.browser.newPage()
    await page.setViewport({ width: 1200, height: 900 })
    await page.goto(web.url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-row-key]', { timeout: 30_000 })
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => /^(继续|Continue)$/u.test((candidate.textContent ?? '').trim()))
      button?.click()
    })
    await openSession(page, seed.sessionId)
    // The tail is already mounted; no rail jump needed for this probe.
    const latestTurn = await page.evaluate(() => Math.max(
      ...[...document.querySelectorAll('[data-chat-turn]')].map((row) => Number(row.getAttribute('data-chat-turn'))),
    ))
    await openCardOnTurn(page, latestTurn)

    // 1. autosize: type past three rows
    await page.click('.clipchat-card__ta')
    for (let line = 0; line < 5; line += 1) {
      await page.keyboard.type(`第${line + 1}行文字`, { delay: 8 })
      await page.keyboard.down('Shift')
      await page.keyboard.press('Enter')
      await page.keyboard.up('Shift')
    }
    await page.keyboard.type('最后一行', { delay: 8 })
    await sleep(200)
    const autosize = await page.evaluate(() => {
      const ta = document.querySelector('.clipchat-card__ta')
      return {
        height: Math.round(ta.getBoundingClientRect().height),
        scrollHeight: ta.scrollHeight,
        clientHeight: ta.clientHeight,
        capped: ta.classList.contains('is-capped'),
      }
    })
    record('autosize', autosize)
    if (!(autosize.height <= 62 && autosize.capped && autosize.scrollHeight > autosize.clientHeight)) {
      report.ok = false
      report.error = 'the box did not cap at three rows'
    }

    // 2. long paste becomes a snippet
    await page.evaluate(() => {
      const ta = document.querySelector('.clipchat-card__ta')
      ta.focus()
      ta.select()
      document.execCommand?.('delete')
    })
    await page.evaluate(() => {
      const ta = document.querySelector('.clipchat-card__ta')
      const data = new DataTransfer()
      data.setData('text/plain', '第一段\n第二段\n第三段\n第四段\n第五段')
      const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data })
      ta.dispatchEvent(event)
    })
    await sleep(250)
    const folded = await page.evaluate(() => ({
      snippets: document.querySelectorAll('.clipchat-card__snippet').length,
      value: document.querySelector('.clipchat-card__ta').value,
    }))
    record('fold-paste', folded)
    if (folded.snippets !== 1 || folded.value.length !== 0) {
      report.ok = false
      report.error = 'a long paste did not fold into a snippet'
    }

    // 3. attach a real PNG through the file input
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const shotPath = join(root, 'probe-shot.png')
    await writeFile(shotPath, png)
    const fileInput = await page.$('input[type="file"]')
    await fileInput.uploadFile(shotPath)
    await sleep(400)
    const attached = await page.evaluate(() => ({
      thumbs: document.querySelectorAll('.clipchat-card__thumb').length,
      chip: document.querySelectorAll('.clipchat-card__fchip').length,
    }))
    record('attach', attached)
    if (attached.thumbs !== 1) {
      report.ok = false
      report.error = 'the image attachment did not render'
    }

    // 4. ask; the view must not chase the answer
    const before = await page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      return { top: thread.scrollTop, height: thread.clientHeight }
    })
    await page.click('.clipchat-card__ta')
    await page.keyboard.type('结合这张图说明一下', { delay: 15 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const answer = document.querySelector('.clipchat-card__a')
      return answer !== null && (answer.textContent ?? '').includes('第 14 段')
    }, { timeout: 40_000, polling: 120 })
    await sleep(600)
    const after = await page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      const turn = [...document.querySelectorAll('.clipchat-card__turn')].at(-1)
      const q = turn.querySelector('.clipchat-card__q')
      const pill = document.querySelector('.clipchat-card__jump')
      return {
        top: thread.scrollTop,
        qTop: Math.round(q.getBoundingClientRect().top - thread.getBoundingClientRect().top),
        pill: pill === null ? null : pill.textContent,
        qHasImage: turn.querySelectorAll('.clipchat-card__q .clipchat-card__thumb').length,
        qHasSnippet: turn.querySelectorAll('.clipchat-card__q .clipchat-card__snippet').length,
      }
    })
    record('after-answer', { before, after })
    if (after.top !== before.top) {
      report.ok = false
      report.error = `the thread scrolled while the answer was rendering (${before.top} -> ${after.top})`
    }
    if (after.qHasImage !== 1 || after.qHasSnippet !== 1) {
      report.ok = false
      report.error = 'the question bubble lost its attachment or snippet'
    }

    // 4b. the footer reports this round's tokens, not a dash
    const tokenLine = await page.evaluate(() => document.querySelector('.clipchat-card__tokens')?.textContent ?? '')
    record('tokens', { tokenLine })
    if (!/\d/.test(tokenLine) || tokenLine.includes('—')) {
      report.ok = false
      report.error = `the footer did not report tokens: ${tokenLine}`
    }

    // 4c. a second round, then the pill's round picker lists both
    await page.click('.clipchat-card__ta')
    await page.keyboard.type('再问一轮', { delay: 15 })
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => {
      const turns = [...document.querySelectorAll('.clipchat-card__turn')]
      const last = turns.at(-1)
      return turns.length === 2 && last !== undefined && (last.querySelector('.clipchat-card__a')?.textContent ?? '').includes('第 14 段')
    }, { timeout: 40_000, polling: 120 })
    await sleep(500)
    await page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      thread.scrollTop = Math.max(0, thread.scrollTop - 40)
    })
    await sleep(300)
    // The control is a split button: the text half jumps, the caret opens the
    // round list. Clicking the caret is what the design documents.
    const caret = await page.$('.clipchat-card__jumpcaret')
    if (caret !== null) {
      await caret.click()
      await sleep(250)
      const picker = await page.evaluate(() => ({
        items: [...document.querySelectorAll('.clipchat-card__jumpitem')].map((item) => item.textContent.trim()),
      }))
      record('round-picker', picker)
      if (picker.items.length !== 3) {
        report.ok = false
        report.error = `the round picker listed ${picker.items.length} items`
      }
      await page.screenshot({ path: join(root, 'jump-menu.png'), fullPage: false })
      report.menuScreenshot = join(root, 'jump-menu.png')
      await caret.click()
      await sleep(150)
    } else {
      report.ok = false
      report.error = 'the round picker never appeared for two rounds'
    }

    // 5. "back to main" rides one atomic quote, the way 引用文本 does: the
    //    composer shows a compact chip (not the whole thread), while the
    //    message it sends still carries every round for the mainline model.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.clipchat-actions__btn')]
        .find((candidate) => (candidate.textContent ?? '').includes('带回主线'))
      button?.click()
    })
    await sleep(700)
    const mainComposer = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
        .filter((element) => element.closest('.clipchat-card') === null)
      const field = candidates.at(-1)
      if (field === undefined) return null
      const value = 'value' in field ? field.value : (field.textContent ?? '')
      return {
        length: value.length,
        hasQuoteChip: document.querySelector('[data-composer-quote]') !== null,
        hasRounds: /〔滑词〕2 轮问答/u.test(value),
        hasNewestQuestion: value.includes('再问一轮'),
        showsWholeAnswer: value.includes('第 14 段'),
        head: value.slice(0, 80),
      }
    })
    record('back-to-main-composer', mainComposer ?? { missing: true })
    if (mainComposer === null || mainComposer.hasQuoteChip !== true) {
      report.ok = false
      report.error = 'back to main did not insert a quote chip'
    } else if (mainComposer.hasRounds !== true || mainComposer.hasNewestQuestion !== true) {
      report.ok = false
      report.error = 'the quote chip did not summarize the thread'
    } else if (mainComposer.showsWholeAnswer === true || mainComposer.length > 400) {
      report.ok = false
      report.error = 'the composer still shows the whole transcript instead of a quote'
    }

    // Send it: the user message must still carry the full thread (that is what
    // the mainline model reads), even though the bubble stays collapsed.
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')]
        .find((candidate) => ['发送消息', 'Send message'].includes(candidate.getAttribute('aria-label') ?? ''))
      button?.click()
    })
    await page.waitForFunction(() => {
      const bubbles = [...document.querySelectorAll('[data-message-bubble]')]
      const text = bubbles.at(-1)?.textContent ?? ''
      return text.includes('问：再问一轮')
    }, { timeout: 30_000, polling: 150 }).catch(() => {})
    const sentMessage = await page.evaluate(() => {
      const bubbles = [...document.querySelectorAll('[data-message-bubble]')]
      const text = bubbles.at(-1)?.textContent ?? ''
      return {
        length: text.length,
        hasFirstRound: text.includes('问：结合这张图说明一下'),
        hasSecondRound: text.includes('问：再问一轮'),
        hasLast: text.includes('第 14 段'),
      }
    })
    record('back-to-main-message', sentMessage)
    if (sentMessage.hasSecondRound !== true || sentMessage.hasLast !== true) {
      report.ok = false
      report.error = 'the sent message lost the thread or its answer'
    }

    await page.screenshot({ path: join(root, 'composer.png'), fullPage: false })
    report.screenshot = join(root, 'composer.png')
    report.sessionId = seed.sessionId
    report.web = web.url.replace(/token=[^&]+/u, 'token=***')
  } finally {
    try { await browser?.browser.close() } catch { /* ignore */ }
    try { await web?.handle?.stop?.() } catch { /* ignore */ }
    try { await mock?.close?.() } catch { /* ignore */ }
  }

  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}

await main()
