/**
 * Tests for the highlight overlay and the plugin's registration path.
 *
 * The overlay is the only part of the plugin that writes to the host's chat DOM,
 * so it is where a bad selector or a missing geometry guard does real damage.
 * `apply()` is what the host calls, and its effects are only observable through
 * the context it is handed, so that is stubbed here.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'

import { installDom } from './helpers/dom.mjs'
import { loadBundle } from './helpers/load-client.mjs'

const NODE_KEY = '14:assistant-step7:3'

/** One chat column with a mounted assistant step and two text blocks. */
function chatHtml({ withFlow = true } = {}) {
  return `
    ${withFlow ? '<div data-chat-flow>' : ''}
      <div data-chat-turn="7">
        <div data-chat-node-key="${NODE_KEY}">
          <div data-text-interaction-source="0">
            <p id="b0">the selected passage</p>
            <p id="b1">a second block</p>
          </div>
        </div>
      </div>
    ${withFlow ? '</div>' : ''}
  `
}

/** Install a DOM, load the bundle, run one body, always restore. */
async function withDom(html, body, viewport) {
  const env = installDom(html, viewport)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
  try {
    const { definition } = await loadBundle()
    const plugin = definition.factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected module: ${name}`)
    })
    return await body(plugin.__test, env, plugin)
  } finally {
    globalThis.fetch = originalFetch
    env.restore()
  }
}

/**
 * jsdom reports zero-sized client rects, so give Range a fixed box.
 * @param {object} env - installed DOM.
 * @param {number} width - reported width.
 * @param {number} height - reported height.
 */
function stubRects(env, width = 120, height = 18) {
  const range = env.window.Range.prototype
  range.getClientRects = () => [{
    left: 10,
    top: 20,
    right: 10 + width,
    bottom: 20 + height,
    width,
    height,
  }]
  range.getBoundingClientRect = () => ({
    left: 10,
    top: 20,
    right: 10 + width,
    bottom: 20 + height,
    width,
    height,
  })
}

/** The anchor a real selection produces for `#b0`. */
function anchorOf(env, { start = 0, end = 12, text = 'the selected' } = {}) {
  return {
    nodeKey: NODE_KEY,
    sourceIndex: 0,
    spans: [{ blockIndex: 0, start, end }],
    text,
  }
}

test('renderAll draws one underline per visual row', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    const id = t.addHighlight(anchorOf(env), null)
    t.renderAll()

    const lines = env.document.querySelectorAll('.clipchat-layer__line')
    assert.equal(lines.length, 1, 'one rect produced one line')
    assert.equal(lines[0].getAttribute('data-clipchat-id'), id)
    assert.ok(lines[0].style.width.endsWith('px'), 'the line is positioned')
  })
})

test('renderAll folds nested rects of one row into a single line', async () => {
  await withDom(chatHtml(), (t, env) => {
    // Chrome nests an inline element's border box around the text it holds, so a
    // row with a code pill reports the pill's box and the text inside it, with
    // bottoms a couple of pixels apart. Both used to become an underline.
    env.window.Range.prototype.getClientRects = () => [
      { left: 10, top: 20, width: 60, height: 20, right: 70, bottom: 40 },
      { left: 15, top: 22, width: 50, height: 16, right: 65, bottom: 38 },
      { left: 80, top: 20, width: 20, height: 20, right: 100, bottom: 40 },
    ]
    t.addHighlight(anchorOf(env), null)
    t.renderAll()

    const lines = env.document.querySelectorAll('.clipchat-layer__line')
    assert.equal(lines.length, 1, 'one row keeps one underline')
    assert.equal(Number.parseFloat(lines[0].style.left), 10, 'the line starts at the row start')
    assert.equal(Number.parseFloat(lines[0].style.width), 90, 'the line spans the whole row')
    assert.equal(Number.parseFloat(lines[0].style.top), 20)
    assert.equal(Number.parseFloat(lines[0].style.height), 20, 'the line sits on the lowest edge')
  })
})

test('renderAll keeps one underline per wrapped row', async () => {
  await withDom(chatHtml(), (t, env) => {
    env.window.Range.prototype.getClientRects = () => [
      { left: 10, top: 20, width: 80, height: 18, right: 90, bottom: 38 },
      { left: 10, top: 40, width: 40, height: 18, right: 50, bottom: 58 },
    ]
    t.addHighlight(anchorOf(env), null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 2, 'two rows, two lines')
  })
})

