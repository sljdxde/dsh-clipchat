#!/usr/bin/env node
/**
 * Real-host probe for the height cap after a width-only gesture.
 *
 * The report: after the width alone was resized (or Home was pressed), a long
 * answer pushed the card past the stylesheet's `min(520px, 64vh)` cap — one run
 * measured 1595px on a 900px viewport. The cap was cleared by the inline
 * `max-height:none` that a pinned width used to write.
 *
 * This probe asks the mock provider for an answer several screens long against
 * the real host, resizes the width only, presses Home, and then pulls a height
 * the user chose to prove that a height they picked is still not capped.
 *
 * Usage: node e2e/probe-host-height-cap.mjs [outDir]
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { attachPageLogs, launchBrowser } from './lib/browser.mjs'
import { assertDshBin, dumpConfig, resolveDshBin, startWeb } from './lib/dsh.mjs'
import { generateSeedSession, purgeProjectionCache, rewriteFixture } from './lib/fixture.mjs'
import { startMockLlm } from './lib/mock-llm.mjs'
import { createRunDirs, makeRunId, pathsFor } from './lib/paths.mjs'
import { findFreePort } from './lib/port.mjs'
import { writeProfiles } from './lib/profile.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-height-cap-shots')
const checks = []
function record(name, passed, detail) {
  checks.push({ name, passed, detail })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}\n`)
}

/** An answer long enough that at 600px wide it is several screens tall. */
function longAnswer() {
  const lines = ['E2E_LONG_ANSWER 下面是一段很长的回答，用来把卡片撑高。', '']
  for (let index = 1; index <= 80; index += 1) {
    lines.push(`第 ${index} 段：这一段用来占高度，内容本身没有意义，只负责让回答比卡片高得多。段落里再补一句，保证换行之后仍然占两行以上的高度。`)
    lines.push('')
  }
  lines.push('| 档位 | 携带 | 成本 |', '| --- | --- | ---: |', '| 默认 | 选段 | 2-6k |')
  return lines.join('\n')
}

async function clickSelector(page, selector) {
  return await page.evaluate((css) => {
    const element = document.querySelector(css)
    if (element === null) return false
    element.click()
    return true
  }, selector)
}

async function openSession(page, sessionId) {
  const selector = `[data-row-key="session:${sessionId}"]`
  await page.waitForSelector(selector, { timeout: 20_000 })
  const alreadyOpen = await page.evaluate((css) => {
    const row = document.querySelector(css)
    return row !== null && row.getAttribute('aria-selected') === 'true' && document.querySelector('[data-chat-turn]') !== null
  }, selector)
  if (!alreadyOpen) await clickSelector(page, selector)
  await page.waitForSelector('[data-chat-turn]', { timeout: 20_000 })
  await sleep(1200)
}

