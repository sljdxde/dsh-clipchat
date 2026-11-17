/**
 * Shared record fixtures.
 *
 * A record belongs to one highlight and holds every question asked about it, so
 * the canonical shape is `{ id, selection, turns: [...] }`. For convenience the
 * factory still accepts the turn fields at the top level (`question`, `answer`,
 * `provider`, `model`, `usage`) and folds them into the single turn, which keeps
 * older tests readable. `makeLegacyRecord` produces the pre-turn shape so the
 * migration path stays covered.
 */

/** Fields that belong to a turn rather than to the record itself. */
const TURN_FIELDS = ['question', 'answer', 'provider', 'model', 'usage']

/** One valid stored record in the canonical shape, overridable per test. */
export function makeRecord(id = 'r1', overrides = {}) {
  const record = {}
  const turn = {}
  for (const [key, value] of Object.entries(overrides)) {
    if (TURN_FIELDS.includes(key)) turn[key] = value
    else record[key] = value
  }

  const createdAt = Number.isFinite(overrides.createdAt) ? overrides.createdAt : 1000
  const turns = overrides.turns ?? [makeTurn(id, { ...turn, createdAt })]
  return {
    id,
    selection: `passage-${id}`,
    createdAt,
    updatedAt: turns.reduce((newest, entry) => Math.max(newest, entry.createdAt ?? createdAt), createdAt),
    ...record,
    turns,
  }
}

/** One question/answer turn, overridable per test. */
export function makeTurn(id = 'r1', overrides = {}) {
  return {
    question: `question-${id}`,
    answer: `answer-${id}`,
    provider: 'deepseek',
    model: 'deepseek-chat',
    usage: { input: 10, output: 20 },
    createdAt: 1000,
    ...overrides,
  }
}

/** One valid stored record in the pre-turn shape, for migration tests. */
export function makeLegacyRecord(id = 'r1', overrides = {}) {
  return {
    id,
    selection: `passage-${id}`,
    question: `question-${id}`,
    answer: `answer-${id}`,
    provider: 'deepseek',
    model: 'deepseek-chat',
    usage: { input: 10, output: 20 },
    createdAt: 1000,
    ...overrides,
  }
}
