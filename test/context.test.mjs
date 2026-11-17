import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildContext, LIMITS, renderContext, SYSTEM_PROMPT } from '../lib/context.js'

/** Minimal stand-in for the host `createAssistantMessage` helper. */
function createAssistantMessage(input) {
  return {
    role: 'assistant',
    content: input.content,
    source: { kind: 'model', ...input.source },
    id: 'assistant-id',
  }
}

function input(overrides = {}) {
  return {
    selection: 'SELECTED',
    message: 'alpha beta gamma',
    turn: 4,
    recent: [],
    history: [],
    question: 'why?',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
    ...overrides,
  }
}

/** The text of the first user message, which carries `<context>`. */
function contextOf(result) {
  const message = result.messages[0]
  assert.equal(message.role, 'user')
  return message.content[0].text
}

test('orders system, context, history, then the question', () => {
  const result = buildContext(input({
    history: [
      { role: 'user', text: 'previous question' },
      { role: 'assistant', text: 'previous answer' },
    ],
  }))

  assert.equal(result.system, SYSTEM_PROMPT)
  assert.match(contextOf(result), /^<context>[\s\S]*<\/context>$/)
  assert.equal(result.messages.length, 4, 'context + user history + assistant history + question')
  assert.equal(result.messages.at(-1).content[0].text, 'why?')
})

test('context blocks keep the settled order: message, selection, recent', () => {
  const result = buildContext(input({
    turn: 7,
    recent: [{ turn: 6, user: 'u6', assistant: 'a6' }],
  }))
  const text = contextOf(result)

  const messageAt = text.indexOf('<message')
  const selectionAt = text.indexOf('<selection>')
  const recentAt = text.indexOf('<recent>')

  assert.ok(messageAt >= 0 && selectionAt >= 0 && recentAt >= 0)
  assert.ok(messageAt < selectionAt, 'whole message precedes the selection')
  assert.ok(selectionAt < recentAt, 'selection precedes recent turns')
  assert.match(text, /<message turn="7">\nalpha beta gamma\n<\/message>/)
  assert.match(text, /<selection>\nSELECTED\n<\/selection>/)
})

test('rejects a selection longer than 2000 characters instead of truncating', () => {
  const tooLong = 'x'.repeat(LIMITS.selectionChars + 1)
  assert.throws(
    () => buildContext(input({ selection: tooLong })),
    (error) => {
      assert.equal(error.code, 'selection-too-long')
      assert.match(error.message, /2000/)
      return true
    },
  )
})

test('accepts a selection of exactly 2000 characters', () => {
  const atLimit = 'x'.repeat(LIMITS.selectionChars)
  const result = buildContext(input({ selection: atLimit, message: `before ${atLimit} after` }))
  assert.ok(contextOf(result).includes(atLimit))
})

test('rejects an empty selection', () => {
  assert.throws(
    () => buildContext(input({ selection: '   ' })),
    (error) => error.code === 'empty-selection',
  )
})

test('truncates an 8k+ message around the selection, keeping 2000 chars each side', () => {
  const selection = 'THE_SELECTION'
  const message = `${'A'.repeat(5000)}${selection}${'B'.repeat(5000)}`
  const result = buildContext(input({ selection, message }))
  const text = contextOf(result)

  assert.ok(text.includes(selection), 'selection survives inside the message')
  assert.ok(text.includes('A'.repeat(2000)), 'keeps 2000 characters before the selection')
  assert.ok(text.includes('B'.repeat(2000)), 'keeps 2000 characters after the selection')
  assert.ok(!text.includes('A'.repeat(2001)), 'drops the far head')
  assert.ok(!text.includes('B'.repeat(2001)), 'drops the far tail')
  assert.ok(!text.includes('A'.repeat(5000)), 'the whole message is not sent')
})

test('prefixes an ellipsis marker when the excerpt starts mid-message', () => {
  const selection = 'MIDDLE'
  const message = `${'A'.repeat(5000)}${selection}${'B'.repeat(5000)}`
  const text = contextOf(buildContext(input({ selection, message })))
  assert.match(text, /…\n?A{2000}/)
})

test('recent turns: last three completed turns, oldest first, one turn as a unit', () => {
  const recent = [
    { turn: 2, user: 'u2', assistant: 'a2' },
    { turn: 3, user: 'u3', assistant: 'a3' },
    { turn: 4, user: 'u4', assistant: 'a4' },
    { turn: 5, user: 'u5', assistant: 'a5' },
  ]
  const text = contextOf(buildContext(input({ turn: 6, recent })))

  assert.ok(!text.includes('n="2"'), 'drops the fourth-most-recent turn')
  const order = ['n="3"', 'n="4"', 'n="5"'].map((needle) => text.indexOf(needle))
  assert.ok(order.every((at) => at >= 0))
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'turns stay in ascending order')
  assert.match(text, /<user>\nu3\n<\/user>/)
  assert.match(text, /<assistant>\na3\n<\/assistant>/)
})

