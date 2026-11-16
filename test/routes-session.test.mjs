import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'
import { createStore } from '../lib/store.js'

const SESSION_PATH = '/dsh-clipchat/session'
const HIGHLIGHT_PATH = '/dsh-clipchat/highlight'

class FakeResponse extends EventEmitter {
  constructor() {
    super()
    this.status = 0
    this.headers = {}
    this.raw = ''
    this.ended = false
    this.writableEnded = false
  }

  writeHead(status, headers) {
    this.status = status
    this.headers = headers ?? {}
    return this
  }

  write(chunk) {
    this.raw += String(chunk)
    return true
  }

  end(body) {
    if (body !== undefined) this.raw += String(body)
    this.ended = true
    this.writableEnded = true
  }
}

function makeRequest({ method = 'POST', url, headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  req.destroyed = false
  req.destroy = () => { req.destroyed = true }
  if (body !== undefined) {
    setImmediate(() => {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      req.emit('end')
    })
  }
  return req
}

async function call(handler, request) {
  const res = new FakeResponse()
  await handler(request, res)
  return res
}

function payloadOf(res) {
  return JSON.parse(res.raw)
}

function makeContext({ connection } = {}) {
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
    get: (name) => (name === 'connection' ? connection : undefined),
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
