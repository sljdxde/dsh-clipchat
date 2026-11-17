/**
 * Per-session clipchat state on disk.
 *
 * One JSON file per conversation lives at `<root>/<sessionId>.json`, where the
 * default root is `DSH_HOME/clipchat`. Writes are atomic (temporary file +
 * rename) and serialized per session, so two concurrent highlight POSTs can
 * never overwrite each other. The containing directory is 0700 and each state
 * file is 0600.
 *
 * Schema version 1:
 *   { version: 1, sessionId, updatedAt, highlights: [...], records: [...] }
 *
 * @module dsh-clipchat/lib/store
 */

import { chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { normalizeModelRoute } from './model.js'

/** Current on-disk schema version. */
export const SCHEMA_VERSION = 1

/** Hard cap on stored highlights; the oldest are dropped first. */
export const MAX_HIGHLIGHTS = 200

/** Hard cap on stored records; the oldest are dropped first. */
export const MAX_RECORDS = 500

/**
 * Soft cap on one state file. A write that would exceed it first drops the
 * oldest records; highlights are never dropped.
 */
export const MAX_FILE_BYTES = 1024 * 1024

/** Hard cap on session files inspected by one cross-session search. */
export const SEARCH_MAX_FILES = 400

/** Hard cap on bytes read by one cross-session search. */
export const SEARCH_MAX_BYTES = 8 * 1024 * 1024

/** Inactivity window after which a session's state is deleted: 7 days. */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** A session id must be usable as one file name and never escape the root. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/

const ANCHOR_TEXT_LIMIT = 8000
const ANCHOR_SPAN_LIMIT = 1000

const RECORD_SELECTION_LIMIT = 4000
const RECORD_QUESTION_LIMIT = 20000
const RECORD_ANSWER_LIMIT = 512 * 1024
const RECORD_ROUTE_LIMIT = 200
const RECORD_ID_LIMIT = 200
/** One record holds every question asked about its highlight. */
export const MAX_TURNS_PER_RECORD = 50

/** @returns {boolean} whether `value` is a safe session id. */
export function isValidSessionId(value) {
  return typeof value === 'string' && SESSION_ID_PATTERN.test(value)
}

/**
 * Default store root: `DSH_HOME/clipchat`, falling back to `~/.dsh/clipchat`.
 * @param {Record<string, string | undefined>} [env] - environment to read.
 * @returns {string} absolute-ish directory path.
 */
export function defaultStoreRoot(env = process.env) {
  const home = typeof env?.DSH_HOME === 'string' && env.DSH_HOME.length > 0
    ? env.DSH_HOME
    : join(homedir(), '.dsh')
  return join(home, 'clipchat')
}

function isOffset(value) {
  return Number.isInteger(value) && value >= 0
}

/**
 * Validate the anchor shape the client captures.
 * @param {unknown} anchor - candidate anchor.
 * @returns {boolean} whether it is a usable anchor.
 */
export function isValidAnchor(anchor) {
  if (anchor === null || typeof anchor !== 'object') return false
  if (typeof anchor.nodeKey !== 'string' || anchor.nodeKey.length === 0) return false
  if (typeof anchor.text !== 'string' || anchor.text.length === 0) return false
  if (anchor.text.length > ANCHOR_TEXT_LIMIT) return false
  if (!Array.isArray(anchor.spans) || anchor.spans.length === 0 || anchor.spans.length > ANCHOR_SPAN_LIMIT) return false
  return anchor.spans.every((span) => span !== null && typeof span === 'object'
    && isOffset(span.blockIndex) && isOffset(span.start)
    && isOffset(span.end) && span.end > span.start)
}

/**
 * Validate a highlight entry as accepted by `POST /highlight` (add).
 * @param {unknown} highlight - candidate `{ id, anchor }`.
 * @returns {boolean} whether it is usable.
 */
export function isValidHighlight(highlight) {
  return highlight !== null && typeof highlight === 'object'
    && typeof highlight.id === 'string' && highlight.id.length > 0 && highlight.id.length <= 200
    && isValidAnchor(highlight.anchor)
    && (highlight.model === undefined || normalizeModelRoute(highlight.model) !== null)
}

/** Copy an anchor down to its persisted fields. */
function cleanAnchor(anchor) {
  const spans = anchor.spans.map((span) => ({
    blockIndex: span.blockIndex,
    start: span.start,
    end: span.end,
  }))
  const cleaned = { nodeKey: anchor.nodeKey, spans, text: anchor.text }
  if (isOffset(anchor.sourceIndex)) cleaned.sourceIndex = anchor.sourceIndex
  return cleaned
}

function isStoredHighlight(entry) {
  return entry !== null && typeof entry === 'object'
    && typeof entry.id === 'string' && entry.id.length > 0
    && isValidAnchor(entry.anchor)
}

/** Copy one stored highlight down to its persisted fields. */
function cleanHighlight(entry, createdAt) {
  const cleaned = { id: entry.id, anchor: cleanAnchor(entry.anchor), createdAt }
  const model = normalizeModelRoute(entry.model)
  if (model !== null) cleaned.model = model
  return cleaned
}

/**
 * Whether two anchors cover any of the same characters in the same node.
 *
 * A highlight is meant to mark a passage, not a byte range: re-selecting the
 * same words after a reload lands on slightly different offsets, and a drag can
 * end a character short. Treating those as different passages left duplicate
 * underlines and, with them, duplicate records.
 *
 * @param {object} left - one anchor.
 * @param {object} right - another anchor.
 * @returns {boolean} whether they overlap.
 */
export function anchorsOverlap(left, right) {
  if (left?.nodeKey !== right?.nodeKey) return false
  const leftSpans = Array.isArray(left?.spans) ? left.spans : []
  const rightSpans = Array.isArray(right?.spans) ? right.spans : []
  for (const a of leftSpans) {
    for (const b of rightSpans) {
      if (a.blockIndex !== b.blockIndex) continue
      if (a.start < b.end && b.start < a.end) return true
    }
  }
  return false
}

/**
 * Fold highlights that mark the same passage into the oldest one.
 *
 * Records point at a highlight id, so the surviving id must be the one already
 * referenced; keeping the oldest entry preserves those references.
 *
 * @param {object[]} highlights - cleaned highlights, in file order.
 * @returns {object[]} one highlight per passage.
 */
function mergeHighlights(highlights) {
  const kept = []
  for (const entry of highlights) {
    const duplicate = kept.find((existing) => anchorsOverlap(existing.anchor, entry.anchor))
    if (duplicate === undefined) {
      kept.push(entry)
      continue
    }
    // Keep the older timestamp and any model either copy carried.
    if ((entry.createdAt ?? 0) < (duplicate.createdAt ?? 0)) duplicate.createdAt = entry.createdAt
    if (duplicate.model === undefined && entry.model !== undefined) duplicate.model = entry.model
  }
  return kept
}

/**
 * Re-point records at the highlight that survived the merge.
 *
 * Merging overlapping highlights drops the later copies, but records written
 * before the merge still name those ids. Left alone they would look orphaned:
 * the panel would show two records for one passage, and "定位到原文" would find
 * no underline to jump to. Any record whose highlight no longer exists is
 * re-attached to the surviving highlight covering the same passage.
 *
 * @param {object[]} records - cleaned records.
 * @param {object[]} highlights - highlights after merging.
 * @returns {object[]} records with live highlight ids.
 */
function rebindRecords(records, highlights) {
  const live = new Set(highlights.map((entry) => entry.id))
  const orphans = records.filter((record) => !live.has(record.highlightId))
  if (orphans.length === 0) return records

  for (const record of orphans) {
    const text = typeof record.selection === 'string' ? record.selection : ''
    if (text.length === 0) continue
    // Exact text first, then containment: the two copies of a passage usually
    // differ by a character or two, not by content.
    const exact = highlights.find((entry) => entry.anchor?.text === text)
    const partial = exact ?? highlights.find((entry) => {
      const anchorText = typeof entry.anchor?.text === 'string' ? entry.anchor.text : ''
      return anchorText.length > 0 && (anchorText.includes(text) || text.includes(anchorText))
    })
    if (partial !== undefined) record.highlightId = partial.id
    // No match means the passage is gone for good; the record stays readable in
    // the panel, it just has nothing to jump to.
  }
  return records
}

/** Keep the newest `MAX_HIGHLIGHTS`, preserving their original order. */
function capHighlights(highlights) {
  if (highlights.length <= MAX_HIGHLIGHTS) return highlights
  const ranked = highlights.map((entry, index) => ({ entry, index }))
  ranked.sort((left, right) => (left.entry.createdAt - right.entry.createdAt) || (left.index - right.index))
  const dropped = new Set(ranked.slice(0, highlights.length - MAX_HIGHLIGHTS).map((item) => item.index))
  return highlights.filter((_, index) => !dropped.has(index))
}

/** Rank records oldest first, ties broken by their current position. */
function rankedRecords(records) {
  return records
    .map((entry, index) => ({ entry, index }))
    .sort((left, right) => ((left.entry.createdAt ?? 0) - (right.entry.createdAt ?? 0))
      || (left.index - right.index))
}

/** Keep the newest `MAX_RECORDS` records, preserving their original order. */
function capRecords(records) {
  if (records.length <= MAX_RECORDS) return records
  const ranked = rankedRecords(records)
  const dropped = new Set(ranked.slice(0, records.length - MAX_RECORDS).map((item) => item.index))
  return records.filter((_, index) => !dropped.has(index))
}

function isBoundedText(value, limit) {
  return typeof value === 'string' && value.length > 0 && value.length <= limit
}

/** @returns {boolean} whether `usage` is a complete `{ input, output }` pair. */
function isValidUsage(usage) {
  return usage !== null && typeof usage === 'object'
    && Number.isFinite(usage.input) && usage.input >= 0
    && Number.isFinite(usage.output) && usage.output >= 0
}

/** Validate one question/answer turn inside a record. */
function isValidTurn(turn) {
  if (turn === null || typeof turn !== 'object') return false
  if (!isBoundedText(turn.question, RECORD_QUESTION_LIMIT)) return false
  if (!isBoundedText(turn.answer, RECORD_ANSWER_LIMIT)) return false
  if (!isBoundedText(turn.provider, RECORD_ROUTE_LIMIT)) return false
  if (!isBoundedText(turn.model, RECORD_ROUTE_LIMIT)) return false
  if (turn.usage !== undefined && !isValidUsage(turn.usage)) return false
  if (turn.createdAt !== undefined && !Number.isFinite(turn.createdAt)) return false
  return true
}

/**
 * Validate a record entry as accepted by `POST /record` (add).
 *
 * A record belongs to one highlight and holds every question asked about it, so
 * the canonical shape is `{ id, selection, turns: [...] }`. The legacy
 * single-turn shape (`question` / `answer` at the top level) is still accepted
 * and folded into one turn, so files written before this change keep working.
 *
 * @param {unknown} record - candidate record.
 * @returns {boolean} whether it is usable.
 */
export function isValidRecord(record) {
  if (record === null || typeof record !== 'object') return false
  if (!isBoundedText(record.id, RECORD_ID_LIMIT)) return false
  if (record.highlightId !== undefined && !isBoundedText(record.highlightId, RECORD_ID_LIMIT)) return false
  if (!isBoundedText(record.selection, RECORD_SELECTION_LIMIT)) return false
  if (record.createdAt !== undefined && !Number.isFinite(record.createdAt)) return false
  if (record.updatedAt !== undefined && !Number.isFinite(record.updatedAt)) return false

  if (record.turns !== undefined) {
    if (!Array.isArray(record.turns) || record.turns.length === 0) return false
    if (record.turns.length > MAX_TURNS_PER_RECORD) return false
    return record.turns.every(isValidTurn)
  }

  // Legacy single-turn shape.
  return isValidTurn(record)
}

/** Copy one turn down to its persisted fields. */
function cleanTurn(turn, createdAt) {
  const cleaned = {
    question: turn.question,
    answer: turn.answer,
    provider: turn.provider,
    model: turn.model,
    createdAt: Number.isFinite(turn.createdAt) ? turn.createdAt : createdAt,
  }
  if (isValidUsage(turn.usage)) {
    cleaned.usage = { input: turn.usage.input, output: turn.usage.output }
  }
  return cleaned
}

/**
 * Copy one stored record down to its persisted fields.
 *
 * Always produces the `turns` shape, so a legacy entry is migrated on its next
 * write instead of staying in the old form forever.
 *
 * @param {object} entry - record from disk or from the client.
 * @param {number} createdAt - fallback timestamp.
 * @returns {object} the persisted record.
 */
function cleanRecord(entry, createdAt) {
  const fallback = Number.isFinite(createdAt) ? createdAt : 0
  const turns = Array.isArray(entry.turns)
    ? entry.turns.map((turn) => cleanTurn(turn, fallback))
    : [cleanTurn(entry, fallback)]
  const first = turns[0]?.createdAt ?? fallback
  const last = turns.reduce((newest, turn) => Math.max(newest, turn.createdAt ?? 0), first)
  const cleaned = {
    id: entry.id,
    selection: entry.selection,
    turns,
    createdAt: first,
    updatedAt: last,
  }
  if (isBoundedText(entry.highlightId, RECORD_ID_LIMIT)) cleaned.highlightId = entry.highlightId
  return cleaned
}

/**
 * Merge records that describe the same passage.
 *
 * Records used to be one-per-question, so a file written before that change
 * holds several rows for one highlight. Grouping them keeps the invariant the
 * UI now relies on: one record per passage, with every question inside it.
 *
 * Grouping is by `highlightId` when present, and by selection text only among
 * records that never recorded one (legacy entries), so two different highlights
 * that happen to cover the same words stay separate.
 *
 * @param {object[]} records - cleaned records, in file order.
 * @returns {object[]} one record per passage, oldest first.
 */
function mergeRecords(records) {
  const groups = new Map()
  for (const record of records) {
    const key = isBoundedText(record.highlightId, RECORD_ID_LIMIT)
      ? `id:${record.highlightId}`
      : `text:${record.selection}`
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, { ...record, turns: [...record.turns] })
      continue
    }
    existing.turns.push(...record.turns)
    // Keep the oldest identity and timestamp: the passage was first recorded
    // then, and its id is what the client already holds.
    if ((record.createdAt ?? 0) < (existing.createdAt ?? 0)) existing.createdAt = record.createdAt
    existing.updatedAt = Math.max(existing.updatedAt ?? 0, record.updatedAt ?? 0)
  }
  const merged = [...groups.values()]
  for (const record of merged) {
    record.turns.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
    if (record.turns.length > MAX_TURNS_PER_RECORD) {
      record.turns = record.turns.slice(-MAX_TURNS_PER_RECORD)
    }
  }
  return merged.sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
}

