import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createStore, isValidHighlight } from '../lib/store.js'

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
