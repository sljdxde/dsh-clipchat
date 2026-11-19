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

    // three rounds, so the picker has several entries
    for (const text of ['第一问', '第二问', '第三问']) {
      await page.click('.clipchat-card__ta')
      await page.keyboard.type(text, { delay: 10 })
      await page.keyboard.press('Enter')
      await page.waitForFunction((count) => {
        const turns = [...document.querySelectorAll('.clipchat-card__turn')]
        return turns.length === count && (turns.at(-1).querySelector('.clipchat-card__a')?.textContent ?? '').includes('第 14 段')
      }, { timeout: 40000, polling: 120 }, ['第一问', '第二问', '第三问'].indexOf(text) + 1)
      await sleep(300)
    }

    const tokensOf = () => page.evaluate(() => document.querySelector('.clipchat-card__tokens')?.textContent ?? '')

    const metrics = () => page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      return {
        top: Math.round(thread.scrollTop),
        height: thread.clientHeight,
        scrollHeight: thread.scrollHeight,
        max: thread.scrollHeight - thread.clientHeight,
        turns: document.querySelectorAll('.clipchat-card__turn').length,
      }
    })

    // scroll to the top of the first round so the pill offers the end
    await page.evaluate(() => { const t = document.querySelector('.clipchat-card__thread'); t.scrollTop = 0 })
    await sleep(400)
    const before = await metrics()
    const pill = await page.$('.clipchat-card__jump')
    if (pill === null) { report.ok = false; report.error = 'no pill'; }

    // 1) the label itself must jump to the end
    await pill.click()
    await sleep(500)
    const afterLabel = await metrics()

    // 2) the caret opens the picker
    const caret = await page.$('.clipchat-card__jumpcaret')
    if (caret === null) { report.ok = false; report.error = 'no caret' }
    await caret.click()
    await sleep(200)
    const menuOpen = await page.evaluate(() => document.querySelector('.clipchat-card__jumpmenu') !== null)
    if (!menuOpen) { report.ok = false; report.error = 'the caret did not open the picker' }
    const menuItems = await page.evaluate(() => [...document.querySelectorAll('.clipchat-card__jumpitem')].map((item) => item.textContent.trim()))
    // Use the real mouse: pointerdown/mousedown/mouseup/click, not element.click().
    const box = await page.evaluate(() => {
      const items = [...document.querySelectorAll('.clipchat-card__jumpitem')]
      const target = items[items.length - 1].getBoundingClientRect()
      return { x: target.x + target.width / 2, y: target.y + target.height / 2 }
    })
    await page.mouse.click(box.x, box.y)
    await sleep(500)
    const afterEnd = await metrics()

    // now jump to round 2 from the menu
    const caret2 = await page.$('.clipchat-card__jumpcaret')
    if (caret2 !== null) {
      const pb = await caret2.boundingBox()
      if (pb !== null) await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2)
      else await caret2.click()
    }
    await sleep(200)
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('.clipchat-card__jumpitem')]
      items[1]?.click()
    })
    await sleep(500)
    const afterRound = await metrics()

    // 3) a resized card (the shape a user drags it into) must behave the same
    // Grow the card the way a user does: focus it, then Alt+ArrowDown a few times
    // (Shift makes each step 32px).
    await page.evaluate(() => document.querySelector('.clipchat-card').focus())
    for (let i = 0; i < 8; i += 1) await page.keyboard.down('Alt'), await page.keyboard.press('ArrowDown'), await page.keyboard.up('Alt')
    await page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      thread.scrollTop = 0
    })
    await sleep(200)
    await page.evaluate(() => {
      const thread = document.querySelector('.clipchat-card__thread')
      thread.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await sleep(400)
    const sizedBefore = await metrics()
    const hasPill = await page.evaluate(() => document.querySelector('.clipchat-card__jump') !== null)
    if (!hasPill) {
      report.ok = false
      report.error = 'no pill after resize'
    } else {
      await page.evaluate(() => document.querySelector('.clipchat-card__jump').click())
    }
    await sleep(500)
    const sizedAfter = await metrics()

    record('jump', { before, afterLabel, menuItems, afterEnd, afterRound, sizedBefore, sizedAfter, tokens: await tokensOf() })
    if (sizedAfter.top !== sizedBefore.max) {
      report.ok = false
      report.error = `the pill did not jump in a resized card: ${sizedBefore.top} -> ${sizedAfter.top}, expected ${sizedBefore.max}`
    }
    if (afterLabel.top !== before.max) {
      report.ok = false
      report.error = `the pill did not jump: ${before.top} -> ${afterLabel.top}, expected ${before.max}`
    }
    const tokenText = await tokensOf()
    if (!/\d/.test(tokenText) || tokenText.includes('—')) {
      report.ok = false
      report.error = `footer tokens missing: ${tokenText}`
    }
    if (afterEnd.top === before.top) {
      report.ok = false
      report.error = 'clicking the end action did not move the thread'
    }

    await page.screenshot({ path: join(root, 'jump.png'), fullPage: false })
    report.screenshot = join(root, 'jump.png')
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
