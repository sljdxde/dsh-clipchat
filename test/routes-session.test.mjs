import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'
import { call, makeRequest } from './helpers/http.mjs'
import { createStore } from '../lib/store.js'

const SESSION_PATH = '/dsh-clipchat/session'
const HIGHLIGHT_PATH = '/dsh-clipchat/highlight'


function payloadOf(res) {
  return JSON.parse(res.raw)
}

function makeContext({ connection, sessions, workspaceRegistry, sessionQuery } = {}) {
  const routes = new Map()
  const disposers = []
  const webServer = {
    register({ kind, path, handler }) {
      assert.equal(kind, 'exact')
      routes.set(path, handler)
      return () => routes.delete(path)
    },
  }
  const scope = {
    webServer,
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  const ctx = {
    get: (name) => ({ connection, sessions, workspaceRegistry, sessionQuery })[name],
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    inject(names, fn) {
      assert.deepEqual(names, ['webServer'])
      fn(scope)
      return () => {}
    },
  }
  return { ctx, routes, disposers }
}

const anchor = {
  nodeKey: '5:assistant-step1:1',
  sourceIndex: 0,
  spans: [{ blockIndex: 0, start: 0, end: 7 }],
  text: 'passage',
}

const addBody = {
  sessionId: 'session-a',
  op: 'add',
  highlight: { id: 'h1', anchor, createdAt: 111 },
}

async function setup({ connection = { requestRejection: () => undefined } } = {}) {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes, disposers } = makeContext({ connection })
  apply(ctx, { storeRoot })
  return { routes, disposers, storeRoot, store: createStore({ root: storeRoot }) }
}

function getSession(sessionId, headers = { host: 'h' }) {
  const query = sessionId === undefined ? '' : `?sessionId=${encodeURIComponent(sessionId)}`
  return makeRequest({ method: 'GET', url: `${SESSION_PATH}${query}`, headers })
}

test('registers the session and highlight routes and disposes all four', () => {
  const { ctx, routes, disposers } = makeContext({
    connection: { requestRejection: () => undefined },
  })

  apply(ctx, { storeRoot: '/tmp/unused-clipchat-root' })

  for (const path of [SESSION_PATH, HIGHLIGHT_PATH]) {
    assert.equal(typeof routes.get(path), 'function')
  }

  for (const dispose of disposers.reverse()) dispose()
  assert.equal(routes.size, 0)
})

test('GET session returns stored highlights and records', async () => {
  const { routes, store } = await setup()
  await store.addHighlight('session-a', { id: 'h1', anchor, createdAt: 10 })

  const res = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.equal(res.status, 200)
  assert.deepEqual(payloadOf(res), {
    highlights: [{ id: 'h1', anchor, createdAt: 10 }],
    records: [],
  })
})

test('GET session rejects a request without a sessionId', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(SESSION_PATH), getSession(undefined))

  assert.equal(res.status, 400)
  assert.equal(payloadOf(res).error, 'missing-session-id')
})

test('GET session rejects a sessionId that could escape the store', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(SESSION_PATH), getSession('../escape'))

  assert.equal(res.status, 400)
  assert.equal(payloadOf(res).error, 'invalid-session-id')
})

test('POST add stores a highlight and returns the latest list', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(HIGHLIGHT_PATH), makeRequest({ url: HIGHLIGHT_PATH, body: addBody }))

  assert.equal(res.status, 200)
  assert.deepEqual(payloadOf(res), {
    highlights: [{ id: 'h1', anchor, createdAt: 111 }],
  })

  const read = await call(routes.get(SESSION_PATH), getSession('session-a'))
  assert.deepEqual(payloadOf(read).highlights.map((entry) => entry.id), ['h1'])
})

