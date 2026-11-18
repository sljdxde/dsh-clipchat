#!/usr/bin/env node
/**
 * Real-host probe for the two reported gesture bugs, plus the basic gestures
 * they sit next to. Boots the throwaway DSH home, opens a card the way a person
 * does, and drives real pointer/keyboard input.
 *
 * Usage: node e2e/probe-host-bugfix.mjs [outDir]
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
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-bugfix-shots')
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

async function geometry(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const rect = card.getBoundingClientRect()
    const bar = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
    const grip = document.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
    const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
    return {
      card: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      bar: { x: bar.left + bar.width / 2, y: bar.top + bar.height / 2 },
      grip: { x: grip.right - 6, y: grip.bottom - 6 },
      close: { x: close.left + close.width / 2, y: close.top + close.height / 2 },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      transform: getComputedStyle(card).transform,
    }
  })
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) })
}

/** Alpha of a computed colour, in both rgb/rgba and color(srgb ... / a) forms. */
function alphaOf(value) {
  const rgba = value.match(/rgba?\(([^)]+)\)/u)
  if (rgba !== null) {
    const parts = rgba[1].split(/[,/]/u).map((part) => part.trim())
    return parts.length > 3 ? Number(parts[3]) : 1
  }
  const colorFn = value.match(/\/\s*([\d.]+)\s*\)/u)
  return colorFn === null ? 1 : Number(colorFn[1])
}

/** Hot areas overlapping any control inside the card, and the footer's fit. */
async function layoutReport(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const cardRect = card.getBoundingClientRect()
    const footer = document.querySelector('.clipchat-card__footer')
    const footerRect = footer === null ? null : footer.getBoundingClientRect()
    const controls = [...card.querySelectorAll('button, a, input, textarea, select')]
    const grips = [...card.querySelectorAll('.clipchat-card__grip')]
    const overlaps = []
    for (const grip of grips) {
      const g = grip.getBoundingClientRect()
      for (const control of controls) {
        const c = control.getBoundingClientRect()
        const w = Math.min(g.right, c.right) - Math.max(g.left, c.left)
        const h = Math.min(g.bottom, c.bottom) - Math.max(g.top, c.top)
        if (w > 0 && h > 0) overlaps.push({ grip: grip.className.replace('clipchat-card__grip ', ''), control: (control.textContent ?? control.tagName).trim().slice(0, 10), w: Math.round(w), h: Math.round(h) })
      }
    }
    return {
      w: Math.round(cardRect.width),
      h: Math.round(cardRect.height),
      left: Math.round(cardRect.left),
      right: Math.round(cardRect.right),
      viewport: window.innerWidth,
      footerInside: footerRect === null ? null : footerRect.bottom <= cardRect.bottom + 0.5,
      footerOverflow: footer === null ? null : footerRect.bottom - cardRect.bottom,
      overlaps,
    }
  })
}

/**
 * Shrink the card to its minimum through the bottom-right grip, then report
 * the layout: the footer has to stay inside and no hot area may sit on a control.
 */
