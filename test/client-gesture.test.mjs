/**
 * The card's drag and resize gestures, mounted for real.
 *
 * jsdom has no layout, so the card's own `getBoundingClientRect` is stubbed to
 * report what its inline style says. That keeps a gesture chain honest: a drag
 * that writes `transform` is measured back from the same numbers a browser
 * would give the next gesture.
 */
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

import { installDom } from './helpers/dom.mjs'
import { mountComponent } from './helpers/mount.mjs'

const { act, createElement } = await import('react')

/** The shipped source, for the style rules jsdom cannot cascade for us. */
const CLIENT_SOURCE = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

/** Let effects and timers settle. */
async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** Props for one mounted card. */
function cardProps(overrides = {}) {
  const nodeKey = '1:assistant-step1:1'
  return {
    selection: 'selected passage',
    nodeKey,
    anchor: null,
    dismiss() {},
    translate: (key) => key,
    sessionId: 'session-test',
    useChat: (selector) => selector({
      nodes: { get: () => undefined },
      timeline: { turnOrder: [], turns: new Map() },
      locations: { getTurn: () => [] },
    }),
    initialHighlightId: undefined,
    ...overrides,
  }
}

/** Install a DOM at 1440x900 with a clipping container, and always restore it. */
async function withCard(body, { html = '', clip = true, props = {}, setup } = {}) {
  const env = installDom(html, { width: 600, height: 420 })
  const window = env.window
  Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  setup?.(env)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
  try {
    const mounted = await mountComponent(() => cardProps(props))
    mounted.plugin.__test.cardSizes.clear()
    const card = mounted.container.querySelector('.clipchat-card')
    if (clip) {
      // The host's centre column clips; the probe measured it at 280..1440.
      const box = env.document.createElement('div')
      box.style.overflow = 'hidden'
      box.getBoundingClientRect = () => ({ left: 280, top: 0, right: 1440, bottom: 900, width: 1160, height: 900, x: 280, y: 0 })
      env.document.body.appendChild(box)
      box.appendChild(mounted.container)
    }
    stubCardRect(card)
    return await body({ ...mounted, card, window, document: env.document, plugin: mounted.plugin })
  } finally {
    globalThis.fetch = originalFetch
    env.restore()
  }
}

/** Report a box for the card that matches its inline width/height/transform. */
function stubCardRect(card, origin = { left: 320, top: 240 }) {
  card.getBoundingClientRect = () => {
    const width = Number.parseFloat(card.style.width) || 600
    const height = Number.parseFloat(card.style.height) || 420
    const moved = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform ?? '')
    const dx = moved === null ? 0 : Number(moved[1])
    const dy = moved === null ? 0 : Number(moved[2])
    const left = origin.left + dx
    const top = origin.top + dy
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }
  }
  return card
}

/** The translate offset the card currently carries. */
function offsetOf(card) {
  const moved = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform ?? '')
  return moved === null ? { x: 0, y: 0 } : { x: Number(moved[1]), y: Number(moved[2]) }
}

/** Dispatch one pointer event like a browser would. */
function pointer(target, type, init = {}) {
  const view = globalThis.window
  const { pointerId, ...rest } = init
  const event = new view.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...rest })
  // jsdom's MouseEvent has no pointerId; the card reads it the way a real
  // PointerEvent provides it.
  if (pointerId !== undefined) Object.defineProperty(event, 'pointerId', { value: pointerId })
  target.dispatchEvent(event)
  return event
}

/** Start a gesture on `element` at the given point. */
async function down(element, x, y, init = {}) {
  await act(async () => {
    pointer(element, 'pointerdown', { clientX: x, clientY: y, button: 0, ...init })
  })
}

/** Move the pointer on the window. */
async function move(x, y) {
  await act(async () => {
    pointer(globalThis.window, 'pointermove', { clientX: x, clientY: y })
  })
}

/** Release the pointer on the window. */
async function up(x, y) {
  await act(async () => {
    pointer(globalThis.window, 'pointerup', { clientX: x, clientY: y })
  })
}

test('dragging the title bar moves the card and restores the page afterwards', async () => {
  await withCard(async ({ card, container, document }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    assert.match(card.className, /is-dragging/, 'the card knows a gesture is running')
    assert.equal(document.body.style.cursor, 'grabbing', 'the whole page shows the drag cursor')
    assert.equal(document.body.style.userSelect, 'none', 'text cannot be selected mid-drag')
    await move(460, 290)
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 })
    await up(460, 290)
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 }, 'the place survives the release')
    assert.doesNotMatch(card.className, /is-dragging/)
    assert.equal(document.body.style.cursor, '', 'the cursor is handed back')
    assert.equal(document.body.style.userSelect, '')
  })
})

