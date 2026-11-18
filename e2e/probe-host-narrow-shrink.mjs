#!/usr/bin/env node
/**
 * Real-host probe for the 420px collapse: drag or resize the card in a wide
 * window, then narrow the window, and the card must stay readable — not shrink
 * to the 85px a residual column measurement hands it — and it must come back to
 * its own width when the window widens again.
 *
 * The finding came from final verification: viewport 420 after a gesture left
 * card { left 35.8, right 120.8, width 85 } with a 67px answer column, while
 * opening a card directly at 420 was fine (365 wide). So the trigger is the
 * transition, not the width: something measures a column narrower than the
 * window and the clamp is then remembered.
 *
 * This probe reports every term `cardLimits()` is built from — viewport, the
 * clipping ancestors, the union of message-node rects, the composer's top — so a
 * collapse can be attributed instead of guessed at.
 *
 * Usage: node e2e/probe-host-narrow-shrink.mjs [outDir]
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
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-narrow-shots')
const checks = []
function record(name, passed, detail) {
  checks.push({ name, passed, detail })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}\n`)
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

async function askCard(page, question) {
  const turns = await page.evaluate(() => document.querySelectorAll('.clipchat-card__turn').length)
  await page.click('.clipchat-card__ta')
  await page.type('.clipchat-card__ta', question, { delay: 5 })
  await page.click('.clipchat-card__send')
  await page.waitForFunction((count) => document.querySelectorAll('.clipchat-card__turn').length > count, { timeout: 20_000 }, turns)
  await page.waitForFunction(() => {
    const send = document.querySelector('.clipchat-card__send')
    return send !== null && send.textContent !== '■'
  }, { timeout: 90_000 })
  await sleep(400)
}

/**
 * Everything `cardLimits()` reads, computed the same way the client does it,
 * plus the result the card is actually wearing.
 */
async function measure(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const cardRect = card.getBoundingClientRect()
    const thread = card.querySelector('.clipchat-card__thread')
    const panel = card.querySelector('.clipchat-card__records')
    const scroller = panel !== null ? panel : thread

    // `columnRectOf`: the union of message-node rects, skipping any node that
    // holds the card.
    let unionLeft = Infinity
    let unionRight = -Infinity
    let nodes = 0
    const widest = []
    for (const node of document.querySelectorAll('[data-chat-node-key], [data-chat-turn]')) {
      if (typeof node.contains === 'function' && node.contains(card)) continue
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      unionLeft = Math.min(unionLeft, rect.left)
      unionRight = Math.max(unionRight, rect.right)
      nodes += 1
      widest.push({ w: Math.round(rect.width), l: Math.round(rect.left), r: Math.round(rect.right) })
    }
    widest.sort((a, b) => b.w - a.w)

    // `clipRectOf`: every clipping ancestor, so a collapsed one is visible.
    const clips = []
    for (let node = card.parentElement; node !== null && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const rect = node.getBoundingClientRect()
      clips.push({
        cls: typeof node.className === 'string' ? node.className.slice(0, 40) : node.tagName,
        w: Math.round(rect.width),
        l: Math.round(rect.left),
        r: Math.round(rect.right),
      })
    }

    // `pinnedTopOf`: the composer's top edge.
    let composerTop = null
    for (const input of document.querySelectorAll('textarea, [contenteditable="true"]')) {
      if (typeof card.contains === 'function' && card.contains(input)) continue
      for (let node = input; node !== null && node !== document.body && node !== document.documentElement; node = node.parentElement) {
        const rect = node.getBoundingClientRect()
        if (rect.height > 0 && rect.width > 0 && rect.bottom >= window.innerHeight - 24 && rect.height <= window.innerHeight * 0.5) {
          composerTop = Math.round(rect.top)
          break
        }
      }
      if (composerTop !== null) break
    }

    return {
      viewport: {
        docClient: document.documentElement.clientWidth,
        innerW: window.innerWidth,
        innerH: window.innerHeight,
      },
      card: {
        left: Math.round(cardRect.left * 10) / 10,
        top: Math.round(cardRect.top * 10) / 10,
        right: Math.round(cardRect.right * 10) / 10,
        width: Math.round(cardRect.width * 10) / 10,
        height: Math.round(cardRect.height * 10) / 10,
        inlineWidth: card.style.width,
        className: card.className,
      },
      scroller: {
        kind: panel !== null ? 'records' : 'thread',
        clientWidth: scroller === null ? null : scroller.clientWidth,
        scrollWidth: scroller === null ? null : scroller.scrollWidth,
        clientHeight: scroller === null ? null : scroller.clientHeight,
        scrollHeight: scroller === null ? null : scroller.scrollHeight,
      },
      union: {
        nodes,
        left: nodes === 0 ? null : Math.round(unionLeft * 10) / 10,
        right: nodes === 0 ? null : Math.round(unionRight * 10) / 10,
        width: nodes === 0 ? null : Math.round((unionRight - unionLeft) * 10) / 10,
      },
      widest: widest.slice(0, 4),
      clips: clips.slice(0, 3),
      composerTop,
    }
  })
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
  process.stdout.write(`shot   ${name}.png\n`)
}