test('clips each recent turn to 1500 characters in total, keeping both roles', () => {
  const recent = [{ turn: 3, user: 'u'.repeat(1000), assistant: 'a'.repeat(2000) }]
  const text = contextOf(buildContext(input({ turn: 4, recent })))
  const user = text.match(/<user>\n([\s\S]*?)\n<\/user>/)?.[1] ?? ''
  const assistant = text.match(/<assistant>\n([\s\S]*?)\n<\/assistant>/)?.[1] ?? ''

  assert.ok(user.length > 0 && assistant.length > 0, 'both roles remain represented')
  assert.ok(user.length + assistant.length <= LIMITS.turnChars)
})

test('builds assistant history through createAssistantMessage with the routed model source', () => {
  const result = buildContext(input({
    history: [
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ],
  }))

  const userHistory = result.messages[1]
  const assistantHistory = result.messages[2]

  assert.deepEqual(userHistory, { role: 'user', content: [{ type: 'text', text: 'q1' }] })
  assert.equal(assistantHistory.id, 'assistant-id', 'assistant history came from the helper')
  assert.deepEqual(assistantHistory.content, [{ type: 'text', text: 'a1' }])
  assert.deepEqual(assistantHistory.source, { kind: 'model', provider: 'p', model: 'm' })
})

test('keeps at most 12 history messages, preserving the most recent ones', () => {
  const history = Array.from({ length: 14 }, (_, index) => ({ role: 'user', text: `h${index}` }))
  const result = buildContext(input({ history }))

  const historyTexts = result.messages
    .slice(1, -1)
    .map((message) => message.content[0].text)

  assert.equal(historyTexts.length, LIMITS.historyMessages)
  assert.equal(historyTexts.at(0), 'h2')
  assert.equal(historyTexts.at(-1), 'h13')
})

test('drops the oldest rounds when the input budget is exceeded', () => {
  const recent = [
    { turn: 2, user: 'oldest-user', assistant: 'x'.repeat(1490) },
    { turn: 3, user: 'middle-user', assistant: 'y'.repeat(1490) },
    { turn: 4, user: 'newest-user', assistant: 'z'.repeat(1490) },
  ]
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: 'user',
    text: `${index}:${'h'.repeat(4000)}`,
  }))

  const result = buildContext(input({ selection: 'S'.repeat(2000), message: 'm', turn: 5, recent, history }))
  const total = contextOf(result).length
    + result.messages.slice(1).reduce((sum, message) => sum + message.content[0].text.length, 0)
  const context = contextOf(result)

  assert.ok(total <= LIMITS.totalChars, `input stays within ${LIMITS.totalChars} chars, got ${total}`)
  assert.equal(context.includes('n="4"'), true, 'keeps the newest recent turn while trimming history')
  assert.equal(context.includes('0:'), false, 'drops the oldest follow-up message first')
  assert.equal(result.messages.some((message) => message.content[0].text.startsWith('11:')), true, 'keeps the newest follow-up message')
})

test('the selection is never trimmed by the budget', () => {
  const selection = 'S'.repeat(LIMITS.selectionChars)
  const history = Array.from({ length: 12 }, () => ({ role: 'user', text: 'h'.repeat(8000) }))
  const result = buildContext(input({ selection, history }))
  assert.ok(contextOf(result).includes(selection))
})

test('questions hit the request with a leading context message even without recent turns', () => {
  const result = buildContext(input({ recent: [], history: [] }))
  assert.equal(result.messages.length, 2)
  assert.equal(result.messages.at(-1).content[0].text, 'why?')
})

test('neighbouring steps and the turn user message sit around <message>', () => {
  const result = buildContext(input({
    neighbors: { user: 'the question that produced this turn', before: 'step before', after: 'step after' },
    turn: 9,
  }))
  const text = contextOf(result)

  const order = ['<turn-user>', '<before>', '<message', '<after>', '<selection>'].map((tag) => text.indexOf(tag))
  assert.ok(order.every((at) => at >= 0), 'every neighbour block is present')
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'blocks keep the settled order')
  assert.match(text, /<turn-user>\nthe question that produced this turn\n<\/turn-user>/)
  assert.match(text, /<before>\nstep before\n<\/before>/)
  assert.match(text, /<after>\nstep after\n<\/after>/)
})

test('neighbours are clipped to their budget', () => {
  const result = buildContext(input({
    neighbors: { user: 'u'.repeat(5000), before: 'b'.repeat(5000), after: 'a'.repeat(5000) },
  }))
  const text = contextOf(result)

  assert.equal(text.match(/<turn-user>\n(u+)\n<\/turn-user>/)[1].length, LIMITS.turnUserChars)
  assert.equal(text.match(/<before>\n(b+)\n<\/before>/)[1].length, LIMITS.neighborChars)
  assert.equal(text.match(/<after>\n(a+)\n<\/after>/)[1].length, LIMITS.neighborChars)
})

