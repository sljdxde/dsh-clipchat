import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'

const STATUS_PATH = '/dsh-clipchat/status'
const ASK_PATH = '/dsh-clipchat/ask'

/** A response double: records status, headers, frames and whether it ended. */
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

/** A request double: emits a JSON body asynchronously, like a socket would. */
function makeRequest({ method = 'POST', headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
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

/** Drive a captured route handler to completion. */
async function call(handler, request) {
  const res = new FakeResponse()
  await handler(request, res)
  return res
}

/** Parse the SSE frames a response collected. */
function framesOf(res) {
  return res.raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)))
}

/** Fake plugin context exposing services by name and a captured webServer. */
function makeContext({ connection, sessions, defaultSelection, llm } = {}) {
  const routes = new Map()
  const disposers = []
  const services = {
    connection,
    sessions,
    llm,
    agentDefaultModel: defaultSelection === undefined
      ? undefined
      : { currentSelection: () => defaultSelection },
  }
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
    get: (name) => services[name],
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
  return { ctx, routes, disposers, services }
}

function sessionWith(config, adapterDefaults) {
  return Object.freeze({ requestHeader: () => ({ config, adapterDefaults }) })
}

/** A scripted `llm.stream`; `options.signal` is honoured between chunks. */
function scriptedLlm(script, calls = []) {
  return {
    calls,
    stream(options) {
      calls.push(options)
      return (async function* generate() {
        for (const chunk of script) {
          if (options.signal?.aborted) {
            yield { type: 'finish', reason: { kind: 'aborted' } }
            return
          }
          yield chunk
          await new Promise((resolve) => setImmediate(resolve))
        }
      })()
    },
  }
}

/** Write a throwaway `@deepseek-ai/dsh-llm` install the host half can resolve. */
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

/** Awaited once before the route tests that need the helper import. */
const installRoot = await fixtureInstall()
process.env.DSH_INSTALL_DIR = installRoot

const baseBody = {
  sessionId: 'session-1',
  selection: 'the selected passage',
  message: 'the whole assistant message that contains the selected passage',
  turn: 3,
  recent: [{ turn: 2, user: 'earlier question', assistant: 'earlier answer' }],
  history: [
    { role: 'user', text: 'first question' },
    { role: 'assistant', text: 'first answer' },
  ],
  question: 'what does it mean?',
}

test('registers both exact routes and disposes them', () => {
  const { ctx, routes, disposers } = makeContext({})

  apply(ctx)

  assert.equal(typeof routes.get(STATUS_PATH), 'function')
  assert.equal(typeof routes.get(ASK_PATH), 'function')

  for (const dispose of disposers.reverse()) dispose()
  assert.equal(routes.size, 0)
})

test('rejects unauthenticated requests with the status requestRejection returns', async () => {
  const connection = { requestRejection: () => 401 }
  const { ctx, routes } = makeContext({ connection })
  apply(ctx)

  for (const path of [STATUS_PATH, ASK_PATH]) {
    const handler = routes.get(path)
    const res = await call(handler, makeRequest({ method: path === STATUS_PATH ? 'GET' : 'POST' }))
    assert.equal(res.status, 401)
    assert.equal(JSON.parse(res.raw).error, 'unauthorized')
  }
})

test('passes a 403 through from requestRejection', async () => {
  const connection = { requestRejection: () => 403 }
  const { ctx, routes } = makeContext({ connection })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ body: baseBody }))
  assert.equal(res.status, 403)
  assert.equal(JSON.parse(res.raw).error, 'forbidden')
})

test('status reports guard and the configured default model', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'deepseek', model: 'chat' },
  })
  apply(ctx)

  const res = await call(routes.get(STATUS_PATH), makeRequest({ method: 'GET', headers: { host: '127.0.0.1:3080' } }))
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.raw), {
    ok: true,
    guard: 'requestRejection',
    model: { provider: 'deepseek', model: 'chat' },
  })
})

