/**
 * Geometry for the drag and resize gestures.
 *
 * These are the pure functions the card's pointer and keyboard handlers lean
 * on. They take plain rects, so they are tested without a DOM: the numbers a
 * real browser would report are the input.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadBundle } from './helpers/load-client.mjs'
import { installDom } from './helpers/dom.mjs'

/** Load the bundle and its test surface. */
async function surface() {
  const { definition } = await loadBundle()
  return definition.factory(() => ({ createElement: () => null })).__test
}

/** A card rect as `getBoundingClientRect()` would report it. */
function rect(left, top, width, height) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }
}

test('cardLimits uses the whole window when nothing clips the card', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  assert.deepEqual(limits, {
    left: 8,
    top: 8,
    right: 1432,
    bottom: 892,
    minW: 420,
    minH: 320,
    maxW: 1424,
    maxH: 780,
  })
})

test('cardLimits narrows to the first ancestor that clips', async () => {
  const t = await surface()
  // The host's centre column, measured in the real page: 280..1440 wide.
  const limits = t.cardLimits({ width: 1440, height: 900 }, { left: 280, top: 0, right: 1440, bottom: 900 })
  assert.equal(limits.left, 288)
  assert.equal(limits.right, 1432)
  assert.equal(limits.maxW, 1144)
})

test('cardLimits caps the width by the window even when the container reaches past it', async () => {
  const t = await surface()
  // The host's column can start at x=0 and run to the right edge while the
  // overlay it clips sits inset; a window narrower than the column still wins.
  const limits = t.cardLimits({ width: 360, height: 900 }, { left: 0, top: 0, right: 400, bottom: 900 })
  assert.equal(limits.maxW, 344, 'the window edge, not the container edge, caps the width')
  assert.equal(limits.minW, 344)
})

test('cardLimits stops the card inside the conversation column and above the composer', async () => {
  const t = await surface()
  // Real host at 1440x900: the centre column clips at 280..1433, the message
  // column sits at 485..1227, and the composer covers 772..900.
  const limits = t.cardLimits({ width: 1440, height: 900 }, { left: 280, top: 76, right: 1433, bottom: 900 }, { right: 1227, bottom: 772 })
  assert.equal(limits.right, 1219, 'the right edge stops 8px inside the message column')
  assert.equal(limits.bottom, 764, 'the bottom edge stops 8px above the composer')
  assert.equal(limits.top, 84)
  assert.equal(limits.maxW, 931, 'the width is what is left between the limits')
  assert.equal(limits.maxH, 680, 'and the height too')
})

test('cardLimits ignores a room edge that was not measured', async () => {
  const t = await surface()
  const plain = t.cardLimits({ width: 1440, height: 900 }, null)
  assert.deepEqual(t.cardLimits({ width: 1440, height: 900 }, null, { right: null, bottom: null }), plain)
  assert.deepEqual(t.cardLimits({ width: 1440, height: 900 }, null, {}), plain)
  assert.deepEqual(t.cardLimits({ width: 1440, height: 900 }, null, null), plain)
})

test('columnRectOf measures the column the host lays its messages out in', async () => {
  const env = installDom(`
    <div data-chat-turn id="turn"><div data-chat-node-key="1" id="node"></div></div>
    <div data-chat-node-key="2" id="node2"></div>
  `)
  try {
    const t = await surface()
    env.document.getElementById('turn').getBoundingClientRect = () => rect(485, 100, 742, 300)
    env.document.getElementById('node').getBoundingClientRect = () => rect(485, 100, 742, 200)
    env.document.getElementById('node2').getBoundingClientRect = () => rect(485, 400, 742, 200)
    assert.deepEqual(t.columnRectOf(null), { left: 485, right: 1227 })
    // A node that is not laid out yet says nothing about the column.
    env.document.getElementById('node2').getBoundingClientRect = () => rect(0, 0, 0, 0)
    assert.deepEqual(t.columnRectOf(null), { left: 485, right: 1227 })
  } finally {
    env.restore()
  }
})

test('columnRectOf skips the card and reports nothing without messages', async () => {
  const env = installDom('<div data-chat-node-key="1" id="node"><div class="clipchat-card" id="card"></div></div>')
  try {
    const t = await surface()
    const node = env.document.getElementById('node')
    node.getBoundingClientRect = () => rect(485, 100, 742, 200)
    assert.equal(t.columnRectOf(env.document.getElementById('card')), null, 'a card inside a node is not the column')
    assert.deepEqual(t.columnRectOf(undefined), { left: 485, right: 1227 })
  } finally {
    env.restore()
  }
  const bare = installDom('<div id="nothing"></div>')
  try {
    const t = await surface()
    assert.equal(t.columnRectOf(null), null, 'no message, no column')
  } finally {
    bare.restore()
  }
})

