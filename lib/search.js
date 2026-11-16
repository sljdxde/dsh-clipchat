/**
 * Cross-session search over stored 留痕 records.
 *
 * Pure functions: callers hand in already-read session states, so the search
 * rules are testable without touching the disk. The host route stitches this
 * together with the store reader.
 *
 * Matching is a case-insensitive substring over the selection, the question and
 * the answer. Results are newest first; a limit trims the tail and reports
 * whether anything was cut.
 *
 * @module dsh-clipchat/lib/search
 */

/** Search limits shared by the route and the store reader. */
export const SEARCH_LIMITS = Object.freeze({
  maxQueryChars: 200,
  defaultLimit: 20,
  maxLimit: 50,
})

/**
 * Clamp one caller-supplied limit to the search range.
 * @param {unknown} value - number or numeric string.
 * @returns {number} a limit between 1 and {@link SEARCH_LIMITS.maxLimit}.
 */
export function searchLimitOf(value) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, SEARCH_LIMITS.maxLimit)
    : SEARCH_LIMITS.defaultLimit
}

/**
 * Whether one record matches the normalized query.
 * @param {object} record - stored record.
 * @param {string} query - lowercase query; empty matches everything.
 * @returns {boolean} whether it matches.
 */
function matches(record, query) {
  if (query.length === 0) return true
  const fields = [record.selection, record.question, record.answer]
  return fields.some((value) => typeof value === 'string' && value.toLowerCase().includes(query))
}

/**
 * Flatten one stored record into a search result; the answer is returned in
 * full so the client can show the stored Q&A without a second request.
 * @param {string} sessionId - owning session.
 * @param {object} record - stored record.
 * @returns {object} result row.
 */
function toResult(sessionId, record) {
  const answer = typeof record.answer === 'string' ? record.answer : ''
  return {
    sessionId,
    recordId: record.id,
    selection: typeof record.selection === 'string' ? record.selection : '',
    question: typeof record.question === 'string' ? record.question : '',
    answer,
    provider: typeof record.provider === 'string' ? record.provider : '',
    model: typeof record.model === 'string' ? record.model : '',
    createdAt: Number.isFinite(record.createdAt) ? record.createdAt : 0,
  }
}

/**
 * Search every record of every supplied session.
 * @param {Array<{ sessionId: string, records: object[] }>} sessions - read session states.
 * @param {string} query - user query.
 * @param {number} limit - maximum rows returned.
 * @returns {{ items: object[], total: number, truncated: boolean }} matches.
 */
export function searchRecords(sessions, query, limit) {
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : ''
  const max = searchLimitOf(limit)
  const items = []
  for (const session of Array.isArray(sessions) ? sessions : []) {
    if (session === null || session === undefined) continue
    const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
    if (sessionId.length === 0 || !Array.isArray(session.records)) continue
    for (const record of session.records) {
      if (record === null || record === undefined || typeof record !== 'object') continue
      if (!matches(record, needle)) continue
      items.push(toResult(sessionId, record))
    }
  }
  items.sort((left, right) => (right.createdAt - left.createdAt)
    || (left.sessionId < right.sessionId ? -1 : left.sessionId > right.sessionId ? 1 : 0)
    || (left.recordId < right.recordId ? -1 : 1))
  return {
    items: items.slice(0, max),
    total: items.length,
    truncated: items.length > max,
  }
}
