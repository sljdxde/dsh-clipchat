import { test } from 'node:test'
import assert from 'node:assert/strict'

import { searchLimitOf, searchRecords, SEARCH_LIMITS } from '../lib/search.js'
import { makeLegacyRecord, makeRecord, makeTurn } from './helpers/records.mjs'

const sessions = [
  {
    sessionId: 'session-a',
    records: [
      makeRecord('r1', { selection: 'Alpha passage', question: 'first', answer: 'one', createdAt: 100 }),
      makeRecord('r2', { selection: 'beta', question: 'Alpha in the question', answer: 'two', createdAt: 300 }),
    ],
  },
  {
    sessionId: 'session-b',
    records: [
      makeRecord('r3', { selection: 'gamma', question: 'third', answer: 'mentions alpha in the answer', createdAt: 200 }),
      makeRecord('r4', { selection: 'delta', question: 'fourth', answer: 'none here', createdAt: 400 }),
    ],
  },
]

test('search matches selection, question and answer, case-insensitively', () => {
  const result = searchRecords(sessions, 'ALPHA', 10)
  assert.deepEqual(result.items.map((item) => item.recordId), ['r2', 'r3', 'r1'])
  assert.equal(result.total, 3)
  assert.equal(result.truncated, false)
})

test('search is newest first, across sessions', () => {
  const result = searchRecords(sessions, '', 10)
  assert.deepEqual(result.items.map((item) => item.recordId), ['r4', 'r2', 'r3', 'r1'])
})

test('an empty query returns everything and honours the limit', () => {
  const result = searchRecords(sessions, '   ', 2)
  assert.deepEqual(result.items.map((item) => item.recordId), ['r4', 'r2'])
  assert.equal(result.total, 4)
  assert.equal(result.truncated, true)
})

test('result rows carry the owning session and route metadata', () => {
  const result = searchRecords(sessions, 'first', 10)
  assert.deepEqual(result.items[0], {
    sessionId: 'session-a',
    recordId: 'r1',
    selection: 'Alpha passage',
    // `question`/`answer` mirror the newest turn; `turns` carries them all.
    question: 'first',
    answer: 'one',
    turns: [{ question: 'first', answer: 'one' }],
    provider: 'deepseek',
    model: 'deepseek-chat',
    createdAt: 100,
  })
})

test('a long answer is returned in full', () => {
  const long = 'x'.repeat(SEARCH_LIMITS.maxQueryChars * 100)
  const result = searchRecords([{ sessionId: 's', records: [makeRecord('r9', { answer: long })] }], '', 10)
  assert.equal(result.items[0].answer, long)
})

test('malformed sessions and records are ignored instead of throwing', () => {
  const result = searchRecords([null, {}, { sessionId: '', records: [] }, { sessionId: 's', records: [null, 'x', { id: 'r1' }] }], 'x', 10)
  assert.equal(result.total, 0)
  assert.deepEqual(result.items, [])
})

test('searchLimitOf clamps to the configured range', () => {
  assert.equal(searchLimitOf(undefined), SEARCH_LIMITS.defaultLimit)
  assert.equal(searchLimitOf('3'), 3)
  assert.equal(searchLimitOf('0'), SEARCH_LIMITS.defaultLimit)
  assert.equal(searchLimitOf('nope'), SEARCH_LIMITS.defaultLimit)
  assert.equal(searchLimitOf(999), SEARCH_LIMITS.maxLimit)
  assert.equal(searchLimitOf(-2), SEARCH_LIMITS.defaultLimit)
})

test('turnsOf folds a legacy single-turn record into one turn', async () => {
  const { turnsOf } = await import('../lib/search.js')
  const legacy = makeLegacyRecord('r1', { question: 'old q', answer: 'old a' })
  assert.deepEqual(turnsOf(legacy), [{
    question: 'old q',
    answer: 'old a',
    provider: 'deepseek',
    model: 'deepseek-chat',
    createdAt: 1000,
  }])
})

test('turnsOf returns nothing for a record with neither shape', async () => {
  const { turnsOf } = await import('../lib/search.js')
  assert.deepEqual(turnsOf(null), [])
  assert.deepEqual(turnsOf({}), [])
  assert.deepEqual(turnsOf({ question: 'only a question' }), [])
})

test('search matches a question inside any turn, not just the newest', async () => {
  const record = makeRecord('r1', {
    turns: [
      makeTurn('r1', { question: 'the older question', answer: 'older answer' }),
      makeTurn('r1', { question: 'the newer question', answer: 'newer answer', createdAt: 2000 }),
    ],
    updatedAt: 2000,
  })
  const result = searchRecords([{ sessionId: 's', records: [record] }], 'older question', 10)
  assert.equal(result.total, 1)
  assert.equal(result.items[0].question, 'the newer question', 'the newest turn is mirrored at the top level')
  assert.equal(result.items[0].turns.length, 2, 'every turn is returned')
})
