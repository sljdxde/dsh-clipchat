/**
 * DOM-level tests for the parts of the bundle that only work against a real
 * document: capturing a selection, measuring chat nodes, and locating a stored
 * highlight in a virtualised list.
 *
 * These run the real functions against jsdom rather than inspecting a returned
 * element tree, so a broken selector or a missing null guard fails here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as React from 'react'

import { installDom, selectRange } from './helpers/dom.mjs'
import { loadBundle } from './helpers/load-client.mjs'

/**
 * Install a DOM, load the bundle, run one body, always restore.
 *
 * `drainMs` lets timers the code under test scheduled finish before the DOM is
 * taken down; without it a late callback throws `document is not defined`.
 */
async function withDom(html, body, { viewport, drainMs = 0 } = {}) {
  const env = installDom(html, viewport)
  const originalFetch = globalThis.fetch
  try {
    const { definition } = await loadBundle()
    // These tests never mount, but the factory still asks for React.
    const plugin = definition.factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected module: ${name}`)
    })
    const result = await body(plugin.__test, env)
    if (drainMs > 0) await new Promise((resolve) => setTimeout(resolve, drainMs))
    return result
  } finally {
    globalThis.fetch = originalFetch
    env.restore()
  }
}

/* --- selection capture --- */

const ASSISTANT_HTML = `
  <div data-chat-turn="7">
    <div data-chat-node-key="14:assistant-step7:3">
      <div data-text-interaction-source="0"><p id="p1">the selected passage</p></div>
    </div>
  </div>
`

test('nodeKeyOfSelection reads the key off the selected node', async () => {
  await withDom(ASSISTANT_HTML, (t, env) => {
    const p = env.document.getElementById('p1')
    selectRange(p.firstChild, 4, 12)
    assert.equal(t.nodeKeyOfSelection(), '14:assistant-step7:3')
  })
})

test('nodeKeyOfSelection is null without a selection', async () => {
  await withDom(ASSISTANT_HTML, (t, env) => {
    env.document.getSelection().removeAllRanges()
    assert.equal(t.nodeKeyOfSelection(), null)
  })
})

test('nodeKeyOfSelection is null when the selection is outside any node', async () => {
  await withDom('<p id="loose">outside the chat</p>', (t, env) => {
    selectRange(env.document.getElementById('loose').firstChild, 0, 4)
    assert.equal(t.nodeKeyOfSelection(), null)
  })
})

test('anchorFromSelection captures the span and text', async () => {
  await withDom(ASSISTANT_HTML, (t, env) => {
    const p = env.document.getElementById('p1')
    selectRange(p.firstChild, 4, 12)
    const anchor = t.anchorFromSelection()
    assert.equal(anchor.nodeKey, '14:assistant-step7:3')
    assert.equal(anchor.sourceIndex, 0)
    assert.equal(anchor.text, 'selected')
    assert.deepEqual(anchor.spans, [{ blockIndex: 0, start: 4, end: 12 }])
  })
})

test('anchorFromSelection is null for a collapsed selection', async () => {
  await withDom(ASSISTANT_HTML, (t, env) => {
    const p = env.document.getElementById('p1')
    const selection = env.document.getSelection()
    selection.removeAllRanges()
    const range = env.document.createRange()
    range.setStart(p.firstChild, 3)
    range.collapse(true)
    selection.addRange(range)
    assert.equal(t.anchorFromSelection(), null)
  })
})

test('anchorFromSelection is null when the selection is not in a text-interaction source', async () => {
  await withDom('<p id="loose">outside the chat</p>', (t, env) => {
    selectRange(env.document.getElementById('loose').firstChild, 0, 4)
    assert.equal(t.anchorFromSelection(), null)
  })
})

test('anchorFromSelection spans multiple blocks', async () => {
  const html = `
    <div data-chat-turn="2">
      <div data-chat-node-key="1:assistant-step2:1">
        <div data-text-interaction-source="0">
          <p id="a">first block</p>
          <p id="b">second block</p>
        </div>
      </div>
    </div>
  `
  await withDom(html, (t, env) => {
    const selection = env.document.getSelection()
    selection.removeAllRanges()
    const range = env.document.createRange()
    range.setStart(env.document.getElementById('a').firstChild, 6)
    range.setEnd(env.document.getElementById('b').firstChild, 6)
    selection.addRange(range)
    const anchor = t.anchorFromSelection()
    assert.equal(anchor.spans.length, 2, 'both blocks are covered')
    assert.deepEqual(anchor.spans[0], { blockIndex: 0, start: 6, end: 11 })
    assert.deepEqual(anchor.spans[1], { blockIndex: 1, start: 0, end: 6 })
  })
})

/* --- turn resolution --- */

test('turnOfNodeKey reads the step number, not the sequence prefix', async () => {
  await withDom('', (t) => {
    assert.equal(t.turnOfNodeKey('14:assistant-step22:51'), 22)
    assert.equal(t.turnOfNodeKey('7:assistant-step3:0'), 3)
  })
})

test('turnOfNodeKey falls back to the prefix and rejects non-turns', async () => {
  await withDom('', (t) => {
    assert.equal(t.turnOfNodeKey('5:user:9'), 5)
    assert.equal(t.turnOfNodeKey('not-a-key'), null)
    assert.equal(t.turnOfNodeKey('0:assistant-step0:1'), null)
    assert.equal(t.turnOfNodeKey(null), null)
  })
})

test('turnOfNode reads the host turn stamp from the mounted wrapper', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.turnOfNode('14:assistant-step7:3'), 7)
    assert.equal(t.turnOfNode('99:assistant-step1:1'), null)
  })
})

test('turnOfNode is null when no node is mounted', async () => {
  await withDom('', (t) => {
    assert.equal(t.turnOfNode('1:assistant-step1:1'), null)
  })
})

test('turnOfText finds the turn holding the passage', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.turnOfText('the selected passage'), 7)
    assert.equal(t.turnOfText('nothing like this'), null)
    assert.equal(t.turnOfText(''), null)
  })
})

test('turnOfText skips nodes that are not assistant steps', async () => {
  const html = `
    <div data-chat-turn="3">
      <div data-chat-node-key="1:user:1">
        <div data-text-interaction-source="0"><p>the selected passage</p></div>
      </div>
    </div>
  `
  await withDom(html, (t) => {
    assert.equal(t.turnOfText('the selected passage'), null)
  })
})

/* --- navigation --- */

test('navigateToTurn prefers the plain jump control', async () => {
  const html = `
    <button aria-label="加载并跳转到第 4 轮">load</button>
    <button aria-label="跳转到第 4 轮">jump</button>
  `
  await withDom(html, (t, env) => {
    const clicked = []
    for (const button of env.document.querySelectorAll('button')) {
      button.addEventListener('click', () => clicked.push(button.textContent))
    }
    assert.equal(t.navigateToTurn(4), 'jump')
    assert.deepEqual(clicked, ['jump'])
  })
})

test('navigateToTurn falls back to load-and-jump', async () => {
  await withDom('<button title="加载并跳转到第 9 轮">load</button>', (t) => {
    assert.equal(t.navigateToTurn(9), 'load')
  })
})

test('navigateToTurn reports null when no control matches', async () => {
  await withDom('<button aria-label="跳转到第 1 轮">other</button>', (t) => {
    assert.equal(t.navigateToTurn(2), null)
    assert.equal(t.navigateToTurn('2'), null)
  })
})

/* --- reveal --- */

test('revealHighlight reports false for an unknown highlight', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.revealHighlight('nope'), false)
    assert.equal(t.revealHighlight(42), false)
  })
})

test('revealHighlight jumps to the turn and flashes the underline', async (t) => {
  // The flash re-arms timers for a couple of seconds; fake them so the test is
  // deterministic and does not outlive its DOM.
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  const html = `
    <div data-conversation-scroll style="height:400px">
      ${ASSISTANT_HTML}
      <button aria-label="跳转到第 7 轮">jump</button>
    </div>
  `
  await withDom(html, async (t_, env) => {
    const anchor = { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'the selected' }
    t_.addHighlight(anchor, null, 'session-test')
    const id = t_.highlightIdOf('14:assistant-step7:3', 'the selected')
    assert.ok(id, 'the highlight was stored')

    let jumps = 0
    env.document.querySelector('button').addEventListener('click', () => { jumps += 1 })

    const started = t_.revealHighlight(id, 7)
    assert.equal(started, true)
    assert.equal(jumps, 1, 'the host jump control was used')
    assert.equal(t_.turnOfNodeKey(anchor.nodeKey), 7)
    t.mock.timers.reset()
  }, { viewport: { width: 600, height: 20 } })
})

test('revealHighlight falls back to scrolling when no jump control exists', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  await withDom(ASSISTANT_HTML, async (t_, env) => {
    const anchor = { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'the selected' }
    t_.addHighlight(anchor, null, 'session-test')
    const id = t_.highlightIdOf('14:assistant-step7:3', 'the selected')

    let scrolled = 0
    const node = env.document.querySelector('[data-chat-node-key]')
    node.scrollIntoView = () => { scrolled += 1 }

    assert.equal(t_.revealHighlight(id, 7), true)
    assert.equal(scrolled, 1, 'the node itself was scrolled into view')
    t.mock.timers.reset()
  })
})

test('revealHighlight reports failure when the passage never lays out', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  await withDom(ASSISTANT_HTML, async (t_, env) => {
    const anchor = { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'the selected' }
    t_.addHighlight(anchor, null, 'session-test')
    const id = t_.highlightIdOf('14:assistant-step7:3', 'the selected')
    // jsdom has no scrollIntoView; the fallback path needs one to exist.
    env.document.querySelector('[data-chat-node-key]').scrollIntoView = () => {}

    let failed = false
    // No underline is ever rendered, so the deadline is reached.
    assert.equal(t_.revealHighlight(id, 7, () => { failed = true }), true)
    // The poll re-arms itself every 100ms; the unmounted path now waits 6s.
    for (let step = 0; step < 80 && !failed; step += 1) t.mock.timers.tick(100)
    assert.equal(failed, true, 'onFail ran once the deadline passed')
    t.mock.timers.reset()
  })
})

/* --- openHighlight: the path a click on an underline takes --- */

test('openHighlight selects the stored span and asks the host to open on it', async () => {
  await withDom(ASSISTANT_HTML, (t, env) => {
    const highlight = {
      id: 'h-open',
      anchor: { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 0, start: 4, end: 12 }], text: 'selected' },
      createdAt: 1,
    }
    let announced = 0
    env.document.addEventListener('selectionchange', () => { announced += 1 })

    assert.equal(t.openHighlight(highlight), true, 'the passage was selected')
    assert.equal(String(env.document.getSelection()), 'selected', 'the stored span is selected again')
    assert.equal(announced, 1, 'the host was told the selection changed')
  })
})

test('openHighlight refuses an entry with no anchor', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.openHighlight(null), false)
    assert.equal(t.openHighlight({ id: 'x' }), false)
  })
})

test('openHighlight gives up when the node is not mounted', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.openHighlight({
      id: 'h-gone',
      anchor: { nodeKey: '99:assistant-step9:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 3 }], text: 'abc' },
    }), false)
  })
})

test('openHighlight gives up when the stored block index no longer exists', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.openHighlight({
      id: 'h-block',
      anchor: { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 9, start: 0, end: 3 }], text: 'abc' },
    }), false)
  })
})

test('openHighlight gives up when the span is empty', async () => {
  await withDom(ASSISTANT_HTML, (t) => {
    assert.equal(t.openHighlight({
      id: 'h-span',
      anchor: { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [], text: 'abc' },
    }), false)
  })
})

/* --- centring --- */

test('centreInColumn eases the column towards the line and settles on it', async () => {
  const html = `
    <div data-conversation-scroll>
      <div class="clipchat-layer"><div class="clipchat-layer__line" id="line"></div></div>
    </div>
  `
  await withDom(html, (t, env) => {
    const scroller = env.document.querySelector('[data-conversation-scroll]')
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true })
    scroller.scrollTop = 0
    const line = env.document.getElementById('line')
    // 20px tall, 300px down a 400px viewport: centring means moving it up by
    // 300 - (400 - 20) / 2 = 110px.
    line.getBoundingClientRect = () => ({ top: 300, height: 20, width: 100, left: 0, bottom: 320, right: 100 })
    scroller.getBoundingClientRect = () => ({ top: 0, height: 400, width: 600, left: 0, bottom: 400, right: 600 })

    assert.equal(t.centreDeltaOf(line, scroller), 110, 'the distance to centre is measured')

    // Drive the animation frame by frame so the motion is deterministic.
    const frames = []
    let now = 0
    globalThis.requestAnimationFrame = (callback) => {
      frames.push(callback)
      return frames.length
    }
    globalThis.performance = { now: () => now }

    t.animateScroll(scroller, 110)
    const samples = []
    for (let frame = 0; frame < 40 && frames.length > 0; frame += 1) {
      const next = frames.shift()
      now += 16
      next(now)
      samples.push(scroller.scrollTop)
    }

    assert.ok(samples.length > 5, 'the move took several frames rather than one')
    assert.ok(Math.max(...samples) > 110, 'it travelled past the target before settling')
    assert.equal(scroller.scrollTop, 110, 'and came back to rest exactly on it')
  })
})

test('animateScroll falls back to an instant move without animation frames', async () => {
  await withDom('<div id="s"></div>', (t, env) => {
    const scroller = env.document.getElementById('s')
    scroller.scrollTop = 0
    const original = globalThis.requestAnimationFrame
    delete globalThis.requestAnimationFrame
    try {
      t.animateScroll(scroller, 50)
      assert.equal(scroller.scrollTop, 50, 'the distance was applied directly')
    } finally {
      globalThis.requestAnimationFrame = original
    }
  })
})

test('centreInColumn does nothing without a scroller or a laid-out line', async () => {
  await withDom('<div class="clipchat-layer__line" id="line"></div>', (t, env) => {
    const line = env.document.getElementById('line')
    assert.doesNotThrow(() => t.centreInColumn([line]))
    assert.doesNotThrow(() => t.centreInColumn([]))
    assert.doesNotThrow(() => t.centreInColumn(null))
  })
})

/* --- highlight store --- */

test('removeHighlight reports whether it removed anything', async () => {
  await withDom(chatHtmlForRemove(), (t, env) => {
    stubRectsForRemove(env)
    const id = t.addHighlight({ nodeKey: '1:assistant-step1:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'hello' }, null)
    assert.equal(t.removeHighlight(id), true, 'an existing highlight was removed')
    assert.equal(t.removeHighlight(id), false, 'removing it again reports nothing to do')
  })
})

test('hasHighlight only matches the same node and text', async () => {
  await withDom(chatHtmlForRemove(), (t, env) => {
    stubRectsForRemove(env)
    t.addHighlight({ nodeKey: '1:assistant-step1:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'hello' }, null)
    assert.equal(t.hasHighlight('1:assistant-step1:1', 'hello'), true)
    assert.equal(t.hasHighlight('1:assistant-step1:1', 'other'), false)
    assert.equal(t.hasHighlight('2:assistant-step2:1', 'hello'), false)
  })
})

test('addHighlight refuses a duplicate and a missing anchor', async () => {
  await withDom(chatHtmlForRemove(), (t, env) => {
    stubRectsForRemove(env)
    const anchor = { nodeKey: '1:assistant-step1:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'hello' }
    assert.ok(t.addHighlight(anchor, null), 'the first add succeeded')
    assert.equal(t.addHighlight(anchor, null), null, 'a duplicate is refused')
    assert.equal(t.addHighlight(null, null), null, 'a missing anchor is refused')
  })
})

/** One chat column for the highlight-store tests. */
function chatHtmlForRemove() {
  return `
    <div data-chat-flow>
      <div data-chat-turn="1">
        <div data-chat-node-key="1:assistant-step1:1">
          <div data-text-interaction-source="0"><p id="p">hello world</p></div>
        </div>
      </div>
    </div>
  `
}

/** Give Range a box so drawing succeeds. */
function stubRectsForRemove(env) {
  env.window.Range.prototype.getClientRects = () => [{ left: 0, top: 0, width: 40, height: 16, right: 40, bottom: 16 }]
}

test('dateTextOf renders a date and falls back for an unusable value', async () => {
  await withDom('', (t) => {
    assert.equal(typeof t.dateTextOf(1_700_000_000_000), 'string')
    assert.equal(t.dateTextOf(Number.NaN), '—')
    assert.equal(t.dateTextOf(undefined), '—')
  })
})

test('holdCentred re-applies the correction until the target is centred', async (t) => {
  const html = `
    <div data-conversation-scroll>
      <div class="clipchat-layer__line" id="line"></div>
    </div>
  `
  await withDom(html, (t_, env) => {
    const scroller = env.document.querySelector('[data-conversation-scroll]')
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true })
    scroller.scrollTop = 0
    const line = env.document.getElementById('line')
    line.getBoundingClientRect = () => ({ top: 300, height: 20, width: 100, left: 0, bottom: 320, right: 100 })
    scroller.getBoundingClientRect = () => ({ top: 0, height: 400, width: 600, left: 0, bottom: 400, right: 600 })

    t_.holdCentred(() => [line], Date.now() - 1)
    assert.ok(scroller.scrollTop > 0, 'the first pass centred the line')
  })
})

test('holdCentred gives up quietly without a scroller', async () => {
  await withDom('<div class="clipchat-layer__line" id="line"></div>', (t, env) => {
    assert.doesNotThrow(() => t.holdCentred(() => [env.document.getElementById('line')], Date.now() + 100))
  })
})

/* --- defensive branches --- */

test('offsetWithin returns 0 for a boundary outside the block', async () => {
  await withDom('<p id="a">inside</p><p id="b">outside</p>', (t, env) => {
    const a = env.document.getElementById('a')
    const b = env.document.getElementById('b')
    assert.equal(t.offsetWithin(a, a, 0), 0, 'the block itself is offset 0')
    assert.equal(t.offsetWithin(a, b.firstChild, 2), 0, 'a boundary outside the block is 0')
  })
})

test('nodesFor escapes a key with quotes instead of throwing', async () => {
  await withDom('<div data-chat-node-key="plain"></div>', (t) => {
    assert.equal(t.nodesFor('plain').length, 1)
    // A quote in the key is escaped rather than thrown on, so the query runs
    // and simply finds nothing.
    assert.equal(t.nodesFor('a"b').length, 0, 'a key with a quote matches nothing')
  })
})

test('rangeForSpan returns null when the block has no text', async () => {
  await withDom('<p id="empty"></p>', (t, env) => {
    assert.equal(t.rangeForSpan(env.document.getElementById('empty'), 0, 1), null)
  })
})

test('layerFor creates one layer per column and reuses it', async () => {
  await withDom('<div data-chat-flow id="col"></div>', (t, env) => {
    const column = env.document.getElementById('col')
    const first = t.layerFor(column)
    const second = t.layerFor(column)
    assert.equal(first, second, 'the same layer is reused')
    assert.equal(column.querySelectorAll(':scope > .clipchat-layer').length, 1)
  })
})

test('blocksOf falls back to the source when it has no block children', async () => {
  await withDom('<div data-text-interaction-source id="src">bare text</div>', (t, env) => {
    const blocks = t.blocksOf(env.document.getElementById('src'))
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].id, 'src')
  })
})

test('blocksOf returns the leaf blocks of a nested list', async () => {
  await withDom('<div id="src"><ul><li id="li">one</li></ul></div>', (t, env) => {
    const blocks = t.blocksOf(env.document.getElementById('src'))
    assert.deepEqual(blocks.map((block) => block.id), ['li'], 'the leaf li is the block, not the ul')
  })
})

test('rangeForSpan returns null when the range cannot be built', async () => {
  await withDom('<p id="p">some text</p>', (t, env) => {
    const block = env.document.getElementById('p')
    const original = env.document.createRange.bind(env.document)
    env.document.createRange = () => {
      const range = original()
      range.setStart = () => { throw new Error('bad boundary') }
      return range
    }
    try {
      assert.equal(t.rangeForSpan(block, 0, 3), null, 'a bad boundary yields no range')
    } finally {
      env.document.createRange = original
    }
  })
})

test('nodesFor survives a selector that the engine rejects', async () => {
  await withDom('<div data-chat-node-key="plain"></div>', (t, env) => {
    const original = env.document.querySelectorAll.bind(env.document)
    env.document.querySelectorAll = () => { throw new Error('bad selector') }
    try {
      assert.deepEqual(t.nodesFor('anything'), [], 'a rejected selector yields nothing')
    } finally {
      env.document.querySelectorAll = original
    }
  })
})

test('revealHighlight flashes the underline and clears it again', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  const html = `
    <div data-conversation-scroll>
      ${ASSISTANT_HTML}
      <button aria-label="跳转到第 7 轮">jump</button>
      <div class="clipchat-layer"><div class="clipchat-layer__line" data-clipchat-id="h-flash"></div></div>
    </div>
  `
  await withDom(html, async (t_, env) => {
    // The underline must have height for the flash step to run.
    env.window.Range.prototype.getClientRects = () => [{ left: 0, top: 0, width: 80, height: 16 }]
    const line = env.document.querySelector('.clipchat-layer__line')
    line.getBoundingClientRect = () => ({ top: 100, height: 16, width: 80, left: 0, bottom: 116, right: 80 })

    const anchor = { nodeKey: '14:assistant-step7:3', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 5 }], text: 'the selected' }
    t_.addHighlight(anchor, null)
    // Bind the drawn line to the id the highlight actually got.
    line.setAttribute('data-clipchat-id', t_.highlightIdOf('14:assistant-step7:3', 'the selected'))

    const id = t_.highlightIdOf('14:assistant-step7:3', 'the selected')
    assert.equal(t_.revealHighlight(id, 7), true)

    // tick (100ms) → flash (260ms) → the class lands.
    for (let step = 0; step < 6; step += 1) t.mock.timers.tick(100)
    assert.ok(line.classList.contains('is-flash'), 'the underline flashed')

    // The flash clears itself after 1600ms.
    for (let step = 0; step < 20; step += 1) t.mock.timers.tick(100)
    assert.equal(line.classList.contains('is-flash'), false, 'the flash cleared')
    t.mock.timers.reset()
  }, { width: 600, height: 20 })
})

test('offsetWithin falls back to 0 when the range cannot be built', async () => {
  await withDom('<p id="p">some text</p>', (t, env) => {
    const block = env.document.getElementById('p')
    const original = env.document.createRange.bind(env.document)
    env.document.createRange = () => {
      const range = original()
      range.setEnd = () => { throw new Error('bad boundary') }
      return range
    }
    try {
      assert.equal(t.offsetWithin(block, block.firstChild, 3), 0)
    } finally {
      env.document.createRange = original
    }
  })
})

test('rangeForSpan clamps an offset past the end of the block', async () => {
  await withDom('<p id="p">short</p>', (t, env) => {
    // An offset beyond the text lands on the last node's end, not an error.
    const range = t.rangeForSpan(env.document.getElementById('p'), 2, 999)
    assert.ok(range !== null, 'a clamped range is still built')
    assert.equal(range.toString(), 'ort', 'the range covers to the end')
  })
})

test('dateTextOf survives a value the date engine rejects', async () => {
  await withDom('', (t, env) => {
    const original = env.window.Date
    // A Date that throws on formatting exercises the guard.
    env.window.Date = class extends original {
      toLocaleDateString() { throw new Error('locale missing') }
    }
    globalThis.Date = env.window.Date
    try {
      assert.equal(t.dateTextOf(1_700_000_000_000), '—')
    } finally {
      globalThis.Date = original
    }
  })
})

/* --- overlap: the same passage selected twice --- */

/** Two anchors on one node, differing only in the span they cover. */
function spanAnchor(start, end, blockIndex = 0) {
  return {
    nodeKey: '1:assistant-step1:1',
    sourceIndex: 0,
    spans: [{ blockIndex, start, end }],
    text: 'x'.repeat(Math.max(0, end - start)),
  }
}

test('anchorsOverlap treats any shared character as the same passage', async () => {
  await withDom('', (t) => {
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), spanAnchor(0, 10)), true, 'identical spans overlap')
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), spanAnchor(8, 20)), true, 'a partial overlap counts')
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), spanAnchor(9, 20)), true, 'a one-character overlap counts')
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), spanAnchor(10, 20)), false, 'touching but disjoint does not')
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), spanAnchor(20, 30)), false, 'a gap does not')
  })
})

test('anchorsOverlap needs the same node and the same block', async () => {
  await withDom('', (t) => {
    const left = spanAnchor(0, 10)
    assert.equal(t.anchorsOverlap(left, { ...spanAnchor(0, 10), nodeKey: '2:assistant-step2:1' }), false,
      'a different node is a different passage')
    assert.equal(t.anchorsOverlap(left, spanAnchor(0, 10, 3)), false, 'a different block does not overlap')
  })
})

test('anchorsOverlap tolerates a malformed anchor', async () => {
  await withDom('', (t) => {
    assert.equal(t.anchorsOverlap(null, spanAnchor(0, 10)), false)
    assert.equal(t.anchorsOverlap(spanAnchor(0, 10), null), false)
    assert.equal(t.anchorsOverlap({ nodeKey: 'n' }, { nodeKey: 'n' }), false, 'no spans means no overlap')
    assert.equal(t.anchorsOverlap({ nodeKey: 'n', spans: 'x' }, { nodeKey: 'n', spans: [] }), false)
  })
})

test('highlightIdFor finds a highlight whose span only partly matches', async () => {
  await withDom('', (t) => {
    const anchor = spanAnchor(0, 12)
    const id = t.addHighlight(anchor, null)
    assert.ok(id, 'the first highlight was stored')

    // A second selection of the same words, ending two characters short.
    const shorter = spanAnchor(0, 10)
    assert.equal(t.highlightIdFor('1:assistant-step1:1', shorter.text, shorter), id,
      'the overlap matched the existing highlight')
    assert.equal(t.hasHighlight('1:assistant-step1:1', shorter.text, shorter), true)
  })
})

test('highlightIdFor falls back to exact text when no anchor is given', async () => {
  await withDom('', (t) => {
    const anchor = spanAnchor(0, 12)
    const id = t.addHighlight(anchor, null)
    assert.equal(t.highlightIdFor('1:assistant-step1:1', anchor.text), id, 'exact text still matches')
    assert.equal(t.highlightIdFor('1:assistant-step1:1', 'other text'), null)
    assert.equal(t.highlightIdFor('1:assistant-step1:1', 'other text', null), null)
  })
})

test('addHighlight refuses a second selection of the same passage', async () => {
  await withDom('', (t) => {
    assert.ok(t.addHighlight(spanAnchor(0, 12), null), 'the first one was added')
    assert.equal(t.addHighlight(spanAnchor(0, 10), null), null,
      'a shorter selection of the same words is not a new highlight')
    assert.equal(t.addHighlight(spanAnchor(11, 20), null), null,
      'a selection overlapping by one character is not new either')
    assert.ok(t.addHighlight(spanAnchor(50, 60), null), 'a genuinely different passage is added')
  })
})

test('centreInColumn does nothing when the line has no height', async () => {
  await withDom('<div data-conversation-scroll><div class="clipchat-layer__line" id="line"></div></div>', (t, env) => {
    const scroller = env.document.querySelector('[data-conversation-scroll]')
    scroller.scrollTop = 0
    const line = env.document.getElementById('line')
    line.getBoundingClientRect = () => ({ top: 100, height: 0, width: 100, left: 0, bottom: 100, right: 100 })

    assert.equal(t.centreDeltaOf(line, scroller), null, 'an unlaid-out line has no centre')
    t.centreInColumn([line])
    assert.equal(scroller.scrollTop, 0, 'nothing moved')
  })
})

test('centreInColumn scrolls a laid-out line through the animation', async () => {
  await withDom('<div data-conversation-scroll><div class="clipchat-layer__line" id="line"></div></div>', (t, env) => {
    const scroller = env.document.querySelector('[data-conversation-scroll]')
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true })
    scroller.scrollTop = 0
    const line = env.document.getElementById('line')
    line.getBoundingClientRect = () => ({ top: 300, height: 20, width: 100, left: 0, bottom: 320, right: 100 })
    scroller.getBoundingClientRect = () => ({ top: 0, height: 400, width: 600, left: 0, bottom: 400, right: 600 })

    // No animation frames in this harness: the move lands immediately, which is
    // enough to prove centreInColumn reached the animation.
    const original = globalThis.requestAnimationFrame
    delete globalThis.requestAnimationFrame
    try {
      t.centreInColumn([line])
      assert.equal(scroller.scrollTop, 110, 'the column moved by the measured distance')
    } finally {
      globalThis.requestAnimationFrame = original
    }
  })
})

test('holdCentred leaves the column alone while an eased move is in flight', async () => {
  await withDom('<div data-conversation-scroll><div class="clipchat-layer__line" id="line"></div></div>', (t, env) => {
    const scroller = env.document.querySelector('[data-conversation-scroll]')
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true })
    scroller.scrollTop = 0
    const line = env.document.getElementById('line')
    line.getBoundingClientRect = () => ({ top: 300, height: 20, width: 100, left: 0, bottom: 320, right: 100 })
    scroller.getBoundingClientRect = () => ({ top: 0, height: 400, width: 600, left: 0, bottom: 400, right: 600 })

    // Start an eased move, then immediately ask the hold loop to centre. The
    // hold must wait: a second writer mid-animation is what made the jump look
    // like it stuttered.
    const frames = []
    const realRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length }
    try {
      t.animateScroll(scroller, 110)
      assert.ok(frames.length > 0, 'the animation was scheduled')

      const before = scroller.scrollTop
      t.holdCentred(() => [line], Date.now() + 200)
      assert.equal(scroller.scrollTop, before, 'the hold did not move the column')
    } finally {
      globalThis.requestAnimationFrame = realRaf
    }
  })
})