test('falls back to a same-origin guard when connection is absent, and reports it', async () => {
  const { ctx, routes } = makeContext({ defaultSelection: { provider: 'p', model: 'm' } })
  apply(ctx)

  const allowed = await call(routes.get(STATUS_PATH), makeRequest({
    method: 'GET',
    headers: { host: '127.0.0.1:3080' },
  }))
  assert.equal(allowed.status, 200)
  assert.equal(JSON.parse(allowed.raw).guard, 'same-origin')
  assert.deepEqual(JSON.parse(allowed.raw).model, { provider: 'p', model: 'm' })

  const crossSite = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: '127.0.0.1:3080', origin: 'https://evil.example' },
    body: baseBody,
  }))
  assert.equal(crossSite.status, 403)

  const crossSiteFetch = await call(routes.get(STATUS_PATH), makeRequest({
    method: 'GET',
    headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' },
  }))
  assert.equal(crossSiteFetch.status, 403)
})

test('streams meta, delta, usage and done in order for one ask', async () => {
  const llm = scriptedLlm([
    { type: 'text-delta', index: 0, text: 'Hel' },
    { type: 'text-delta', index: 0, text: 'lo' },
    { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
  const frames = framesOf(res)

  assert.equal(res.status, 200)
  assert.match(res.headers['Content-Type'], /text\/event-stream/)
  assert.deepEqual(frames.map((frame) => frame.type), ['meta', 'delta', 'delta', 'usage', 'done'])
  assert.deepEqual(frames[0], { type: 'meta', provider: 'deepseek', model: 'chat' })
  assert.deepEqual(frames.slice(1, 3).map((frame) => frame.text), ['Hel', 'lo'])
  assert.equal(frames[3].usage.inputTokens, 12)
  assert.equal(frames[3].usage.outputTokens, 3)
  assert.equal(frames[4].reason, 'stop')
  assert.equal(typeof frames[4].firstTokenMs, 'number')
  assert.equal(res.ended, true)
})

test('sends the system prompt, the assembled context and the routed token budget', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat', reasoningEffort: 'high' }) },
    llm,
  })
  apply(ctx)

  await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
  const options = llm.calls[0]

  assert.equal(options.provider, 'deepseek')
  assert.equal(options.model, 'chat')
  assert.equal(options.reasoningEffort, 'high')
  assert.equal(options.maxTokens, 2048)
  assert.equal(typeof options.system, 'string')
  assert.ok(options.system.length > 0)
  assert.equal(options.tools, undefined, 'never declares tools')

  const context = options.messages[0].content[0].text
  assert.match(context, /^<context>/)
  assert.ok(context.indexOf('<message turn="3">') < context.indexOf('<selection>'))
  assert.ok(context.indexOf('<selection>') < context.indexOf('<recent>'))
  assert.match(context, /the selected passage/)
  assert.match(context, /earlier question/)
})

test('assistant history is rebuilt as a model message with the routed source', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
  const messages = llm.calls[0].messages

  const userHistory = messages[1]
  const assistantHistory = messages[2]
  assert.deepEqual(userHistory, { role: 'user', content: [{ type: 'text', text: 'first question' }] })
  assert.equal(assistantHistory.role, 'assistant')
  assert.deepEqual(assistantHistory.content, [{ type: 'text', text: 'first answer' }])
  assert.equal(assistantHistory.source.kind, 'model')
  assert.equal(assistantHistory.source.provider, 'deepseek')
  assert.equal(assistantHistory.source.model, 'chat')
  assert.equal(typeof assistantHistory.id, 'string')
  assert.equal(messages.at(-1).content[0].text, 'what does it mean?')
})

