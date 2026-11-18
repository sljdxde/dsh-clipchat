/**
 * P0-4: after the virtualised history window has scrolled far from turn 10,
 * pressing “定位” on a record for that turn must mount it, centre its
 * underline, and close the card.
 *
 * The case deliberately depends only on the host's public DOM and on the
 * plugin's own rendered classes. It never reaches into React state, so it keeps
 * testing the same path a person drives.
 */
import { ANCHOR, TARGET_TURN } from '../lib/fixture.mjs'

/** Fixed viewport the case assumes (set by the browser launcher). */
const VIEWPORT = { width: 1440, height: 900 }
/** How long one host navigation may take before it is declared stuck. */
const NAVIGATION_TIMEOUT_MS = 20_000
/** Extra settle time after a rail jump: the host pages history in. */
const JUMP_SETTLE_MS = 6500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Record one step; a thrown error keeps the partial assertion list.
 * @param {object[]} assertions - accumulator.
 * @param {string} name - assertion name.
 * @param {() => Promise<unknown>} body - step body.
 * @returns {Promise<void>} resolves when the step passed.
 */
async function step(assertions, name, body) {
  const startedAt = Date.now()
  try {
    const detail = await body()
    const text = detail === undefined ? 'ok' : String(detail)
    assertions.push({ name, passed: true, detail: text, durationMs: Date.now() - startedAt })
    return text
  } catch (error) {
    assertions.push({ name, passed: false, detail: error?.message ?? String(error), durationMs: Date.now() - startedAt })
    throw error
  }
}

/**
 * Click one element through the DOM, which is not affected by overlays that
 * intercept real pointer events during the host's startup transition.
 * @param {object} page - puppeteer page.
 * @param {string} selector - CSS selector.
 * @returns {Promise<boolean>} whether the element existed.
 */
async function click(page, selector) {
  return await page.evaluate((css) => {
    const element = document.querySelector(css)
    if (element === null) return false
    element.click()
    return true
  }, selector)
}

/**
 * Click the first element whose text matches.
 * @param {object} page - puppeteer page.
 * @param {string} token - exact trimmed text.
 * @returns {Promise<boolean>} whether it was found.
 */
async function clickByText(page, token) {
  return await page.evaluate((wanted) => {
    const element = [...document.querySelectorAll('button')]
      .find((button) => (button.textContent ?? '').trim() === wanted)
    if (element === undefined) return false
    element.click()
    return true
  }, token)
}

/**
 * Open the fixture session and wait for its transcript.
 * @param {object} page - puppeteer page.
 * @param {string} sessionId - fixture session id.
 * @returns {Promise<void>} resolves once turns are mounted.
 */
async function openSession(page, sessionId) {
  const selector = `[data-row-key="session:${sessionId}"]`
  await page.waitForSelector(selector, { timeout: NAVIGATION_TIMEOUT_MS })
  const alreadyOpen = await page.evaluate((css) => {
    const row = document.querySelector(css)
    return row !== null && row.getAttribute('aria-selected') === 'true'
      && document.querySelector('[data-chat-turn]') !== null
  }, selector)
  if (!alreadyOpen) {
    const clicked = await click(page, selector)
    if (!clicked) throw new Error(`session row ${selector} disappeared before it could be clicked`)
  }
  await page.waitForSelector('[data-chat-turn]', { timeout: NAVIGATION_TIMEOUT_MS })
  await sleep(1200)
}

/**
 * Row numbers currently mounted in the transcript.
 * @param {object} page - puppeteer page.
 * @returns {Promise<number[]>} turn numbers.
 */
async function mountedTurns(page) {
  return await page.evaluate(() => [...document.querySelectorAll('[data-chat-turn]')]
    .map((row) => Number.parseInt(row.getAttribute('data-chat-turn') ?? '', 10))
    .filter((value) => Number.isInteger(value)))
}

/**
 * Scroll the turn rail so the mark for `turn` is rendered, then click it.
 *
 * The rail virtualises its own marks, so a mark for turn 10 does not exist in
 * the DOM until the rail is scrolled near it. Pitch is derived from a rendered
 * mark's `data-index` and its offset inside the scroller, with the host's
 * fixed 10px pitch as the fallback; that keeps this independent of the rail's
 * generated class names.
 *
 * @param {object} page - puppeteer page.
 * @param {number} turn - target turn.
 * @returns {Promise<object>} rail diagnostics.
 */