test('pinnedTopOf finds the composer from the page input, not from the card', async () => {
  const env = installDom(`
    <div class="clipchat-card" id="card"><textarea id="own"></textarea></div>
    <div id="composer"><div id="row"><textarea id="page"></textarea></div></div>
  `)
  const { window } = env
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  try {
    const t = await surface()
    env.document.getElementById('row').getBoundingClientRect = () => rect(469, 828, 774, 42)
    env.document.getElementById('composer').getBoundingClientRect = () => rect(280, 772, 1153, 128)
    assert.equal(t.pinnedTopOf(env.document.getElementById('card')), 772, 'the card\'s own input is not the composer')
    assert.equal(t.pinnedTopOf(null), 772, 'and without a card the page input is still found')
    // A bar pinned to the top is not the composer, and neither is the page.
    env.document.getElementById('composer').getBoundingClientRect = () => rect(280, 0, 1153, 60)
    assert.equal(t.pinnedTopOf(null), null)
    env.document.getElementById('composer').getBoundingClientRect = () => rect(0, 0, 1440, 900)
    assert.equal(t.pinnedTopOf(null), null, 'the page body is not a pinned bar')
  } finally {
    env.restore()
  }
})

test('cardRoomOf combines the column and the composer, and stays null without either', async () => {
  const env = installDom(`
    <div data-chat-turn id="turn"></div>
    <div id="composer"><textarea id="page"></textarea></div>
  `)
  const { window } = env
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  try {
    const t = await surface()
    env.document.getElementById('turn').getBoundingClientRect = () => rect(485, 100, 742, 300)
    env.document.getElementById('composer').getBoundingClientRect = () => rect(280, 772, 1153, 128)
    assert.deepEqual(t.cardRoomOf(null), { right: 1227, bottom: 772 })
    env.document.getElementById('composer').getBoundingClientRect = () => rect(280, 0, 1153, 60)
    assert.deepEqual(t.cardRoomOf(null), { right: 1227, bottom: null }, 'a column without a composer caps one edge')
  } finally {
    env.restore()
  }
  const bare = installDom('<div id="nothing"></div>')
  try {
    const t = await surface()
    assert.equal(t.cardRoomOf(null), null, 'nothing measured caps nothing')
  } finally {
    bare.restore()
  }
})

test('cardLimits never lets the minimum exceed the space it has', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 360, height: 400 }, null)
  assert.equal(limits.maxW, 344)
  assert.equal(limits.minW, 344, 'the minimum falls back to the room available')
  assert.equal(limits.minH, 280, 'height keeps 120px of window even on a short screen')
})

test('cardLimits treats an unmeasured window as unbounded', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 0, height: 0 }, null)
  assert.equal(limits.maxW, Infinity, 'an unmeasured window caps nothing')
  assert.equal(limits.maxH, Infinity)
  assert.equal(limits.minW, 420)
  assert.equal(limits.minH, 320)
})

test('clampNumber pins a value that has nowhere legal to go', async () => {
  const t = await surface()
  assert.equal(t.clampNumber(5, 0, 10), 5)
  assert.equal(t.clampNumber(-5, 0, 10), 0)
  assert.equal(t.clampNumber(50, 0, 10), 10)
  assert.equal(t.clampNumber(50, 30, 10), 30, 'an inverted range prefers the minimum')
})

test('cardFrameOf takes the applied offset back out of a measured rect', async () => {
  const t = await surface()
  const frame = t.cardFrameOf(rect(180, 160, 600, 400), { w: null, h: null, dx: 80, dy: 60 })
  assert.deepEqual(frame, { left: 100, top: 100, width: 600, height: 400 })
  assert.deepEqual(t.cardFrameOf(null, null), { left: 0, top: 0, width: 0, height: 0 })
})

