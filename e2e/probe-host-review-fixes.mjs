#!/usr/bin/env node
/**
 * Real-host probe for the two must-fix findings of the drag/resize code review.
 *
 * 1) The east resize rail sat on the answer's native scrollbar: a press meant
 *    for the scrollbar resized the card instead. The thread is now inset by the
 *    rail's width, so a scrollbar laid out inside the thread's box lands left of
 *    the rail. This host runs overlay scrollbars (zero layout width), so the
 *    probe also injects a 15px classic scrollbar to reproduce the Windows/Linux
 *    layout the finding was reported against — and takes the inset back out at
 *    runtime as a negative control, to show the same probe catches the defect.
 * 2) The visible bottom-right grip is a tab stop, but the card's key handler
 *    ignored it: tabbing onto the one visible handle lost every keyboard
 *    shortcut. The probe walks the real Tab order onto the grip and presses
 *    arrows, Alt+arrow and Home there.
 *
 * It also guards what must not regress: the rail still resizes, and the records
 * panel — which replaces the thread — keeps the same right-hand text gap.
 *
 * Usage: node e2e/probe-host-review-fixes.mjs [outDir]
 */
import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { attachPageLogs, launchBrowser } from './lib/browser.mjs'
import { assertDshBin, dumpConfig, resolveDshBin, startWeb } from './lib/dsh.mjs'
import { generateSeedSession, purgeProjectionCache, rewriteFixture } from './lib/fixture.mjs'
import { startMockLlm } from './lib/mock-llm.mjs'
import { createRunDirs, makeRunId, pathsFor } from './lib/paths.mjs'
import { findFreePort } from './lib/port.mjs'
import { writeProfiles } from './lib/profile.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const OUT = process.argv[2] ?? join(process.env.HOME ?? '/tmp', 'clipchat-review-fix-shots')
const checks = []
function record(name, passed, detail) {
  checks.push({ name, passed, detail })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name} - ${typeof detail === 'string' ? detail : JSON.stringify(detail)}\n`)
}

/** An answer long enough that the card's answer area scrolls. */
function longAnswer() {
  const lines = ['E2E_LONG_ANSWER 下面是一段很长的回答，用来把回答区撑出滚动条。', '']
  for (let index = 1; index <= 80; index += 1) {
    lines.push(`第 ${index} 段：这一段用来占高度，内容本身没有意义，只负责让回答比卡片高得多。段落里再补一句，保证换行之后仍然占两行以上的高度。`)
    lines.push('')
  }
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
  await page.waitForFunction(() => {
    const send = document.querySelector('.clipchat-card__send')
    return send !== null && send.textContent !== '■'
  }, { timeout: 90_000 })
  await sleep(400)
}

/**
 * Everything the two findings are about: where the rail is, where the answer's
 * scrollbar is, which element owns the pixel between them, and what the card's
 * inline geometry currently says.
 */
async function measure(page) {
  return await page.evaluate(() => {
    const card = document.querySelector('.clipchat-card')
    if (card === null) return null
    const thread = card.querySelector('.clipchat-card__thread')
    const rail = card.querySelector('.clipchat-card__grip--e')
    const cardRect = card.getBoundingClientRect()
    const threadRect = thread.getBoundingClientRect()
    const railRect = rail.getBoundingClientRect()
    // A classic scrollbar takes layout space inside the thread's box; an
    // overlay one is drawn over the thread's right edge and takes none.
    const scrollbarWidth = thread.offsetWidth - thread.clientWidth
    const middleY = threadRect.top + threadRect.height / 2
    const scrollbarX = threadRect.right - (scrollbarWidth > 0 ? scrollbarWidth / 2 : 2)
    const owner = (x) => {
      const hit = document.elementFromPoint(x, middleY)
      if (hit === null) return 'nothing'
      if (hit.closest('.clipchat-card__grip') !== null) return 'rail'
      if (hit.closest('.clipchat-card__thread') !== null) return 'thread'
      return hit.tagName.toLowerCase()
    }
    const threadStyle = getComputedStyle(thread)
    const threadRightGap = Number.parseFloat(threadStyle.paddingRight) + Number.parseFloat(threadStyle.marginRight)
    const moved = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform ?? '')
    return {
      card: {
        left: Math.round(cardRect.left),
        top: Math.round(cardRect.top),
        right: Math.round(cardRect.right),
        width: Math.round(cardRect.width),
        height: Math.round(cardRect.height),
      },
      thread: {
        right: Math.round(threadRect.right * 10) / 10,
        scrollbarWidth,
        scrollTop: Math.round(thread.scrollTop),
        scrollHeight: thread.scrollHeight,
        clientHeight: thread.clientHeight,
      },
      rail: {
        left: Math.round(railRect.left * 10) / 10,
        right: Math.round(railRect.right * 10) / 10,
        width: Math.round(railRect.width * 10) / 10,
      },
      gap: Math.round((cardRect.right - threadRect.right) * 10) / 10,
      threadRightGap,
      middleY: Math.round(middleY),
      scrollbarX: Math.round(scrollbarX * 10) / 10,
      ownerAtScrollbar: owner(scrollbarX),
      ownerAtRail: owner(cardRect.right - 4),
      offset: { x: moved === null ? 0 : Number(moved[1]), y: moved === null ? 0 : Number(moved[2]) },
      inline: { width: card.style.width, height: card.style.height, transform: card.style.transform },
      className: card.className,
    }
  })
}

async function shot(page, name, clip) {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip === undefined ? {} : { clip }) })
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

/** Park the answer mid-way so a scrollbar's thumb sits under the middle of the rail. */
async function centreScroll(page) {
  await page.evaluate(() => {
    const thread = document.querySelector('.clipchat-card__thread')
    if (thread === null) return
    thread.scrollTop = Math.round((thread.scrollHeight - thread.clientHeight) / 2)
  })
  await sleep(250)
}

/** Put the thread's own right inset back / take it out, for the negative control. */
async function setInset(page, on) {
  await page.evaluate((keep) => {
    const thread = document.querySelector('.clipchat-card__thread')
    if (thread === null) return
    thread.style.marginRight = keep ? '' : '0px'
    thread.style.paddingRight = keep ? '' : '16px'
  }, on)
  await sleep(300)
}

async function main() {
  // A re-run must not leave screenshots from an earlier attempt next to these.
  await mkdir(OUT, { recursive: true })
  for (const name of await readdir(OUT)) {
    if (name.endsWith('.png')) await rm(join(OUT, name), { force: true })
  }
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
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(`console: ${String(message.text()).slice(0, 300)}`)
    })
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForSelector('[data-row-key]', { timeout: 60_000 })
    await openSession(page, seed.sessionId)

    // --- Setup: a card holding an answer taller than the card. ---
    await openCard(page)
    await askCard(page, '这段怎么理解？')
    const loaded = await measure(page)
    await shot(page, '01-long-answer')
    record('the answer area really scrolls, so the scrollbar exists',
      loaded !== null && loaded.thread.scrollHeight > loaded.thread.clientHeight + 600, loaded?.thread)
    process.stdout.write(`native scrollbar: ${loaded !== null && loaded.thread.scrollbarWidth > 0 ? 'classic' : 'overlay (zero layout width)'}\n`)

    // --- Finding 1: which element owns the pixels at the card's right edge. ---
    // The close-up that the numbers describe: the answer's edge, the rail's
    // 10px and the card's border, from the card's right-hand 60px.
    await shot(page, '01b-right-edge-before-any-drag', {
      x: Math.max(0, loaded.card.right - 60),
      y: Math.max(0, loaded.card.top + 60),
      width: 60,
      height: Math.min(320, Math.max(60, loaded.card.height - 120)),
    })
    record('the thread ends at least the rail width inside the card, so a laid-out scrollbar is left of the rail',
      loaded !== null && loaded.gap >= loaded.rail.width,
      loaded === null ? null : {
        threadRight: loaded.thread.right, railLeft: loaded.rail.left, cardRight: loaded.card.right,
        gap: loaded.gap, railWidth: loaded.rail.width,
      })
    record('a 15px classic scrollbar laid out inside the thread would still clear the rail',
      loaded !== null && loaded.thread.right - 15 < loaded.rail.left,
      loaded === null ? null : {
        classicScrollbarSpan: [Math.round((loaded.thread.right - 15) * 10) / 10, loaded.thread.right],
        railSpan: [loaded.rail.left, loaded.rail.right],
      })
    record('the outermost thread pixel belongs to the answer area, not to the resize rail',
      loaded !== null && loaded.ownerAtScrollbar === 'thread' && loaded.ownerAtRail === 'rail',
      loaded === null ? null : {
        atOutermostThreadPixel: loaded.ownerAtScrollbar, x: loaded.scrollbarX,
        atRailPixel: loaded.ownerAtRail, railX: loaded.card.right - 4,
      })
    record('the inset is paid out of the right padding, so the text keeps its 16px gap',
      loaded !== null && loaded.threadRightGap === 16, loaded === null ? null : { rightGap: loaded.threadRightGap })

    // --- Finding 1 with a real mouse: press at the far right and drag. ---
    // The report was "the far-right 10px turns a scrollbar drag into a card
    // resize"; the press now lands in the answer area and the width must stay.
    await dragBy(page, loaded.scrollbarX, loaded.middleY, { dx: -40 })
    const edgeDragged = await measure(page)
    await shot(page, '02-after-far-right-drag')
    record('a real press-and-drag on that pixel does not resize the card',
      edgeDragged !== null && edgeDragged.card.width === loaded.card.width && !/ is-resizing/.test(edgeDragged.className),
      edgeDragged === null ? null : {
        widthBefore: loaded.card.width, widthAfter: edgeDragged.card.width, className: edgeDragged.className,
      })

    // --- Negative control: take the inset out and the rail eats the pixel again. ---
    await setInset(page, false)
    const control = await measure(page)
    await shot(page, '03-negative-control-no-inset', {
      x: Math.max(0, control === null ? 0 : control.card.right - 60),
      y: Math.max(0, control === null ? 0 : control.card.top + 60),
      width: 60,
      height: Math.min(320, Math.max(60, (control === null ? 0 : control.card.height) - 120)),
    })
    record('negative control: without the inset, that pixel is the rail again',
      control !== null && control.ownerAtScrollbar === 'rail',
      control === null ? null : { owner: control.ownerAtScrollbar, x: control.scrollbarX, gap: control.gap })
    await setInset(page, true)
    const restored = await measure(page)
    record('the inset is back, and the card is still open, after the control',
      restored !== null && restored.ownerAtScrollbar === 'thread' && restored.gap >= restored.rail.width,
      restored === null ? null : { owner: restored.ownerAtScrollbar, gap: restored.gap })

    // --- The rail itself still resizes (the fix must not disable it). ---
    await page.focus('.clipchat-card__bar')
    await page.keyboard.press('Home')
    await sleep(650)
    const home0 = await measure(page)
    await dragBy(page, home0.card.right - 4, home0.middleY, { dx: -100 })
    const resized = await measure(page)
    await shot(page, '04-rail-still-resizes')
    record('the east rail still resizes the card',
      resized !== null && resized.card.width <= home0.card.width - 90,
      resized === null ? null : { from: home0.card.width, to: resized.card.width, pageErrors: pageErrors.slice(-3) })

    // --- Finding 2: Tab onto the grip, then drive the card from it. ---
    await page.focus('.clipchat-card__bar')
    await page.keyboard.press('Home')
    await sleep(650)
    const baseline = await measure(page)
    const focusTrail = []
    let onGrip = false
    for (let step = 0; step < 30; step += 1) {
      await page.keyboard.press('Tab')
      const active = await page.evaluate(() => {
        const element = document.activeElement
        if (element === null) return null
        const className = typeof element.className === 'string' ? element.className : ''
        return { className, tag: element.tagName.toLowerCase(), grip: element.closest?.('.clipchat-card__grip') !== null }
      })
      focusTrail.push(active === null ? 'none' : (active.grip ? 'grip' : active.className.split(' ').at(-1) || active.tag))
      if (active !== null && active.grip === true) { onGrip = true; break }
    }
    await shot(page, '05-grip-focused')
    record('Tab reaches the visible resize grip', onGrip,
      { steps: focusTrail.length, trail: focusTrail.join(' -> ') })

    await page.keyboard.press('ArrowRight')
    await sleep(150)
    const arrowed = await measure(page)
    record('an arrow key on the focused grip moves the card by 8px',
      arrowed !== null && arrowed.offset.x - baseline.offset.x === 8 && arrowed.offset.y === baseline.offset.y,
      arrowed === null ? null : { from: baseline.offset, to: arrowed.offset })

    await page.keyboard.down('Alt')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.up('Alt')
    await sleep(250)
    const resizedByKey = await measure(page)
    record('Alt+arrow on the focused grip resizes the card by 8px',
      arrowed !== null && resizedByKey !== null && resizedByKey.card.width - arrowed.card.width === 8,
      resizedByKey === null ? null : { from: arrowed?.card.width, to: resizedByKey.card.width })
    await shot(page, '06-grip-after-keys')

    const columnBefore = await page.evaluate(() => {
      let node = document.querySelector('.clipchat-card')?.parentElement ?? null
      while (node !== null) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node.scrollTop
        node = node.parentElement
      }
      return null
    })
    await page.keyboard.press('ArrowDown')
    await sleep(150)
    const movedDown = await measure(page)
    const columnAfter = await page.evaluate(() => {
      let node = document.querySelector('.clipchat-card')?.parentElement ?? null
      while (node !== null) {
        const style = getComputedStyle(node)
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node.scrollTop
        node = node.parentElement
      }
      return null
    })
    record('a plain arrow on the grip moves the card instead of scrolling the page',
      resizedByKey !== null && movedDown !== null && movedDown.offset.y - resizedByKey.offset.y === 8
        && columnAfter === columnBefore,
      movedDown === null ? null : {
        from: resizedByKey?.offset, to: movedDown.offset,
        columnScrollBefore: columnBefore, columnScrollAfter: columnAfter,
      })

    await page.keyboard.press('Home')
    await sleep(650)
    const homed = await measure(page)
    await shot(page, '07-home-from-grip')
    record('Home on the focused grip puts the card back where Home from the title bar does',
      homed !== null && Math.abs(homed.card.width - 600) <= 2
        && homed.inline.height === '' && homed.offset.x === baseline.offset.x && homed.offset.y === baseline.offset.y,
      homed === null ? null : {
        width: homed.card.width, inlineHeight: homed.inline.height,
        offset: homed.offset, baseline: baseline.offset,
      })

    // --- The records panel replaces the thread; its right-hand text gap must match. ---
    const opened = await page.evaluate(() => {
      const toggle = document.querySelector('.clipchat-actions__btn[aria-expanded]')
      if (toggle === null) return false
      toggle.click()
      return true
    })
    await sleep(400)
    const records = opened
      ? await page.evaluate(() => {
        const panel = document.querySelector('.clipchat-card__records')
        const card = document.querySelector('.clipchat-card')
        const thread = card === null ? null : card.querySelector('.clipchat-card__thread')
        if (panel === null || card === null || thread === null) return null
        const panelStyle = getComputedStyle(panel)
        const threadStyle = getComputedStyle(thread)
        return {
          panelPaddingRight: Number.parseFloat(panelStyle.paddingRight),
          threadRightGap: Number.parseFloat(threadStyle.paddingRight) + Number.parseFloat(threadStyle.marginRight),
          panelGap: Math.round((card.getBoundingClientRect().right - panel.getBoundingClientRect().right) * 10) / 10,
          threadHidden: getComputedStyle(thread).display === 'none',
        }
      })
      : null
    await shot(page, '08-records-panel')
    record('the records panel keeps the same right-hand text gap as the thread',
      records !== null && records.panelPaddingRight === 16 && records.threadRightGap === 16 && records.threadHidden,
      records ?? 'the records toggle was not found')
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