test('a shaky press below 6px moves nothing', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(404, 253)
    assert.equal(card.style.transform, '', 'sub-threshold travel is a click')
    await up(404, 253)
    assert.equal(card.style.transform, '')
    assert.doesNotMatch(card.className, /is-dragging/)
  })
})

test('a press that never travelled but lasted commits the unchanged box', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await flush(220)
    await up(400, 250)
    assert.equal(card.style.transform, '', 'geometry is unchanged')
  })
})

test('a drag stops before the card leaves the clipping container', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(400 - 5000, 250 - 5000)
    const offset = offsetOf(card)
    assert.equal(320 + offset.x + 600, 288 + 96, '96px of the card stays inside the left limit')
    assert.equal(240 + offset.y, 8, 'the title bar stops at the top of the container')
    await up(0, 0)
  })
})

test('the bottom-right grip resizes both dimensions', async () => {
  await withCard(async ({ card, container, document }) => {
    const grip = container.querySelector('.clipchat-card__grip--se')
    await down(grip, 920, 660)
    assert.equal(document.body.style.cursor, 'nwse-resize')
    await move(1020, 720)
    assert.equal(card.style.width, '700px')
    assert.equal(card.style.height, '480px')
    assert.equal(card.style.maxHeight, 'none')
    await up(1020, 720)
    assert.doesNotMatch(card.className, /is-resizing/)
    assert.equal(document.body.style.cursor, '')
  })
})

test('the right edge resizes width only and the bottom edge height only', async () => {
  await withCard(async ({ card, container }) => {
    const right = container.querySelector('.clipchat-card__grip--e')
    await down(right, 920, 450)
    await move(970, 500)
    assert.equal(card.style.width, '650px')
    assert.equal(card.style.height, '', 'a vertical move on the right edge changes nothing')
    assert.equal(card.style.maxHeight, '', 'a width-only card keeps the stylesheet height cap')
    await up(970, 500)

    const bottom = container.querySelector('.clipchat-card__grip--s')
    await down(bottom, 600, 660)
    await move(700, 700)
    assert.equal(card.style.height, '460px')
    assert.equal(card.style.width, '650px', 'the width keeps what the first gesture set')
    assert.equal(card.style.maxHeight, 'none', 'a height the user pulled is not capped')
    await up(700, 700)
  })
})

test('Home gives the height cap back after a width-only resize', async () => {
  await withCard(async ({ card, container }) => {
    const grip = container.querySelector('.clipchat-card__grip--e')
    await down(grip, 920, 450)
    await move(1100, 450)
    await up(1100, 450)
    assert.equal(card.style.width, '780px')
    assert.equal(card.style.maxHeight, '')

    const bar = container.querySelector('.clipchat-card__bar')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    assert.equal(card.style.width, '600px')
    assert.equal(card.style.maxHeight, '', 'Home leaves the cap to the stylesheet, so a long answer still stops at 520px')
    assert.equal(card.className.includes('is-sized'), false)
  })
})

test('the bottom-left corner moves the left edge and compensates the offset', async () => {
  await withCard(async ({ card, container }) => {
    const grip = container.querySelector('.clipchat-card__grip--sw')
    await down(grip, 320, 660)
    await move(300, 660)
    assert.equal(card.style.width, '620px')
    assert.deepEqual(offsetOf(card), { x: -20, y: 0 }, 'the right edge stayed put')
    await up(270, 660)
  })
})

test('resizing stops at the minimum size', async () => {
  await withCard(async ({ card, container }) => {
    const grip = container.querySelector('.clipchat-card__grip--se')
    await down(grip, 920, 660)
    await move(-5000, -5000)
    assert.equal(card.style.width, '420px')
    assert.equal(card.style.height, '320px')
    await up(0, 0)
  })
})

test('pointercancel, window blur and a lost capture all end the gesture', async () => {
  for (const type of ['pointercancel', 'blur', 'lostpointercapture']) {
    await withCard(async ({ card, container, document }) => {
      const bar = container.querySelector('.clipchat-card__bar')
      await down(bar, 400, 250)
      await move(430, 280)
      await act(async () => { pointer(globalThis.window, type, {}) })
      assert.doesNotMatch(card.className, /is-dragging/, `${type} ended the gesture`)
      assert.equal(document.body.style.userSelect, '', `${type} restored the page`)
      assert.deepEqual(offsetOf(card), { x: 30, y: 30 }, 'what was moved stays moved')
    })
  }
})

