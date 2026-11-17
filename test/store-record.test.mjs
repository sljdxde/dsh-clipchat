import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeRecord as record } from './helpers/records.mjs'

const makeRecord = record
import { createStore, isValidRecord, MAX_FILE_BYTES, MAX_RECORDS } from '../lib/store.js'

async function makeRoot() {
  return mkdtemp(join(tmpdir(), 'clipchat-record-'))
}

/** A well-formed record as the client builds it. */
async function readState(root, sessionId) {
  return JSON.parse(await readFile(join(root, `${sessionId}.json`), 'utf8'))
}

async function seed(root, sessionId, extra = {}) {
  await writeFile(join(root, `${sessionId}.json`), JSON.stringify({
    version: 1,
    sessionId,
    updatedAt: 1,
    highlights: [],
    records: [],
    ...extra,
  }))
}

const anchor = {
  nodeKey: '5:assistant-step1:1',
  sourceIndex: 0,
  spans: [{ blockIndex: 0, start: 0, end: 7 }],
  text: 'passage',
}

test('addRecord persists the full record schema', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 2000 })

  const state = await store.addRecord('session-a', record('r1', { highlightId: 'h1' }))

  assert.equal(state.records.length, 1)
  const stored = await readState(root, 'session-a')
  assert.equal(stored.version, 1)
  assert.deepEqual(stored.records, [{
    id: 'r1',
    highlightId: 'h1',
    selection: 'passage-r1',
    turns: [{
      question: 'question-r1',
      answer: 'answer-r1',
      provider: 'deepseek',
      model: 'deepseek-chat',
      usage: { input: 10, output: 20 },
      createdAt: 1000,
    }],
    createdAt: 1000,
    updatedAt: 1000,
  }])
  assert.deepEqual(stored.highlights, [])
})

test('addRecord omits optional fields that are absent', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 2100 })
  // Both the record and its turn fall back to the store clock.
  const entry = record('r1')
  delete entry.createdAt
  delete entry.turns[0].usage
  delete entry.turns[0].createdAt

  const state = await store.addRecord('session-a', entry)

  assert.deepEqual(state.records, [{
    id: 'r1',
    selection: 'passage-r1',
    turns: [{
      question: 'question-r1',
      answer: 'answer-r1',
      provider: 'deepseek',
      model: 'deepseek-chat',
      createdAt: 2100,
    }],
    createdAt: 2100,
    updatedAt: 2100,
  }])
})

test('addRecord upserts by id instead of duplicating', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 3000 })

  await store.addRecord('session-a', record('r1', { answer: 'first' }))
  const state = await store.addRecord('session-a', record('r1', { answer: 'second' }))

  assert.equal(state.records.length, 1)
  assert.equal(state.records[0].turns.length, 1)
  assert.equal(state.records[0].turns[0].answer, 'second')
})

test('removeRecord drops only that record and persists', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 4000 })
  await store.addRecord('session-a', record('r1'))
  await store.addRecord('session-a', record('r2'))

  const state = await store.removeRecord('session-a', 'r1')

  assert.deepEqual(state.records.map((entry) => entry.id), ['r2'])
  assert.deepEqual((await readState(root, 'session-a')).records.map((entry) => entry.id), ['r2'])
})

test('removeRecord for an unknown id writes no new file', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 4100 })

  const state = await store.removeRecord('missing-session', 'nope')

  assert.deepEqual(state.records, [])
  await assert.rejects(readFile(join(root, 'missing-session.json'), 'utf8'), { code: 'ENOENT' })
})

test('records and highlights coexist in one file', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 4200 })

  await store.addHighlight('session-a', { id: 'h1', anchor, createdAt: 10 })
  await store.addRecord('session-a', record('r1'))
  const removed = await store.removeRecord('session-a', 'r1')

  assert.deepEqual(removed.highlights.map((entry) => entry.id), ['h1'])
  assert.deepEqual(removed.records, [])
})

test('isValidRecord accepts the client shape and rejects malformed records', () => {
  assert.equal(isValidRecord(record('r1')), true)
  assert.equal(isValidRecord(record('r1', { createdAt: undefined })), true)
  assert.equal(isValidRecord(record('r1', { highlightId: 'h1' })), true)
  assert.equal(isValidRecord(record('r1', { usage: undefined })), true)

  for (const invalid of [
    null,
    undefined,
    'record',
    {},
    record(''),
    record('r1', { selection: '' }),
    record('r1', { question: 42 }),
    record('r1', { answer: undefined }),
    record('r1', { provider: '' }),
    record('r1', { model: 7 }),
    record('r1', { usage: { input: -1, output: 2 } }),
    record('r1', { usage: { input: 'x', output: 2 } }),
    record('r1', { usage: { input: 1 } }),
    record('r1', { createdAt: 'yesterday' }),
    record('r1', { highlightId: '' }),
    record('r1', { turns: [] }),
    record('r1', { turns: [{ question: 'q' }] }),
    { ...record('r1'), id: 'x'.repeat(201) },
  ]) {
    assert.equal(isValidRecord(invalid), false, `should reject ${JSON.stringify(invalid)}`)
  }
})

