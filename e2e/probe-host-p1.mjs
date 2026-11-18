#!/usr/bin/env node
/**
 * Real-host probe for the two P1s the independent verification found:
 *
 * 1) At the maximum width the close button must own its pixels: the turn
 *    outline rail sits above the card on the right, so a card allowed to grow
 *    under it can only be dismissed by a 6px sliver.
 * 2) After the conversation is scrolled, dragging the card to the bottom-right
 *    extreme must leave its title bar outside the pinned composer: the bar is
 *    the only move handle, and one buried under the composer can never be
 *    grabbed back.
 *
 * Usage: node e2e/probe-host-p1.mjs [outDir]
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
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-p1-shots')
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

/** Card, bar, close and grip rects, plus where the composer starts. */
async function geometry(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const round = (rect) => ({ l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom), w: Math.round(rect.width), h: Math.round(rect.height) })
    const bar = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
    const grip = document.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
    const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
    // The composer: the pinned chrome at the bottom that is not the card.
    let composerTop = null
    for (const fraction of [0.5, 0.3, 0.7]) {
      const hit = document.elementFromPoint(window.innerWidth * fraction, window.innerHeight - 4)
      if (hit === null || hit.closest('.clipchat-card') !== null) continue
      const rect = hit.getBoundingClientRect()
      if (rect.height <= 0 || rect.bottom < window.innerHeight - 8) continue
      if (rect.top < window.innerHeight * 0.35 || rect.height > window.innerHeight * 0.5) continue
      composerTop = Math.round(rect.top)
      break
    }
    let clipRight = window.innerWidth
    for (let node = card.parentElement; node !== null && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      clipRight = Math.round(node.getBoundingClientRect().right)
      break
    }
    return {
      card: round(card.getBoundingClientRect()),
      close: round(close),
      bar: { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2, ...round(bar) },
      grip: { x: grip.right - 6, y: grip.bottom - 6 },
      composerTop,
      clipRight,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      transform: getComputedStyle(card).transform,
    }
  })
}

/** Hit-test every horizontal sample across the close button. */
async function closeSamples(page) {
  return await page.evaluate(() => {
    const close = document.querySelector('.clipchat-card__close')
    if (close === null) return null
    const rect = close.getBoundingClientRect()
    const y = rect.top + rect.height / 2
    const samples = []
    for (const fraction of [0.05, 0.25, 0.5, 0.75, 0.95]) {
      const x = rect.left + rect.width * fraction
      const hit = document.elementFromPoint(x, y)
      samples.push({
        x: Math.round(x),
        y: Math.round(y),
        mine: hit !== null && hit.closest('.clipchat-card__close') !== null,
        hit: hit === null ? null : `${hit.tagName.toLowerCase()}.${String(hit.className ?? '').split(' ')[0]}`,
      })
    }
    return { rect: { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) }, samples }
  })
}

/**
 * Hit-test several points along the part of the title bar that is on screen: a
 * card parked at an edge keeps 96px of itself visible by design, so the bar
 * reaching past the window is expected.
 */