test('pointer capture is used when the platform has it, and a refusal is survivable', async () => {
  await withCard(async ({ card, container }) => {
    const calls = []
    card.setPointerCapture = (id) => { calls.push(['set', id]) }
    card.releasePointerCapture = (id) => { calls.push(['release', id]) }
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250, { pointerId: 7 })
    await move(420, 260)
    await up(420, 260)
    assert.deepEqual(calls, [['set', 7], ['release', 7]], 'the pointer is captured and handed back')
  })

  await withCard(async ({ card, container }) => {
    card.setPointerCapture = () => { throw new Error('no capture here') }
    card.releasePointerCapture = () => { throw new Error('nothing to release') }
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250, { pointerId: 9 })
    await move(430, 280)
    await up(430, 280)
    assert.deepEqual(offsetOf(card), { x: 30, y: 30 }, 'the gesture still works without capture')
  })
})

test('a second pointer or a right button never starts a gesture', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250, { button: 2 })
    assert.doesNotMatch(card.className, /is-dragging/, 'only the primary button drags')
    await down(bar, 400, 250, { pointerId: 1 })
    await down(bar, 500, 300, { pointerId: 2 })
    await move(460, 290)
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 }, 'the first gesture owns the pointer')
    await act(async () => { pointer(globalThis.window, 'pointermove', { clientX: 900, clientY: 900, pointerId: 2 }) })
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 }, 'a second pointer id is ignored')
    await up(460, 290)
  })
})

test('arrow keys move the card, Shift takes a longer step', async () => {
  await withCard(async ({ card, container }) => {
    await act(async () => {
      container.querySelector('.clipchat-card__bar').dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    assert.deepEqual(offsetOf(card), { x: 8, y: 0 })
    await act(async () => {
      container.querySelector('.clipchat-card__bar').dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }),
      )
    })
    assert.deepEqual(offsetOf(card), { x: 8, y: 40 })
  })
})

test('Alt+arrow resizes the card, Shift takes a longer step', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }))
    })
    assert.equal(card.style.width, '608px', 'the right edge grows the width')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, shiftKey: true, bubbles: true }))
    })
    assert.equal(card.style.width, '576px', 'Alt+Shift is 32px')
    assert.deepEqual(offsetOf(card), { x: 32, y: 0 }, 'the left edge moved, the right one stayed put')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    })
    assert.equal(card.style.height, '428px', 'the bottom edge grows the height')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true }))
    })
    assert.equal(card.style.height, '396px')
    assert.deepEqual(offsetOf(card), { x: 32, y: 32 }, 'the top edge moved, the bottom one stayed put')
  })
})

test('keyboard shortcuts ignore the composer and unhandled keys', async () => {
  await withCard(async ({ card, container }) => {
    const textarea = container.querySelector('.clipchat-card__ta')
    await act(async () => {
      textarea.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      textarea.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }))
      container.querySelector('.clipchat-card__bar').dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key: 'a', bubbles: true }),
      )
    })
    assert.equal(card.style.transform, '', 'typing and unknown keys never move the card')
  })
})

test('the focused resize grip answers the same keys as the title bar', async () => {
  await withCard(async ({ card, container }) => {
    const grip = container.querySelector('.clipchat-card__grip--se')
    grip.focus()
    assert.equal(container.ownerDocument.activeElement, grip, 'the grip is a real tab stop')
    const press = async (init) => {
      let event = null
      await act(async () => {
        event = new globalThis.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
        grip.dispatchEvent(event)
      })
      return event
    }
    const arrow = await press({ key: 'ArrowRight' })
    assert.equal(arrow.defaultPrevented, true, 'the page does not scroll instead')
    assert.deepEqual(offsetOf(card), { x: 8, y: 0 }, 'an arrow key moves the card from the grip')
    await press({ key: 'ArrowRight', altKey: true })
    assert.equal(card.style.width, '608px', 'Alt+arrow resizes it from the grip')
    await press({ key: 'Home' })
    assert.equal(card.style.width, '600px', 'Home resets it from the grip')
    assert.deepEqual(offsetOf(card), { x: 0, y: 0 })
  })
})

/** The east rail's width, read from its own rule. */
function railWidthOf() {
  const rail = CLIENT_SOURCE.match(/\.clipchat-card__grip--e\{([^}]*)\}/)
  assert.ok(rail, 'the east rail rule is still there')
  return Number(/width:(\d+)px/.exec(rail[1])[1])
}

/** The right-hand inset a rule gives its element, from `margin-right` or `margin`. */
function rightInsetOf(declarations) {
  const explicit = /margin-right:([\d.]+)px/.exec(declarations)
  if (explicit !== null) return Number.parseFloat(explicit[1])
  const shorthand = /margin:([^;]*)/.exec(declarations)
  if (shorthand === null) return 0
  const sides = shorthand[1].trim().split(/\s+/)
  return Number.parseFloat(sides.length >= 2 ? sides[1] : sides[0])
}

