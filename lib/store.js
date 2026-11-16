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

import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Current on-disk schema version. */
export const SCHEMA_VERSION = 1

/** Hard cap on stored highlights; the oldest are dropped first. */
export const MAX_HIGHLIGHTS = 200

/** Hard cap on stored records; the oldest are dropped first. */
export const MAX_RECORDS = 500

/** Inactivity window after which a session's state is deleted: 7 days. */
export const TTL_MS = 7 * 24 * 60 * 60 * 1000

/** A session id must be usable as one file name and never escape the root. */
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/

const ANCHOR_TEXT_LIMIT = 8000
const ANCHOR_SPAN_LIMIT = 1000

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

/** Keep the newest `MAX_HIGHLIGHTS`, preserving their original order. */
function capHighlights(highlights) {
  if (highlights.length <= MAX_HIGHLIGHTS) return highlights
  const ranked = highlights.map((entry, index) => ({ entry, index }))
  ranked.sort((left, right) => (left.entry.createdAt - right.entry.createdAt) || (left.index - right.index))
  const dropped = new Set(ranked.slice(0, highlights.length - MAX_HIGHLIGHTS).map((item) => item.index))
  return highlights.filter((_, index) => !dropped.has(index))
}

function capRecords(records) {
  return records.length <= MAX_RECORDS ? records : records.slice(-MAX_RECORDS)
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
 *   sweep: (options?: { liveSessionIds?: Set<string> | string[] }) => Promise<{
 *     skipped: boolean, scanned: number, removed: string[],
 *   }>,
 * }} the store.
 */
export function createStore(options = {}) {
  const root = options.root ?? defaultStoreRoot()
  const now = optionNow(options.now)
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
      ? raw.highlights.filter(isStoredHighlight).map((entry) => ({
        id: entry.id,
        anchor: cleanAnchor(entry.anchor),
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : now(),
      }))
      : []
    const records = Array.isArray(raw.records)
      ? raw.records.filter((record) => record !== null && typeof record === 'object')
      : []
    return {
      version: SCHEMA_VERSION,
      sessionId,
      updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now(),
      highlights: capHighlights(highlights),
      records: capRecords(records),
    }
  }

  /** Read one state; `exists` is false for a missing or unreadable file. */
  async function readState(sessionId) {
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

  async function writeState(state) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    await chmod(root, 0o700)
    const body = JSON.stringify(state)
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
      const { state, exists } = await readState(sessionId)
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
   * Delete state files that are orphaned or expired.
   *
   * An orphan is a `<root>/<sessionId>.json` whose id is absent from the live
   * set (live sessions plus archived sessions). A file whose `updatedAt` is
   * older than {@link TTL_MS} is removed even when its session is live, and a
   * file that cannot be read or parsed is removed as corrupt.
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
    let names
    try {
      names = await readdir(root)
    } catch (error) {
      if (error?.code === 'ENOENT') return { skipped: false, scanned: 0, removed: [] }
      throw error
    }
    const at = now()
    const removed = []
    let scanned = 0
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      const sessionId = name.slice(0, -'.json'.length)
      // Only files we could have written are ours; other names are left alone.
      if (!isValidSessionId(sessionId)) continue
      scanned += 1
      const target = join(root, name)
      if (!live.has(sessionId)) {
        await rm(target, { force: true })
        removed.push(sessionId)
        continue
      }
      let parsed
      try {
        parsed = JSON.parse(await readFile(target, 'utf8'))
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        await rm(target, { force: true })
        removed.push(sessionId)
        continue
      }
      const corrupt = parsed === null || typeof parsed !== 'object'
        || parsed.version !== SCHEMA_VERSION
        || !Number.isFinite(parsed.updatedAt)
      if (corrupt || at - parsed.updatedAt > TTL_MS) {
        await rm(target, { force: true })
        removed.push(sessionId)
      }
    }
    return { skipped: false, scanned, removed }
  }

  async function addHighlight(sessionId, highlight) {
    assertSessionId(sessionId)
    if (!isValidHighlight(highlight)) throw new TypeError('invalid highlight')
    return enqueue(sessionId, async () => {
      const { state } = await readState(sessionId)
      const entry = {
        id: highlight.id,
        anchor: cleanAnchor(highlight.anchor),
        createdAt: Number.isFinite(highlight.createdAt) ? highlight.createdAt : now(),
      }
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
      const { state, exists } = await readState(sessionId)
      if (!exists) return state
      state.highlights = state.highlights.filter((item) => item.id !== id)
      state.updatedAt = now()
      await writeState(state)
      return state
    })
  }

  return { root, filePath, load, addHighlight, removeHighlight, sweep }
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

function optionNow(value) {
  return typeof value === 'function' ? value : () => Date.now()
}