async function shrinkToMinimum(page) {
  const grip = await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    const box = card === null ? null : card.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
    return box === null ? null : { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  if (grip === null) return null
  await page.mouse.move(grip.x, grip.y)
  await page.mouse.down()
  await page.mouse.move(grip.x - 2000, grip.y - 2000, { steps: 10 })
  await page.mouse.up()
  await sleep(400)
  return await layoutReport(page)
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

    // --- Bug 2: the close button must own its corner and still close. ---
    await openCard(page)
    const opened = await geometry(page)
    record('card opens untouched', opened !== null && opened.transform === 'none' && Math.round(opened.card.width) === 600,
      opened === null ? { card: false } : { width: opened.card.width, transform: opened.transform })
    const hit = await page.evaluate(() => {
      const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
      const x = close.left + close.width / 2
      const y = close.top + close.height / 2
      const element = document.elementFromPoint(x, y)
      return {
        x, y,
        top: element === null ? null : `${element.tagName.toLowerCase()}.${(element.className ?? '').toString().split(' ')[0]}`,
        isClose: element !== null && element.closest('.clipchat-card__close') !== null,
        isGrip: element !== null && element.closest('.clipchat-card__grip') !== null,
      }
    })
    record('the press on × lands on the close button, not on a resize hot area',
      hit.isClose === true && hit.isGrip === false, hit)
    await shot(page, '01-close-hit')
    await page.mouse.move(opened.close.x, opened.close.y)
    await page.mouse.down()
    await page.mouse.up()
    await sleep(600)
    const closed = await page.evaluate(() => document.querySelector('.clipchat-card') === null)
    record('clicking × dismisses the card', closed === true, { closed })
    await shot(page, '02-closed')

    // --- Reopen for the gestures. ---
    await openCard(page)
    const again = await geometry(page)
    record('the card reopens after being closed', again !== null, { card: again !== null })

    // --- Bug 1: opaque while resizing, and the resize itself still works. ---
    await page.mouse.move(again.grip.x, again.grip.y)
    await page.mouse.down()
    await page.mouse.move(again.grip.x + 60, again.grip.y + 40, { steps: 6 })
    await sleep(150)
    const live = await page.evaluate(() => {
      const card = document.querySelector('.clipchat-card')
      if (card === null) return null
      const style = getComputedStyle(card)
      return {
        className: card.className,
        opacity: style.opacity,
        background: style.backgroundColor,
        backdrop: (style.backdropFilter ?? '') + (style.webkitBackdropFilter ?? ''),
        width: card.getBoundingClientRect().width,
        inlineOpacity: card.style.opacity,
      }
    })
    await shot(page, '03-mid-resize')
    record('the card is opaque while a resize is live',
      live !== null && live.opacity === '1' && alphaOf(live.background) >= 0.999 && live.inlineOpacity === '',
      live === null ? { card: false } : { opacity: live.opacity, background: live.background, alpha: alphaOf(live.background), inlineOpacity: live.inlineOpacity, backdrop: live.backdrop })
    await page.mouse.move(again.grip.x + 160, again.grip.y + 100, { steps: 8 })
    await page.mouse.up()
    await sleep(350)
    const resized = await geometry(page)
    record('the bottom-right grip resizes both dimensions',
      resized !== null && resized.card.width > again.card.width + 100 && resized.card.height > again.card.height + 40,
      resized === null ? { card: false } : { from: { w: Math.round(again.card.width), h: Math.round(again.card.height) }, to: { w: Math.round(resized.card.width), h: Math.round(resized.card.height) } })
    await shot(page, '04-resized')
    const wideLayout = await layoutReport(page)
    record('no resize hot area sits on a control at the default width',
      wideLayout !== null && wideLayout.overlaps.length === 0, wideLayout)

    // --- Basic move by the title bar. ---
    await page.mouse.move(resized.bar.x, resized.bar.y)
    await page.mouse.down()
    await page.mouse.move(resized.bar.x + 70, resized.bar.y - 50, { steps: 10 })
    await page.mouse.up()
    await sleep(350)
    const moved = await geometry(page)
    record('the title bar still drags the card',
      moved !== null && Math.round(moved.card.left - resized.card.left) === 70 && Math.round(moved.card.top - resized.card.top) === -50,
      moved === null ? { card: false } : { dx: Math.round(moved.card.left - resized.card.left), dy: Math.round(moved.card.top - resized.card.top) })
    await shot(page, '05-moved')

    // --- P1: at maximum size the close button must not sit under the outline rail. ---
    const maxGrip = await page.evaluate(() => {
      const r = document.querySelector('.clipchat-card__grip--se').getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await page.mouse.move(maxGrip.x, maxGrip.y)
    await page.mouse.down()
    await page.mouse.move(maxGrip.x + 2000, maxGrip.y + 2000, { steps: 10 })
    await page.mouse.up()
    await sleep(400)
    const maxState = await page.evaluate(() => {
      const card = document.querySelector('.clipchat-card').getBoundingClientRect()
      const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
      const hits = []
      // Sample the inside of the button, clear of the 7px rounded corners:
      // those corners are the bar's, and a rounded corner is not a click.
      for (let i = 0; i <= 2; i += 1) {
        for (let j = 0; j <= 2; j += 1) {
          const x = close.left + 4 + ((close.width - 8) * i) / 2
          const y = close.top + 4 + ((close.height - 8) * j) / 2
          const element = document.elementFromPoint(x, y)
          hits.push(element !== null && element.closest('.clipchat-card__close') !== null)
        }
      }
      return {
        card: { right: Math.round(card.right), width: Math.round(card.width), height: Math.round(card.height) },
        close: { left: Math.round(close.left), width: Math.round(close.width) },
        hits: hits.filter(Boolean).length,
        samples: hits.length,
      }
    })
    record('at the maximum size every pixel of × still closes the card',
      maxState.hits === maxState.samples && maxState.card.right <= 1392,
      maxState)

    // --- P1: after scrolling, dragging to the bottom-right must leave the bar above the composer. ---
    await page.evaluate(() => {
      const scroller = [...document.querySelectorAll('*')]
        .filter((el) => getComputedStyle(el).overflowY !== 'visible' && el.scrollHeight > el.clientHeight + 100)
        .sort((left, right) => right.clientHeight - left.clientHeight)[0]
      if (scroller !== undefined) scroller.scrollTop -= 400
    })
    await sleep(500)
    const buriedBar = await page.evaluate(() => {
      const r = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
      return { x: r.left + 120, y: r.top + r.height / 2 }
    })
    await page.mouse.move(buriedBar.x, buriedBar.y)
    await page.mouse.down()
    await page.mouse.move(buriedBar.x + 2000, buriedBar.y + 2000, { steps: 10 })
    await page.mouse.up()
    await sleep(400)
    const bottomState = await page.evaluate(() => {
      const card = document.querySelector('.clipchat-card').getBoundingClientRect()
      const bar = document.querySelector('.clipchat-card__bar').getBoundingClientRect()
      const hit = document.elementFromPoint(bar.left + Math.min(120, bar.width / 2), bar.top + bar.height / 2)
      const composer = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 4)
      const composerRect = composer === null ? null : composer.getBoundingClientRect()
      return {
        card: { top: Math.round(card.top), bottom: Math.round(card.bottom) },
        bar: { top: Math.round(bar.top), bottom: Math.round(bar.bottom) },
        composerTop: composerRect === null ? null : Math.round(composerRect.top),
        barHit: hit !== null && hit.closest('.clipchat-card__bar') !== null,
      }
    })
    record('dragged to the bottom-right, the title bar stays above the composer and stays grabbable',
      bottomState.composerTop !== null && bottomState.bar.bottom <= bottomState.composerTop && bottomState.barHit === true,
      bottomState)

    // --- The × still works after a gesture moved the card. ---
    const closeAfter = await geometry(page)
    await page.mouse.move(closeAfter.close.x, closeAfter.close.y)
    await page.mouse.down()
    await page.mouse.up()
    await sleep(600)
    record('× still closes after the card has been moved and resized',
      (await page.evaluate(() => document.querySelector('.clipchat-card') === null)) === true)

    // --- Minimum size: the footer stays in the card, no grip on a control. ---
    await openCard(page)
    const minimal = await shrinkToMinimum(page)
    record('the minimum card keeps its footer inside and its grips off the controls',
      minimal !== null && minimal.w === 420 && minimal.h === 320 && minimal.footerInside === true && minimal.overlaps.length === 0,
      minimal)
    await shot(page, '05b-minimum')
    const afterMin = await geometry(page)
    await page.mouse.move(afterMin.close.x, afterMin.close.y)
    await page.mouse.down()
    await page.mouse.up()
    await sleep(600)
    record('× closes from the minimum size',
      (await page.evaluate(() => document.querySelector('.clipchat-card') === null)) === true)

    // --- Keyboard, narrow window, min size: the neighbours of the fix. ---
    await openCard(page)
    await page.evaluate(() => document.querySelector('.clipchat-card__bar').focus())
    const before = await geometry(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await sleep(250)
    const keyed = await geometry(page)
    record('arrow keys still move the card',
      keyed !== null && Math.round(keyed.card.left - before.card.left) === 8 && Math.round(keyed.card.top - before.card.top) === 8,
      keyed === null ? { card: false } : { dx: Math.round(keyed.card.left - before.card.left), dy: Math.round(keyed.card.top - before.card.top) })

    await page.keyboard.down('Alt')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.up('Alt')
    await sleep(250)
    const alt = await geometry(page)
    record('Alt+arrows still resize the card',
      alt !== null && Math.round(alt.card.width - keyed.card.width) === 8 && Math.round(alt.card.height - keyed.card.height) === 8,
      alt === null ? { card: false } : { dw: Math.round(alt.card.width - keyed.card.width), dh: Math.round(alt.card.height - keyed.card.height) })

    await page.keyboard.press('Home')
    await sleep(600)
    const homed = await geometry(page)
    record('Home still resets size and place',
      homed !== null && Math.round(homed.card.width) === 600 && homed.transform === 'none',
      homed === null ? { card: false } : { width: Math.round(homed.card.width), transform: homed.transform })

    // Leave an offset and a pinned size behind, then shrink the window without
    // pressing Home: the card must still come back inside on its own.
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await sleep(200)
    await page.setViewport({ width: 360, height: 800 })
    await sleep(600)
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
    await sleep(600)
    const narrow = await page.evaluate(() => {
      const card = document.querySelector('.clipchat-card')
      const footer = document.querySelector('.clipchat-card__footer')
      if (card === null || footer === null) return null
      const rect = card.getBoundingClientRect()
      const clip = (() => {
        for (let node = card.parentElement; node !== null && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node)
          if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
            const r = node.getBoundingClientRect()
            return { left: r.left, right: r.right, width: r.width, overflow: style.overflowX + '/' + style.overflowY, tag: node.tagName + '.' + (node.className ?? '').toString().split(' ')[0] }
          }
        }
        return null
      })()
      return {
        width: rect.width,
        left: rect.left,
        right: rect.right,
        transform: card.style.transform,
        clip,
        viewport: window.innerWidth,
        footerOverflow: footer.scrollWidth - footer.clientWidth,
        closeVisible: (() => {
          const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
          return close.right <= window.innerWidth + 1 && close.width > 0
        })(),
      }
    })
    record('a 360px window keeps the card, footer and × inside',
      narrow !== null && narrow.width <= 344 && narrow.right <= 360 && narrow.footerOverflow <= 1 && narrow.closeVisible === true,
      narrow === null ? { card: false } : narrow)
    await shot(page, '06-narrow')
    await page.evaluate(() => document.querySelector('.clipchat-card__bar').focus())
    await page.keyboard.press('Home')
    await sleep(700)
    const narrowHome = await layoutReport(page)
    record('Home in a 360px window lands the card back inside the viewport',
      narrowHome !== null && narrowHome.left >= 0 && narrowHome.right <= 360,
      narrowHome)

    // Close and open a fresh card in the same narrow window: the host anchors it
    // again, so the remembered size must be fitted to the new anchor too.
    await page.evaluate(() => document.querySelector('.clipchat-card__close')?.click())
    await sleep(600)
    await openCard(page)
    await sleep(600)
    const reopened = await layoutReport(page)
    record('a card reopened in a 360px window opens inside it',
      reopened !== null && reopened.left >= 0 && reopened.right <= 360 && reopened.footerInside === true,
      reopened)

    // Close on the narrow layout too.
    const narrowClose = await page.evaluate(() => {
      const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
      const element = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2)
      return element !== null && element.closest('.clipchat-card__close') !== null
    })
    record('× is still the top element at 360px', narrowClose === true)

    await page.setViewport({ width: 860, height: 900 })
    await sleep(600)
    const wideClose = await page.evaluate(() => {
      const close = document.querySelector('.clipchat-card__close').getBoundingClientRect()
      const element = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2)
      return element !== null && element.closest('.clipchat-card__close') !== null
    })
    record('× is still the top element at 860px', wideClose === true)
    await shot(page, '07-wide')
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
