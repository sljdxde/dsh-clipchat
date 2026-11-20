import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'
import { call, FakeResponse, makeRequest } from './helpers/http.mjs'
import { createStore } from '../lib/store.js'
import { makeRecord } from './helpers/records.mjs'

const SESSION_PATH = '/dsh-clipchat/session'
const ASK_PATH = '/dsh-clipchat/ask'
const HIGHLIGHT_PATH = '/dsh-clipchat/highlight'

/**
 * Write a throwaway `@deepseek-ai/dsh-llm` install the ask route can resolve.
 * Without this the route reports `llm-helper-unavailable` on a clean runner
 * (the host module is only resolvable inside a DSH install), so any ask test
 * would fail for an unrelated reason. Mirrors test/routes.test.mjs.
 */
async function fixtureInstall() {
  const root = await mkdtemp(join(tmpdir(), 'clipchat-llm-'))
  const packageDir = join(root, 'node_modules', '@deepseek-ai', 'dsh-llm')
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture', private: true }))
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({
    name: '@deepseek-ai/dsh-llm',
    version: '0.0.0',
    type: 'module',
    main: './index.js',
    exports: { '.': './index.js' },
  }))
  await writeFile(join(packageDir, 'index.js'), [
    'export function createAssistantMessage(input) {',
    "  return { role: 'assistant', content: input.content, source: { kind: 'model', ...input.source }, id: 'fixture-assistant' }",
    '}',
  ].join('\n'))
  return root
}

process.env.DSH_INSTALL_DIR = await fixtureInstall()


function payloadOf(res) {
  return JSON.parse(res.raw)
}

function makeContext({ connection, sessions, workspaceRegistry, sessionQuery, llm } = {}) {
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
    get: (name) => ({ connection, sessions, workspaceRegistry, sessionQuery, llm })[name],
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

async function setup({
  connection = { requestRejection: () => undefined },
  sessionQuery,
  sessions,
  workspaceRegistry,
  llm,
} = {}) {
  const storeRoot = await mkdtemp(join(tmpdir(), 'clipchat-routes-'))
  const { ctx, routes, disposers } = makeContext({ connection, sessionQuery, sessions, workspaceRegistry, llm })
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
  // Two different passages: identical anchors are one highlight now.
  await store.addHighlight('session-a', { id: 'h1', anchor, createdAt: 10 })
  await store.addHighlight('session-a', {
    id: 'h2',
    anchor: { ...anchor, spans: [{ blockIndex: 0, start: 20, end: 27 }], text: 'another' },
    createdAt: 11,
  })

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
    makeRecord('r1', { answer: '' }),
    makeRecord('r1', { usage: { input: -1, output: 0 } }),
    makeRecord('r1', { turns: [] }),
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

// --- cross-session search (M2) ---

const SEARCH_PATH = '/dsh-clipchat/search'

test('registers the search route next to session, highlight and record', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
  })
  apply(ctx, { storeRoot: '/tmp/unused-clipchat-root' })

  assert.equal(typeof routes.get(SEARCH_PATH), 'function')
})

test('GET search matches across sessions and reports the total', async () => {
  const { routes, store } = await setup()
  await store.addRecord('session-a', makeRecord('r1', { question: 'needle in a', answer: 'no' }))
  await store.addRecord('session-b', makeRecord('r2', { question: 'other', answer: 'contains needle' }))
  await store.addRecord('session-b', makeRecord('r3', { question: 'nothing', answer: 'none' }))

  const res = await call(routes.get(SEARCH_PATH), makeRequest({
    method: 'GET',
    url: `${SEARCH_PATH}?q=NEEDLE`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200)
  const body = payloadOf(res)
  assert.equal(body.total, 2)
  assert.deepEqual(body.items.map((item) => item.recordId), ['r1', 'r2'])
  assert.equal(body.truncated, false)
  assert.equal(body.items[1].sessionId, 'session-b')
})

test('GET search trims to the limit and reports truncation', async () => {
  const { routes, store } = await setup()
  await store.addRecord('session-a', makeRecord('r1'))
  await store.addRecord('session-a', makeRecord('r2'))

  const res = await call(routes.get(SEARCH_PATH), makeRequest({
    method: 'GET',
    url: `${SEARCH_PATH}?q=&limit=1`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200)
  const body = payloadOf(res)
  assert.equal(body.items.length, 1)
  assert.equal(body.total, 2)
  assert.equal(body.truncated, true)
})

test('GET search rejects an oversized query', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(SEARCH_PATH), makeRequest({
    method: 'GET',
    url: `${SEARCH_PATH}?q=${'x'.repeat(201)}`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 400)
  assert.equal(payloadOf(res).error, 'query-too-long')
})

test('the search route honours the connection guard', async () => {
  for (const rejection of [401, 403]) {
    const { routes, disposers } = await setup({ connection: { requestRejection: () => rejection } })
    const res = await call(routes.get(SEARCH_PATH), makeRequest({
      method: 'GET', url: SEARCH_PATH, headers: { host: 'h' },
    }))
    assert.equal(res.status, rejection)
    for (const dispose of disposers.reverse()) dispose()
  }
})

// --- session digest for detailed mode ---

const CONTEXT_PATH = '/dsh-clipchat/context'

test('registers the context route next to the others', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
  })
  apply(ctx, { storeRoot: '/tmp/unused-clipchat-root' })
  assert.equal(typeof routes.get(CONTEXT_PATH), 'function')
})

/** A sessionQuery stub whose observation is disposable, like the real one. */
function makeSessionQuery(events, { throwOnObserve = false } = {}) {
  const observed = []
  return {
    observed,
    async observeSession(sessionId) {
      observed.push(sessionId)
      if (throwOnObserve) throw new Error('not found')
      let disposed = false
      return {
        source: 'live',
        header: { id: sessionId },
        events,
        get [Symbol.dispose]() {
          return () => { disposed = true; observed.push('disposed') }
        },
      }
    },
  }
}

test('GET context returns the rendered digest and its stats', async () => {
  const sessionQuery = makeSessionQuery([
    { type: 'turn/start', data: { turn: 3 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'do the thing' }] } },
    {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: 'done' }, { type: 'tool-call', name: 'bash' }] } },
    },
  ])
  const { routes } = await setup({ sessionQuery })

  const res = await call(routes.get(CONTEXT_PATH), makeRequest({
    method: 'GET',
    url: `${CONTEXT_PATH}?sessionId=session-a`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200)
  const body = payloadOf(res)
  assert.equal(body.available, true)
  assert.ok(body.digest.includes('<history>'), body.digest)
  assert.ok(body.digest.includes('do the thing'))
  assert.ok(body.digest.includes('tools="bash"'))
  assert.equal(body.stats.turns, 1)
  assert.equal(body.stats.tools, 1)
  assert.equal(body.stats.firstTurn, 3)
  // The observation lease is released, so preparations are not pinned.
  assert.equal(sessionQuery.observed.includes('disposed'), true)
})

