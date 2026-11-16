import { test } from 'node:test'
import assert from 'node:assert/strict'

const react = {
  createElement: (...args) => ({ args }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
}

let bundleSequence = 0

/** Load the browser bundle through a fake ModuleLoader against one document stub. */
async function loadPlugin(documentStub) {
  let definition
  globalThis.window = {
    __ModuleLoader__: { load(value) { definition = value } },
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (handle) => clearTimeout(handle),
  }
  globalThis.document = documentStub
  const url = new URL('../client.js', import.meta.url)
  await import(`${url.href}?v=${++bundleSequence}`)
  assert.ok(definition, 'bundle registered itself')
  return definition.factory(() => react).__test
}

/** A document whose only session marker lives on one element. */
function makeDocument({ sessionId = null, flow = null } = {}) {
  const state = { sessionId }
  const sessionElement = { getAttribute: () => state.sessionId }
  return {
    state,
    body: {},
    head: { appendChild() {} },
    createElement() {
      return {
        dataset: {}, style: {}, textContent: '', className: '', remove() {},
        setAttribute() {}, appendChild() {},
      }
    },
    getSelection() { return null },
    querySelector(selector) {
      if (selector === '[data-conversation-scroll] [data-conversation-session]') return sessionElement
      if (selector === '[data-conversation-session]') return sessionElement
      if (selector === '[data-chat-flow]') return flow
      return null
    },
    querySelectorAll() { return [] },
    addEventListener() {},
    removeEventListener() {},
  }
}

const anchor = {
  nodeKey: '5:assistant-step1:1',
  sourceIndex: 0,
  spans: [{ blockIndex: 0, start: 0, end: 7 }],
  text: 'passage',
}

/** Replace global fetch with a scripted JSON responder and record calls. */
function stubFetch(responses) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    const response = responses.shift() ?? { highlights: [], records: [] }
    return { ok: true, status: 200, json: async () => response }
  }
  return calls
}

test('currentSessionIdOf prefers the session marker inside the scroll container', async () => {
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  assert.equal(test_.currentSessionIdOf(), 'session-a')
})

test('currentSessionIdOf falls back to any session marker', async () => {
  const test_ = await loadPlugin({
    body: {},
    querySelector(selector) {
      if (selector === '[data-conversation-session]') return { getAttribute: () => 'session-b' }
      return null
    },
  })
  assert.equal(test_.currentSessionIdOf(), 'session-b')
})

test('currentSessionIdOf returns null without a marker or a querySelector', async () => {
  const none = await loadPlugin(makeDocument())
  assert.equal(none.currentSessionIdOf(), null)

  const bare = await loadPlugin({ body: {} })
  assert.equal(bare.currentSessionIdOf(), null)
})

test('loading a session replaces the in-memory highlights with the stored ones', async () => {
  const calls = stubFetch([{
    highlights: [{ id: 'h1', anchor, createdAt: 10 }],
    records: [],
  }])
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))

  await test_.loadSession('session-a')

  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/dsh-clipchat/session?sessionId=session-a')
  assert.equal(calls[0].options?.method ?? 'GET', 'GET')
  assert.equal(test_.highlightIdOf(anchor.nodeKey, anchor.text), 'h1')
})

test('maybeLoadSession loads once per session and reloads after a switch', async () => {
  const calls = stubFetch([
    { highlights: [{ id: 'h1', anchor, createdAt: 10 }], records: [] },
    { highlights: [{ id: 'h2', anchor, createdAt: 20 }], records: [] },
  ])
  const documentStub = makeDocument({ sessionId: 'session-a' })
  const test_ = await loadPlugin(documentStub)

  await test_.maybeLoadSession()
  assert.equal(calls.length, 1)
  assert.equal(test_.highlightIdOf(anchor.nodeKey, anchor.text), 'h1')

  await test_.maybeLoadSession()
  assert.equal(calls.length, 1, 'the same session is not fetched again')

  documentStub.state.sessionId = 'session-b'
  await test_.maybeLoadSession()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, '/dsh-clipchat/session?sessionId=session-b')
  assert.equal(test_.highlightIdOf(anchor.nodeKey, anchor.text), 'h2', 'old highlights are gone')
})

test('a session switch clears highlights before the new state arrives', async () => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  let callCount = 0
  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return { ok: true, json: async () => ({ highlights: [{ id: 'h1', anchor, createdAt: 1 }], records: [] }) }
    }
    return { ok: true, json: async () => pending }
  }
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  await test_.loadSession('session-a')
  assert.equal(test_.highlightIdOf(anchor.nodeKey, anchor.text), 'h1')

  const switching = test_.loadSession('session-b')
  assert.equal(test_.highlightIdOf(anchor.nodeKey, anchor.text), null, 'cleared immediately')

  release({ highlights: [], records: [] })
  await switching
})