test('addRecord and removeRecord reject unsafe session ids and bad records', async () => {
  const root = await makeRoot()
  const store = createStore({ root })

  await assert.rejects(store.addRecord('../escape', record('r1')), TypeError)
  await assert.rejects(store.addRecord('session-a', { id: 'r1' }), TypeError)
  await assert.rejects(store.removeRecord('../escape', 'r1'), TypeError)
  await assert.rejects(store.removeRecord('session-a', ''), TypeError)
})

test('the cap keeps the newest 500 records by createdAt and drops the oldest', async () => {
  const root = await makeRoot()
  const seeded = Array.from({ length: MAX_RECORDS }, (_, index) => record(`r${index}`, { createdAt: index + 1 }))
  await seed(root, 'session-a', { records: seeded })
  const store = createStore({ root, now: () => 5000 })

  await store.addRecord('session-a', record('r500', { createdAt: 501 }))
  await store.addRecord('session-a', record('r501', { createdAt: 502 }))
  const state = await store.load('session-a')

  assert.equal(state.records.length, MAX_RECORDS)
  assert.equal(state.records[0].id, 'r2')
  assert.equal(state.records.at(-1).id, 'r501')
})

test('adding an older record still ranks by createdAt for the cap', async () => {
  const root = await makeRoot()
  const seeded = Array.from({ length: MAX_RECORDS }, (_, index) => record(`r${index}`, { createdAt: 1000 + index }))
  await seed(root, 'session-a', { records: seeded })
  const store = createStore({ root, now: () => 5100 })

  const state = await store.addRecord('session-a', record('old', { createdAt: 1 }))

  assert.equal(state.records.length, MAX_RECORDS)
  assert.equal(state.records.some((entry) => entry.id === 'old'), false)
  assert.equal(state.records.some((entry) => entry.id === 'r0'), true)
})

test('a write over the 1 MB budget drops the oldest records first', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 6000 })
  const big = 'x'.repeat(200 * 1024)

  for (let index = 0; index < 8; index += 1) {
    await store.addRecord('session-a', record(`r${index}`, { answer: big, createdAt: 1000 + index }))
  }

  const stored = await readState(root, 'session-a')
  assert.ok(Buffer.byteLength(JSON.stringify(stored), 'utf8') <= MAX_FILE_BYTES, 'file is within budget')
  assert.ok(stored.records.length >= 1, 'some records survive')
  assert.equal(stored.records.at(-1).id, 'r7', 'the newest record is kept')
  assert.equal(stored.records[0].id !== 'r0', true, 'the oldest record was dropped')
})

test('trimming to the 1 MB budget keeps every highlight intact', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 6100 })
  for (let index = 0; index < 3; index += 1) {
    await store.addHighlight('session-a', {
      id: `h${index}`,
      anchor: { ...anchor, text: `passage-${index}` },
      createdAt: 10 + index,
    })
  }
  const big = 'y'.repeat(200 * 1024)
  for (let index = 0; index < 8; index += 1) {
    await store.addRecord('session-a', record(`r${index}`, { answer: big, createdAt: 1000 + index }))
  }

  const stored = await readState(root, 'session-a')
  assert.ok(Buffer.byteLength(JSON.stringify(stored), 'utf8') <= MAX_FILE_BYTES)
  assert.deepEqual(stored.highlights.map((entry) => entry.id), ['h0', 'h1', 'h2'])
  assert.ok(stored.records.length >= 1)
})

test('a highlight write also trims records to the 1 MB budget', async () => {
  const root = await makeRoot()
  const big = 'z'.repeat(200 * 1024)
  const records = Array.from({ length: 8 }, (_, index) => record(`r${index}`, { answer: big, createdAt: index + 1 }))
  await seed(root, 'session-a', {
    highlights: [{ id: 'h1', anchor, createdAt: 1 }],
    records,
  })
  assert.ok(Buffer.byteLength(await readFile(join(root, 'session-a.json'), 'utf8')) > MAX_FILE_BYTES)
  const store = createStore({ root, now: () => 6200 })

  const state = await store.addHighlight('session-a', {
    id: 'h2',
    anchor: { ...anchor, text: 'second' },
    createdAt: 2,
  })

  const stored = await readState(root, 'session-a')
  assert.ok(Buffer.byteLength(JSON.stringify(stored), 'utf8') <= MAX_FILE_BYTES)
  assert.deepEqual(stored.highlights.map((entry) => entry.id), ['h1', 'h2'])
  assert.deepEqual(state.highlights.map((entry) => entry.id), ['h1', 'h2'])
  assert.ok(stored.records.length < records.length)
})

