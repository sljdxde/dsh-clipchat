import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { createStore, defaultStoreRoot, isValidHighlight, isValidSessionId, MAX_HIGHLIGHTS } from '../lib/store.js'

async function makeRoot() {
  return mkdtemp(join(tmpdir(), 'clipchat-store-'))
}

/** A well-formed anchor as the client captures it. */
function anchor(text = 'passage') {
  return {
    nodeKey: '5:assistant-step1:1',
    sourceIndex: 0,
    spans: [{ blockIndex: 0, start: 0, end: text.length }],
    text,
  }
}

function highlight(id, text = `text-${id}`, createdAt) {
  const entry = { id, anchor: anchor(text) }
  if (createdAt !== undefined) entry.createdAt = createdAt
  return entry
}

async function readState(root, sessionId) {
  return JSON.parse(await readFile(join(root, `${sessionId}.json`), 'utf8'))
}

test('the default store root lives under DSH_HOME, falling back to ~/.dsh', () => {
  assert.equal(defaultStoreRoot({ DSH_HOME: '/tmp/dsh-home' }), join('/tmp/dsh-home', 'clipchat'))
  assert.equal(defaultStoreRoot({}), join(homedir(), '.dsh', 'clipchat'))
})

test('an unknown session loads as an empty version 1 state', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 1000 })

  const state = await store.load('session-a')

  assert.deepEqual(state, {
    version: 1,
    sessionId: 'session-a',
    updatedAt: 1000,
    highlights: [],
    records: [],
  })
  assert.deepEqual(await readdir(root), [], 'reading an unknown session writes no file')
})

test('adding a highlight persists the version 1 schema with its anchor', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 2000 })

  const state = await store.addHighlight('session-a', highlight('h1'))

  assert.equal(state.highlights.length, 1)
  const stored = await readState(root, 'session-a')
  assert.equal(stored.version, 1)
  assert.equal(stored.sessionId, 'session-a')
  assert.equal(stored.updatedAt, 2000)
  assert.deepEqual(stored.records, [])
  assert.deepEqual(stored.highlights, [{
    id: 'h1',
    anchor: anchor('text-h1'),
    createdAt: 2000,
  }])
})

test('adding twice with the same id upserts instead of duplicating', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 3000 })

  await store.addHighlight('session-a', highlight('h1', 'first'))
  const state = await store.addHighlight('session-a', highlight('h1', 'second'))

  assert.equal(state.highlights.length, 1)
  assert.equal(state.highlights[0].anchor.text, 'second')
})

test('removing by id drops only that highlight and persists', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 4000 })

  await store.addHighlight('session-a', highlight('h1'))
  await store.addHighlight('session-a', highlight('h2'))
  const state = await store.removeHighlight('session-a', 'h1')

  assert.deepEqual(state.highlights.map((entry) => entry.id), ['h2'])
  const stored = await readState(root, 'session-a')
  assert.deepEqual(stored.highlights.map((entry) => entry.id), ['h2'])
})

test('removing an unknown id is a no-op and writes no new state', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 5000 })

  const state = await store.removeHighlight('missing-session', 'nope')

  assert.deepEqual(state.highlights, [])
  assert.deepEqual(await readdir(root), [], 'removing from an unknown session creates no file')
})

test('the cap keeps the newest 200 highlights and drops the oldest', async () => {
  const root = await makeRoot()
  let clock = 0
  const store = createStore({ root, now: () => ++clock })

  for (let index = 0; index < MAX_HIGHLIGHTS + 3; index += 1) {
    await store.addHighlight('session-a', highlight(`h${index}`))
  }

  const state = await store.load('session-a')
  assert.equal(state.highlights.length, MAX_HIGHLIGHTS)
  assert.equal(state.highlights[0].id, 'h3')
  assert.equal(state.highlights.at(-1).id, `h${MAX_HIGHLIGHTS + 2}`)
})

test('load touches updatedAt on a stored session', async () => {
  const root = await makeRoot()
  let clock = 1000
  const store = createStore({ root, now: () => clock })

  await store.addHighlight('session-a', highlight('h1'))
  clock = 9000
  const state = await store.load('session-a')

  assert.equal(state.updatedAt, 9000)
  assert.equal((await readState(root, 'session-a')).updatedAt, 9000)
})

test('adding to a stored session preserves existing records', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 6000 })
  const records = [{ id: 'r1', selection: 's', question: 'q', answer: 'a', provider: 'p', model: 'm', createdAt: 1 }]
  await writeFile(join(root, 'session-a.json'), JSON.stringify({
    version: 1,
    sessionId: 'session-a',
    updatedAt: 10,
    highlights: [],
    records,
  }))

  await store.addHighlight('session-a', highlight('h1'))

  assert.deepEqual((await readState(root, 'session-a')).records, records)
})

test('a corrupt file loads as an empty state instead of throwing', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 7000 })
  await writeFile(join(root, 'session-a.json'), '{not json')

  const state = await store.load('session-a')

  assert.deepEqual(state.highlights, [])
  assert.deepEqual(state.records, [])
})