test('renderAll skips a column that is not mounted', async () => {
  await withDom(chatHtml({ withFlow: false }), (t, env) => {
    t.addHighlight(anchorOf(env), null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer').length, 0, 'no layer was created')
  })
})

test('renderAll ignores a highlight whose node is gone', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    t.addHighlight({ nodeKey: '99:assistant-step9:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 3 }], text: 'abc' }, null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 0)
  })
})

test('renderAll skips a span whose block index no longer exists', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    t.addHighlight({ nodeKey: NODE_KEY, sourceIndex: 0, spans: [{ blockIndex: 9, start: 0, end: 3 }], text: 'abc' }, null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 0)
  })
})

test('renderAll re-anchors a single span when the text moved', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    // The stored span points at the wrong offsets; the text is found again.
    t.addHighlight({ nodeKey: NODE_KEY, sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 12 }], text: 'selected' }, null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 1)
  })
})

test('renderAll drops a highlight whose text can no longer be found', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    t.addHighlight({ nodeKey: NODE_KEY, sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 3 }], text: 'vanished text' }, null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 0)
  })
})

test('renderAll skips a zero-sized rect', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env, 0, 0)
    t.addHighlight(anchorOf(env), null)
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer__line').length, 0, 'a zero-size rect is not drawn')
  })
})

test('renderAll reuses the existing layer instead of stacking new ones', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    t.addHighlight(anchorOf(env), null)
    t.renderAll()
    t.renderAll()
    assert.equal(env.document.querySelectorAll('.clipchat-layer').length, 1)
  })
})

test('renderAll scales coordinates by the column ratio', async () => {
  await withDom(chatHtml(), (t, env) => {
    stubRects(env)
    const column = env.document.querySelector('[data-chat-flow]')
    // A scaled column: layout size differs from the painted box.
    Object.defineProperty(column, 'offsetWidth', { value: 600, configurable: true })
    Object.defineProperty(column, 'offsetHeight', { value: 300, configurable: true })
    t.addHighlight(anchorOf(env), null)
    t.renderAll()
    const line = env.document.querySelector('.clipchat-layer__line')
    assert.ok(line, 'the line was drawn')
    assert.ok(Number.parseFloat(line.style.width) > 0)
  }, { width: 1200, height: 600 })
})

/* --- style tag --- */

test('ensureStyle injects one style tag and only once', async () => {
  await withDom('', (t, env) => {
    t.ensureStyle()
    t.ensureStyle()
    const tags = env.document.querySelectorAll('style[data-plugin="dsh-clipchat"]')
    assert.equal(tags.length, 1, 'the stylesheet is injected once')
    assert.ok(tags[0].textContent.includes('.clipchat-card'), 'the stylesheet has the card rules')
  })
})

test('the strip detail never takes the pointer', async () => {
  await withDom('', (t, env) => {
    t.ensureStyle()
    const css = env.document.querySelector('style[data-plugin="dsh-clipchat"]').textContent
    // The popover opens upward over the composer row. Giving it the pointer made
    // it keep itself hovered, so the click meant for the textarea landed on the
    // popover and the next question could never be typed.
    const own = css.split('}').find((rule) => rule.trimStart().startsWith('.clipchat-strip__detail{'))
    assert.ok(own, 'the popover still has its own rule')
    assert.ok(own.includes('pointer-events:none'), 'it lets the pointer through')
    for (const rule of css.split('}')) {
      if (!rule.includes('.clipchat-strip__detail')) continue
      assert.equal(rule.includes('pointer-events:auto'), false, rule.trim().slice(0, 80))
    }
    // The popover is anchored to the composer block, so it opens above the input.
    assert.ok(
      css.includes('.clipchat-card__bottom{position:relative'),
      'the composer block anchors the popover',
    )
  })
})

/* --- apply() registration --- */

/** A context stub recording what `apply()` registers. */
function makeContext() {
  const effects = []
  const injections = []
  const registered = []
  const dictionaries = {}
  return {
    effects,
    injections,
    registered,
    dictionaries,
    ctx: {
      effect(fn, label) {
        effects.push({ label, dispose: fn() })
      },
      locale: {
        register(namespace, dict) {
          dictionaries[namespace] = dict
          return () => {}
        },
        bind: (namespace) => (key) => dictionaries[namespace]?.zh?.[key] ?? key,
      },
      slots: {
        inject(name, fn) {
          injections.push(name)
          return fn()
        },
        register(_options, component) {
          registered.push(component)
          return () => {}
        },
        entries: () => [],
        subscribe: () => () => {},
      },
    },
  }
}