/**
 * One scroll container of the card: its scrollbar must be laid out left of the
 * east rail, which means the container ends at least a rail width inside the
 * card, and the inset came out of the right padding rather than off the text.
 */
function railClearanceOf(selector, label) {
  const rule = CLIENT_SOURCE.match(new RegExp(`${selector.replaceAll('.', '\\.')}\\{([^}]*)\\}`))
  assert.ok(rule, `the ${label} rule is still there`)
  const railWidth = railWidthOf()
  const inset = rightInsetOf(rule[1])
  assert.ok(inset >= railWidth,
    `the ${label} is inset ${inset}px, at least the ${railWidth}px rail, so its scrollbar is laid out left of the rail`)
  const padding = /padding:(\d+)px (\d+)px (\d+)px (\d+)px/.exec(rule[1])
  assert.ok(padding, `the ${label} states its padding on four sides`)
  return { textGap: Number(padding[2]) + inset, leftGap: Number(padding[4]) }
}

test('the east rail leaves every scroll container its own scrollbar', async () => {
  const answer = railClearanceOf('.clipchat-card__thread', 'answer area')
  const records = railClearanceOf('.clipchat-card__records', 'records panel')
  assert.equal(answer.textGap, answer.leftGap, 'the answer text keeps the gap it has on the left')
  assert.equal(records.textGap, records.leftGap, 'the records panel does too')
  assert.equal(records.textGap, answer.textGap, 'so the two views line up with each other')
})

test('a card that cannot be measured ignores keyboard geometry', async () => {
  await withCard(async ({ card, container }) => {
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 })
    await act(async () => {
      container.querySelector('.clipchat-card__bar').dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
      container.querySelector('.clipchat-card__bar').dispatchEvent(
        new globalThis.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      )
    })
    assert.equal(card.style.transform, '', 'nothing moves when nothing can be measured')
  })
})

test('Home resets the card from the keyboard', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }))
    })
    assert.equal(card.style.width, '608px')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    assert.equal(card.style.width, '600px')
    assert.match(card.className, /is-settling/, 'it eases back rather than jumping')
    await flush(320)
    assert.doesNotMatch(card.className, /is-settling/, 'and stops easing once it has arrived')
  })
})

test('Home fits the card back inside a narrow window', async () => {
  await withCard(async ({ card, container, window }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    Object.defineProperty(window, 'innerWidth', { value: 360, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    await act(async () => {
      bar.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    assert.equal(card.style.width, '344px', 'the width is capped by the window')
    assert.equal(320 + offsetOf(card).x, 8, 'and the card is pulled back until its right edge is on screen')
  }, { clip: false })
})

test('a pinned height hands the space to the footer', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }))
    })
    assert.match(card.className, /is-sized/, 'the card knows its height is pinned')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    })
    assert.doesNotMatch(card.className, /is-sized/, 'Home gives the height back to the content')
  })
})

test('a shrinking window pulls the card back inside', async () => {
  await withCard(async ({ card, container, window }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(900, 700)
    await up(900, 700)
    stubCardRect(card, { left: 1200, top: 700 })
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    await act(async () => {
      window.dispatchEvent(new window.Event('resize'))
    })
    // The card is 600x420 and now hangs off 900x700; it must come back in.
    const match = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform)
    assert.notEqual(match, null, 'the card was repositioned')
    assert.ok(1200 + Number(match[1]) + 600 <= 892, 'its right edge is inside the window')
    assert.ok(700 + Number(match[2]) + 420 <= 692, 'its bottom edge is inside the window')
  })
})

test('the host re-anchoring after a resize is fitted again on the next frame', async () => {
  const frames = []
  await withCard(async ({ card, container, window }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(450, 300)
    await up(450, 300)
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    await act(async () => {
      window.dispatchEvent(new window.Event('resize'))
    })
    // The host puts the card back at the old anchor once its own layout lands.
    stubCardRect(card, { left: 880, top: 300 })
    // Run the frame the resize handler queued, exactly as a browser would —
    // waiting on a timer instead lets a slow machine fire it before the stub.
    await act(async () => {
      for (const frame of frames.splice(0)) frame()
    })
    const match = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform)
    assert.notEqual(match, null, 'the next frame moved the card again')
    assert.ok(880 + Number(match[1]) + 600 <= 892, 'its right edge is inside the window')
    assert.ok(300 + Number(match[2]) + 420 <= 692, 'its bottom edge is inside the window')
  }, {
    setup: (env) => {
      env.window.requestAnimationFrame = (frame) => { frames.push(frame); return frames.length }
    },
  })
})

