/**
 * The rail-recovery path of `revealHighlight`.
 *
 * When the chat list virtualises an old turn, the turn rail also virtualises
 * its marks: the "load and jump to turn N" button does not exist until the
 * rail has been scrolled near N. These tests drive the real helper against a
 * jsdom rail with explicit scroll geometry, then drive the retry loop with
 * fake timers, so the click happens exactly once and the 6s deadline is real.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as React from 'react'

import { installDom } from './helpers/dom.mjs'
import { loadBundle } from './helpers/load-client.mjs'

/**
 * Install a DOM and load the bundle, always restoring afterwards.
 * @param {string} html - body markup.
 * @param {(helpers: object, env: object) => unknown} body - test body.
 * @returns {Promise<unknown>} body result.
 */
async function withDom(html, body) {
  const env = installDom(html)
  try {
    const { definition } = await loadBundle()
    const plugin = definition.factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected module: ${name}`)
    })
    return await body(plugin.__test, env)
  } finally {
    env.restore()
  }
}

/**
 * Give one element an explicit geometry.
 * @param {Element} element - target.
 * @param {{ top?: number, height?: number }} box - shared geometry.
 * @returns {Element} the element.
 */
function box(element, { top = 0, height = 0 }) {
  element.getBoundingClientRect = () => ({
    top, bottom: top + height, left: 0, right: 600, width: 600, height, x: 0, y: top,
    toJSON() { return this },
  })
  return element
}

/**
 * Build a rail whose marks live inside one vertically scrollable ancestor.
 * @param {object} options - rail geometry.
 * @param {number} options.index - data-index of the rendered mark.
 * @param {number} options.top - the mark's offset from the scroller top.
 * @param {number} [options.turn] - turn the mark describes.
 * @param {boolean} [options.scrollable] - whether the ancestor reports overflow.
 * @returns {{anchor: Element, scroller: Element}} rail pieces.
 */
function rail({ index, top, turn = 1, scrollable = true }) {
  document.body.innerHTML = `
    <div id="rail">
      <div id="marks">
        <button id="mark" data-index="${index}" aria-label="加载并跳转到第 ${turn} 轮"></button>
      </div>
    </div>
  `
  const anchor = document.getElementById('mark')
  const scroller = document.getElementById('rail')
  scroller.style.overflowY = scrollable ? 'auto' : 'visible'
  Object.defineProperty(scroller, 'scrollHeight', { value: scrollable ? 400 : 0, configurable: true })
  Object.defineProperty(scroller, 'clientHeight', { value: 100, configurable: true })
  scroller.scrollTop = 0
  box(anchor, { top })
  box(scroller, { top: 0 })
  return { anchor, scroller }
}

test('scrollRailToTurn ignores non-integer and non-positive turns', async () => {
  await withDom('', async (t) => {
    assert.equal(t.scrollRailToTurn(1.5), false)
    assert.equal(t.scrollRailToTurn(0), false)
    assert.equal(t.scrollRailToTurn('10'), false)
  })
})

test('scrollRailToTurn reports false without any rendered mark', async () => {
  await withDom('<div></div>', async (t) => {
    assert.equal(t.scrollRailToTurn(10), false)
  })
})

test('scrollRailToTurn leaves an already rendered target mark alone', async () => {
  await withDom('', async (t) => {
    const { scroller } = rail({ index: 0, top: 0, turn: 10 })
    scroller.scrollTop = 37
    assert.equal(t.scrollRailToTurn(10), true)
    assert.equal(scroller.scrollTop, 37, 'an existing mark needs no scrolling')
  })
})

test('scrollRailToTurn derives pitch from a rendered mark and centres the target', async () => {
  await withDom('', async (t) => {
    // index 1 at y=10 implies a 10px pitch; turn 10 lands at 90px, then is
    // pulled up by half the 100px viewport.
    const { scroller } = rail({ index: 1, top: 10, turn: 1 })
    assert.equal(t.scrollRailToTurn(10), true)
    assert.equal(scroller.scrollTop, 40)
  })
})

test('scrollRailToTurn falls back to a 10px pitch when the mark is unmeasurable', async () => {
  await withDom('', async (t) => {
    const { scroller } = rail({ index: 0, top: 40, turn: 1 })
    assert.equal(t.scrollRailToTurn(20), true)
    assert.equal(scroller.scrollTop, 140, 'index 0 cannot derive a pitch, so the fixed pitch is used')
  })
})

test('scrollRailToTurn reports false when no ancestor scrolls', async () => {
  await withDom('', async (t) => {
    rail({ index: 1, top: 10, turn: 1, scrollable: false })
    assert.equal(t.scrollRailToTurn(10), false)
  })
})

test('revealHighlight scrolls the rail, then clicks the loaded mark exactly once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 })
  await withDom('', async (t_, env) => {
    const { scroller } = rail({ index: 1, top: 10, turn: 1 })
    // No chat node for the anchor is mounted; only the rail can recover it.
    t_.addHighlight({ nodeKey: '14:assistant-step10:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 3 }], text: 'the' }, null, 'session-test')
    const id = t_.highlightIdOf('14:assistant-step10:1', 'the')
    assert.ok(id, 'the highlight was stored')

    let clicks = 0
    assert.equal(t_.revealHighlight(id, 10), true)
    assert.ok(scroller.scrollTop > 0, 'the rail was scrolled before any control existed')

    // The virtualiser renders the target mark one frame later.
    const button = env.document.createElement('button')
    button.setAttribute('aria-label', '加载并跳转到第 10 轮')
    button.addEventListener('click', () => { clicks += 1 })
    env.document.getElementById('marks').append(button)

    t.mock.timers.tick(100)
    assert.equal(clicks, 1, 'the newly rendered mark was clicked')

    // Later ticks must not click again: a second click would cancel the load.
    button.remove()
    for (let step = 0; step < 5; step += 1) t.mock.timers.tick(100)
    assert.equal(clicks, 1, 'the click is not repeated')
    t.mock.timers.reset()
  })
})