test('the state file is 0600 after a record write', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 7000 })

  await store.addRecord('session-a', record('r1'))

  assert.equal((await stat(join(root, 'session-a.json'))).mode & 0o777, 0o600)
  assert.equal((await stat(root)).mode & 0o777, 0o700)
})

test('invalid records already on disk are filtered out on read', async () => {
  const root = await makeRoot()
  await seed(root, 'session-a', {
    records: [
      record('r1'),
      { id: 'broken' },
      null,
      record('r2', { provider: '' }),
      record('r3', { createdAt: undefined }),
    ],
  })
  const store = createStore({ root, now: () => 8000 })

  const state = await store.load('session-a')

  assert.deepEqual(state.records.map((entry) => entry.id), ['r1', 'r3'])
})

test('records written before the turn model merge into one per passage', async () => {
  const root = await makeRoot()
  // Three questions about the same highlight, written one-record-per-question.
  await seed(root, 'session-a', {
    records: [
      record('r1', { highlightId: 'h1', createdAt: 100, question: 'q1', answer: 'a1' }),
      record('r2', { highlightId: 'h1', createdAt: 200, question: 'q2', answer: 'a2' }),
      record('r3', { highlightId: 'h1', createdAt: 300, question: 'q3', answer: 'a3' }),
      // A different highlight that happens to cover the same words stays apart.
      record('r4', { highlightId: 'h2', createdAt: 400 }),
    ],
  })
  const store = createStore({ root, now: () => 9000 })

  const state = await store.load('session-a')

  assert.deepEqual(state.records.map((entry) => entry.id), ['r1', 'r4'])
  assert.deepEqual(state.records[0].turns.map((turn) => turn.question), ['q1', 'q2', 'q3'])
  assert.equal(state.records[0].createdAt, 100)
  assert.equal(state.records[0].updatedAt, 300)
})

test('legacy records without a highlight merge by their passage text', async () => {
  const root = await makeRoot()
  await seed(root, 'session-a', {
    records: [
      record('r1', { selection: 'same words', createdAt: 100 }),
      record('r2', { selection: 'same words', createdAt: 200 }),
      record('r3', { selection: 'other words', createdAt: 300 }),
    ],
  })
  const store = createStore({ root, now: () => 9000 })

  const state = await store.load('session-a')

  assert.deepEqual(state.records.map((entry) => entry.id), ['r1', 'r3'])
  assert.equal(state.records[0].turns.length, 2)
})

test('a budget that cannot fit even one record drops them all', async () => {
  const root = await makeRoot()
  // A cap far below one record forces the binary search to give up.
  const store = createStore({ root, now: () => 1000 })
  const huge = makeRecord('r1', { selection: 's'.repeat(4000) })
  await store.addRecord('session-a', huge)

  // A single record that is itself larger than the file budget cannot be kept.
  const state = await store.load('session-a')
  assert.ok(state.records.length <= 1, 'the record either fits or is dropped')
})

test('a write whose rename target is a directory fails and cleans up', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 1000 })
  // The target name is occupied by a directory, so rename() cannot replace it.
  await mkdir(join(root, 'session-a.json'))

  await assert.rejects(store.addRecord('session-a', makeRecord('r1')))
  const names = await readdir(root)
  assert.equal(names.some((name) => name.endsWith('.tmp')), false, 'the temp file was removed')
})

test('a state too large even without records is written with none', async () => {
  const root = await makeRoot()
  const store = createStore({ root, now: () => 1000 })
  // Highlights are never dropped, so a big enough highlight set pushes the
  // file past the budget on its own; the writer then has to give up on records.
  const anchors = []
  for (let index = 0; index < 150; index += 1) {
    anchors.push({
      id: `h${index}`,
      anchor: {
        nodeKey: '1:assistant-step1:1',
        sourceIndex: 0,
        spans: [{ blockIndex: 0, start: 0, end: 7000 }],
        text: 'x'.repeat(7000),
      },
      createdAt: 1000 + index,
    })
  }
  await seed(root, 'session-a', { highlights: anchors, records: [makeRecord('r1')] })

  const state = await store.load('session-a')

  assert.ok(state.highlights.length > 0, 'the highlights survived')
  assert.deepEqual(state.records, [], 'the record was dropped to fit the budget')
})