test('neighbours are dropped before the message when the budget is exceeded', () => {
  const result = buildContext(input({
    selection: 'SELECTED',
    message: 'm'.repeat(3000),
    neighbors: { user: 'u'.repeat(2000), before: 'b'.repeat(2000), after: 'a'.repeat(2000) },
    question: 'why?',
  }))
  const text = contextOf(result)

  assert.ok(text.includes('SELECTED'), 'the selection is never trimmed')
  assert.ok(text.length + SYSTEM_PROMPT.length + 'why?'.length <= LIMITS.totalChars + 1)
})

test('missing or malformed neighbours are ignored', () => {
  for (const neighbors of [undefined, null, {}, { user: 5, before: {}, after: [] }]) {
    const text = contextOf(buildContext(input({ neighbors })))
    assert.ok(!text.includes('<turn-user>'))
    assert.ok(!text.includes('<before>'))
    assert.ok(!text.includes('<after>'))
  }
})

test('an empty question is refused', () => {
  assert.throws(
    () => buildContext({
      selection: 'a passage',
      message: 'the message',
      question: '   ',
      model: { provider: 'p', model: 'm' },
      createAssistantMessage,
    }),
    (error) => error.code === 'empty-question',
  )
})

test('a context over the ceiling drops neighbours before the message', () => {
  // A long message plus long neighbours: the budget forces the shrink ladder
  // through every rung.
  const long = 'x'.repeat(9000)
  const built = buildContext({
    selection: 'a passage',
    message: long,
    turn: 3,
    recent: Array.from({ length: 3 }, (_, index) => ({ turn: index + 1, user: long, assistant: long })),
    neighbors: { user: long, before: long, after: long },
    history: Array.from({ length: 12 }, () => ({ role: 'user', text: long })),
    question: 'what does it mean?',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  const context = built.messages[0].content[0].text
  assert.ok(context.includes('a passage'), 'the selection is never trimmed')
  assert.ok(context.length <= LIMITS.totalChars + 200, 'the context fits the ceiling')
})

test('a context that cannot fit even after shrinking is refused', () => {
  // The selection and the question are never trimmed, so a question big enough
  // to fill the budget on its own leaves the shrink ladder nothing to give.
  assert.throws(
    () => buildContext({
      selection: 'y'.repeat(LIMITS.selectionChars),
      message: 'z'.repeat(200_000),
      question: 'q'.repeat(LIMITS.totalChars),
      model: { provider: 'p', model: 'm' },
      createAssistantMessage,
    }),
    (error) => error.code === 'context-too-long',
  )
})

test('renderContext emits the digest block in place of recent turns', () => {
  const parts = {
    turnUser: '',
    before: '',
    message: 'the message',
    after: '',
    neighbors: { user: '', before: '', after: '' },
    selection: 'a passage',
    digest: '<summary>folded</summary>',
    recent: [],
    history: [],
    question: 'q',
  }
  const text = renderContext(parts)
  assert.ok(text.includes('<summary>folded</summary>'), 'the digest is inlined')
  assert.equal(text.includes('<recent>'), false, 'recent turns are replaced, not duplicated')
})

test('a context over the ceiling drops recent turns before neighbours', () => {
  const long = 'x'.repeat(6000)
  const built = buildContext({
    selection: 'a passage',
    message: long,
    turn: 5,
    recent: Array.from({ length: 3 }, (_, index) => ({ turn: index + 1, user: long, assistant: long })),
    neighbors: { user: 'u', before: 'b', after: 'a' },
    question: 'what does it mean?',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  const context = built.messages[0].content[0].text
  assert.ok(context.includes('a passage'), 'the selection survived')
  assert.ok(context.length <= LIMITS.totalChars + 200, 'the context fits')
})

test('recent turns are dropped once the history has been given up', () => {
  // Oversized neighbours and a full message leave no room for the recent
  // turns, so the recent list is emptied before the shrink ladder runs.
  const built = buildContext({
    selection: 'a passage',
    message: 'm'.repeat(LIMITS.messageChars),
    turn: 9,
    turnUser: 't'.repeat(LIMITS.turnUserChars),
    recent: Array.from({ length: LIMITS.recentTurns }, (_, index) => ({
      turn: index + 1,
      user: 'r'.repeat(LIMITS.turnChars),
      assistant: 'r'.repeat(LIMITS.turnChars),
    })),
    neighbors: {
      user: 'u'.repeat(LIMITS.neighborChars),
      before: 'b'.repeat(LIMITS.neighborChars),
      after: 'a'.repeat(LIMITS.neighborChars),
    },
    question: 'what does it mean?',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  const context = built.messages[0].content[0].text
  assert.ok(context.includes('a passage'), 'the selection survived')
  assert.equal(context.includes('<recent>'), false, 'every recent turn was dropped')
  assert.ok(context.length <= LIMITS.totalChars + 200, 'the context fits')
})