test('dragBox moves the card by the pointer travel', async () => {
  const t = await surface()
  const box = { w: null, h: null, dx: 0, dy: 0 }
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const moved = t.dragBox(box, { x: 40, y: -30 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(moved, { w: null, h: null, dx: 40, dy: -30 })
})

test('dragBox stops while 96px of the card is still reachable', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const right = t.dragBox({ w: null, h: null, dx: 0, dy: 0 }, { x: 5000, y: 5000 }, rect(100, 100, 600, 420), limits)
  assert.equal(100 + right.dx, limits.right - 96, 'the right edge stops 96px inside the limit')
  assert.equal(100 + right.dy, limits.bottom - 44, 'the bottom stops while 44px of the card is still visible')
  const left = t.dragBox({ w: null, h: null, dx: 0, dy: 0 }, { x: -5000, y: -5000 }, rect(100, 100, 600, 420), limits)
  assert.equal(100 + left.dx + 600, limits.left + 96, 'the left edge keeps 96px of the card on screen')
  assert.equal(100 + left.dy, limits.top, 'but the title bar never leaves the top of the container')
})

test('dragBox measures against the size the user chose, not the CSS size', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const moved = t.dragBox({ w: 900, h: 400, dx: 0, dy: 0 }, { x: -5000, y: 0 }, rect(100, 100, 600, 420), limits)
  assert.equal(100 + moved.dx + 900, limits.left + 96, 'the chosen width is what gets kept on screen')
})

test('resizeBox grows from the east and south edges', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const box = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'se', { x: 100, y: 60 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(box, { w: 700, h: 480, dx: 0, dy: 0 })
})

test('resizeBox compensates the offset when the west or north edge moves', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const west = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'w', { x: -80, y: 0 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(west, { w: 680, h: null, dx: -80, dy: 0 }, 'the right edge stayed put and height stays automatic')
  const north = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'n', { x: 0, y: -40 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(north, { w: null, h: 460, dx: 0, dy: -40 }, 'the bottom edge stayed put and width stays automatic')
})

test('resizeBox stops at the minimum size', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const box = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'se', { x: -5000, y: -5000 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(box, { w: 420, h: 320, dx: 0, dy: 0 })
})

test('resizeBox stops at the maximum and never leaves the container', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const wide = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'e', { x: 5000, y: 0 }, rect(100, 100, 600, 420), limits)
  assert.equal(100 + wide.dx + wide.w, limits.right, 'the right edge lands on the limit')
  const tall = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 's', { x: 0, y: 5000 }, rect(100, 100, 600, 420), limits)
  assert.equal(tall.h, 780, 'the height is capped by the window slack')
  const west = t.resizeBox({ w: null, h: null, dx: 0, dy: 0 }, 'w', { x: 5000, y: 0 }, rect(100, 100, 600, 420), limits)
  assert.equal(west.w, 420, 'dragging the west edge inward stops at the minimum width')
})

test('fitBox shrinks and moves a card back inside the limits', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 900, height: 700 }, null)
  const fitted = t.fitBox({ w: 900, h: 780, dx: 400, dy: 300 }, rect(100, 100, 900, 780), limits)
  assert.equal(fitted.w, 884, 'the width is capped by the window')
  assert.equal(fitted.h, 580, 'the height is capped by the window slack')
  assert.equal(100 + fitted.dx, limits.left, 'it was pulled back inside the left limit')
  assert.equal(100 + fitted.dy, 112, 'and up so the whole card fits')
})

test('fitBox keeps a default-sized card at its CSS size', async () => {
  const t = await surface()
  const limits = t.cardLimits({ width: 1440, height: 900 }, null)
  const fitted = t.fitBox({ w: null, h: null, dx: 0, dy: 0 }, rect(100, 100, 600, 420), limits)
  assert.deepEqual(fitted, { w: null, h: null, dx: 0, dy: 0 })
})

test('boxStyleOf writes only what the user changed', async () => {
  const t = await surface()
  assert.equal(t.boxStyleOf({ w: null, h: null, dx: 0, dy: 0 }), undefined, 'an untouched card has no inline style')
  assert.deepEqual(t.boxStyleOf({ w: 700, h: null, dx: 0, dy: 0 }), { width: '700px' },
    'a width-only card keeps the stylesheet height cap, or a long answer runs it off the window')
  assert.deepEqual(t.boxStyleOf({ w: null, h: 500, dx: 0, dy: 0 }), { height: '500px', maxHeight: 'none' },
    'a height the user chose is the height, cap or not')
  assert.deepEqual(t.boxStyleOf({ w: 700, h: 500, dx: 3, dy: -4 }), {
    width: '700px',
    height: '500px',
    maxHeight: 'none',
    transform: 'translate3d(3px, -4px, 0)',
  })
})