test('POST remove deletes by id and returns the latest list', async () => {
  const { routes, storeRoot } = await setup()
  const store = createStore({ root: storeRoot })
  await store.addHighlight('session-a', { id: 'h1', anchor, createdAt: 10 })
  await store.addHighlight('session-a', { id: 'h2', anchor, createdAt: 11 })

  const res = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: { sessionId: 'session-a', op: 'remove', highlight: { id: 'h1' } },
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(payloadOf(res).highlights.map((entry) => entry.id), ['h2'])
  const stored = JSON.parse(await readFile(join(storeRoot, 'session-a.json'), 'utf8'))
  assert.deepEqual(stored.highlights.map((entry) => entry.id), ['h2'])
})

test('POST highlight returns 404 for an unknown op', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: { sessionId: 'session-a', op: 'toggle', highlight: { id: 'h1', anchor } },
  }))

  assert.equal(res.status, 404)
  assert.equal(payloadOf(res).error, 'unknown-op')
})

test('POST add rejects an invalid anchor or id with 400', async () => {
  const { routes } = await setup()

  const badAnchor = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: {
      sessionId: 'session-a',
      op: 'add',
      highlight: { id: 'h1', anchor: { nodeKey: '', spans: [], text: '' } },
    },
  }))
  assert.equal(badAnchor.status, 400)
  assert.equal(payloadOf(badAnchor).error, 'invalid-highlight')

  const badSpan = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: {
      sessionId: 'session-a',
      op: 'add',
      highlight: { id: 'h1', anchor: { ...anchor, spans: [{ blockIndex: 0, start: 9, end: 2 }] } },
    },
  }))
  assert.equal(badSpan.status, 400)

  const badId = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: { sessionId: 'session-a', op: 'add', highlight: { anchor } },
  }))
  assert.equal(badId.status, 400)
})

test('POST highlight rejects an invalid sessionId with 400', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: { ...addBody, sessionId: '../escape' },
  }))

  assert.equal(res.status, 400)
  assert.equal(payloadOf(res).error, 'invalid-session-id')
})

test('POST highlight rejects malformed JSON and oversized bodies', async () => {
  const { routes } = await setup()

  const invalid = await call(routes.get(HIGHLIGHT_PATH), makeRequest({ url: HIGHLIGHT_PATH, body: '{oops' }))
  assert.equal(invalid.status, 400)
  assert.equal(payloadOf(invalid).error, 'invalid-request')

  const oversized = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    body: JSON.stringify({ ...addBody, padding: 'x'.repeat(600 * 1024) }),
  }))
  assert.equal(oversized.status, 413)
  assert.equal(payloadOf(oversized).error, 'body-too-large')
})

test('both routes honour the connection guard', async () => {
  for (const rejection of [401, 403]) {
    const { routes, disposers } = await setup({ connection: { requestRejection: () => rejection } })
    for (const [path, method] of [[SESSION_PATH, 'GET'], [HIGHLIGHT_PATH, 'POST']]) {
      const res = await call(routes.get(path), makeRequest({
        method,
        url: path,
        headers: { host: 'h' },
        body: method === 'POST' ? addBody : undefined,
      }))
      assert.equal(res.status, rejection)
    }
    for (const dispose of disposers.reverse()) dispose()
  }
})

test('the same-origin fallback also fences both routes', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({})
  apply(ctx, { storeRoot })

  const crossOrigin = await call(routes.get(SESSION_PATH), makeRequest({
    method: 'GET',
    url: `${SESSION_PATH}?sessionId=session-a`,
    headers: { host: 'h', origin: 'https://evil.example' },
  }))
  assert.equal(crossOrigin.status, 403)

  const crossSite = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    url: HIGHLIGHT_PATH,
    headers: { host: 'h', 'sec-fetch-site': 'cross-site' },
    body: addBody,
  }))
  assert.equal(crossSite.status, 403)
})

test('wrong methods are rejected with 405', async () => {
  const { routes } = await setup()

  const sessionPost = await call(routes.get(SESSION_PATH), makeRequest({
    method: 'POST',
    url: SESSION_PATH,
    body: addBody,
  }))
  assert.equal(sessionPost.status, 405)

  const highlightGet = await call(routes.get(HIGHLIGHT_PATH), makeRequest({
    method: 'GET',
    url: HIGHLIGHT_PATH,
  }))
  assert.equal(highlightGet.status, 405)
})