test('GET context reports unavailable instead of failing when the log is missing', async () => {
  const { routes } = await setup({ sessionQuery: makeSessionQuery([], { throwOnObserve: true }) })
  const res = await call(routes.get(CONTEXT_PATH), makeRequest({
    method: 'GET', url: `${CONTEXT_PATH}?sessionId=session-a`, headers: { host: 'h' },
  }))
  assert.equal(res.status, 200)
  assert.equal(payloadOf(res).available, false)
})

test('GET context is unavailable when the host mounts no sessionQuery', async () => {
  const { routes } = await setup({ sessionQuery: undefined })
  const res = await call(routes.get(CONTEXT_PATH), makeRequest({
    method: 'GET', url: `${CONTEXT_PATH}?sessionId=session-a`, headers: { host: 'h' },
  }))
  assert.equal(res.status, 200)
  assert.equal(payloadOf(res).available, false)
})

test('GET context rejects a missing or unsafe session id', async () => {
  const { routes } = await setup({ sessionQuery: makeSessionQuery([]) })
  for (const url of [CONTEXT_PATH, `${CONTEXT_PATH}?sessionId=../etc`]) {
    const res = await call(routes.get(CONTEXT_PATH), makeRequest({ method: 'GET', url, headers: { host: 'h' } }))
    assert.equal(res.status, 400)
  }
})

test('the context route honours the connection guard', async () => {
  const { routes } = await setup({ connection: { requestRejection: () => 401 }, sessionQuery: makeSessionQuery([]) })
  const res = await call(routes.get(CONTEXT_PATH), makeRequest({
    method: 'GET', url: `${CONTEXT_PATH}?sessionId=session-a`, headers: { host: 'h' },
  }))
  assert.equal(res.status, 401)
})

test('an ask against a context route whose lease throws still answers', async () => {
  const { routes } = await setup({
    sessionQuery: {
      observeSession() {
        return {
          events: [{ type: 'user/message', data: { turn: 1, content: [{ type: 'text', text: 'hi' }] } }],
          [Symbol.dispose]() { throw new Error('lease release failed') },
        }
      },
    },
  })

  const res = await call(routes.get(CONTEXT_PATH), makeRequest({
    method: 'GET',
    url: `${CONTEXT_PATH}?sessionId=session-a`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200, 'a failing dispose must not fail the request')
  assert.equal(payloadOf(res).available, true)
})

test('a response destroyed before the stream opens is not written to', async () => {
  // A response that reports itself destroyed before the stream opens must not
  // be written to; the route returns without opening SSE.
  const { routes } = await setup({
    sessions: { get: () => ({ requestHeader: () => ({ config: { provider: 'deepseek', model: 'chat' } }) }) },
    llm: { stream: () => (async function* () {})() },
  })
  const res = new FakeResponse()
  res.destroyed = true

  await routes.get(ASK_PATH)(makeRequest({
    headers: { host: 'h' },
    body: {
      sessionId: 'session-a',
      selection: 'the selected passage',
      message: 'the whole assistant message',
      question: 'what does it mean?',
    },
  }), res)

  assert.equal(res.raw, '', 'nothing was written to a destroyed response')
})

test('a session read that throws is reported as store-unavailable', async () => {
  // A store root that is a file makes every read inside it fail.
  const root = join(await mkdtemp(join(tmpdir(), 'clipchat-broken-')), 'not-a-dir')
  await writeFile(root, 'x')
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx, { storeRoot: root })

  const res = await call(routes.get(SESSION_PATH), makeRequest({
    method: 'GET',
    url: `${SESSION_PATH}?sessionId=session-a`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 500)
  assert.equal(payloadOf(res).error, 'store-unavailable')
})

test('a malformed url on the session route reports a missing id', async () => {
  const { routes } = await setup()

  const res = await call(routes.get(SESSION_PATH), makeRequest({
    method: 'GET',
    url: 'http://[bad',
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 400)
  assert.equal(payloadOf(res).error, 'missing-session-id')
})