/** Press, travel, release — the way a hand would. */
async function dragBy(page, x, y, { dx = 0, dy = 0 } = {}) {
  await page.mouse.move(x, y)
  await sleep(120)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
  await sleep(400)
}

async function setViewport(page, width, height) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  // The client keeps fitting the card until it holds still (up to ~90 frames),
  // because the host re-anchors it a beat after the window changed. Measure after
  // that window has closed, so the numbers are the settled ones.
  await sleep(1700)
}

/**
 * The widest the card can be in this window, from the terms the client itself
 * uses: the window minus the 16px edge, the CSS width (`100vw - 32px`), and the
 * conversation column's right edge minus an 8px gap on each side (the rail
 * beside the column is chrome the card must not sit under). At 420px the column
 * ends at 381, so 365 is the ceiling — the point of the check is that the card
 * gets its ceiling instead of 85.
 */
function readableWidth(viewportWidth, unionRight) {
  const ceiling = unionRight === null || unionRight === undefined
    ? viewportWidth - 32
    : Math.min(viewportWidth - 32, unionRight - 16)
  return Math.max(300, ceiling)
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
  const mock = await startMockLlm({ log: () => {}, answer: () => 'E2E_NARROW_ANSWER 窄屏下这段回答要能一行放得下好几个字，用来量正文宽度。' })
  baseEnv.E2E_MOCK_BASE_URL = mock.baseUrl

  const pageErrors = []
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
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 300)))

    // --- Wide window: open a card and give it a size and a place of its own. ---
    await setViewport(page, 1440, 900)
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('[data-row-key]', { timeout: 60_000 })
    await openSession(page, seed.sessionId)
    await openCard(page)
    await askCard(page, '这段怎么理解？')

    const before = await measure(page)
    const bar = await page.evaluate(() => {
      const rect = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
      return { x: rect.left + Math.min(120, rect.width / 2), y: rect.top + rect.height / 2 }
    })
    await dragBy(page, bar.x, bar.y, { dx: 60, dy: 40 })
    const moved = await measure(page)
    await dragBy(page, moved.card.right - 4, moved.card.top + moved.card.height / 2, { dx: -120 })
    const sized = await measure(page)
    await shot(page, '01-wide-after-gestures')
    record('setup: a wide window, a card the user moved and resized',
      before !== null && sized !== null && sized.card.width < before.card.width - 80,
      { before: before?.card, after: sized?.card, union: sized?.union, clips: sized?.clips, composerTop: sized?.composerTop })
    const chosenWidth = sized.card.width

    // --- Narrow it: the card must stay readable, not collapse. ---
    await setViewport(page, 420, 900)
    const narrow = await measure(page)
    await shot(page, '02-narrow-420')
    record('420px after a gesture: the card stays inside the window and readable',
      narrow !== null && narrow.card.width >= readableWidth(narrow.viewport.docClient, narrow.union.right) - 2
        && narrow.scroller.clientWidth > 100,
      narrow === null ? null : {
        card: narrow.card, scroller: narrow.scroller, viewport: narrow.viewport,
        union: narrow.union, widest: narrow.widest, clips: narrow.clips, composerTop: narrow.composerTop,
        readable: readableWidth(narrow.viewport.docClient, narrow.union.right),
      })

    // --- The records panel takes the same card width; it must be readable too. ---
    const opened = await page.evaluate(() => {
      const toggle = document.querySelector('.clipchat-actions__btn[aria-expanded]')
      if (toggle === null) return false
      toggle.click()
      return true
    })
    await sleep(400)
    const narrowRecords = opened ? await measure(page) : null
    await shot(page, '03-narrow-420-records')
    record('420px with records open: the panel content is readable and does not overflow sideways',
      narrowRecords !== null && narrowRecords.scroller.kind === 'records'
        && narrowRecords.scroller.clientWidth > 100
        && narrowRecords.scroller.scrollWidth <= narrowRecords.scroller.clientWidth + 1,
      narrowRecords === null ? null : { scroller: narrowRecords.scroller, card: narrowRecords.card })

    // --- Widen again: the card comes back by itself. ---
    await setViewport(page, 1440, 900)
    const restored = await measure(page)
    await shot(page, '04-wide-again')
    record('1440px again: the card returns to a readable width without a gesture',
      restored !== null && restored.card.width >= Math.min(chosenWidth, 600) - 2
        && restored.scroller.clientWidth > 100,
      restored === null ? null : { card: restored.card, scroller: restored.scroller, chosenWidth, union: restored.union })
  } finally {
    await browser?.browser.close().catch(() => {})
    await web?.handle.stop().catch(() => {})
    await mock.close().catch(() => {})
  }

  if (pageErrors.length > 0) {
    process.stdout.write(`\npage errors seen:\n${pageErrors.map((line) => `  ${line}`).join('\n')}\n`)
  }
  const failed = checks.filter((check) => check.passed !== true)
  process.stdout.write(`\n${checks.length - failed.length}/${checks.length} checks passed\n`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((error) => {
  process.stderr.write(`PROBE FAILED: ${error?.stack ?? error}\n`)
  process.exit(2)
})