test('a card the host anchors too close to a narrow window edge is fitted on its first frame', async () => {
  const frames = []
  await withCard(async ({ card }) => {
    // The host puts the freshly opened card at x=32, where its 328px body runs
    // 9px past the window edge.
    card.getBoundingClientRect = () => ({ left: 32, top: 240, width: 328, height: 361, right: 360, bottom: 601, x: 32, y: 240 })
    await act(async () => {
      for (const frame of frames.splice(0)) frame()
    })
    assert.equal(32 + offsetOf(card).x, 24, 'the card is pulled left until its right edge is on screen')
  }, {
    clip: false,
    setup: (env) => {
      Object.defineProperty(env.window, 'innerWidth', { value: 360, configurable: true })
      Object.defineProperty(env.window, 'innerHeight', { value: 800, configurable: true })
      env.window.requestAnimationFrame = (frame) => { frames.push(frame); return frames.length }
    },
  })
})

test('a fit frame that lands mid-drag leaves the card where the pointer put it', async () => {
  const frames = []
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(460, 290)
    await act(async () => {
      for (const frame of frames.splice(0)) frame()
    })
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 }, 'the drag wins over the fit')
    await up(460, 290)
  }, {
    clip: false,
    setup: (env) => {
      env.window.requestAnimationFrame = (frame) => { frames.push(frame); return frames.length }
    },
  })
})

test('a window resize that lands mid-drag leaves the card where the pointer put it', async () => {
  await withCard(async ({ card, container, window }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(460, 290)
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    await act(async () => {
      window.dispatchEvent(new window.Event('resize'))
    })
    assert.deepEqual(offsetOf(card), { x: 60, y: 40 }, 'the drag wins over the resize fit')
    await up(460, 290)
  })
})

/** A conversation column and a pinned composer, as the real host reports them. */
function hostChrome(document, { column = { left: 485, top: 100, width: 742, height: 300 }, composer = { left: 280, top: 772, width: 1153, height: 128 } } = {}) {
  const box = (spec) => ({ ...spec, right: spec.left + spec.width, bottom: spec.top + spec.height, x: spec.left, y: spec.top })
  const turn = document.createElement('div')
  turn.setAttribute('data-chat-turn', '')
  turn.getBoundingClientRect = () => box(column)
  document.body.appendChild(turn)
  const bar = document.createElement('div')
  const input = document.createElement('textarea')
  bar.appendChild(input)
  bar.getBoundingClientRect = () => box(composer)
  document.body.appendChild(bar)
  return { turn, bar }
}

test('the card stops inside the conversation column and above the composer', async () => {
  await withCard(async ({ card, container, document }) => {
    hostChrome(document)
    const grip = container.querySelector('.clipchat-card__grip--se')
    await down(grip, 920, 660)
    await move(920 + 2000, 660 + 2000)
    await up(920 + 2000, 660 + 2000)
    const rect = card.getBoundingClientRect()
    assert.ok(rect.right <= 1219, `the right edge stays inside the message column (${rect.right})`)
    assert.ok(rect.bottom <= 764, `the bottom edge stays above the composer (${rect.bottom})`)
  })
})

test('a drag stops with the title bar clear of the composer', async () => {
  await withCard(async ({ card, container, document }) => {
    hostChrome(document)
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    await move(400, 250 + 2000)
    await up(400, 250 + 2000)
    const rect = card.getBoundingClientRect()
    assert.ok(rect.top + 44 <= 764, `the title bar is visible above the composer (${rect.top})`)
  })
})

test('a window resize with nothing measurable changes nothing', async () => {
  await withCard(async ({ card, window }) => {
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 })
    await act(async () => {
      window.dispatchEvent(new window.Event('resize'))
    })
    assert.equal(card.style.transform, '')
    assert.equal(card.style.width, '')
  })
})

test('a resize is remembered for the session and never the place', async () => {
  await withCard(async ({ card, container, plugin }) => {
    const grip = container.querySelector('.clipchat-card__grip--se')
    await down(grip, 920, 660)
    await move(1000, 720)
    await up(1000, 720)
    assert.equal(card.style.width, '680px')
    assert.deepEqual(plugin.__test.cardSizes.get('session-test'), { w: 680, h: 480 }, 'size only')
  })
})