test('cursorOfGesture maps every direction to the cursor the browser expects', async () => {
  const t = await surface()
  assert.equal(t.cursorOfGesture('move', ''), 'grabbing')
  assert.equal(t.cursorOfGesture('resize', 'n'), 'ns-resize')
  assert.equal(t.cursorOfGesture('resize', 's'), 'ns-resize')
  assert.equal(t.cursorOfGesture('resize', 'e'), 'ew-resize')
  assert.equal(t.cursorOfGesture('resize', 'w'), 'ew-resize')
  assert.equal(t.cursorOfGesture('resize', 'ne'), 'nesw-resize')
  assert.equal(t.cursorOfGesture('resize', 'sw'), 'nesw-resize')
  assert.equal(t.cursorOfGesture('resize', 'se'), 'nwse-resize')
  assert.equal(t.cursorOfGesture('resize', 'nw'), 'nwse-resize')
})

test('a session remembers its size and nothing else', async () => {
  const t = await surface()
  t.cardSizes.clear()
  assert.deepEqual(t.rememberedBox('s1'), { w: null, h: null, dx: 0, dy: 0 }, 'a new session starts at the CSS size')
  t.rememberBox('s1', { w: 700, h: 500, dx: 40, dy: 20 })
  assert.deepEqual(t.rememberedBox('s1'), { w: 700, h: 500, dx: 0, dy: 0 }, 'the place is not remembered')
  assert.deepEqual(t.rememberedBox('s2'), { w: null, h: null, dx: 0, dy: 0 }, 'another session is unaffected')
  t.rememberBox(undefined, { w: 700, h: 500, dx: 0, dy: 0 })
  t.rememberBox('', { w: 700, h: 500, dx: 0, dy: 0 })
  assert.equal(t.cardSizes.size, 1, 'a card without a session id remembers nothing')
})

test('clipRectOf reports the first ancestor that clips', async () => {
  const env = installDom(`
    <div id="clip" style="overflow:hidden"><div id="mid"><div id="card"></div></div></div>
  `)
  try {
    const t = await surface()
    const document = env.document
    const clip = document.getElementById('clip')
    clip.getBoundingClientRect = () => rect(200, 50, 1200, 800)
    const found = t.clipRectOf(document.getElementById('card'))
    assert.deepEqual(found, { left: 200, top: 50, right: 1400, bottom: 850 })
  } finally {
    env.restore()
  }
})

test('clipRectOf skips a clipping ancestor that has no box of its own', async () => {
  const env = installDom(`
    <div id="zero" style="overflow:hidden"><div id="card"></div></div>
  `)
  try {
    const t = await surface()
    const document = env.document
    document.getElementById('zero').getBoundingClientRect = () => rect(0, 0, 0, 0)
    assert.equal(t.clipRectOf(document.getElementById('card')), null, 'a zero-sized ancestor cannot clip anything visible')
  } finally {
    env.restore()
  }
})

test('clipRectOf returns null when nothing on the way up clips or measures', async () => {
  const env = installDom('<div id="plain"><div id="card"></div></div>')
  try {
    const t = await surface()
    assert.equal(t.clipRectOf(env.document.getElementById('card')), null)
    assert.equal(t.clipRectOf(null), null, 'a missing element is not an error')
  } finally {
    env.restore()
  }
})

test('clipRectOf returns null without a style engine', async () => {
  const env = installDom('<div id="clip" style="overflow:hidden"><div id="card"></div></div>')
  const original = env.window.getComputedStyle
  try {
    const t = await surface()
    delete env.window.getComputedStyle
    assert.equal(t.clipRectOf(env.document.getElementById('card')), null)
  } finally {
    env.window.getComputedStyle = original
    env.restore()
  }
})

test('viewportOf prefers the layout viewport and falls back to the window', async () => {
  const env = installDom('')
  try {
    const t = await surface()
    const size = t.viewportOf()
    assert.ok(size.width > 0, 'a width is reported')
    assert.ok(size.height > 0, 'a height is reported')
    Object.defineProperty(env.document.documentElement, 'clientWidth', { value: 1234, configurable: true })
    Object.defineProperty(env.document.documentElement, 'clientHeight', { value: 765, configurable: true })
    assert.deepEqual(t.viewportOf(), { width: 1234, height: 765 }, 'the layout viewport wins: no scrollbar width')
  } finally {
    env.restore()
  }
})