test('concurrent writes to one session are serialized without losing data', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 8000 })

  await Promise.all(Array.from({ length: 25 }, (_, index) => (
    store.addHighlight('session-a', highlight(`h${index}`))
  )))

  const state = await store.load('session-a')
  assert.equal(state.highlights.length, 25)
  assert.deepEqual(
    state.highlights.map((entry) => entry.id).sort(),
    Array.from({ length: 25 }, (_, index) => `h${index}`).sort(),
  )
})

test('writes are atomic: no temporary file survives next to the state file', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 8100 })

  await Promise.all(Array.from({ length: 10 }, (_, index) => (
    store.addHighlight('session-a', highlight(`h${index}`))
  )))

  assert.deepEqual(await readdir(root), ['session-a.json'])
  const stored = JSON.parse(await readFile(join(root, 'session-a.json'), 'utf8'))
  assert.equal(stored.highlights.length, 10)
})

test('the directory is 0700 and the state file is 0600', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 8200 })

  await store.addHighlight('session-a', highlight('h1'))

  assert.equal((await stat(root)).mode & 0o777, 0o700)
  assert.equal((await stat(join(root, 'session-a.json'))).mode & 0o777, 0o600)
})

test('session ids that could escape the store directory are rejected', async () => {
  const root = await makeRoot()
  const store = createStore({ root })

  assert.equal(isValidSessionId('session-a'), true)
  assert.equal(isValidSessionId('a.b_c-1'), true)
  assert.equal(isValidSessionId('../etc/passwd'), false)
  assert.equal(isValidSessionId('a/b'), false)
  assert.equal(isValidSessionId(''), false)
  assert.equal(isValidSessionId('../x'), false)

  await assert.rejects(store.load('../escape'), TypeError)
  await assert.rejects(store.addHighlight('../escape', highlight('h1')), TypeError)
  await assert.rejects(store.removeHighlight('../escape', 'h1'), TypeError)
})

test('a highlight may persist an explicit model route', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 9000 })
  const model = { provider: 'deepseek', model: 'reasoner', reasoningEffort: 'high' }

  const state = await store.addHighlight('session-a', { ...highlight('h1'), model })

  assert.deepEqual(state.highlights[0].model, model)
  assert.deepEqual((await readState(root, 'session-a')).highlights[0].model, model)
})

test('upserting a highlight replaces or clears its stored model', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 9100 })

  await store.addHighlight('session-a', {
    ...highlight('h1'),
    model: { provider: 'p', model: 'first' },
  })
  await store.addHighlight('session-a', {
    ...highlight('h1'),
    model: { provider: 'q', model: 'second' },
  })
  assert.deepEqual((await store.load('session-a')).highlights[0].model, { provider: 'q', model: 'second' })

  await store.addHighlight('session-a', highlight('h1'))
  assert.equal((await store.load('session-a')).highlights[0].model, undefined)
  assert.deepEqual((await readState(root, 'session-a')).highlights[0], {
    id: 'h1',
    anchor: anchor('text-h1'),
    createdAt: 9100,
  })
})

test('a stored file keeps a valid model across reads and writes', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 9200 })
  const model = { provider: 'p', model: 'm' }
  await writeFile(join(root, 'session-a.json'), JSON.stringify({
    version: 1,
    sessionId: 'session-a',
    updatedAt: 10,
    highlights: [{ id: 'h1', anchor: anchor('kept'), createdAt: 11, model }],
    records: [],
  }))

  const state = await store.load('session-a')
  assert.deepEqual(state.highlights[0].model, model)

  await store.addHighlight('session-a', highlight('h2'))
  assert.deepEqual((await readState(root, 'session-a')).highlights[0].model, model)
})

test('an invalid model is rejected on add but dropped from an existing file', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 9300 })

  await assert.rejects(
    store.addHighlight('session-a', { ...highlight('h1'), model: { provider: 'p' } }),
    TypeError,
  )
  await assert.rejects(
    store.addHighlight('session-a', { ...highlight('h1'), model: null }),
    TypeError,
  )

  await writeFile(join(root, 'session-a.json'), JSON.stringify({
    version: 1,
    sessionId: 'session-a',
    updatedAt: 10,
    highlights: [{ id: 'h1', anchor: anchor('kept'), createdAt: 11, model: { provider: 'p' } }],
    records: [],
  }))
  const state = await store.load('session-a')
  assert.deepEqual(state.highlights, [{ id: 'h1', anchor: anchor('kept'), createdAt: 11 }])
})

test('highlight validation accepts a shaped model and rejects a malformed one', async () => {
  assert.equal(isValidHighlight({ id: 'h1', anchor: anchor('x'), model: { provider: 'p', model: 'm' } }), true)
  assert.equal(isValidHighlight({ id: 'h1', anchor: anchor('x'), model: { provider: 'p', model: '' } }), false)
  assert.equal(isValidHighlight({ id: 'h1', anchor: anchor('x'), model: { model: 'm' } }), false)
})