test('a card of the same session comes back at the remembered size', async () => {
  await withCard(async ({ container, plugin, document }) => {
    plugin.__test.rememberBox('session-test', { w: 700, h: 520, dx: 90, dy: 40 })
    const { createRoot } = await import('react-dom/client')
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(plugin.__test.ClipCard, cardProps()))
    })
    const card = container.querySelector('.clipchat-card')
    assert.equal(card.style.width, '700px', 'the remembered width is applied at mount')
    assert.equal(card.style.height, '520px')
    assert.equal(card.style.transform, '', 'the place is never restored')
    assert.ok(document.body.contains(card))
    await act(async () => root.unmount())
  })
})

test('the grips expose one visible handle to the keyboard and nothing else', async () => {
  await withCard(async ({ container }) => {
    const grips = [...container.querySelectorAll('.clipchat-card__grip')]
    assert.deepEqual(grips.map((grip) => grip.className.split('--').at(-1)), ['nw', 'sw', 'se', 'e', 's'])
    const visible = grips.filter((grip) => grip.getAttribute('aria-hidden') !== 'true')
    assert.equal(visible.length, 1, 'only the drawn handle is announced')
    assert.equal(visible[0].className, 'clipchat-card__grip clipchat-card__grip--se')
    assert.equal(visible[0].getAttribute('role'), 'separator')
    assert.equal(visible[0].getAttribute('tabindex'), '0')
    assert.equal(visible[0].getAttribute('aria-label'), 'resizeHint')
    assert.equal(visible[0].getAttribute('aria-valuemin'), '420')
    assert.ok(Number(visible[0].getAttribute('aria-valuemax')) >= 600, 'the maximum comes from the measured limits')
    for (const hidden of grips.filter((grip) => grip !== visible[0])) {
      assert.equal(hidden.getAttribute('aria-hidden'), 'true')
      assert.equal(hidden.getAttribute('tabindex'), '-1')
    }
  })
})

/* --- the close button owns the top-right corner --- */

test('no resize hot area sits on the close button', async () => {
  await withCard(async ({ container }) => {
    assert.equal(container.querySelector('.clipchat-card__grip--ne'), null, 'the top-right corner has no hot area')
    assert.doesNotMatch(CLIENT_SOURCE, /grip--ne\{/, 'and its rule is gone with it')
    assert.ok(container.querySelector('.clipchat-card__close'), 'the close button is where it was')
  })
})

test('pressing the close button dismisses the card and starts no gesture', async () => {
  let dismissed = 0
  await withCard(async ({ card, container }) => {
    const close = container.querySelector('.clipchat-card__close')
    await down(close, 900, 270)
    assert.doesNotMatch(card.className, /is-(dragging|resizing)/, 'the press belongs to the button')
    await move(960, 330)
    assert.equal(card.style.transform, '', 'a press on the button never moves the card')
    await up(960, 330)
    assert.doesNotMatch(card.className, /is-(dragging|resizing)/)
    await act(async () => {
      close.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true }))
    })
    assert.equal(dismissed, 1, 'the click still reaches the button')
    assert.equal(card.style.opacity, '', 'and nothing dims the card on the way out')
  }, { props: { dismiss: () => { dismissed += 1 } } })
})

test('a press on a control inside the card starts no gesture', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    const close = container.querySelector('.clipchat-card__close')
    await down(close, 900, 270)
    await move(940, 320)
    assert.equal(card.style.transform, '', 'a press on the button does not drag the card')
    await up(940, 320)

    await down(bar, 700, 260)
    assert.match(card.className, /is-dragging/, 'the bar itself still drags')
    await up(700, 260)
  })
})

test('pressOwnedByControl tells controls from the card surface', async () => {
  await withCard(async ({ container, plugin }) => {
    const { pressOwnedByControl } = plugin.__test
    const close = container.querySelector('.clipchat-card__close')
    const bar = container.querySelector('.clipchat-card__bar')
    assert.equal(pressOwnedByControl(close), true, 'a button owns its press')
    assert.equal(pressOwnedByControl(bar), false, 'the bar does not')
    assert.equal(pressOwnedByControl(null), false, 'no target belongs to the card')
  })
})

test('the card paints an opaque surface while a gesture runs', async () => {
  const rule = CLIENT_SOURCE.match(/\.clipchat-card\.is-dragging,\.clipchat-card\.is-resizing\{([^}]*)\}/)
  assert.ok(rule, 'the gesture state has a rule')
  assert.match(rule[1], /background:var\(--dsw-alias-bg-elevated/, 'the gesture paints the opaque surface')
  assert.doesNotMatch(rule[1], /color-mix/, 'the 78%-transparent fill is not left bare without its blur')
})