// --- startup and read-time cleanup (ticket 17) ---

const DAY = 24 * 60 * 60 * 1000

async function writeSession(root, sessionId, updatedAt = Date.now()) {
  await writeFile(join(root, `${sessionId}.json`), JSON.stringify({
    version: 1,
    sessionId,
    updatedAt,
    highlights: [],
    records: [],
  }))
}

async function listFiles(root) {
  try {
    return await readdir(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function waitFor(predicate, timeoutMs = 1000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('condition was not met before the timeout')
}

test('apply sweeps orphans against sessions.list plus archived ids', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  await writeSession(storeRoot, 'active-1', Date.now() - DAY)
  await writeSession(storeRoot, 'archived-1', Date.now() - DAY)
  await writeSession(storeRoot, 'orphan-1')
  const { ctx } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'active-1' }] },
    workspaceRegistry: { archivedSessionIds: ['archived-1'] },
    sessionQuery: { listSessions: async () => [{ header: { id: 'active-1' } }, { header: { id: 'archived-1' } }] },
  })

  apply(ctx, { storeRoot })

  await waitFor(async () => (await listFiles(storeRoot)).length === 2)
  assert.deepEqual((await listFiles(storeRoot)).sort(), ['active-1.json', 'archived-1.json'])
})

test('GET session sweeps expired and orphaned files before serving', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'active-1' }] },
    sessionQuery: { listSessions: async () => [{ header: { id: 'active-1' } }] },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'active-1', Date.now() - DAY)
  await writeSession(storeRoot, 'orphan-1')
  await writeSession(storeRoot, 'stale-1', Date.now() - 8 * DAY)
  await writeSession(storeRoot, 'stale-live', Date.now() - 8 * DAY)

  const res = await call(routes.get(SESSION_PATH), getSession('active-1'))

  assert.equal(res.status, 200)
  assert.deepEqual((await listFiles(storeRoot)).sort(), ['active-1.json'])
})

test('cleanup is skipped when sessions.list is unavailable', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.equal(res.status, 200)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

test('cleanup is skipped when sessions.list returns no ids', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [] },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.equal(res.status, 200)
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

test('a throwing sessions.list neither breaks apply nor the session route', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => { throw new Error('session store unavailable') } },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.equal(res.status, 200)
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

test('malformed session entries still yield a usable set of string ids', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  await writeSession(storeRoot, 'active-1', Date.now() - DAY)
  await writeSession(storeRoot, 'orphan-1')
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    // Session ids are branded strings; a mix of shapes must normalize to strings.
    sessions: { list: () => [{ id: 'active-1' }, null, { id: '' }, {}] },
    sessionQuery: { listSessions: async () => [{ header: { id: 'active-1' } }] },
  })
  apply(ctx, { storeRoot })

  await waitFor(async () => (await listFiles(storeRoot)).length === 1)
  assert.deepEqual(await listFiles(storeRoot), ['active-1.json'])

  const res = await call(routes.get(SESSION_PATH), getSession('active-1'))
  assert.equal(res.status, 200)
})

test('a failing cleanup sweep does not turn GET session into a 500', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  await writeSession(storeRoot, 'orphan-1')
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'active-1' }] },
    sessionQuery: { listSessions: async () => [{ header: { id: 'active-1' } }] },
  })
  apply(ctx, { storeRoot })
  // The directory is readable but not writable, so deleting the orphan rejects.
  await chmod(storeRoot, 0o500)
  try {
    const res = await call(routes.get(SESSION_PATH), getSession('session-a'))
    assert.equal(res.status, 200)
  } finally {
    await chmod(storeRoot, 0o700)
  }
})