async function jumpToTurn(page, turn) {
  const scrolled = await page.evaluate((wanted) => {
    const marks = [...document.querySelectorAll('button[data-index][aria-label]')]
      .filter((mark) => (mark.getAttribute('aria-label') ?? '').includes('轮'))
    if (marks.length === 0) return { ok: false, reason: 'no turn marks are rendered' }
    const anchor = marks[0]
    let scroller = anchor.parentElement
    while (scroller !== null) {
      const style = getComputedStyle(scroller)
      const scrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll')
        && scroller.scrollHeight > scroller.clientHeight
      if (scrollable) break
      scroller = scroller.parentElement
    }
    if (scroller === null) return { ok: false, reason: 'no scrollable ancestor for the turn rail' }
    const index = Number.parseInt(anchor.getAttribute('data-index') ?? '', 10)
    const offset = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const pitch = Number.isInteger(index) && index > 0 && offset > 0 ? offset / index : 10
    const target = Math.max(0, (wanted - 1) * pitch - scroller.clientHeight / 2)
    scroller.scrollTop = target
    return { ok: true, pitch, target, scrollHeight: scroller.scrollHeight, clientHeight: scroller.clientHeight }
  }, turn)
  if (!scrolled.ok) throw new Error(`rail scroll failed: ${scrolled.reason}`)
  await sleep(700)
  const clicked = await page.evaluate((wanted) => {
    const labels = [`加载并跳转到第 ${wanted} 轮`, `跳转到第 ${wanted} 轮`]
    for (const label of labels) {
      const button = [...document.querySelectorAll('button[aria-label]')]
        .find((candidate) => candidate.getAttribute('aria-label') === label)
      if (button !== undefined) {
        button.click()
        return { ok: true, label }
      }
    }
    return { ok: false, rendered: [...document.querySelectorAll('button[data-index][aria-label]')].map((b) => b.getAttribute('aria-label')) }
  }, turn)
  if (!clicked.ok) {
    throw new Error(`turn ${turn} mark was not rendered after scrolling the rail (pitch=${scrolled.pitch}); rendered=${JSON.stringify(clicked.rendered).slice(0, 400)}`)
  }
  await page.waitForSelector(`[data-chat-turn="${turn}"]`, { timeout: NAVIGATION_TIMEOUT_MS })
  await sleep(JUMP_SETTLE_MS)
  return { ...scrolled, label: clicked.label }
}

/**
 * Bounding box of the assistant paragraph for one turn.
 * @param {object} page - puppeteer page.
 * @param {number} turn - turn number.
 * @returns {Promise<{x: number, y: number, width: number, height: number, text: string}>} box.
 */