test('the title bar carries the keyboard instructions', async () => {
  await withCard(async ({ container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    assert.equal(bar.getAttribute('role'), 'group')
    assert.equal(bar.getAttribute('tabindex'), '0')
    assert.equal(bar.getAttribute('aria-label'), 'dragHint')
    assert.equal(bar.getAttribute('title'), 'dragHint')
  })
})

test('a card dismissed mid-gesture leaves the page usable', async () => {
  await withCard(async ({ card, container, document, unmount }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    assert.equal(document.body.style.userSelect, 'none')
    await unmount()
    assert.equal(document.body.style.userSelect, '', 'the page can select text again')
    assert.equal(document.body.style.cursor, '')
    assert.ok(card !== null)
  })
})

/* --- the host's own chrome over the title bar --- */

/** A cover element standing in for the host's sticky header. */
function coverElement(document, bottom) {
  const cover = document.createElement('header')
  cover.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1440, bottom, width: 1440, height: bottom, x: 0, y: 0 })
  return cover
}

/** Limits a 1440x900 window gives. */
const LIMITS = { left: 288, top: 8, right: 1432, bottom: 892, minW: 420, minH: 320, maxW: 1144, maxH: 780 }

test('a title bar hidden under the host header is pushed down until it can be grabbed', async () => {
  await withCard(async ({ card, container, document }) => {
    stubCardRect(card, { left: 320, top: 10 })
    const bar = container.querySelector('.clipchat-card__bar')
    bar.getBoundingClientRect = () => {
      const box = card.getBoundingClientRect()
      return { left: box.left, top: box.top, right: box.right, bottom: box.top + 40, width: box.width, height: 40, x: box.left, y: box.top }
    }
    const cover = coverElement(document, 120)
    document.elementFromPoint = (x, y) => (y < 120 ? cover : null)

    await down(bar, 500, 20)
    await move(560, 20)
    await up(560, 20)
    const offset = offsetOf(card)
    assert.equal(offset.x, 60, 'the horizontal travel is untouched')
    assert.ok(offset.y > 100, `the card moved down out of the header (got ${offset.y})`)
    assert.ok(10 + offset.y >= 120, 'the bar now sits below the header')
  })
})

test('revealTitleBar leaves the card alone when the bar is not covered', async () => {
  await withCard(async ({ card, container, plugin, document }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    bar.getBoundingClientRect = () => ({ left: 300, top: 700, right: 900, bottom: 740, width: 600, height: 40, x: 300, y: 700 })
    const box = { w: null, h: null, dx: 0, dy: 0 }
    const rect = { left: 300, top: 700, width: 600, height: 420 }

    delete document.elementFromPoint
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'no hit test, no move')

    document.elementFromPoint = () => bar
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'a bar that answers for itself needs no help')

    document.elementFromPoint = () => null
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'an unanswered hit test is not a cover')

    document.elementFromPoint = () => coverElement(document, 0)
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'a zero-height cover overlaps nothing')

    document.elementFromPoint = () => coverElement(document, 690)
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'a cover that ends above the bar needs no shift')
  })
})

test('revealTitleBar gives up on a bar that is out of view or unmeasurable', async () => {
  await withCard(async ({ card, plugin, document }) => {
    document.elementFromPoint = () => coverElement(document, 400)
    const bar = card.querySelector('.clipchat-card__bar')
    const box = { w: null, h: null, dx: 0, dy: 0 }
    const rect = { left: 300, top: 300, width: 600, height: 420 }

    bar.getBoundingClientRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 })
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'an unmeasurable bar is left alone')

    bar.getBoundingClientRect = () => ({ left: 0, top: 100, right: 200, bottom: 140, width: 200, height: 40, x: 0, y: 100 })
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'a bar wholly outside the column cannot be covered by its header')

    bar.getBoundingClientRect = () => ({ left: 300, top: 950, right: 900, bottom: 990, width: 600, height: 40, x: 300, y: 950 })
    assert.equal(plugin.__test.revealTitleBar(card, box, rect, LIMITS).dy, 0, 'a bar under the bottom edge is not the header')

    bar.getBoundingClientRect = () => ({ left: 300, top: 880, right: 900, bottom: 920, width: 600, height: 40, x: 300, y: 880 })
    assert.equal(plugin.__test.revealTitleBar(card, { w: null, h: null, dx: 0, dy: 0 }, { left: 300, top: 880, width: 600, height: 420 }, LIMITS).dy, 0,
      'at the bottom limit there is nowhere to go')
  })
})