test('apply registers styles, dictionaries and the highlight observer', async () => {
  await withDom(chatHtml(), (_t, _env, plugin) => {
    const { ctx, effects, dictionaries } = makeContext()
    plugin.apply(ctx)

    assert.ok(dictionaries.clipchat?.zh, 'the Chinese dictionary was registered')
    assert.ok(dictionaries.clipchat?.en, 'the English dictionary was registered')
    const labels = effects.map((effect) => effect.label)
    assert.ok(labels.includes('clipchat: styles'), 'styles effect registered')
    assert.ok(labels.includes('clipchat: dictionaries'), 'dictionary effect registered')
    assert.ok(labels.includes('clipchat: highlights'), 'overlay effect registered')
    assert.ok(labels.includes('clipchat: quote menu'), 'quote menu effect registered')
  })
})

test('apply cleans up its style tag and listeners on dispose', async () => {
  await withDom(chatHtml(), (_t, env, plugin) => {
    const { ctx, effects } = makeContext()
    plugin.apply(ctx)
    const styles = env.document.querySelectorAll('style[data-plugin="dsh-clipchat"]')
    assert.equal(styles.length, 1)

    for (const effect of effects) effect.dispose()

    assert.equal(env.document.querySelectorAll('style[data-plugin="dsh-clipchat"]').length, 0, 'the style tag was removed')
    assert.equal(env.document.querySelectorAll('.clipchat-layer').length, 0, 'the overlay was removed')
  })
})

test('apply registers the fallback interaction when the host has no quote entry', async () => {
  await withDom(chatHtml(), (_t, _env, plugin) => {
    const { ctx, injections, registered } = makeContext()
    const interactions = []
    ctx.uiConversation = {
      interactions: {
        register(entry) { interactions.push(entry); return () => {} },
        getSnapshot: () => [],
      },
    }
    plugin.apply(ctx)

    assert.equal(interactions.length, 1, 'the fallback interaction was registered')
    assert.equal(interactions[0].id, 'clipchat')
    assert.ok(injections.includes('conversation.chat.text-interaction'), 'the fallback surface was injected')
    assert.ok(registered.length > 0, 'a fallback component was registered')
  })
})

test('apply leaves the host quote entry alone when it is already registered', async () => {
  await withDom(chatHtml(), (_t, _env, plugin) => {
    const { ctx } = makeContext()
    const opened = []
    ctx.uiConversation = {
      interactions: {
        register() { return () => {} },
        getSnapshot: () => ['quote'],
      },
    }
    plugin.apply(ctx)

    // With quote present the fallback must not steal the selection.
    const interaction = ctx.uiConversation.interactions
    assert.deepEqual(opened, [])
    assert.equal(typeof interaction.register, 'function')
  })
})

test('apply wraps the quote entry and restores it on dispose', async () => {
  await withDom(chatHtml(), (_t, _env, plugin) => {
    const Original = () => null
    const entry = { options: { key: 'quote' }, component: Original }
    let listener = null
    const { ctx, effects } = makeContext()
    ctx.slots.entries = () => [entry]
    ctx.slots.subscribe = (name, fn) => { listener = fn; return () => {} }

    plugin.apply(ctx)
    assert.notEqual(entry.component, Original, 'the entry was wrapped')
    assert.equal(typeof entry.__clipchatOriginal, 'function', 'the original is kept')

    // A later registration is patched by the subscription.
    const late = { options: { key: 'quote' }, component: Original }
    ctx.slots.entries = () => [entry, late]
    listener()
    assert.notEqual(late.component, Original, 'a late entry was wrapped too')

    for (const effect of effects) effect.dispose()
    assert.equal(entry.component, Original, 'the original was restored')
    assert.equal(late.component, Original, 'the late entry was restored')
    assert.equal('__clipchatOriginal' in entry, false, 'the marker was cleared')
  })
})

/* --- clicking an underline, end to end through apply() --- */

/** A chat column with a mounted assistant step whose passage is highlighted. */
function clickableHtml() {
  return `
    <div data-chat-flow>
      <div data-chat-turn="7">
        <div data-chat-node-key="${NODE_KEY}">
          <div data-text-interaction-source="0"><p id="b0">the selected passage</p></div>
        </div>
      </div>
    </div>
  `
}

/** Give Range a box so a highlight actually draws. */
function stubRangeBox(env) {
  env.window.Range.prototype.getClientRects = () => [{ left: 10, top: 20, width: 120, height: 18, right: 130, bottom: 38 }]
}

