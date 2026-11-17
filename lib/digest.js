/**
 * Session-level digest for the clipchat "detailed answer" mode.
 *
 * A fork inherits the whole event log prefix, which for a long session is far
 * larger than any context window. This module keeps the information a
 * passage-question actually needs and drops the two largest, least useful
 * layers: assistant reasoning and tool results.
 *
 * Kept, per turn, in this order of value:
 *
 * - `user` — the user message, the intent line;
 * - `assistant` — assistant text, where the conclusions are;
 * - `tools` — tool names only, so the model knows what the turn did;
 *
 * plus the compaction summary, which is already a distilled view of the turns
 * that were folded away.
 *
 * @module dsh-clipchat/lib/digest
 */

/** Per-turn and total caps for the digest. */
export const DIGEST_LIMITS = Object.freeze({
  userChars: 800,
  assistantChars: 1200,
  toolNameChars: 80,
  toolsPerTurn: 20,
  summaryChars: 8000,
  totalChars: 60000,
})

/** Rough characters-per-token for mixed Chinese and code; used for reporting only. */
export const CHARS_PER_TOKEN = 1.6

/**
 * Text of one content-block array, keeping only the block kinds asked for.
 * @param {unknown} content - message content blocks.
 * @param {string[]} kinds - block `type` values to keep.
 * @returns {string} joined text.
 */
function textOf(content, kinds) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    if (!kinds.includes(block.type)) continue
    if (typeof block.text !== 'string' || block.text.trim().length === 0) continue
    parts.push(block.text)
  }
  return parts.join('\n\n')
}

/**
 * Clip to a character budget, keeping the head and marking the cut.
 * @param {string} text - source text.
 * @param {number} limit - character budget.
 * @returns {string} at most `limit` characters.
 */
function clip(text, limit) {
  if (text.length <= limit) return text
  if (limit <= 1) return text.slice(0, Math.max(0, limit))
  return `${text.slice(0, limit - 1)}…`
}

/**
 * Build the digest of a session event log.
 *
 * The input is the same event array `sessionQuery.observeSession()` exposes, so
 * the caller needs no knowledge of chat nodes: `user/message`,
 * `assistant/message`, `tool/call`, `compaction/summary` and `turn/start` are
 * the only event types read.
 *
 * @param {unknown} events - session events, in log order.
 * @param {{ limits?: Partial<typeof DIGEST_LIMITS> }} [options] - cap overrides.
 * @returns {{ turns: Array<{ turn: number, user: string, assistant: string, tools: string[] }>, summary: string, chars: number, omittedTurns: number }} the digest.
 */
export function buildDigest(events, options = {}) {
  const limits = { ...DIGEST_LIMITS, ...(options.limits ?? {}) }
  const order = []
  const byTurn = new Map()
  let summary = ''
  let turn = null

  const ensure = (value) => {
    if (!byTurn.has(value)) {
      byTurn.set(value, { turn: value, user: '', assistant: '', tools: [] })
      order.push(value)
    }
    return byTurn.get(value)
  }

  for (const event of Array.isArray(events) ? events : []) {
    if (event === null || typeof event !== 'object') continue
    const data = event.data ?? {}
    if (event.type === 'turn/start') {
      const value = data.turn
      if (Number.isFinite(value)) {
        turn = value
        ensure(value)
      }
      continue
    }
    if (event.type === 'compaction/summary') {
      const text = textOf(data.summary, ['text'])
      if (text.length > 0) summary = text
      continue
    }
    const owner = Number.isFinite(data.turn) ? data.turn : turn
    if (!Number.isFinite(owner)) continue

    if (event.type === 'user/message') {
      const text = textOf(data.content, ['text'])
      if (text.length > 0) {
        const entry = ensure(owner)
        entry.user = entry.user.length > 0 ? `${entry.user}\n\n${text}` : text
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const message = data.message ?? {}
      // Only text blocks: reasoning is the single largest layer in a long
      // session and carries no conclusion the answer can cite.
      const text = textOf(message.content, ['text'])
      if (text.length > 0) {
        const entry = ensure(owner)
        entry.assistant = entry.assistant.length > 0 ? `${entry.assistant}\n\n${text}` : text
      }
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block === null || typeof block !== 'object' || block.type !== 'tool-call') continue
        if (typeof block.name !== 'string' || block.name.length === 0) continue
        ensure(owner).tools.push(block.name)
      }
      continue
    }
    // `tool/call` carries the same name as the block above; `tool/result` is
    // deliberately ignored, as is every other event type.
  }

  const turns = []
  for (const value of order) {
    const entry = byTurn.get(value)
    turns.push({
      turn: value,
      user: clip(entry.user, limits.userChars),
      assistant: clip(entry.assistant, limits.assistantChars),
      tools: entry.tools.slice(0, limits.toolsPerTurn).map((name) => clip(name, limits.toolNameChars)),
    })
  }

  let summaryText = clip(summary, limits.summaryChars)
  const size = (list) => list.reduce((total, entry) => total
    + entry.user.length + entry.assistant.length
    + entry.tools.reduce((sum, name) => sum + name.length + 2, 0), 0)
  const total = () => size(turns) + summaryText.length

  // Trim the oldest turn first: the nearest history is the most relevant, and
  // the summary already stands in for whatever was folded away.
  let omittedTurns = 0
  while (total() > limits.totalChars && turns.length > 1) {
    turns.shift()
    omittedTurns += 1
  }
  // Then shrink each turn's supporting layers, keeping the user line longest.
  for (const keep of [0.5, 0.25, 0]) {
    if (total() <= limits.totalChars) break
    for (const entry of turns) {
      entry.assistant = clip(entry.assistant, Math.floor(limits.assistantChars * keep))
      entry.tools = keep === 0 ? [] : entry.tools
    }
  }
  // The summary is the last thing to give up room: it is the only view of the
  // turns that were folded away before this digest started.
  if (total() > limits.totalChars) {
    summaryText = clip(summaryText, Math.max(0, limits.totalChars - size(turns)))
  }

  return { turns, summary: summaryText, chars: total(), omittedTurns }
}

/**
 * Render a digest as the `<history>` block of the request context.
 * @param {ReturnType<typeof buildDigest>} digest - digest to render.
 * @returns {string} the block, or an empty string when the digest is empty.
 */
export function renderDigest(digest) {
  if (digest === null || typeof digest !== 'object') return ''
  const blocks = []
  if (digest.summary.length > 0) {
    blocks.push('<summary>', digest.summary, '</summary>')
  }
  if (digest.turns.length > 0) {
    blocks.push('<history>')
    for (const turn of digest.turns) {
      const attributes = [`n="${turn.turn}"`]
      if (turn.tools.length > 0) attributes.push(`tools="${turn.tools.join(',')}"`)
      blocks.push(`<turn ${attributes.join(' ')}>`)
      if (turn.user.length > 0) blocks.push('<user>', turn.user, '</user>')
      if (turn.assistant.length > 0) blocks.push('<assistant>', turn.assistant, '</assistant>')
      blocks.push('</turn>')
    }
    blocks.push('</history>')
  }
  return blocks.join('\n')
}
