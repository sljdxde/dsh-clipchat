import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadBundle } from './helpers/load-client.mjs'

/** React stub that keeps state values stable (no re-render) but records setters. */
function makeInteractiveReact() {
  return {
    createElement: (...args) => ({ args }),
    useState: (init) => {
      let value = typeof init === 'function' ? init() : init
      return [value, (next) => { value = typeof next === 'function' ? next(value) : next }]
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: 'Fragment',
  }
}

/** Every button element in a rendered tree, depth-first. */
function buttonsOf(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) buttonsOf(child, out)
    return out
  }
  if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return out
  if (node.args[0] === 'button') out.push(node)
  buttonsOf(node.args.slice(2), out)
  return out
}

const nodeKey = '1:assistant-step1:1'
const node = {
  kind: 'assistant-step',
  data: { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: 'the selected message' }] },
}

function useChat(selector) {
  return selector({
    nodes: { get: (key) => (key === nodeKey ? node : undefined) },
    timeline: { turnOrder: [], turns: new Map() },
    locations: { getTurn: () => [] },
  })
}

function renderCard(plugin, { selection = 'selected passage', anchor = null } = {}) {
  return plugin.__test.ClipCard({
    selection,
    nodeKey,
    anchor,
    dismiss() {},
    translate: (key) => key,
    sessionId: 'session-test',
    useChat,
    inputActions: undefined,
    initialHighlightId: undefined,
  })
}

test('a preset click sends that exact preset question to /ask', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeInteractiveReact())
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: init?.body })
    return { ok: false, status: 500, json: async () => ({ error: 'test' }) }
  }
  try {
    const presets = buttonsOf(renderCard(plugin))
      .filter((button) => button.args[1]?.className === 'clipchat-card__preset')
    assert.equal(presets.length, 4)
    assert.equal(presets[1].args[1].disabled, false)
    presets[1].args[1].onClick()
    const ask = calls.find((entry) => entry.url === '/dsh-clipchat/ask')
    assert.ok(ask, 'clicking a preset must call /ask')
    assert.equal(JSON.parse(ask.body).question, 'presetTranslateQ')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('quick asks are disabled when no passage was read', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeInteractiveReact())
  const presets = buttonsOf(renderCard(plugin, { selection: '  ' }))
    .filter((button) => button.args[1]?.className === 'clipchat-card__preset')
  assert.equal(presets.length, 4)
  assert.deepEqual(presets.map((button) => button.args[1].disabled), [true, true, true, true])
})

test('the first ask commits the highlight only when one is missing', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeInteractiveReact())
  const anchor = {
    nodeKey: '9:assistant-step1:1',
    sourceIndex: 0,
    spans: [{ blockIndex: 0, start: 0, end: 7 }],
    text: 'passage',
  }
  const added = []
  const add = (value, model) => { added.push({ value, model }); return 'h-new' }

  assert.equal(plugin.__test.askHighlightId({ highlighted: false, anchor, model: null, add }), 'h-new')
  assert.deepEqual(added, [{ value: anchor, model: null }])
  assert.equal(plugin.__test.askHighlightId({ highlighted: true, anchor, model: null, add }), null)
  assert.equal(plugin.__test.askHighlightId({ highlighted: false, anchor: null, model: null, add }), null)
  assert.equal(added.length, 1)
})

test('rendering a card without asking commits no highlight', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeInteractiveReact())
  const anchor = {
    nodeKey: '7:assistant-step9:1',
    sourceIndex: 0,
    spans: [{ blockIndex: 0, start: 0, end: 15 }],
    text: 'never committed',
  }
  renderCard(plugin, { selection: 'never committed', anchor })
  assert.equal(plugin.__test.hasHighlight(anchor.nodeKey, anchor.text), false)
})

test('the kept-answer panel stays closed until the footer button opens it', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeInteractiveReact())
  const hasPanel = (node, out = { found: false }) => {
    if (Array.isArray(node)) {
      for (const child of node) hasPanel(child, out)
      return out
    }
    if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return out
    const props = node.args[1]
    if (props !== null && typeof props === 'object' && props.className === 'clipchat-card__records') out.found = true
    hasPanel(node.args.slice(2), out)
    return out
  }
  assert.equal(hasPanel(renderCard(plugin)).found, false, 'a fresh card shows the thread, not the list')
})

/** React stub that records every state setter call, keyed by the state's init. */
function makeRecordingReact() {
  const log = []
  return {
    log,
    createElement: (...args) => ({ args }),
    useState: (init) => {
      const entry = { init, calls: [] }
      log.push(entry)
      let value = typeof init === 'function' ? init() : init
      return [value, (next) => {
        value = typeof next === 'function' ? next(value) : next
        entry.calls.push(value)
      }]
    },
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: 'Fragment',
  }
}

/** Every rendered element of one tag, depth-first. */
function elementsOf(node, tag, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) elementsOf(child, tag, out)
    return out
  }
  if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return out
  if (node.args[0] === tag) out.push(node)
  elementsOf(node.args.slice(2), tag, out)
  return out
}

test('sending a question empties the composer for the next one', async () => {
  const { definition } = await loadBundle()
  const react = makeRecordingReact()
  const plugin = definition.factory(() => react)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ error: 'test' }) })
  try {
    const tree = renderCard(plugin)
    const textarea = elementsOf(tree, 'textarea')
      .find((node) => node.args[1]?.className === 'clipchat-card__ta')
    assert.ok(textarea, 'the composer renders a textarea')

    // Type, then send through a preset: the preset carries its own question, so
    // the harness needs no re-render for the draft to be current.
    textarea.args[1].onChange({ target: { value: '这个参数是干什么的' } })
    const draft = react.log.find((entry) => entry.calls[0] === '这个参数是干什么的')
    assert.ok(draft, 'typing must update the draft state')

    const preset = buttonsOf(tree).filter((button) => button.args[1]?.className === 'clipchat-card__preset')[0]
    preset.args[1].onClick()

    assert.equal(draft.calls[draft.calls.length - 1], '', 'sending must clear the draft')
  } finally {
    globalThis.fetch = originalFetch
  }
})
