import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadBundle } from './helpers/load-client.mjs'
import { makeRecord, makeTurn } from './helpers/records.mjs'

const react = {
  createElement: (...args) => ({ args }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  useRef: () => ({ current: null }),
}

/** Load the browser bundle through the shared loader against one document stub. */
async function loadPlugin(documentStub) {
  globalThis.window = {
    __ModuleLoader__: { load() {} },
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (handle) => clearTimeout(handle),
  }
  globalThis.document = documentStub
  const { definition } = await loadBundle()
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

// --- records (ticket 19) ---

test('buildRecord assembles the persisted record shape', async () => {
  const test_ = await loadPlugin(makeDocument())

  const entry = test_.buildRecord({
    id: 'r1',
    highlightId: 'h1',
    selection: 'passage',
    question: 'why?',
    answer: 'because',
    provider: 'deepseek',
    model: 'deepseek-chat',
    usage: { input: 3, output: 7 },
    createdAt: 99,
  })

  assert.deepEqual(entry, {
    id: 'r1',
    highlightId: 'h1',
    selection: 'passage',
    turns: [{
      question: 'why?',
      answer: 'because',
      provider: 'deepseek',
      model: 'deepseek-chat',
      usage: { input: 3, output: 7 },
      createdAt: 99,
    }],
    createdAt: 99,
    updatedAt: 99,
  })
})

test('buildRecord generates an id and timestamp when they are absent', async () => {
  const test_ = await loadPlugin(makeDocument())

  const entry = test_.buildRecord({
    selection: 'passage',
    question: 'why?',
    answer: 'because',
    provider: 'deepseek',
    model: 'deepseek-chat',
  })

  assert.equal(typeof entry.id, 'string')
  assert.ok(entry.id.length > 0)
  assert.equal(typeof entry.createdAt, 'number')
  assert.equal(entry.turns.length, 1)
  assert.equal('usage' in entry.turns[0], false)
  assert.equal('highlightId' in entry, false)
})

test('buildRecord refuses an incomplete answer, selection or route', async () => {
  const test_ = await loadPlugin(makeDocument())
  const valid = {
    selection: 'passage',
    question: 'why?',
    answer: 'because',
    provider: 'deepseek',
    model: 'deepseek-chat',
  }

  for (const broken of [
    null,
    {},
    { ...valid, answer: '' },
    { ...valid, answer: undefined },
    { ...valid, question: '' },
    { ...valid, selection: '' },
    { ...valid, provider: '' },
    { ...valid, model: undefined },
    { ...valid, usage: { input: -1, output: 2 } },
    { ...valid, usage: { input: 1 } },
    { ...valid, createdAt: 'yesterday' },
  ]) {
    assert.equal(test_.buildRecord(broken), null, `should refuse ${JSON.stringify(broken)}`)
  }
})

test('recordCount and recordList track the loaded session records', async () => {
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(url)
    return { ok: true, json: async () => ({ highlights: [], records: [makeRecord('r1'), makeRecord('r2')] }) }
  }
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))

  await test_.loadSession('session-a')

  assert.equal(test_.recordCount(), 2)
  assert.deepEqual(test_.recordList().map((entry) => entry.id), ['r1', 'r2'])
  assert.equal(calls.length, 1)
})

test('a session switch clears records before the new state arrives', async () => {
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  let callCount = 0
  let release
  const pending = new Promise((resolve) => { release = resolve })
  globalThis.fetch = async () => {
    callCount += 1
    if (callCount === 1) {
      return { ok: true, json: async () => ({ highlights: [], records: [makeRecord('r1')] }) }
    }
    return { ok: true, json: async () => pending }
  }

  await test_.loadSession('session-a')
  assert.equal(test_.recordCount(), 1)

  const switching = test_.loadSession('session-b')
  assert.equal(test_.recordCount(), 0, 'records are cleared immediately')

  release({ highlights: [], records: [makeRecord('r9')] })
  await switching
  assert.deepEqual(test_.recordList().map((entry) => entry.id), ['r9'])
})