/** Select a paragraph and open the card through the real menu. */
async function openCard(page) {
  await page.evaluate(() => {
    for (const paragraph of document.querySelectorAll('[data-chat-turn] [data-text-interaction-source] p')) {
      if (!(paragraph.textContent ?? '').includes('E2E_TURN')) continue
      paragraph.scrollIntoView({ block: 'center' })
      return
    }
  })
  await sleep(350)
  const box = await page.evaluate(() => {
    for (const paragraph of document.querySelectorAll('[data-chat-turn] [data-text-interaction-source] p')) {
      const rect = paragraph.getBoundingClientRect()
      if (rect.height <= 0 || rect.width <= 0) continue
      if (rect.top < 120 || rect.bottom > window.innerHeight - 200) continue
      if (!(paragraph.textContent ?? '').includes('E2E_TURN')) continue
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return null
  })
  if (box === null) throw new Error('no mounted assistant paragraph to select')
  for (const rightToLeft of [false, true]) {
    const middle = box.y + box.height / 2
    const startX = rightToLeft ? box.x + box.width - 2 : box.x + 1
    const endX = rightToLeft ? box.x + 1 : box.x + box.width - 2
    await page.mouse.move(startX, middle)
    await page.mouse.down()
    await page.mouse.move(rightToLeft ? startX - 10 : startX + 10, middle)
    await page.mouse.move(endX, middle, { steps: 12 })
    await page.mouse.up()
    try {
      await page.waitForSelector('.clipchat-menu__ask', { timeout: 2000 })
      await clickSelector(page, '.clipchat-menu__ask')
      await page.waitForSelector('.clipchat-card', { timeout: 10_000 })
      await sleep(700)
      return true
    } catch { /* try the other direction */ }
  }
  throw new Error('selection never opened the ask menu')
}

/** Ask the card a question and wait until the streamed answer has stopped. */
async function askCard(page, question) {
  const turns = await page.evaluate(() => document.querySelectorAll('.clipchat-card__turn').length)
  await page.click('.clipchat-card__ta')
  await page.type('.clipchat-card__ta', question, { delay: 5 })
  await page.click('.clipchat-card__send')
  await page.waitForFunction((count) => document.querySelectorAll('.clipchat-card__turn').length > count, { timeout: 20_000 }, turns)
  // The send button turns into the stop square while the answer streams.
  await page.waitForFunction(() => {
    const send = document.querySelector('.clipchat-card__send')
    return send !== null && send.textContent !== '■'
  }, { timeout: 90_000 })
  await sleep(400)
}

/** The card's height, the cap the stylesheet asks for, and whether its answer scrolls. */
async function measure(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    const style = getComputedStyle(card)
    const thread = card.querySelector('.clipchat-card__thread')
    const bar = card.querySelector('.clipchat-card__bar').getBoundingClientRect()
    const gripE = card.querySelector('.clipchat-card__grip--e').getBoundingClientRect()
    const gripSe = card.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
    return {
      height: Math.round(rect.height),
      width: Math.round(rect.width),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      cap: Math.min(520, Math.round(window.innerHeight * 0.64)),
      maxHeight: style.maxHeight,
      inline: { width: card.style.width, height: card.style.height, maxHeight: card.style.maxHeight },
      thread: thread === null ? null : { client: thread.clientHeight, scroll: thread.scrollHeight },
      bar: { x: bar.left + Math.min(120, bar.width / 2), y: bar.top + bar.height / 2 },
      gripE: { x: gripE.right - 4, y: gripE.top + gripE.height / 2 },
      gripSe: { x: gripSe.right - 6, y: gripSe.bottom - 6 },
      className: card.className,
    }
  })
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const runId = makeRunId()
  const paths = pathsFor(runId)
  await createRunDirs(paths)
  const dshBin = resolveDshBin()
  await assertDshBin(dshBin)
  await writeProfiles({ home: paths.home, dshBin })
  const baseEnv = { ...process.env, DSH_HOME: paths.home, E2E_MOCK_API_KEY: 'mock-e2e' }
  await dumpConfig({ dshBin, env: baseEnv, profile: 'e2e-web' })
  const mock = await startMockLlm({ log: () => {}, answer: () => longAnswer() })
  baseEnv.E2E_MOCK_BASE_URL = mock.baseUrl

  let web = null
  let browser = null
  try {
    const seed = await generateSeedSession({ dshBin, env: baseEnv, cwd: paths.workspace, logPath: join(paths.artifactsDir, 'fixture.log') })
    await rewriteFixture({ sourcePath: seed.logPath, sessionId: seed.sessionId, workspace: paths.workspace })
    await purgeProjectionCache(paths.home, seed.sessionId)
    web = await startWeb({ dshBin, env: baseEnv, cwd: paths.workspace, port: await findFreePort(), logPath: join(paths.artifactsDir, 'web.log') })
    browser = await launchBrowser({ headed: process.env.PROBE_HEADED === '1' })
    const page = await browser.browser.newPage()
    attachPageLogs(page, { log: () => {}, secrets: [web.token] })
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('[data-row-key]', { timeout: 60_000 })
    await openSession(page, seed.sessionId)

    // --- The setup: a card holding an answer several screens long. ---
    await openCard(page)
    await askCard(page, '这段怎么理解？')
    const loaded = await measure(page)
    await shot(page, '01-long-answer')
    record('the answer is far taller than the card, so the cap is what keeps it on screen',
      loaded !== null && loaded.thread !== null && loaded.thread.scroll >= loaded.thread.client + 600, loaded)
    record('a fresh card stops at the stylesheet cap',
      loaded !== null && loaded.height <= loaded.cap + 1,
      loaded === null ? null : { height: loaded.height, cap: loaded.cap, maxHeight: loaded.maxHeight })

    // --- Resize the width only: the height must stay under the same cap. ---
    await page.mouse.move(loaded.gripE.x, loaded.gripE.y)
    await page.mouse.down()
    await page.mouse.move(loaded.gripE.x - 100, loaded.gripE.y, { steps: 6 })
    await page.mouse.move(loaded.gripE.x - 200, loaded.gripE.y, { steps: 6 })
    await sleep(150)
    await page.mouse.up()
    await sleep(500)
    const narrower = await measure(page)
    await shot(page, '02-after-width-resize')
    record('the width-only resize landed',
      narrower !== null && narrower.width >= loaded.width - 220 && narrower.width <= loaded.width - 160,
      narrower === null ? null : { from: loaded.width, to: narrower.width })
    record('a width-only resize keeps the height cap',
      narrower !== null && narrower.height <= narrower.cap + 1,
      narrower === null ? null : { height: narrower.height, cap: narrower.cap, maxHeight: narrower.maxHeight, inline: narrower.inline })
    record('the answer still scrolls inside the narrower card',
      narrower !== null && narrower.thread !== null && narrower.thread.scroll > narrower.thread.client, narrower?.thread)

    // --- Home: back to the default width, cap still in force. ---
    await page.focus('.clipchat-card__bar')
    await page.keyboard.press('Home')
    await sleep(650)
    const homed = await measure(page)
    await shot(page, '03-after-home')
    record('Home puts the width back',
      homed !== null && Math.abs(homed.width - 600) <= 2, homed === null ? null : { width: homed.width })
    record('Home leaves the height cap in force',
      homed !== null && homed.height <= homed.cap + 1,
      homed === null ? null : { height: homed.height, cap: homed.cap, maxHeight: homed.maxHeight, inline: homed.inline })

    // --- A height the user pulls is still theirs: move up, then grow the bottom edge. ---
    await page.mouse.move(homed.bar.x, homed.bar.y)
    await page.mouse.down()
    await page.mouse.move(homed.bar.x, homed.bar.y - 90, { steps: 6 })
    await page.mouse.move(homed.bar.x, homed.bar.y - 150, { steps: 6 })
    await page.mouse.up()
    await sleep(450)
    const moved = await measure(page)
    let tall = null
    if (moved === null) {
      record('a height the user pulled is not capped by the stylesheet', false, 'the card is gone before the tall resize')
      record('that tall card is still fully inside the window', false, 'the card is gone before the tall resize')
    } else {
      await page.mouse.move(moved.gripSe.x, moved.gripSe.y)
      await page.mouse.down()
      await page.mouse.move(moved.gripSe.x, moved.gripSe.y + 200, { steps: 6 })
      await page.mouse.move(moved.gripSe.x, moved.gripSe.y + 400, { steps: 6 })
      await page.mouse.up()
      await sleep(500)
      tall = await measure(page)
      await shot(page, '04-after-tall-resize')
      record('a height the user pulled is not capped by the stylesheet',
        tall !== null && tall.height >= tall.cap + 60,
        tall === null ? null : { height: tall.height, cap: tall.cap, maxHeight: tall.maxHeight, top: tall.top, bottom: tall.bottom })
      record('that tall card is still fully inside the window',
        tall !== null && tall.bottom <= 900 && tall.top >= 0,
        tall === null ? null : { top: tall.top, bottom: tall.bottom })
    }

    // --- Back to the cap: Home again, after the tall height. ---
    let reset = null
    if (tall === null) {
      record('Home after a tall height returns the card to the cap', false, 'no tall card to reset')
    } else {
      await page.focus('.clipchat-card__bar')
      await page.keyboard.press('Home')
      await sleep(650)
      reset = await measure(page)
      await shot(page, '05-home-after-tall')
      record('Home after a tall height returns the card to the cap',
        reset !== null && reset.height <= reset.cap + 1 && Math.abs(reset.width - 600) <= 2,
        reset === null ? null : { height: reset.height, width: reset.width, cap: reset.cap, maxHeight: reset.maxHeight })
    }
  } finally {
    await browser?.browser.close().catch(() => {})
    await web?.handle.stop().catch(() => {})
    await mock.close().catch(() => {})
  }

  const failed = checks.filter((check) => check.passed !== true)
  process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  process.stderr.write(`PROBE FAILED: ${error?.stack ?? error}\n`)
  process.exit(2)
})
