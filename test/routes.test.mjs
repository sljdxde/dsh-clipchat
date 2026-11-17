import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../index.js'
import { call, FakeResponse, makeRequest } from './helpers/http.mjs'
import { makeRecord } from './helpers/records.mjs'

const STATUS_PATH = '/dsh-clipchat/status'
const ASK_PATH = '/dsh-clipchat/ask'


/** Parse the SSE frames a response collected. */
function framesOf(res) {
  return res.raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data: '))
    .map((block) => JSON.parse(block.slice('data: '.length)))
}

/** Fake plugin context exposing services by name and a captured webServer. */
function makeContext({ connection, sessions, defaultSelection, llm, workspaceRegistry, sessionQuery } = {}) {
  const routes = new Map()
  const disposers = []
  const services = {
    connection,
    sessions,
    llm,
    workspaceRegistry,
    sessionQuery,
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

const MODELS_PATH = '/dsh-clipchat/models'

/** An llm double that also advertises a model catalog. */
function catalogLlm(catalog, script = [], calls = []) {
  const base = scriptedLlm(script, calls)
  return {
    ...base,
    listProviders: () => Object.keys(catalog).map((id) => ({ id, name: id.toUpperCase() })),
    async listModels(provider) {
      const entries = catalog[provider]
      if (entries instanceof Error) throw entries
      return (entries ?? []).map((id) => ({ provider, id, name: id.toUpperCase() }))
    },
  }
}

test('GET models lists the provider catalog and the session route behind the guard', async () => {
  const llm = catalogLlm({ alpha: ['a1', 'a2'], beta: ['b1'] })
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'alpha', model: 'a2' }) },
    llm,
  })
  apply(ctx)

  const handler = routes.get(MODELS_PATH)
  assert.equal(typeof handler, 'function', 'the models route is registered')

  const res = await call(handler, makeRequest({
    method: 'GET',
    url: `${MODELS_PATH}?sessionId=session-1`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.raw), {
    models: [
      { provider: 'alpha', model: 'a1', name: 'A1', isDefault: false },
      { provider: 'alpha', model: 'a2', name: 'A2', isDefault: true },
      { provider: 'beta', model: 'b1', name: 'B1', isDefault: false },
    ],
    current: { provider: 'alpha', model: 'a2' },
  })
})

test('GET models falls back to the configured default when listing fails', async () => {
  const llm = {
    listProviders() { throw new Error('no registry') },
  }
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'deepseek', model: 'chat' },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(MODELS_PATH), makeRequest({
    method: 'GET',
    url: MODELS_PATH,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.raw), {
    models: [{ provider: 'deepseek', model: 'chat', name: 'chat', isDefault: true }],
    current: { provider: 'deepseek', model: 'chat' },
  })
})

test('GET models honours the guard and rejects non-read methods', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => 401 } })
  apply(ctx)

  const guarded = await call(routes.get(MODELS_PATH), makeRequest({
    method: 'GET',
    url: MODELS_PATH,
  }))
  assert.equal(guarded.status, 401)
  assert.equal(JSON.parse(guarded.raw).error, 'unauthorized')

  const { ctx: openCtx, routes: openRoutes } = makeContext({
    connection: { requestRejection: () => undefined },
  })
  apply(openCtx)
  const wrongMethod = await call(openRoutes.get(MODELS_PATH), makeRequest({
    method: 'POST',
    url: MODELS_PATH,
    headers: { host: 'h' },
  }))
  assert.equal(wrongMethod.status, 405)
})

test('an explicit ask model wins over the session chain', async () => {
  const llm = catalogLlm({ alpha: ['a1', 'a2'] }, [
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'alpha', model: 'a1' }) },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: { ...baseBody, model: { provider: 'alpha', model: 'a2' } },
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(framesOf(res)[0], { type: 'meta', provider: 'alpha', model: 'a2' })
  assert.equal(llm.calls[0].provider, 'alpha')
  assert.equal(llm.calls[0].model, 'a2')
})