async function barSamples(page) {
  return await page.evaluate(() => {
    const bar = document.querySelector('.clipchat-card__bar')
    if (bar === null) return null
    const rect = bar.getBoundingClientRect()
    let clipRight = window.innerWidth
    const card = document.querySelector('.clipchat-card')
    for (let node = card.parentElement; node !== null && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      clipRight = Math.round(node.getBoundingClientRect().right)
      break
    }
    const left = Math.max(rect.left, 0)
    const right = Math.min(rect.right, window.innerWidth, clipRight)
    const y = rect.top + rect.height / 2
    const samples = []
    for (const fraction of [0.02, 0.28, 0.5, 0.72, 0.98]) {
      const x = left + (right - left) * fraction
      const hit = document.elementFromPoint(x, y)
      samples.push({
        x: Math.round(x),
        y: Math.round(y),
        mine: hit !== null && hit.closest('.clipchat-card') !== null,
        hit: hit === null ? null : `${hit.tagName.toLowerCase()}.${String(hit.className ?? '').split(' ')[0]}`,
        trace: hit === null ? null : [...(function* walk() {
          for (let node = hit; node !== null && node !== document.body; node = node.parentElement) yield `${node.tagName.toLowerCase()}.${String(node.className ?? '').split(' ')[0]}`
        })()].slice(0, 4),
        own: hit === null ? null : (() => {
          const box = hit.getBoundingClientRect()
          return { l: Math.round(box.left), t: Math.round(box.top), r: Math.round(box.right), b: Math.round(box.bottom) }
        })(),
      })
    }
    return { rect: { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom) }, samples }
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

    // ---- P1-1: the maximum width must leave the close button its own pixels ----
    await openCard(page)
    const opened = await geometry(page)
    record('card opens at the CSS width', opened !== null && Math.round(opened.card.w) === 600,
      opened === null ? { card: false } : { w: opened.card.w })
    await page.mouse.move(opened.grip.x, opened.grip.y)
    await page.mouse.down()
    await page.mouse.move(opened.grip.x + 2000, opened.grip.y + 2000, { steps: 12 })
    await page.mouse.up()
    await sleep(500)
    const maxed = await geometry(page)
    await shot(page, 'evidence-01-p1-1-max')
    record('the card stops before the turn-outline rail',
      maxed !== null && maxed.card.w < 940, maxed === null ? { card: false } : { w: maxed.card.w, right: maxed.card.r })
    const closeAtMax = await closeSamples(page)
    record('every sample across × hits the close button at the maximum width',
      closeAtMax !== null && closeAtMax.samples.every((sample) => sample.mine === true),
      closeAtMax === null ? { close: false } : { rect: closeAtMax.rect, samples: closeAtMax.samples })
    await page.mouse.move(maxed.close.l + maxed.close.w / 2, maxed.close.t + maxed.close.h / 2)
    await page.mouse.down()
    await page.mouse.up()
    await sleep(600)
    const closedByClick = await page.evaluate(() => document.querySelector('.clipchat-card') === null)
    record('clicking the centre of × closes the card at the maximum width', closedByClick === true, { closed: closedByClick })
    await shot(page, 'evidence-02-p1-1-closed')

    // ---- P1-2: scrolled conversation, drag to the bottom-right extreme ----
    await openCard(page)
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 100)
        .sort((a, b) => b.clientHeight - a.clientHeight)[0]
      if (scroller !== undefined) scroller.scrollTop -= 400
    })
    await sleep(700)
    const scrolled = await geometry(page)
    record('the conversation scrolled, the card is still reachable',
      scrolled !== null && scrolled.bar.t > 0, scrolled === null ? { card: false } : { bar: scrolled.bar })
    await page.mouse.move(scrolled.bar.x, scrolled.bar.y)
    await page.mouse.down()
    await page.mouse.move(scrolled.bar.x + 2000, scrolled.bar.y + 2000, { steps: 12 })
    await page.mouse.up()
    await sleep(500)
    const corner = await geometry(page)
    await shot(page, 'evidence-03-p1-2-corner')
    record('the title bar stops above the pinned composer',
      corner !== null && corner.composerTop !== null && corner.bar.b <= corner.composerTop,
      corner === null ? { card: false } : { bar: corner.bar, composerTop: corner.composerTop })
    const barAtCorner = await barSamples(page)
    // Host chrome may sit over part of the bar (the floating "back to latest"
    // button is one); what may never happen is the composer covering it.
    const inComposer = (sample) => sample.mine !== true && sample.own !== null
      && sample.own.t <= corner.composerTop && sample.own.b >= corner.composerTop
    const graspable = barAtCorner === null ? 0 : barAtCorner.samples.filter((sample) => sample.mine === true).length
    record('the title bar is graspable and no part of it is under the composer',
      barAtCorner !== null && graspable >= 3 && barAtCorner.samples.every((sample) => inComposer(sample) !== true),
      barAtCorner === null ? { bar: false } : { rect: barAtCorner.rect, graspable, samples: barAtCorner.samples })

    // The bar has to still move the card: a bar under the composer would hand
    // the press to the composer and the card would never come back. The press
    // has to land on the part of the bar that is on screen: a card parked at
    // the edge keeps only 96px of itself visible by design.
    const beforeMove = await geometry(page)
    const pressX = Math.max(Math.min(beforeMove.bar.x, beforeMove.viewport.w - 40), beforeMove.card.l + 40)
    const pressY = beforeMove.bar.y
    await page.mouse.move(pressX, pressY)
    await page.mouse.down()
    await page.mouse.move(pressX - 240, pressY - 240, { steps: 12 })
    await page.mouse.up()
    await sleep(400)
    const afterMove = await geometry(page)
    record('the buried-corner card can still be dragged back',
      afterMove !== null && beforeMove !== null
        && Math.round(afterMove.card.l - beforeMove.card.l) === -240
        && Math.round(afterMove.card.t - beforeMove.card.t) === -240,
      afterMove === null || beforeMove === null
        ? { card: false }
        : { dx: Math.round(afterMove.card.l - beforeMove.card.l), dy: Math.round(afterMove.card.t - beforeMove.card.t) })
    await shot(page, 'evidence-04-p1-2-recovered')

    // The card hangs off its anchor, so scrolling carries it along; scrolling
    // back has to hand the title bar back to the pointer.
    const parked = await geometry(page)
    const scrollBy = async (delta) => {
      await page.evaluate((travel) => {
        const scroller = [...document.querySelectorAll('*')]
          .filter((el) => getComputedStyle(el).overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 100)
          .sort((a, b) => b.clientHeight - a.clientHeight)[0]
        if (scroller !== undefined) scroller.scrollTop += travel
      }, delta)
      await sleep(700)
    }
    await scrollBy(-300)
    const afterScroll = await geometry(page)
    await shot(page, 'evidence-05-p1-2-after-scroll')
    record('scrolling a step away carries the card, scrolling back hands the bar back',
      afterScroll !== null && parked !== null && Math.round(afterScroll.card.t - parked.card.t) === 300,
      afterScroll === null || parked === null
        ? { card: false }
        : { parked: parked.card, scrolled: afterScroll.card })
    await scrollBy(300)
    const back = await geometry(page)
    const barBack = await barSamples(page)
    record('the title bar is clickable again once the conversation is scrolled back',
      back !== null && barBack !== null && barBack.samples.every((sample) => sample.mine === true
        || (sample.own !== null && sample.own.t > back.composerTop)),
      back === null || barBack === null
        ? { card: false }
        : { card: back.card, bar: barBack.rect, samples: barBack.samples })
    await shot(page, 'evidence-06-p1-2-scrolled-back')
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