/**
 * Build a store bound to one root directory.
 * @param {{ root?: string, now?: () => number }} [options] - root override and clock.
 * @returns {{
 *   root: string,
 *   filePath: (sessionId: string) => string,
 *   load: (sessionId: string) => Promise<object>,
 *   addHighlight: (sessionId: string, highlight: object) => Promise<object>,
 *   removeHighlight: (sessionId: string, id: string) => Promise<object>,
 *   addRecord: (sessionId: string, record: object) => Promise<object>,
 *   removeRecord: (sessionId: string, id: string) => Promise<object>,
 *   sweep: (options?: { liveSessionIds?: Set<string> | string[] }) => Promise<{
 *     skipped: boolean, scanned: number, removed: string[],
 *   }>,
 * }} the store.
 */
export function createStore(options = {}) {
  const root = options.root ?? defaultStoreRoot()
  const now = nowFrom(options.now)
  const queues = new Map()
  let tmpSequence = 0

  /** @throws {TypeError} when the session id is unsafe. */
  function assertSessionId(sessionId) {
    if (!isValidSessionId(sessionId)) {
      throw new TypeError(`invalid session id: ${String(sessionId)}`)
    }
  }

  function filePath(sessionId) {
    assertSessionId(sessionId)
    return join(root, `${sessionId}.json`)
  }

  /** Run one task after every earlier task for the same session. */
  function enqueue(sessionId, task) {
    const previous = queues.get(sessionId) ?? Promise.resolve()
    const run = previous.then(task, task)
    const tail = run.then(() => undefined, () => undefined)
    queues.set(sessionId, tail)
    void tail.then(() => {
      if (queues.get(sessionId) === tail) queues.delete(sessionId)
    })
    return run
  }

  function emptyState(sessionId) {
    return {
      version: SCHEMA_VERSION,
      sessionId,
      updatedAt: now(),
      highlights: [],
      records: [],
    }
  }

  function normalize(raw, sessionId) {
    if (raw === null || typeof raw !== 'object' || raw.version !== SCHEMA_VERSION) return null
    const highlights = Array.isArray(raw.highlights)
      ? raw.highlights.filter(isStoredHighlight).map((entry) => cleanHighlight(
        entry,
        Number.isFinite(entry.createdAt) ? entry.createdAt : now(),
      ))
      : []
    const records = Array.isArray(raw.records)
      ? raw.records.filter(isValidRecord).map((entry) => cleanRecord(
        entry,
        Number.isFinite(entry.createdAt) ? entry.createdAt : now(),
      ))
      : []
    // One merge pass, then records are re-pointed at whatever survived it.
    const mergedHighlights = capHighlights(mergeHighlights(highlights))
    return {
      version: SCHEMA_VERSION,
      sessionId,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now(),
      highlights: mergedHighlights,
      records: capRecords(rebindRecords(mergeRecords(records), mergedHighlights)),
    }
  }

  /**
   * List the state files this store could have written.
   * Directory order is not meaningful; callers that care sort explicitly.
   * A missing root reads as an empty list.
   * @returns {Promise<Array<{ sessionId: string, name: string, path: string }>>} state files.
   */
  async function listSessionFiles() {
    let names
    try {
      names = await readdir(root)
    } catch (error) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
    const files = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const sessionId = name.slice(0, -'.json'.length)
      if (!isValidSessionId(sessionId)) continue
      files.push({ sessionId, name, path: join(root, name) })
    }
    return files
  }

  /**
   * Read one session state without touching its TTL clock.
   * `exists` is false for a missing, unreadable or invalid file.
   * @param {string} sessionId - owning session.
   * @returns {Promise<{ state: object, exists: boolean }>} stored state.
   */
  async function readSessionFile(sessionId) {
    let text
    try {
      text = await readFile(filePath(sessionId), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return { state: emptyState(sessionId), exists: false }
      throw error
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      return { state: emptyState(sessionId), exists: false }
    }
    const state = normalize(parsed, sessionId)
    return state === null
      ? { state: emptyState(sessionId), exists: false }
      : { state, exists: true }
  }

  /** Newest `keep` records of a pre-ranked list, preserving their original order. */
  function newestRecords(records, ranked, keep) {
    if (keep >= records.length) return records
    const kept = new Set(ranked.slice(records.length - keep).map((item) => item.index))
    return records.filter((_, index) => kept.has(index))
  }

  /**
   * Serialize a state within {@link MAX_FILE_BYTES}.
   *
   * When the serialized state is too big, the oldest records are dropped until
   * it fits; highlights are never dropped. A state whose highlights alone
   * exceed the budget is written as-is so no highlight is ever lost. The
   * surviving record list is written back onto `state`, so callers returning
   * `state` report exactly what was persisted.
   * @param {object} state - state about to be written.
   * @returns {string} the JSON body to persist.
   */
  function serializeWithinBudget(state) {
    let body = JSON.stringify(state)
    if (Buffer.byteLength(body, 'utf8') <= MAX_FILE_BYTES) return body
    if (state.records.length === 0) return body
    const ranked = rankedRecords(state.records)
    // Keep the newest records first: size grows with `keep`, so binary search
    // finds the largest suffix that fits in a handful of serializations.
    let low = 0
    let high = state.records.length
    let best = null
    while (low <= high) {
      const keep = Math.floor((low + high) / 2)
      const records = newestRecords(state.records, ranked, keep)
      const candidate = JSON.stringify({ ...state, records })
      if (Buffer.byteLength(candidate, 'utf8') <= MAX_FILE_BYTES) {
        best = { records, body: candidate }
        low = keep + 1
      } else {
        high = keep - 1
      }
    }
    if (best === null) {
      state.records = []
      return JSON.stringify(state)
    }
    state.records = best.records
    return best.body
  }

  async function writeState(state) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await chmod(root, 0o700)
    const body = serializeWithinBudget(state)
    const target = filePath(state.sessionId)
    const tmp = join(root, `.${state.sessionId}.${process.pid}.${tmpSequence++}.tmp`)
    try {
      await writeFile(tmp, body, { mode: 0o600 })
      await chmod(tmp, 0o600)
      await rename(tmp, target)
    } catch (error) {
      await rm(tmp, { force: true }).catch(() => {})
      throw error
    }
  }

  async function load(sessionId) {
    assertSessionId(sessionId)
    return enqueue(sessionId, async () => {
      const { state, exists } = await readSessionFile(sessionId)
      if (!exists) return state
      // Lazy TTL: a session untouched for more than 7 days is dropped on read.
      if (now() - state.updatedAt > TTL_MS) {
        await rm(filePath(sessionId), { force: true })
        return emptyState(sessionId)
      }
      // Every read counts as an access, so the TTL sweeper sees it.
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  /**
   * Refresh `updatedAt` of an existing state file; never creates one.
   * @param {string} sessionId - owning session.
   * @returns {Promise<boolean>} whether a state file was touched.
   */
  async function touch(sessionId) {
    assertSessionId(sessionId)
    return enqueue(sessionId, async () => {
      let text
      try {
        text = await readFile(filePath(sessionId), 'utf8')
      } catch (error) {
        if (error?.code === 'ENOENT') return false
        throw error
      }
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        return false
      }
      if (parsed === null || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) return false
      const state = normalize(parsed, sessionId)
      if (state === null) return false
      state.updatedAt = now()
      await writeState(state)
      return true
    })
  }

  /**
   * Delete state files that are orphaned or expired.
   *
   * An orphan is a `<root>/<sessionId>.json` whose id is absent from the live
   * set (live sessions plus archived sessions). A file whose `updatedAt` is
   * older than {@link TTL_MS} is removed even when its session is live, and a
   * file that cannot be read or parsed is left alone.
   *
   * Sweeping is deliberately skipped when the caller cannot supply a non-empty
   * live set: an unavailable or empty session list must never be read as "every
   * conversation was deleted", so the caller skips this call in that case.
   *
   * @param {{ liveSessionIds?: Set<string> | string[] }} [options] - ids to keep.
   * @returns {Promise<{ skipped: boolean, scanned: number, removed: string[] }>}
   *   whether the sweep ran, how many state files it inspected and their ids.
   */
  async function sweep(options = {}) {
    const live = toLiveSet(options?.liveSessionIds)
    if (live === null || live.size === 0) {
      return { skipped: true, scanned: 0, removed: [] }
    }
    const files = await listSessionFiles()
    const at = now()
    const removed = []
    let scanned = 0
    for (const file of files) {
      scanned += 1
      if (!live.has(file.sessionId)) {
        await rm(file.path, { force: true })
        removed.push(file.sessionId)
        continue
      }
      let parsed
      try {
        parsed = JSON.parse(await readFile(file.path, 'utf8'))
      } catch {
        continue
      }
      if (parsed === null || typeof parsed !== 'object'
        || parsed.version !== SCHEMA_VERSION
        || !Number.isFinite(parsed.updatedAt)) continue
      if (at - parsed.updatedAt > TTL_MS) {
        await rm(file.path, { force: true })
        removed.push(file.sessionId)
      }
    }
    return { skipped: false, scanned, removed }
  }

  /**
   * Read every non-expired session state for cross-session search.
   *
   * Search is read-only: unlike `load`, it never refreshes `updatedAt`, so a
   * query cannot keep dormant sessions alive. Expired, corrupt and oversized
   * files are skipped; the scan stops at the byte/file caps and reports
   * `truncated` so callers can tell a partial corpus from a complete one.
   *
   * `maxFiles` and the returned `scanned` exist so tests can exercise the cap
   * without a 400-file fixture; production callers pass no options.
   *
   * @param {{ maxFiles?: number }} [options] - test seam: override the file cap.
   * @returns {Promise<{ sessions: Array<{ sessionId: string, updatedAt: number, records: object[] }>, truncated: boolean, scanned: number }>} readable states.
   */
  async function readAllForSearch(options = {}) {
    const maxFiles = positiveInt(options.maxFiles, SEARCH_MAX_FILES)
    const files = await listSessionFiles()
    const at = now()
    const sessions = []
    let scanned = 0
    let bytes = 0
    let truncated = false
    for (const file of files) {
      if (scanned >= maxFiles) {
        truncated = true
        break
      }
      scanned += 1
      let info
      try {
        info = await stat(file.path)
      } catch {
        continue
      }
      if (!info.isFile()) continue
      if (bytes + info.size > SEARCH_MAX_BYTES) {
        truncated = true
        break
      }
      let read
      try {
        read = await readSessionFile(file.sessionId)
      } catch {
        continue
      }
      if (!read.exists || at - read.state.updatedAt > TTL_MS || read.state.records.length === 0) continue
      bytes += info.size
      sessions.push({ sessionId: file.sessionId, updatedAt: read.state.updatedAt, records: read.state.records })
    }
    return { sessions, truncated, scanned }
  }

  async function addHighlight(sessionId, highlight) {
    assertSessionId(sessionId)
    if (!isValidHighlight(highlight)) throw new TypeError('invalid highlight')
    return enqueue(sessionId, async () => {
      const { state } = await readSessionFile(sessionId)
      const entry = cleanHighlight(
        highlight,
        Number.isFinite(highlight.createdAt) ? highlight.createdAt : now(),
      )
      state.highlights = capHighlights(
        state.highlights.filter((item) => item.id !== entry.id).concat(entry),
      )
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  async function removeHighlight(sessionId, id) {
    assertSessionId(sessionId)
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('invalid highlight id')
    return enqueue(sessionId, async () => {
      const { state, exists } = await readSessionFile(sessionId)
      if (!exists) return state
      state.highlights = state.highlights.filter((item) => item.id !== id)
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  async function addRecord(sessionId, record) {
    assertSessionId(sessionId)
    if (!isValidRecord(record)) throw new TypeError('invalid record')
    return enqueue(sessionId, async () => {
      const { state } = await readSessionFile(sessionId)
      const entry = cleanRecord(
        record,
        Number.isFinite(record.createdAt) ? record.createdAt : now(),
      )
      state.records = capRecords(
        state.records.filter((item) => item.id !== entry.id).concat(entry),
      )
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  async function removeRecord(sessionId, id) {
    assertSessionId(sessionId)
    if (typeof id !== 'string' || id.length === 0) throw new TypeError('invalid record id')
    return enqueue(sessionId, async () => {
      const { state, exists } = await readSessionFile(sessionId)
      if (!exists) return state
      state.records = state.records.filter((item) => item.id !== id)
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  return { root, filePath, load, touch, listSessionFiles, readSessionFile, readAllForSearch, addHighlight, removeHighlight, addRecord, removeRecord, sweep }
}

/** Normalize a caller-supplied keep set; null means the live set is unusable. */
function toLiveSet(value) {
  if (value instanceof Set) {
    return new Set([...value].filter((id) => typeof id === 'string' && id.length > 0))
  }
  if (Array.isArray(value)) {
    return new Set(value.filter((id) => typeof id === 'string' && id.length > 0))
  }
  return null
}

function nowFrom(value) {
  return typeof value === 'function' ? value : () => Date.now()
}

/** Keep a positive integer option, otherwise fall back to the default. */
function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}
