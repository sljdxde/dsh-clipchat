#!/usr/bin/env node
/**
 * Real-host probe for the flicker on release.
 *
 * The report: "拖动完松开的一下，界面会闪一下". This probe drives a real drag
 * and a real resize against the real host, samples the card's computed style on
 * every animation frame across the release, and checks that nothing moves the
 * card, fades it, or starts an animation after the pointer goes up.
 *
 * Usage: node e2e/probe-host-flicker.mjs [outDir]
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
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-flicker-shots')
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

async function geometry(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    const bar = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
    const grip = document.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
    return {
      card: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      bar: { x: bar.left + Math.min(120, bar.width / 2), y: bar.top + bar.height / 2 },
      grip: { x: grip.left + grip.width / 2, y: grip.top + grip.height / 2 },
      className: card.className,
      transform: getComputedStyle(card).transform,
    }
  })
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

/**
 * Sample the card's computed style every frame for `ms`, tagged with the phase
 * the page is in. Runs inside the page so the release frame is not lost to a
 * round trip: the recorder is installed before the pointer goes up.
 */
async function installCardHelper(page) {
  await page.evaluate(() => {
    window.__realCard = () => [...document.querySelectorAll('.clipchat-card')]
      .find((node) => node.querySelector('.clipchat-card__footer') !== null) ?? null
  })
}