test('revealTitleBar stops after a few attempts instead of looping forever', async () => {
  await withCard(async ({ card, document, plugin }) => {
    const bar = card.querySelector('.clipchat-card__bar')
    const offsetY = () => {
      const moved = /translate3d\((-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(card.style.transform ?? '')
      return moved === null ? 0 : Number(moved[2])
    }
    bar.getBoundingClientRect = () => {
      const top = 20 + offsetY()
      return { left: 300, top, right: 900, bottom: top + 40, width: 600, height: 40, x: 300, y: top }
    }
    let hits = 0
    // A cover that always reaches 30px below the bar: each attempt reveals the
    // bar and then finds it covered again, until the attempts run out.
    document.elementFromPoint = () => {
      hits += 1
      const cover = document.createElement('header')
      const bottom = 20 + offsetY() + 30
      cover.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1440, bottom, width: 1440, height: bottom, x: 0, y: 0 })
      return cover
    }
    const next = plugin.__test.revealTitleBar(card, { w: null, h: null, dx: 0, dy: 0 }, { left: 300, top: 20, width: 600, height: 420 }, LIMITS)
    assert.equal(hits, 4, 'it tried four times and stopped')
    assert.ok(next.dy > 0, 'it still moved as far as it could')
    assert.ok(20 + next.dy <= 892 - 44, 'and stayed inside the bottom limit')
  })
})

test('a remembered size that no longer fits is trimmed when the card opens', async () => {
  await withCard(async ({ card, plugin, window }) => {
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    document.body.appendChild(container)
    plugin.__test.rememberBox('session-test', { w: 1200, h: 900, dx: 0, dy: 0 })
    const root = createRoot(container)
    await act(async () => {
      root.render(createElement(plugin.__test.ClipCard, cardProps()))
    })
    const next = container.querySelector('.clipchat-card')
    await flush(30)
    assert.equal(next.style.width, '684px', 'the width is trimmed to what a 700px window allows')
    assert.equal(next.style.height, '480px', 'and the height to the 600px window minus its slack')
    await act(async () => root.unmount())
    container.remove()
    assert.ok(card !== null)
  })
})

test('the pinned-height rule lets the answer area shrink instead of pushing the footer out', async () => {
  assert.match(CLIENT_SOURCE, /\.clipchat-card\.is-sized \.clipchat-card__thread\{min-height:0\}/,
    'the thread gives way to the footer when the height is pinned')
})

/* --- the pinned-height rule --- */

test('the pinned-height layout starts with the gesture, not with its release', async () => {
  await withCard(async ({ card, container }) => {
    const bottom = container.querySelector('.clipchat-card__grip--s')
    assert.doesNotMatch(card.className, /is-sized/, 'a card at its CSS height is not pinned')
    await down(bottom, 600, 660)
    await move(600, 600)
    assert.equal(card.style.height, '360px')
    assert.match(card.className, /is-sized/, 'the live height already gives the footer its room')
    await up(600, 600)
    assert.match(card.className, /is-sized/, 'and the release leaves the layout alone')
  })
})

/* --- the opening animation plays once --- */

test('the opening class is dropped once the card has opened', async () => {
  await withCard(async ({ card }) => {
    assert.match(card.className, /is-entering/, 'the card announces itself while it appears')
    await flush(240)
    assert.doesNotMatch(card.className, /is-entering/, 'the opening moment is over, and it stays over')
  })
})

test('a gesture ends the opening moment so a release cannot replay it', async () => {
  await withCard(async ({ card, container }) => {
    const bar = container.querySelector('.clipchat-card__bar')
    await down(bar, 400, 250)
    assert.match(card.className, /is-dragging/, 'the gesture started')
    assert.doesNotMatch(card.className, /is-entering/, 'the press ends the opening moment')
    await move(460, 290)
    await up(460, 290)
    assert.doesNotMatch(card.className, /is-dragging/)
    assert.doesNotMatch(card.className, /is-entering/, 'the release does not bring the opening class back')
    await flush(240)
    assert.doesNotMatch(card.className, /is-entering/, 'nor does the entry timer')
  })
})

test('the opening animation is scoped to its own class, never the resting card', async () => {
  const base = CLIENT_SOURCE.match(/\.clipchat-card\{([^}]*)\}/)
  assert.ok(base, 'the card has a base rule')
  assert.doesNotMatch(base[1], /animation:/, 'the resting card carries no animation for a gesture to turn back on')
  const entering = CLIENT_SOURCE.match(/\.clipchat-card\.is-entering\{([^}]*)\}/)
  assert.ok(entering, 'the opening moment has its own rule')
  assert.match(entering[1], /animation:clipchat-pop/, 'the opening animation lives there and only there')
  assert.match(CLIENT_SOURCE, /prefers-reduced-motion:reduce\)\{\.clipchat-card\.is-entering\{animation:none\}\}/,
    'reduced motion still suppresses the opening animation')
})