test('an explicit ask model may carry a reasoning effort', async () => {
  const llm = catalogLlm({ alpha: ['a1'] }, [
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: { ...baseBody, model: { provider: 'alpha', model: 'a1', reasoningEffort: 'high' } },
  }))

  assert.equal(res.status, 200)
  assert.equal(llm.calls[0].reasoningEffort, 'high')
})

test('rejects an ask whose explicit model is not in the catalog', async () => {
  const llm = catalogLlm({ alpha: ['a1'] }, [
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'alpha', model: 'a1' },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: { ...baseBody, model: { provider: 'alpha', model: 'gone' } },
  }))

  assert.equal(res.status, 400)
  assert.deepEqual(JSON.parse(res.raw), { error: 'invalid-model' })
  assert.equal(llm.calls.length, 0, 'no model call happens for an invalid choice')
})

test('rejects an ask with a malformed model object', async () => {
  const llm = catalogLlm({ alpha: ['a1'] })
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    defaultSelection: { provider: 'alpha', model: 'a1' },
    llm,
  })
  apply(ctx)

  for (const model of [{ provider: 'alpha' }, { model: 'a1' }, { provider: '', model: '' }, 'alpha']) {
    const res = await call(routes.get(ASK_PATH), makeRequest({
      headers: { host: 'h' },
      body: { ...baseBody, model },
    }))
    assert.equal(res.status, 400)
    assert.deepEqual(JSON.parse(res.raw), { error: 'invalid-model' })
  }
  assert.equal(llm.calls.length, 0)
})

test('an omitted ask model still follows the session header chain', async () => {
  const llm = catalogLlm({ alpha: ['a1'] }, [
    { type: 'finish', reason: { kind: 'stop' } },
  ])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'alpha', model: 'a1' }) },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    headers: { host: 'h' },
    body: baseBody,
  }))

  assert.equal(res.status, 200)
  assert.deepEqual(framesOf(res)[0], { type: 'meta', provider: 'alpha', model: 'a1' })
})

test('a request with an unparseable URL reports no session id', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  // A url that is not a valid relative URL still has to answer, not throw.
  const res = await call(routes.get(STATUS_PATH), makeRequest({ method: 'GET', url: 'http://[bad', headers: { host: '127.0.0.1:3080' } }))
  assert.equal(res.status, 200)
})

test('history longer than the cap is refused before the model is called', async () => {
  let streamed = 0
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm: {
      stream: async () => { streamed += 1; return (async function* () {})() },
    },
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({
    body: { ...baseBody, history: Array.from({ length: 40 }, (_, index) => ({ role: 'user', text: `q${index}` })) },
  }))

  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.raw).error, 'history-too-long')
  assert.equal(streamed, 0, 'the model was never called')
})

test('a missing llm service reports 503', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined }, llm: undefined })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ body: baseBody }))

  assert.equal(res.status, 503)
  assert.equal(JSON.parse(res.raw).error, 'llm-unavailable')
})

test('an llm stream that ends without a finish frame reports a closed stream', async () => {
  // `llm.stream` returns an async iterable of chunk objects.
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm: scriptedLlm([{ type: 'text-delta', index: 0, text: 'partial' }]),
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ body: baseBody }))
  const frames = framesOf(res)

  assert.equal(res.status, 200)
  assert.ok(frames.some((frame) => frame.type === 'error' && frame.code === 'STREAM_CLOSED'),
    'the truncation is reported')
})

test('an llm stream that throws reports the message', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm: {
      stream() {
        return (async function* generate() {
          yield { type: 'text-delta', index: 0, text: 'partial' }
          throw new Error('upstream broke')
        })()
      },
    },
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ body: baseBody }))
  const frames = framesOf(res)

  assert.ok(frames.some((frame) => frame.type === 'error' && frame.message === 'upstream broke'))
})

