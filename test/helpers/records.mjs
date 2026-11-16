/** Shared 留痕 record fixture: one valid stored record, overridable per test. */
export function makeRecord(id = 'r1', overrides = {}) {
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