test('a persisted-only session is kept even when it is not live', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'live-1' }] },
    sessionQuery: {
      listSessions: async () => [{ header: { id: 'live-1' } }, { header: { id: 'cold-1' } }],
    },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'live-1', Date.now() - DAY)
  await writeSession(storeRoot, 'cold-1', Date.now() - DAY)
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('cold-1'))

  assert.equal(res.status, 200)
  assert.deepEqual((await listFiles(storeRoot)).sort(), ['cold-1.json', 'live-1.json'])
})

test('the union of live, archived and persisted ids removes a truly unknown file', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'live-1' }] },
    workspaceRegistry: { archivedSessionIds: ['archived-1'] },
    sessionQuery: {
      listSessions: async () => [{ header: { id: 'live-1' } }, { header: { id: 'cold-1' } }],
    },
  })
  apply(ctx, { storeRoot })
  for (const id of ['live-1', 'archived-1', 'cold-1', 'unknown-1']) {
    await writeSession(storeRoot, id, Date.now() - DAY)
  }

  const res = await call(routes.get(SESSION_PATH), getSession('live-1'))

  assert.equal(res.status, 200)
  assert.deepEqual(
    (await listFiles(storeRoot)).sort(),
    ['archived-1.json', 'cold-1.json', 'live-1.json'],
  )
})

test('cleanup is skipped when sessionQuery is missing', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'live-1' }] },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('live-1'))

  assert.equal(res.status, 200)
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

test('cleanup is skipped when listSessions throws', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [{ id: 'live-1' }] },
    sessionQuery: { listSessions: async () => { throw new Error('corpus unavailable') } },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('live-1'))

  assert.equal(res.status, 200)
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

test('cleanup is skipped when listSessions resolves an empty corpus', async () => {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => [] },
    sessionQuery: { listSessions: async () => [] },
  })
  apply(ctx, { storeRoot })
  await writeSession(storeRoot, 'orphan-1')

  const res = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.equal(res.status, 200)
  assert.deepEqual(await listFiles(storeRoot), ['orphan-1.json'])
})

// --- records (ticket 19) ---

const RECORD_PATH = '/dsh-clipchat/record'

/** A well-formed record as the client builds it. */
function makeRecord(id = 'r1') {
  return {
    id,
    selection: `passage-${id}`,
    question: `question-${id}`,
    answer: `answer-${id}`,
    provider: 'deepseek',
    model: 'deepseek-chat',
    usage: { input: 10, output: 20 },
    createdAt: 111,
  }
}

const addRecordBody = {
  sessionId: 'session-a',
  op: 'add',
  record: makeRecord(),
}

test('registers the record route next to session and highlight', async () => {
  const { ctx, routes, disposers } = makeContext({
    connection: { requestRejection: () => undefined },
  })
  apply(ctx, { storeRoot: '/tmp/unused-clipchat-root' })

  assert.equal(typeof routes.get(RECORD_PATH), 'function')
  for (const dispose of disposers.reverse()) dispose()
  assert.equal(routes.size, 0)
})

test('POST record add stores a record and returns the latest list', async () => {
  const { routes, storeRoot } = await setup()

  const res = await call(routes.get(RECORD_PATH), makeRequest({ url: RECORD_PATH, body: addRecordBody }))

  assert.equal(res.status, 200)
  assert.deepEqual(payloadOf(res), { records: [makeRecord()] })
  const stored = JSON.parse(await readFile(join(storeRoot, 'session-a.json'), 'utf8'))
  assert.deepEqual(stored.records, [makeRecord()])
})

test('POST record add is visible through GET session', async () => {
  const { routes } = await setup()

  await call(routes.get(RECORD_PATH), makeRequest({ url: RECORD_PATH, body: addRecordBody }))
  const read = await call(routes.get(SESSION_PATH), getSession('session-a'))

  assert.deepEqual(payloadOf(read).records, [makeRecord()])
})