async function assistantParagraph(page, turn) {
  await page.evaluate((wanted) => {
    const row = document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
    row?.scrollIntoView({ block: 'center' })
  }, turn)
  await sleep(500)
  const box = await page.evaluate((wanted) => {
    const rows = [...document.querySelectorAll(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)]
    const fallback = [...document.querySelectorAll(`[data-chat-turn="${wanted}"] [data-chat-node-key*="assistant-step"]`)]
    const candidates = rows.length > 0 ? rows : fallback
    for (const row of candidates) {
      for (const paragraph of row.querySelectorAll('[data-text-interaction-source] p')) {
        const rect = paragraph.getBoundingClientRect()
        if (rect.height <= 0 || rect.width <= 0) continue
        const text = paragraph.textContent ?? ''
        if (!text.includes('E2E_TURN')) continue
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, text: text.slice(0, 120) }
      }
    }
    return null
  }, turn)
  if (box === null) {
    const diagnostic = await page.evaluate((wanted) => ({
      exact: document.querySelectorAll(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`).length,
      descendant: document.querySelectorAll(`[data-chat-turn="${wanted}"] [data-chat-node-key*="assistant-step"]`).length,
      paragraphs: document.querySelectorAll(`[data-chat-turn="${wanted}"] [data-text-interaction-source] p`).length,
    }), turn)
    throw new Error(`no assistant paragraph for turn ${turn}; selector counts=${JSON.stringify(diagnostic)}`)
  }
  return box
}

/**
 * Drag across one paragraph with the mouse.
 *
 * Triple-click does not produce a selection in headless Chrome, and a
 * programmatic Range bypasses the host's selection pipeline, so the case
 * performs the same gesture a person does.
 *
 * @param {object} page - puppeteer page.
 * @param {{x: number, y: number, width: number, height: number}} box - paragraph box.
 * @param {boolean} [rightToLeft] - drag backwards on the retry.
 * @returns {Promise<void>} resolves after the drag.
 */
async function dragSelect(page, box, rightToLeft = false) {
  const middle = box.y + box.height / 2
  const startX = rightToLeft ? box.x + box.width - 2 : box.x + 1
  const endX = rightToLeft ? box.x + 1 : box.x + box.width - 2
  await page.mouse.move(startX, middle)
  await page.mouse.down()
  await page.mouse.move(rightToLeft ? startX - 10 : startX + 10, middle)
  await page.mouse.move(endX, middle, { steps: 12 })
  await page.mouse.up()
}

/**
 * Select a paragraph and wait for the plugin's ask menu.
 * @param {object} page - puppeteer page.
 * @param {number} turn - turn whose assistant paragraph is selected.
 * @returns {Promise<object>} the paragraph box.
 */
async function selectAndOpenMenu(page, turn) {
  const box = await assistantParagraph(page, turn)
  for (const rightToLeft of [false, true]) {
    await dragSelect(page, box, rightToLeft)
    try {
      await page.waitForSelector('.clipchat-menu__ask', { timeout: 1500 })
      return box
    } catch { /* try the other direction once */ }
  }
  throw new Error(`drag selection did not open the ask menu for turn ${turn} (text=${JSON.stringify(box.text)}). `
    + 'The host selection pipeline produced no visible selection.')
}

/**
 * Fill the card composer and send the fixed question.
 * @param {object} page - puppeteer page.
 * @param {string} question - question to send.
 * @returns {Promise<void>} resolves once the card exists and the question is submitted.
 */
async function askQuestion(page, question) {
  const clicked = await click(page, '.clipchat-menu__ask')
  if (!clicked) throw new Error('the ask menu button vanished before it could be clicked')
  await page.waitForSelector('.clipchat-card', { timeout: 10_000 })
  await page.waitForSelector('.clipchat-card__ta', { timeout: 10_000 })
  await page.evaluate(() => document.querySelector('.clipchat-card__ta')?.focus())
  await page.keyboard.type(question, { delay: 15 })
  await page.keyboard.press('Enter')
}

/**
 * Footer record toggle label and pressed state.
 * @param {object} page - puppeteer page.
 * @returns {Promise<{label: string, pressed: string | null}|null>} control state.
 */
async function recordToggleState(page) {
  return await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.clipchat-card__footer button')]
    const toggle = buttons.find((button) => /^(记录|取消记录)/u.test((button.textContent ?? '').trim()))
    if (toggle === undefined) return null
    return { label: (toggle.textContent ?? '').trim(), pressed: toggle.getAttribute('aria-pressed') }
  })
}

/**
 * Id of the highlight underline that is drawn over one turn's answer.
 *
 * Captured while that turn is mounted, so the post-locate assertions can bind
 * to exactly this highlight instead of whichever underline happens to be first.
 *
 * @param {object} page - puppeteer page.
 * @param {number} turn - turn whose highlight is wanted.
 * @returns {Promise<string>} `data-clipchat-id` of the intersecting line.
 */
async function targetHighlightId(page, turn) {
  const intersects = (wanted) => {
    const row = document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
      ?? document.querySelector(`[data-chat-turn="${wanted}"]`)
    if (row === null) return false
    const box = row.getBoundingClientRect()
    return [...document.querySelectorAll('.clipchat-layer__line[data-clipchat-id]')].some((line) => {
      const rect = line.getBoundingClientRect()
      return rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom
    })
  }
  try {
    await page.waitForFunction(intersects, { timeout: 5000, polling: 100 }, turn)
  } catch {
    throw new Error(`cannot identify the target highlight for turn ${turn}: no .clipchat-layer__line[data-clipchat-id] intersects its row`)
  }
  const id = await page.evaluate((wanted) => {
    const row = document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
      ?? document.querySelector(`[data-chat-turn="${wanted}"]`)
    if (row === null) return null
    const box = row.getBoundingClientRect()
    const line = [...document.querySelectorAll('.clipchat-layer__line[data-clipchat-id]')]
      .find((candidate) => {
        const rect = candidate.getBoundingClientRect()
        return rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom
      })
    return line?.getAttribute('data-clipchat-id') ?? null
  }, turn)
  if (id === null) throw new Error(`cannot identify the target highlight for turn ${turn}: its row has no intersecting underline`)
  return id
}

/**
 * Assert geometry that proves the located turn is visible and its underline is
 * centred; returns the measured numbers for the assertion detail.
 * @param {object} page - puppeteer page.
 * @param {string} highlightId - target underline's `data-clipchat-id`.
 * @returns {Promise<object>} measurements.
 */
async function measureCentred(page, highlightId) {
  const measured = await page.evaluate((wanted) => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (scroller === null) return { ok: false, reason: 'no conversation scroller' }
    const view = scroller.getBoundingClientRect()
    const rows = [...document.querySelectorAll('[data-chat-turn="10"]')]
      .map((row) => row.getBoundingClientRect())
      .filter((rect) => rect.height > 0 && rect.width > 0)
    if (rows.length === 0) return { ok: false, reason: 'turn 10 has no laid-out box' }
    const row = rows[0]
    const intersection = Math.max(0, Math.min(row.bottom, view.bottom) - Math.max(row.top, view.top))
    const lines = [...document.querySelectorAll('.clipchat-layer__line')]
      .filter((line) => line.getAttribute('data-clipchat-id') === wanted)
      .map((line) => line.getBoundingClientRect())
      .filter((rect) => rect.height > 0 && rect.width > 0)
    if (lines.length === 0) return { ok: false, reason: `target underline ${wanted} is not mounted with height` }
    const line = lines[0]
    const lineCentre = line.top + line.height / 2
    const needsCare = row.height > view.height
    const ratio = intersection / row.height
    return {
      ok: true,
      view: { top: view.top, height: view.height },
      row: { top: row.top, height: row.height, intersection, ratio },
      line: { top: line.top, height: line.height, centre: lineCentre },
      centred: lineCentre >= view.top + 0.25 * view.height && lineCentre <= view.top + 0.75 * view.height,
      visible: needsCare
        ? row.top >= view.top && row.top < view.bottom && intersection >= 0.5 * view.height
        : ratio >= 0.8,
      cardCount: document.querySelectorAll('.clipchat-card').length,
      failedHint: [...document.querySelectorAll('.clipchat-card__hint')]
        .some((hint) => (hint.textContent ?? '').includes('原文位置已找不到')),
    }
  }, highlightId)
  if (!measured.ok) throw new Error(`post-locate measurement failed: ${measured.reason}`)
  return measured
}

/**
 * Run the case.
 * @param {object} context - runner context.
 * @param {object} context.page - puppeteer page.
 * @param {object} context.paths - run paths.
 * @param {string} context.url - authenticated Web URL.
 * @param {string} context.sessionId - fixture session id.
 * @param {(line: string) => void} context.log - line sink.
 * @returns {Promise<{assertions: object[]}>} recorded assertions.
 */
export async function run({ page, url, sessionId, log }) {
  const assertions = []
  try {
    return await runSteps({ page, url, sessionId, log, assertions })
  } catch (error) {
    if (!assertions.some((assertion) => assertion.passed === false)) {
      assertions.push({ name: 'case-error', passed: false, detail: `${error?.name ?? 'Error'}: ${error?.message ?? error}` })
    }
    const wrapped = new Error(error?.message ?? String(error))
    wrapped.assertions = assertions
    throw wrapped
  }
}

/**
 * Run the ordered steps; a single `assertions` array is shared with the caller
 * so a failure still reports every step that passed before it.
 * @param {object} context - runner context plus the accumulator.
 * @returns {Promise<{assertions: object[]}>} recorded assertions.
 */
async function runSteps({ page, url, sessionId, log, assertions }) {
  await page.setViewport(VIEWPORT)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  let highlightId = null

  await step(assertions, 'open fixture session', async () => {
    await openSession(page, sessionId)
    const turns = await mountedTurns(page)
    return `mounted turns ${Math.min(...turns)}-${Math.max(...turns)} (${turns.length} rows)`
  })

  await step(assertions, 'rail jump mounts target turn', async () => {
    const result = await jumpToTurn(page, TARGET_TURN)
    const text = await page.evaluate((wanted) => {
      const row = document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
      return (row?.textContent ?? '').slice(0, 160)
    }, TARGET_TURN)
    if (!text.includes(ANCHOR)) throw new Error(`turn ${TARGET_TURN} mounted but does not contain ${ANCHOR}: ${JSON.stringify(text)}`)
    return `${result.label} pitch=${result.pitch} text=${JSON.stringify(text.slice(0, 80))}`
  })

  await step(assertions, 'drag selection and ask', async () => {
    const box = await selectAndOpenMenu(page, TARGET_TURN)
    await askQuestion(page, 'E2E_QUESTION_10')
    return `selected ${JSON.stringify(box.text.slice(0, 60))}`
  })

  await step(assertions, 'answer streamed and auto-recorded', async () => {
    await page.waitForFunction(() => {
      const answer = document.querySelector('.clipchat-card__a')
      return answer !== null && (answer.textContent ?? '').includes('E2E_MOCK_ANSWER')
    }, { timeout: 30_000, polling: 100 })
    const state = await recordToggleState(page)
    if (state === null || state.pressed !== 'true' || state.label !== '取消记录') {
      throw new Error(`record toggle is not in its saved state: ${JSON.stringify(state)}`)
    }
    const records = await page.evaluate(() => [...document.querySelectorAll('.clipchat-card__footer button')]
      .map((button) => (button.textContent ?? '').trim())
      .find((text) => /^记录 \d+$/u.test(text)) ?? null)
    if (records === null || !/^记录 [1-9]\d*$/u.test(records)) throw new Error(`records count button not found: ${JSON.stringify(records)}`)
    // Bind the later geometry assertions to this exact underline: while turn 10
    // is still mounted, the line crossing its row is the one the locate control
    // will bring back into view.
    highlightId = await targetHighlightId(page, TARGET_TURN)
    return `answer received; ${records} highlight=${highlightId}`
  })

  await step(assertions, 'return to tail and reload', async () => {
    await page.evaluate(() => {
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (scroller !== null) scroller.scrollTop = scroller.scrollHeight
    })
    await sleep(300)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openSession(page, sessionId)
    let turns = await mountedTurns(page)
    if (turns.includes(TARGET_TURN)) {
      const returned = await page.evaluate(() => {
        const button = document.querySelector('button[aria-label="回到底部"]')
        if (button === null) return false
        button.click()
        return true
      })
      if (returned) {
        await sleep(800)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await openSession(page, sessionId)
        turns = await mountedTurns(page)
      }
    }
    if (turns.includes(TARGET_TURN)) {
      throw new Error(`environment premise violated: turn ${TARGET_TURN} is still mounted after reload (min=${Math.min(...turns)})`)
    }
    return `turns ${Math.min(...turns)}-${Math.max(...turns)}`
  })

  await step(assertions, 'pre-locate target is absent', async () => {
    const state = await page.evaluate((wanted) => {
      const turns = [...document.querySelectorAll('[data-chat-turn]')]
        .map((row) => Number.parseInt(row.getAttribute('data-chat-turn') ?? '', 10))
        .filter((value) => Number.isInteger(value))
      return {
        present: document.querySelector(`[data-chat-turn="${wanted}"]`) !== null,
        minTurn: turns.length === 0 ? null : Math.min(...turns),
        maxTurn: turns.length === 0 ? null : Math.max(...turns),
        cards: document.querySelectorAll('.clipchat-card').length,
      }
    }, TARGET_TURN)
    if (state.present) throw new Error(`turn ${TARGET_TURN} is already mounted before locating`)
    if (state.minTurn === null || state.minTurn <= TARGET_TURN) {
      throw new Error(`minTurn=${state.minTurn} does not exceed ${TARGET_TURN}; the virtual window still contains the target`)
    }
    return `minTurn=${state.minTurn} maxTurn=${state.maxTurn} cards=${state.cards}`
  })

  const located = await step(assertions, 'record locate control opens target record', async () => {
    const turns = await mountedTurns(page)
    const latest = Math.max(...turns)
    await selectAndOpenMenu(page, latest)
    await click(page, '.clipchat-menu__ask')
    await page.waitForSelector('.clipchat-card__records', { timeout: 10_000 }).catch(async () => {
      const opened = await page.evaluate(() => {
        const toggle = [...document.querySelectorAll('.clipchat-card__footer button')]
          .find((button) => /^记录 \d+$/u.test((button.textContent ?? '').trim())
            && button.getAttribute('aria-expanded') === 'false')
        if (toggle === undefined) return false
        toggle.click()
        return true
      })
      if (!opened) throw new Error('records toggle was not present in the card footer')
      await page.waitForSelector('.clipchat-card__records', { timeout: 10_000 })
    })
    const found = await page.evaluate((anchor) => {
      const rows = [...document.querySelectorAll('.clipchat-card__record')]
      const row = rows.find((candidate) => (candidate.querySelector('.clipchat-card__record-selection')?.textContent ?? '').includes(anchor))
      if (row === undefined) {
        return { ok: false, selections: rows.map((candidate) => candidate.querySelector('.clipchat-card__record-selection')?.textContent ?? '') }
      }
      const box = row.getBoundingClientRect()
      const button = row.querySelector('.clipchat-card__record-locate')
      if (box.height <= 0 || button === null) return { ok: false, reason: 'record row has no box or no locate button' }
      button.click()
      return { ok: true, selection: row.querySelector('.clipchat-card__record-selection')?.textContent ?? '' }
    }, ANCHOR)
    if (!found.ok) throw new Error(`record for ${ANCHOR} not found: ${JSON.stringify(found).slice(0, 600)}`)
    return `record selection=${JSON.stringify(found.selection)} latest turn=${latest}`
  })
  log(`locate control: ${located}`)

  await step(assertions, 'post-locate target mounted', async () => {
    await page.waitForFunction(() => document.querySelectorAll('.clipchat-card').length === 0,
      { timeout: 10_000, polling: 100 })
    await page.waitForSelector(`[data-chat-turn="${TARGET_TURN}"]`, { timeout: 8000 })
    return `turn ${TARGET_TURN} is mounted and the card closed`
  })

  await step(assertions, 'post-locate target centred', async () => {
    if (highlightId === null) throw new Error('target highlight id was not captured while turn 10 was mounted')
    try {
      await page.waitForFunction((wanted) => {
        const scroller = document.querySelector('[data-conversation-scroll]')
        if (scroller === null) return false
        const view = scroller.getBoundingClientRect()
        const line = [...document.querySelectorAll('.clipchat-layer__line')]
          .find((candidate) => candidate.getAttribute('data-clipchat-id') === wanted)
        if (line === undefined) return false
        const rect = line.getBoundingClientRect()
        if (rect.height <= 0) return false
        const centre = rect.top + rect.height / 2
        return centre >= view.top + 0.25 * view.height && centre <= view.top + 0.75 * view.height
      }, { timeout: 4000, polling: 100 }, highlightId)
    } catch {
      throw new Error(`target underline ${highlightId} did not enter the middle band within 4s`)
    }
    const measured = await measureCentred(page, highlightId)
    if (!measured.visible) throw new Error(`turn ${TARGET_TURN} is not sufficiently visible: ${JSON.stringify(measured.row)} in ${JSON.stringify(measured.view)}`)
    if (!measured.centred) throw new Error(`underline ${highlightId} is not in the middle band: ${JSON.stringify(measured.line)} in ${JSON.stringify(measured.view)}`)
    if (measured.cardCount !== 0) throw new Error(`card did not close: ${measured.cardCount} remain`)
    if (measured.failedHint) throw new Error('the card reported “原文位置已找不到”')
    return `highlight=${highlightId} row=${JSON.stringify(measured.row)} line=${JSON.stringify(measured.line)}`
  })

  return { assertions }
}