async function startRecorder(page, ms = 500) {
  await page.evaluate((duration) => {
    const card = window.__realCard?.() ?? document.querySelector('.clipchat-card')
    if (card === null) throw new Error('no card to record')
    window.__flicker = []
    const start = performance.now()
    const sample = () => {
      const style = getComputedStyle(card)
      window.__flicker.push({
        t: Math.round(performance.now() - start),
        opacity: Number(style.opacity),
        transform: style.transform,
        width: Math.round(card.getBoundingClientRect().width),
        height: Math.round(card.getBoundingClientRect().height),
        left: Math.round(card.getBoundingClientRect().left),
        top: Math.round(card.getBoundingClientRect().top),
        background: style.backgroundColor,
        backdrop: style.backdropFilter ?? style.webkitBackdropFilter ?? '',
        className: card.className,
        footerOverflow: (() => {
          const footer = card.querySelector('.clipchat-card__footer')
          if (footer === null) return null
          return Math.round((footer.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom) * 10) / 10
        })(),
        threadHeight: (() => {
          const thread = card.querySelector('.clipchat-card__thread')
          return thread === null ? null : Math.round(thread.getBoundingClientRect().height)
        })(),
        animations: card.getAnimations().map((animation) => ({
          name: animation.animationName,
          state: animation.playState,
          time: Math.round(animation.currentTime ?? 0),
        })),
      })
      if (performance.now() - start < duration) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, ms)
}

async function readRecorder(page) {
  return await page.evaluate(() => window.__flicker ?? [])
}

/** The frames after the last frame a gesture class was on: what the user sees on release. */
function afterRelease(frames) {
  let last = -1
  frames.forEach((frame, index) => {
    if (/is-dragging|is-resizing/u.test(frame.className)) last = index
  })
  return last < 0 ? [] : frames.slice(last + 1)
}

/** What the card looked like on the last frame the gesture was still live. */
function lastGestureFrame(frames) {
  let last = null
  for (const frame of frames) {
    if (/is-dragging|is-resizing/u.test(frame.className)) last = frame
  }
  return last
}

function summarize(frames) {
  return {
    frames: frames.length,
    minOpacity: frames.length === 0 ? null : Math.min(...frames.map((frame) => frame.opacity)),
    animations: [...new Set(frames.flatMap((frame) => frame.animations.map((animation) => animation.name)))],
    transforms: [...new Set(frames.map((frame) => frame.transform))],
    widths: [...new Set(frames.map((frame) => frame.width))],
    footerOverflows: [...new Set(frames.map((frame) => frame.footerOverflow))],
    first: frames[0] ?? null,
    last: frames[frames.length - 1] ?? null,
  }
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
  const mock = await startMockLlm({ log: () => {} })
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

    // --- Drag: press the title bar, travel, release. ---
    await openCard(page)
    const opened = await geometry(page)
    record('the card opens', opened !== null && Math.round(opened.card.width) === 600, opened === null ? null : { width: opened.card.width })

    await page.mouse.move(opened.bar.x, opened.bar.y)
    await page.mouse.down()
    await page.mouse.move(opened.bar.x + 40, opened.bar.y + 20, { steps: 6 })
    await page.mouse.move(opened.bar.x + 90, opened.bar.y + 50, { steps: 6 })
    await sleep(120)
    const midDrag = await page.evaluate(() => {
      const card = document.querySelector('.clipchat-card')
      const style = getComputedStyle(card)
      return { className: card.className, opacity: Number(style.opacity), transform: style.transform }
    })
    await shot(page, '01-mid-drag')
    record('the card is fully opaque while a drag is live', midDrag.opacity === 1, midDrag)

    await startRecorder(page)
    await sleep(120)
    await page.mouse.up()
    await sleep(650)
    const dragFrames = await readRecorder(page)
    await shot(page, '02-after-drag-release')
    const dragAfter = afterRelease(dragFrames)
    const dragSummary = summarize(dragAfter)
    record('a drag release does not fade the card',
      dragAfter.length > 0 && dragSummary.minOpacity >= 0.99,
      dragSummary)
    record('a drag release does not start an opening animation',
      dragAfter.length > 0 && dragSummary.animations.length === 0,
      dragSummary.animations)
    record('a drag release leaves the card where it was dropped',
      dragAfter.length > 0 && dragSummary.transforms.length === 1 && dragSummary.widths.length === 1,
      { transforms: dragSummary.transforms, widths: dragSummary.widths })

    const dropped = await geometry(page)
    record('the drag itself still moved the card',
      Math.round(dropped.card.left - opened.card.left) >= 60,
      { dx: Math.round(dropped.card.left - opened.card.left), dy: Math.round(dropped.card.top - opened.card.top) })

    // --- Resize: pull the bottom-right grip out, release. ---
    await startRecorder(page, 1500)
    await page.mouse.move(dropped.grip.x, dropped.grip.y)
    await page.mouse.down()
    await page.mouse.move(dropped.grip.x + 60, dropped.grip.y + 40, { steps: 6 })
    await page.mouse.move(dropped.grip.x + 120, dropped.grip.y + 80, { steps: 6 })
    await sleep(120)
    const midResize = await page.evaluate(() => document.querySelector('.clipchat-card').className)
    record('the height pin follows the drag, not its release',
      /is-sized/u.test(midResize), { className: midResize })
    await page.mouse.up()
    await sleep(750)
    const resizeFrames = await readRecorder(page)
    await shot(page, '03-after-resize-release')
    const resizeAfter = afterRelease(resizeFrames)
    const resizeSummary = summarize(resizeAfter)
    record('a resize release does not fade the card',
      resizeAfter.length > 0 && resizeSummary.minOpacity >= 0.99,
      resizeSummary)
    record('a resize release does not start an opening animation',
      resizeAfter.length > 0 && resizeSummary.animations.length === 0,
      resizeSummary.animations)
    record('a resize release keeps the size the user pulled',
      resizeAfter.length > 0 && resizeSummary.widths.length === 1,
      { widths: resizeSummary.widths })
    const liveResize = lastGestureFrame(resizeFrames)
    record('a resize release does not reflow the card',
      liveResize !== null && resizeAfter.length > 0
        && resizeSummary.footerOverflows.length === 1
        && resizeSummary.footerOverflows[0] === liveResize.footerOverflow,
      { live: liveResize === null ? null : { footerOverflow: liveResize.footerOverflow, thread: liveResize.threadHeight },
        after: { footerOverflows: resizeSummary.footerOverflows, thread: resizeAfter.map((frame) => frame.threadHeight).slice(0, 5) } })

    const resized = await geometry(page)
    record('the resize itself still grew the card',
      resized.card.width > dropped.card.width + 20,
      { from: Math.round(dropped.card.width), to: Math.round(resized.card.width) })

    // --- A short press with no travel is still a click, not a gesture. ---
    await page.mouse.move(resized.bar.x, resized.bar.y)
    await page.mouse.down()
    await page.mouse.up()
    await sleep(350)
    const clicked = await geometry(page)
    record('a press without travel leaves the geometry alone',
      clicked !== null && Math.round(clicked.card.left) === Math.round(resized.card.left) && Math.round(clicked.card.width) === Math.round(resized.card.width),
      clicked === null ? null : { left: Math.round(clicked.card.left), width: Math.round(clicked.card.width) })

    // --- The pinned-height rule: does it change the card's layout when it
    // turns on? If it does, a gesture that pins the height (the first drag of
    // the bottom edge) changes the layout at the release, which reads as a
    // flicker. Measured against the real stylesheet on the real card. ---
    await page.mouse.move(0, 0)
    await installCardHelper(page)
    const pinnedRule = await page.evaluate(() => {
      const card = window.__realCard?.() ?? document.querySelector('.clipchat-card')
      const thread = card === null ? null : card.querySelector('.clipchat-card__thread')
      const footer = card === null ? null : card.querySelector('.clipchat-card__footer')
      if (thread === null || footer === null) return null
      const filler = document.createElement('div')
      filler.style.height = '900px'
      thread.appendChild(filler)
      card.style.height = '320px'
      card.style.maxHeight = 'none'
      const overflow = () => Math.round((footer.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom) * 10) / 10
      card.classList.remove('is-sized')
      const before = overflow()
      card.classList.add('is-sized')
      const after = overflow()
      filler.remove()
      card.style.height = ''
      card.style.maxHeight = ''
      return { before, after }
    })
    record('the pinned-height rule changes whether the footer fits, so its timing is what the release controls',
      pinnedRule !== null && pinnedRule.before > 1 && pinnedRule.after <= 1, pinnedRule)

    // --- A fresh card still plays its opening animation once, on open. ---
    // --- A fresh card still plays its opening animation once, on open. ---
    await page.evaluate(() => document.querySelector('.clipchat-card__close')?.click())
    await sleep(600)
    await page.evaluate(() => {
      window.__openAnimations = []
      const observer = new MutationObserver(() => {
        const card = document.querySelector('.clipchat-card')
        if (card === null) return
        observer.disconnect()
        const start = performance.now()
        const tick = () => {
          for (const animation of card.getAnimations()) window.__openAnimations.push(animation.animationName)
          if (performance.now() - start < 400) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    await openCard(page)
    await sleep(500)
    const openAnimations = await page.evaluate(() => [...new Set(window.__openAnimations ?? [])])
    record('a freshly opened card still announces itself once',
      openAnimations.includes('clipchat-pop'), openAnimations)
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