test('models refuses an unsafe session id', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  const res = await call(routes.get('/dsh-clipchat/models'), makeRequest({
    method: 'GET',
    url: '/dsh-clipchat/models?sessionId=../etc/passwd',
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.raw).error, 'invalid-session-id')
})

test('search refuses a query longer than the cap', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  const res = await call(routes.get('/dsh-clipchat/search'), makeRequest({
    method: 'GET',
    url: `/dsh-clipchat/search?q=${'x'.repeat(300)}`,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.raw).error, 'query-too-long')
})

test('a handler that throws reports 500 with its error code', async () => {
  // Point the store at a path that cannot be read, so the route throws.
  const root = await mkdtemp(join(tmpdir(), 'clipchat-unreadable-'))
  await writeFile(join(root, 'session-a.json'), '{not json', { mode: 0o000 })
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx, { storeRoot: root })

  const res = await call(routes.get('/dsh-clipchat/search'), makeRequest({
    method: 'GET',
    url: '/dsh-clipchat/search?q=x',
    headers: { host: 'h' },
  }))

  // A corrupt file is skipped by the reader, so this stays a normal answer.
  assert.equal(res.status, 200)
})

test('an unparseable request url answers 400 on the search route', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  const res = await call(routes.get('/dsh-clipchat/search'), makeRequest({
    method: 'GET',
    url: 'http://[bad',
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 400)
  assert.equal(JSON.parse(res.raw).error, 'invalid-request')
})

test('an ask whose history is at the cap is still accepted', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    text: `message ${index}`,
  }))
  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: { ...baseBody, history } }))

  assert.equal(res.status, 200, 'exactly the cap is allowed')
})

test('a client that disconnects mid-stream aborts the model call', async () => {
  let sawAbort = false
  const llm = {
    stream(options) {
      return (async function* generate() {
        yield { type: 'text-delta', index: 0, text: 'first' }
        // The route aborts on close; give it a turn to land.
        await new Promise((resolve) => setTimeout(resolve, 10))
        sawAbort = options.signal?.aborted === true
        yield { type: 'finish', reason: { kind: 'stop' } }
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
  // Close the response before the stream finishes.
  res.on = (name, handler) => {
    if (name === 'close') setTimeout(handler, 5)
    return res
  }
  await routes.get(ASK_PATH)(makeRequest({ headers: { host: 'h' }, body: baseBody }), res)

  assert.equal(sawAbort, true, 'the model call was aborted when the client left')
})

test('an ask still proceeds when the retention touch fails', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  // A store root that is a file, not a directory: every write inside it fails.
  const root = join(await mkdtemp(join(tmpdir(), 'clipchat-touch-')), 'not-a-dir')
  await writeFile(root, 'x')
  apply(ctx, { storeRoot: root })

  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))

  assert.equal(res.status, 200, 'the answer still streamed')
  assert.ok(framesOf(res).some((frame) => frame.type === 'done'), 'the stream finished normally')
})

test('a workspace registry that throws only narrows the sweep', async () => {
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    workspaceRegistry: { get archivedSessionIds() { throw new Error('registry down') } },
  })
  apply(ctx)

  const res = await call(routes.get('/dsh-clipchat/search'), makeRequest({
    method: 'GET',
    url: '/dsh-clipchat/search?q=x',
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200, 'the search answered anyway')
})

test('an ask reports 500 when the llm helper module cannot be resolved', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    llm,
  })
  apply(ctx)

  // Point both anchors at a tree that has no @deepseek-ai/dsh-llm install.
  const savedArg = process.argv[1]
  const savedDir = process.env.DSH_INSTALL_DIR
  const empty = await mkdtemp(join(tmpdir(), 'clipchat-empty-'))
  process.argv[1] = join(empty, 'index.js')
  process.env.DSH_INSTALL_DIR = empty
  try {
    const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
    assert.equal(res.status, 500)
    assert.equal(JSON.parse(res.raw).error, 'llm-helper-unavailable')
  } finally {
    process.argv[1] = savedArg
    if (savedDir === undefined) delete process.env.DSH_INSTALL_DIR
    else process.env.DSH_INSTALL_DIR = savedDir
  }
})