test('clicking an underline reopens that highlight', async () => {
  await withDom(clickableHtml(), (t, env, plugin) => {
    stubRangeBox(env)
    const { ctx } = makeContext()
    plugin.apply(ctx)

    const anchor = { nodeKey: NODE_KEY, sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 12 }], text: 'the selected' }
    const id = t.addHighlight(anchor, null)
    t.renderAll()

    const line = env.document.querySelector('.clipchat-layer__line')
    assert.ok(line, 'the underline was drawn')

    // The plugin listens on document in the capture phase.
    let announced = 0
    env.document.addEventListener('selectionchange', () => { announced += 1 })
    const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true })
    line.dispatchEvent(event)

    assert.equal(event.defaultPrevented, true, 'the click was taken over by the plugin')
    assert.equal(String(env.document.getSelection()), 'the selected', 'the passage was selected again')
    assert.equal(announced, 1, 'the host was told to reopen on it')
    assert.equal(t.highlightIdOf(NODE_KEY, 'the selected'), id)
  })
})

test('clicking an underline whose highlight is gone does nothing', async () => {
  await withDom(clickableHtml(), (t, env, plugin) => {
    stubRangeBox(env)
    const { ctx } = makeContext()
    plugin.apply(ctx)

    const layer = env.document.createElement('div')
    layer.className = 'clipchat-layer'
    const line = env.document.createElement('div')
    line.className = 'clipchat-layer__line'
    line.setAttribute('data-clipchat-id', 'never-stored')
    layer.appendChild(line)
    env.document.querySelector('[data-chat-flow]').appendChild(layer)

    const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true })
    line.dispatchEvent(event)
    assert.equal(event.defaultPrevented, false, 'the click passed through untouched')
  })
})

test('clicking anywhere else is left alone', async () => {
  await withDom(clickableHtml(), (t, env, plugin) => {
    stubRangeBox(env)
    const { ctx } = makeContext()
    plugin.apply(ctx)

    const event = new env.window.MouseEvent('click', { bubbles: true, cancelable: true })
    env.document.getElementById('b0').dispatchEvent(event)
    assert.equal(event.defaultPrevented, false)
  })
})

test('resizing the window re-renders the overlay', async () => {
  await withDom(clickableHtml(), (t, env, plugin) => {
    stubRangeBox(env)
    const { ctx, effects } = makeContext()
    plugin.apply(ctx)
    t.addHighlight({ nodeKey: NODE_KEY, sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 12 }], text: 'the selected' }, null)

    env.window.dispatchEvent(new env.window.Event('resize'))
    // The render is debounced; wait for it.
    return new Promise((resolve) => {
      setTimeout(() => {
        assert.ok(env.document.querySelector('.clipchat-layer__line'), 'the overlay redrew')
        for (const effect of effects) effect.dispose()
        resolve()
      }, 150)
    })
  })
})

test('the fallback interaction opens only for a real selection without quote', async () => {
  await withDom(clickableHtml(), (_t, _env, plugin) => {
    const { ctx } = makeContext()
    const opened = []
    const interactions = []
    ctx.uiConversation = {
      interactions: {
        register(entry) { interactions.push(entry); return () => {} },
        getSnapshot: () => [],
      },
    }
    plugin.apply(ctx)
    const handler = interactions[0].onInteraction

    // A non-selection trigger is ignored.
    handler({ trigger: 'click', readText: () => 'x', open: () => opened.push('x') })
    assert.equal(opened.length, 0, 'a non-selection trigger does nothing')

    // An empty selection is ignored.
    handler({ trigger: 'selection', readText: () => null, open: () => opened.push('x') })
    assert.equal(opened.length, 0, 'an empty selection does nothing')

    // A real selection opens the surface.
    handler({ trigger: 'selection', readText: () => 'a passage', open: () => opened.push('x') })
    assert.equal(opened.length, 1, 'a real selection opened the surface')
  })
})

test('the fallback interaction stands down when quote is registered', async () => {
  await withDom(clickableHtml(), (_t, _env, plugin) => {
    const { ctx } = makeContext()
    const opened = []
    const interactions = []
    let snapshot = []
    ctx.uiConversation = {
      interactions: {
        register(entry) { interactions.push(entry); return () => {} },
        getSnapshot: () => snapshot,
      },
    }
    plugin.apply(ctx)

    snapshot = ['quote']
    interactions[0].onInteraction({ trigger: 'selection', readText: () => 'a passage', open: () => opened.push('x') })
    assert.equal(opened.length, 0, 'quote keeps priority')
  })
})
