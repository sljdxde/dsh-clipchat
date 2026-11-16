import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { createStore, defaultStoreRoot, isValidSessionId, MAX_HIGHLIGHTS } from '../lib/store.js'

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

// --- 7-day TTL and orphan sweep (ticket 17) ---

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

async function writeSession(root, sessionId, updatedAt, extra = {}) {
  await writeFile(join(root, `${sessionId}.json`), JSON.stringify({
    version: 1,
    sessionId,
    updatedAt,
    highlights: [],
    records: [],
    ...extra,
  }))
}

test('a session untouched for more than 7 days is deleted on load', async () => {
  const root = await makeRoot()
  await writeSession(root, 'session-a', NOW - 8 * DAY, {
    highlights: [{ id: 'h1', anchor: anchor('stale'), createdAt: NOW - 8 * DAY }],
  })
  const store = createStore({ root, now: () => NOW })

  const state = await store.load('session-a')

  assert.deepEqual(state, {
    version: 1,
    sessionId: 'session-a',
    updatedAt: NOW,
    highlights: [],
    records: [],
  })
  await assert.rejects(readFile(join(root, 'session-a.json'), 'utf8'), { code: 'ENOENT' })
})

test('a session touched within 7 days survives load and its clock is refreshed', async () => {
  const root = await makeRoot()
  await writeSession(root, 'session-a', NOW - 6 * DAY, {
    highlights: [{ id: 'h1', anchor: anchor('fresh'), createdAt: NOW - 6 * DAY }],
  })
  const store = createStore({ root, now: () => NOW })

  const state = await store.load('session-a')

  assert.equal(state.updatedAt, NOW)
  assert.deepEqual(state.highlights.map((entry) => entry.id), ['h1'])
  assert.equal((await readState(root, 'session-a')).updatedAt, NOW)
})

test('the TTL boundary is exclusive: exactly 7 days old still loads', async () => {
  const root = await makeRoot()
  await writeSession(root, 'session-a', NOW - 7 * DAY)
  const store = createStore({ root, now: () => NOW })

  await store.load('session-a')

  assert.equal((await readState(root, 'session-a')).updatedAt, NOW)
})

test('sweep deletes files whose session is not in the live set', async () => {
  const root = await makeRoot()
  await writeSession(root, 'live', NOW)
  await writeSession(root, 'orphan', NOW)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['live']) })

  assert.deepEqual(result, { skipped: false, scanned: 2, removed: ['orphan'] })
  assert.deepEqual(await readdir(root), ['live.json'])
})

test('sweep keeps active session ids', async () => {
  const root = await makeRoot()
  await writeSession(root, 'active-1', NOW)
  await writeSession(root, 'active-2', NOW)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['active-1', 'active-2']) })

  assert.deepEqual(result.removed, [])
  assert.deepEqual((await readdir(root)).sort(), ['active-1.json', 'active-2.json'])
})

test('sweep keeps archived session ids supplied by the caller', async () => {
  const root = await makeRoot()
  await writeSession(root, 'active-1', NOW)
  await writeSession(root, 'archived-1', NOW)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['active-1', 'archived-1']) })

  assert.deepEqual(result.removed, [])
  assert.deepEqual((await readdir(root)).sort(), ['active-1.json', 'archived-1.json'])
})

test('sweep deletes expired files even when their session is still live', async () => {
  const root = await makeRoot()
  await writeSession(root, 'stale', NOW - 8 * DAY)
  await writeSession(root, 'fresh', NOW - DAY)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['stale', 'fresh']) })

  assert.deepEqual(result.removed, ['stale'])
  assert.deepEqual(await readdir(root), ['fresh.json'])
})

test('sweep leaves a corrupt file alone', async () => {
  const root = await makeRoot()
  await writeFile(join(root, 'broken.json'), '{not json')
  await writeSession(root, 'live', NOW)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['broken', 'live']) })

  assert.deepEqual(result.removed, [])
  assert.deepEqual((await readdir(root)).sort(), ['broken.json', 'live.json'])
})

test('sweep leaves a structurally invalid state file alone', async () => {
  const root = await makeRoot()
  await writeFile(join(root, 'wrong-version.json'), JSON.stringify({ version: 99, sessionId: 'wrong-version' }))
  await writeSession(root, 'live', NOW)
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['wrong-version', 'live']) })

  assert.deepEqual(result.removed, [])
  assert.deepEqual((await readdir(root)).sort(), ['live.json', 'wrong-version.json'])
})

test('sweep is skipped entirely when the live set is unavailable or empty', async () => {
  const root = await makeRoot()
  await writeSession(root, 'orphan', NOW)
  const store = createStore({ root, now: () => NOW })

  for (const liveSessionIds of [undefined, null, new Set(), [], 'session-a']) {
    const result = await store.sweep({ liveSessionIds })
    assert.deepEqual(result, { skipped: true, scanned: 0, removed: [] })
  }
  assert.deepEqual(await readdir(root), ['orphan.json'], 'the host could not list sessions, so nothing was deleted')
})

test('sweep tolerates a store root that does not exist yet', async () => {
  const root = join(await makeRoot(), 'missing')
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['session-a']) })

  assert.deepEqual(result, { skipped: false, scanned: 0, removed: [] })
})

test('sweep ignores files that are not clipchat state files', async () => {
  const root = await makeRoot()
  await writeSession(root, 'live', NOW)
  await writeFile(join(root, 'notes.txt'), 'keep me')
  await writeFile(join(root, '.live.1.0.tmp'), 'temporary')
  const store = createStore({ root, now: () => NOW })

  const result = await store.sweep({ liveSessionIds: new Set(['live']) })

  assert.deepEqual(result.removed, [])
  assert.deepEqual((await readdir(root)).sort(), ['.live.1.0.tmp', 'live.json', 'notes.txt'])
})

test('touch refreshes an existing file and never creates one', async () => {
  const root = await makeRoot()
  const first = createStore({ root, now: () => NOW })
  await first.addHighlight('session-a', { id: 'h1', anchor: anchor(), createdAt: NOW })
  const later = createStore({ root, now: () => NOW + 5000 })

  assert.equal(await later.touch('session-a'), true)
  const state = JSON.parse(await readFile(join(root, 'session-a.json'), 'utf8'))
  assert.equal(state.updatedAt, NOW + 5000)
  assert.equal(state.highlights.length, 1)

  assert.equal(await later.touch('missing-session'), false)
  assert.deepEqual(await readdir(root), ['session-a.json'])
})