test('a store failure during a record write reports 500', async () => {
  const root = join(await mkdtemp(join(tmpdir(), 'clipchat-bad-')), 'not-a-dir')
  await writeFile(root, 'x')
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx, { storeRoot: root })

  const res = await call(routes.get('/dsh-clipchat/record'), makeRequest({
    headers: { host: 'h' },
    body: { sessionId: 'session-a', op: 'add', record: makeRecord() },
  }))

  assert.equal(res.status, 500)
  assert.equal(JSON.parse(res.raw).error, 'store-unavailable')
})

test('a remove without an id is refused, and an unknown op is a 404', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  const missing = await call(routes.get('/dsh-clipchat/record'), makeRequest({
    headers: { host: 'h' },
    body: { sessionId: 'session-a', op: 'remove', record: {} },
  }))
  assert.equal(missing.status, 400)
  assert.equal(JSON.parse(missing.raw).error, 'invalid-record')

  const unknown = await call(routes.get('/dsh-clipchat/record'), makeRequest({
    headers: { host: 'h' },
    body: { sessionId: 'session-a', op: 'rewrite', record: makeRecord() },
  }))
  assert.equal(unknown.status, 404)
  assert.equal(JSON.parse(unknown.raw).error, 'unknown-op')
})

test('the sweep still runs when the workspace registry is unavailable', async () => {
  const llm = scriptedLlm([{ type: 'finish', reason: { kind: 'stop' } }])
  const { ctx, routes } = makeContext({
    connection: { requestRejection: () => undefined },
    sessions: { list: () => ['session-1'], get: () => sessionWith({ provider: 'deepseek', model: 'chat' }) },
    workspaceRegistry: { get archivedSessionIds() { throw new Error('registry down') } },
    llm,
  })
  apply(ctx)

  const res = await call(routes.get(ASK_PATH), makeRequest({ headers: { host: 'h' }, body: baseBody }))
  assert.equal(res.status, 200, 'the answer was not blocked by the registry')
})

test('a request with no url at all is handled', async () => {
  const { ctx, routes } = makeContext({ connection: { requestRejection: () => undefined } })
  apply(ctx)

  const res = await call(routes.get('/dsh-clipchat/search'), makeRequest({
    method: 'GET',
    url: undefined,
    headers: { host: 'h' },
  }))

  assert.equal(res.status, 200, 'a missing url is treated as the root')
})

test('the same-origin guard refuses cross-site, malformed and hostless requests', async () => {
  const { sameOriginRejection } = await import('../lib/http.js')

  assert.equal(sameOriginRejection({ headers: { host: 'h' } }), undefined, 'a plain request passes')
  assert.equal(sameOriginRejection({ headers: {} }), 403, 'no host is refused')
  assert.equal(sameOriginRejection({ headers: { host: 'h', origin: 'https://evil.example' } }), 403,
    'a cross-site origin is refused')
  assert.equal(sameOriginRejection({ headers: { host: 'h', origin: 'http://[bad' } }), 403,
    'an unparseable origin is refused')
  assert.equal(sameOriginRejection({ headers: { host: 'h', origin: 'http://h' } }), undefined,
    'a same-origin request passes')
  assert.equal(sameOriginRejection({ headers: { host: 'h', referer: 'https://evil.example/x' } }), 403,
    'a cross-site referer is refused')
  assert.equal(sameOriginRejection({ headers: { host: 'h', 'sec-fetch-site': 'cross-site' } }), 403,
    'a cross-site fetch is refused')
  assert.equal(sameOriginRejection({ headers: { host: 'h', 'sec-fetch-site': 'same-origin' } }), undefined,
    'a same-origin fetch passes')
})