test('POST record remove deletes by id and returns the latest list', async () => {
  const { routes, store } = await setup()
  await store.addRecord('session-a', makeRecord('r1'))
  await store.addRecord('session-a', makeRecord('r2'))

  const res = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: { sessionId: 'session-a', op: 'remove', record: { id: 'r1' } },
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(payloadOf(res).records.map((entry) => entry.id), ['r2'])
  const stored = await store.load('session-a')
  assert.deepEqual(stored.records.map((entry) => entry.id), ['r2'])
})

test('POST record returns 404 for an unknown op', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: { sessionId: 'session-a', op: 'toggle', record: makeRecord() },
  }))

  assert.equal(res.status, 404)
  assert.equal(payloadOf(res).error, 'unknown-op')
})

test('POST record rejects a missing or unsafe sessionId with 400', async () => {
  const { routes } = await setup()

  const missing = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: { op: 'add', record: makeRecord() },
  }))
  assert.equal(missing.status, 400)
  assert.equal(payloadOf(missing).error, 'missing-session-id')

  const unsafe = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: { ...addRecordBody, sessionId: '../escape' },
  }))
  assert.equal(unsafe.status, 400)
  assert.equal(payloadOf(unsafe).error, 'invalid-session-id')
})

test('POST record add rejects a malformed record with 400', async () => {
  const { routes } = await setup()

  for (const record of [
    undefined,
    {},
    { id: 'r1' },
    { ...makeRecord(), answer: '' },
    { ...makeRecord(), usage: { input: -1, output: 0 } },
  ]) {
    const res = await call(routes.get(RECORD_PATH), makeRequest({
      url: RECORD_PATH,
      body: { sessionId: 'session-a', op: 'add', record },
    }))
    assert.equal(res.status, 400, `rejects ${JSON.stringify(record)}`)
    assert.equal(payloadOf(res).error, 'invalid-record')
  }
})

test('POST record remove rejects a record without an id with 400', async () => {
  const { routes } = await setup()

  for (const record of [undefined, {}, { id: '' }]) {
    const res = await call(routes.get(RECORD_PATH), makeRequest({
      url: RECORD_PATH,
      body: { sessionId: 'session-a', op: 'remove', record },
    }))
    assert.equal(res.status, 400)
    assert.equal(payloadOf(res).error, 'invalid-record')
  }
})

test('POST record rejects malformed JSON and oversized bodies', async () => {
  const { routes } = await setup()

  const invalid = await call(routes.get(RECORD_PATH), makeRequest({ url: RECORD_PATH, body: '{oops' }))
  assert.equal(invalid.status, 400)
  assert.equal(payloadOf(invalid).error, 'invalid-request')

  const oversized = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: JSON.stringify({ ...addRecordBody, padding: 'x'.repeat(600 * 1024) }),
  }))
  assert.equal(oversized.status, 413)
  assert.equal(payloadOf(oversized).error, 'body-too-large')
})

test('POST record rejects a wrong method with 405', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(RECORD_PATH), makeRequest({ method: 'GET', url: RECORD_PATH }))

  assert.equal(res.status, 405)
})

test('the record route honours the connection guard', async () => {
  for (const rejection of [401, 403]) {
    const { routes, disposers } = await setup({ connection: { requestRejection: () => rejection } })
    const res = await call(routes.get(RECORD_PATH), makeRequest({ url: RECORD_PATH, body: addRecordBody }))
    assert.equal(res.status, rejection)
    for (const dispose of disposers.reverse()) dispose()
  }
})

test('record state of two sessions stays isolated', async () => {
  const { routes } = await setup()

  await call(routes.get(RECORD_PATH), makeRequest({ url: RECORD_PATH, body: addRecordBody }))
  const other = await call(routes.get(RECORD_PATH), makeRequest({
    url: RECORD_PATH,
    body: { ...addRecordBody, sessionId: 'session-b', record: makeRecord('r9') },
  }))
  assert.deepEqual(payloadOf(other).records.map((entry) => entry.id), ['r9'])

  const first = await call(routes.get(SESSION_PATH), getSession('session-a'))
  assert.deepEqual(payloadOf(first).records.map((entry) => entry.id), ['r1'])
})