test('aborts the upstream call when the client disconnects', async () => {
  const calls = []
  let sawFinish = false
  const llm = {
    stream(options) {
      calls.push(options)
      return (async function* generate() {
        yield { type: 'text-delta', index: 0, text: 'partial' }
        await new Promise((resolve) => {
          if (options.signal.aborted) resolve()
          else options.signal.addEventListener('abort', resolve, { once: true })
        })
        sawFinish = true
        yield { type: 'finish', reason: { kind: 'aborted' } }
      })()
    },
  }
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  const res = new FakeResponse()
  const resWrite = res.write.bind(res)
  res.write = (chunk) => {
    const written = resWrite(chunk)
    if (String(chunk).includes('"type":"delta"') && !res.closedByClient) {
      res.closedByClient = true
      res.emit('close')
    }
    return written
  }

  await routes.get(ASK_PATH)(makeRequest({ headers: { host: 'h' }, body: baseBody }), res)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].signal.aborted, true, 'the abort signal reaches the provider call')
  assert.equal(sawFinish, true, 'the stream observed the abort')
  assert.deepEqual(framesOf(res).map((frame) => frame.type), ['meta', 'delta'])
})

test('a closed response never receives another frame', async () => {
  const llm = scriptedLlm([
    { type: 'text-delta', index: 0, text: 'a' },
    { type: 'text-delta', index: 0, text: 'b' },
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  const res = new FakeResponse()
  const resWrite = res.write.bind(res)
  res.write = (chunk) => {
    const written = resWrite(chunk)
    if (String(chunk).includes('"type":"delta"') && !res.closedByClient) {
      res.closedByClient = true
      res.emit('close')
    }
    return written
  }

  await routes.get(ASK_PATH)(makeRequest({ headers: { host: 'h' }, body: baseBody }), res)
  assert.ok(!res.raw.includes('"type":"done"'))
})

test('returns 503 no-model when no route can be resolved', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    llm: scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }]),
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
  assert.equal(res.status, 503)
  assert.deepEqual(JSON.parse(res.raw), { error: 'no-model' })
})

test('rejects an over-long selection with a readable code', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'p', model: 'm' },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: { ...baseBody, selection: 'x'.repeat(2001) },
  }))

  assert.equal(res.status, 400)
  const payload = JSON.parse(res.raw)
  assert.equal(payload.error, 'selection-too-long')
  assert.match(payload.message, /2000/)
  assert.equal(llm.calls.length, 0, 'no model call happens for a rejected selection')
})

test('rejects more than 12 follow-up history messages', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'p', model: 'm' },
    llm,
  })
  apply(ctx)

  const history = Array.from({ length: 13 }, (_, index) => ({ role: 'user', text: `h${index}` }))
  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: { ...baseBody, history },
  }))

  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.raw).error, 'history-too-long')
  assert.equal(llm.calls.length, 0)
})

test('rejects a body above 512 KB', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'p', model: 'm' },
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: JSON.stringify({ ...baseBody, padding: 'x'.repeat(600 * 1024) }),
  }))

  assert.equal(res.status, 413)
  assert.equal(JSON.parse(res.raw).error, 'body-too-large')
})

test('rejects invalid JSON and wrong methods', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'p', model: 'm' },
    llm,
  })
  apply(ctx)

  const invalid = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: '{oops' }))
  assert.equal(invalid.status, 400)
  assert.equal(JSON.parse(invalid.raw).error, 'invalid-request')

  const wrongMethod = await call(routes.get(ASK_PATH), makeRequest({ method: 'GET', headers: { host: 'h' } }))
  assert.equal(wrongMethod.status, 405)

  const statusPost = await call(routes.get(STATUS_PATH), makeRequest({ method: 'POST' }))
  assert.equal(statusPost.status, 405)
})

test('never writes to the session store or calls tools', async () => {
  let headerCalls = 0
  const session = Object.freeze({
    requestHeader() {
      headerCalls += 1
      return { config: { provider: 'deepseek', model: 'chat' } }
    },
  })
  let getCalls = 0
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: {
      get(id) {
        getCalls += 1
        assert.equal(id, 'session-1')
        return session
      },
    },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))

  assert.equal(res.status, 200)
  assert.equal(getCalls, 1)
  assert.equal(headerCalls, 1)
  assert.equal(llm.calls.length, 1)
  assert.equal(llm.calls[0].messages.some((message) => message.role === 'tool'), false)
})