test('malformed stored records are ignored on load', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      highlights: [],
      records: [
        makeRecord('r1'),
        null,
        { id: 'broken' },
        { ...makeRecord('r2'), turns: [{ ...makeTurn('r2'), answer: '' }] },
      ],
    }),
  })
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))

  await test_.loadSession('session-a')

  assert.deepEqual(test_.recordList().map((entry) => entry.id), ['r1'])
})

test('isCurrentSelection tags only records of the current card selection', async () => {
  const test_ = await loadPlugin(makeDocument())

  assert.equal(test_.isCurrentSelection(makeRecord('r1', { selection: 'passage-r1' }), 'passage-r1'), true)
  assert.equal(test_.isCurrentSelection(makeRecord('r1', { selection: 'passage-r1' }), 'other'), false)
  assert.equal(test_.isCurrentSelection(makeRecord('r1', { selection: 'passage-r1' }), ''), false)
  assert.equal(test_.isCurrentSelection(null, 'passage-r1'), false)
  assert.equal(test_.isCurrentSelection(undefined, undefined), false)
})

test('addRecord and removeRecord update memory next to highlights', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ highlights: [], records: [] }) })
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  await test_.loadSession('session-a')
  const entry = test_.buildRecord({
    id: 'r1',
    selection: 'passage',
    question: 'why?',
    answer: 'because',
    provider: 'deepseek',
    model: 'deepseek-chat',
  })

  assert.equal(test_.addRecord(entry, 'session-a'), 'r1')
  assert.equal(test_.recordCount(), 1)

  assert.equal(test_.removeRecord('r1', 'session-a'), true)
  assert.equal(test_.recordCount(), 0)
  assert.equal(test_.removeRecord('r1', 'session-a'), false)
})

test('persisting a record posts to the record route and tolerates failure', async () => {
  const calls = stubFetch([{ records: [makeRecord('r1')] }])
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  const entry = makeRecord('r1')

  await test_.persistRecord('add', entry, 'session-a')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/dsh-clipchat/record')
  assert.equal(calls[0].options.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    sessionId: 'session-a',
    op: 'add',
    record: entry,
  })

  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  await test_.persistRecord('remove', { id: 'r1' }, 'session-a')
})

test('a failed highlight write is logged, not thrown', async () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) })
  try {
    const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
    const id = test_.addHighlight({
      nodeKey: '1:assistant-step1:1',
      sourceIndex: 0,
      spans: [{ blockIndex: 0, start: 0, end: 5 }],
      text: 'hello',
    }, null)
    assert.ok(id, 'the highlight is kept in memory even when the write fails')
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.ok(warnings.some((line) => line.includes('highlight was not saved')), 'the failure was logged')
  } finally {
    console.warn = originalWarn
  }
})

test('a failed session read is logged and leaves the card empty', async () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  globalThis.fetch = async () => { throw new Error('session route down') }
  try {
    const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
    await test_.loadSession('session-a')
    assert.equal(test_.recordCount(), 0)
    assert.ok(warnings.some((line) => line.includes('session highlights were not loaded')), 'the failure was logged')
  } finally {
    console.warn = originalWarn
  }
})

test('scheduleSessionCheck debounces repeated calls', async () => {
  const test_ = await loadPlugin(makeDocument({ sessionId: 'session-a' }))
  const originalFetch = globalThis.fetch
  let reads = 0
  globalThis.fetch = async () => {
    reads += 1
    return { ok: true, json: async () => ({ highlights: [], records: [] }) }
  }
  try {
    test_.scheduleSessionCheck()
    test_.scheduleSessionCheck()
    test_.scheduleSessionCheck()
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(reads, 1, 'three calls collapsed into one read')
  } finally {
    globalThis.fetch = originalFetch
  }
})
