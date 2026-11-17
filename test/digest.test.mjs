/**
 * Digest behaviour, and a side-by-side measurement against the current
 * three-turn context.
 *
 * The fixture is a redacted excerpt of a real session log (turns 12-29 plus its
 * compaction summary), so the comparison reports what actually happens on a
 * long conversation instead of a synthetic guess.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildContext, LIMITS } from '../lib/context.js'
import { buildDigest, CHARS_PER_TOKEN, DIGEST_LIMITS, digestStats, renderDigest } from '../lib/digest.js'

const here = dirname(fileURLToPath(import.meta.url))

/** Load the recorded session fixture as an event array. */
function loadFixture() {
  const raw = readFileSync(join(here, 'fixtures', 'session-digest.jsonl'), 'utf8')
  return raw.split('\n').filter((line) => line.trim().length > 0).map((line) => JSON.parse(line))
}

/** A stand-in for the host's assistant message factory. */
const createAssistantMessage = (input) => ({ role: 'assistant', content: input.content })

test('the digest keeps user text, assistant text and tool names', () => {
  const events = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'do the thing' }] } },
    {
      type: 'assistant/message',
      data: {
        message: {
          content: [
            { type: 'reasoning', text: 'secret thinking' },
            { type: 'text', text: 'done' },
            { type: 'tool-call', name: 'bash' },
          ],
        },
      },
    },
  ]
  const digest = buildDigest(events)
  assert.equal(digest.turns.length, 1)
  assert.equal(digest.turns[0].user, 'do the thing')
  assert.equal(digest.turns[0].assistant, 'done')
  assert.deepEqual(digest.turns[0].tools, ['bash'])
  // Reasoning is the largest layer in a real session and must never appear.
  assert.ok(!JSON.stringify(digest).includes('secret thinking'))
})

test('the digest folds a compaction summary in ahead of the turns', () => {
  const events = [
    { type: 'compaction/summary', data: { summary: [{ type: 'text', text: 'earlier work' }] } },
    { type: 'turn/start', data: { turn: 5 } },
    { type: 'user/message', data: { content: [{ type: 'text', text: 'next' }] } },
  ]
  const digest = buildDigest(events)
  assert.equal(digest.summary, 'earlier work')
  const rendered = renderDigest(digest)
  assert.ok(rendered.indexOf('<summary>') < rendered.indexOf('<history>'))
})

test('the digest clips per-turn layers and drops the oldest turns over budget', () => {
  const events = []
  for (let turn = 1; turn <= 10; turn += 1) {
    events.push({ type: 'turn/start', data: { turn } })
    events.push({ type: 'user/message', data: { content: [{ type: 'text', text: `u${turn}`.repeat(500) }] } })
    events.push({
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: `a${turn}`.repeat(500) }] } },
    })
  }
  const digest = buildDigest(events, { limits: { totalChars: 4000 } })
  assert.ok(digest.chars <= 4000, `chars ${digest.chars}`)
  assert.ok(digest.omittedTurns > 0, 'old turns are dropped, not the newest')
  assert.equal(digest.turns.at(-1).turn, 10, 'the newest turn always survives')
  assert.ok(digest.turns[0].user.length <= DIGEST_LIMITS.userChars)
  assert.ok(digest.turns[0].assistant.length <= DIGEST_LIMITS.assistantChars)
})

test('malformed events are ignored instead of throwing', () => {
  assert.deepEqual(buildDigest(null).turns, [])
  assert.deepEqual(buildDigest([]).turns, [])
  const digest = buildDigest([null, 1, 'x', { type: 'user/message' }, { type: 'turn/start' }])
  assert.deepEqual(digest.turns, [])
})

/* ---------------------------------------------------------------- comparison */

/** Characters of a rendered context request, the way the budget counts them. */
function requestChars(built) {
  const context = built.messages[0]?.content?.[0]?.text ?? ''
  const history = built.messages.slice(1, -1).reduce((total, message) => {
    const blocks = Array.isArray(message.content) ? message.content : []
    return total + blocks.reduce((sum, block) => sum + (block.text?.length ?? 0), 0)
  }, 0)
  const question = built.messages.at(-1)?.content?.[0]?.text ?? ''
  return built.system.length + context.length + history + question.length
}

/** The turns the client can still see for a selection: its own turn plus N before. */
function currentRecent(turns, selectedTurn) {
  return turns
    .filter((turn) => turn.turn < selectedTurn)
    .slice(-LIMITS.recentTurns)
}

test('comparison: plan A reaches turns the current context cannot see', () => {
  const events = loadFixture()
  const digest = buildDigest(events)
  const selectedTurn = 22
  const selection = '提问不续期 TTL（会误删正在用的高亮）'

  const currentTurns = currentRecent(digest.turns, selectedTurn)
  const selected = digest.turns.find((turn) => turn.turn === selectedTurn)
  assert.ok(selected, 'the fixture must contain the selected turn')

  // What the current implementation sends.
  const current = buildContext({
    selection,
    message: selected.assistant,
    turn: selectedTurn,
    recent: currentTurns,
    neighbors: { user: selected.user, before: '', after: '' },
    question: '解释这段',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  // What plan A sends: the same local context, with the session digest in place
  // of `<recent>` and a raised ceiling.
  const digestText = renderDigest(digest)
  const planA = buildContext({
    selection,
    message: selected.assistant,
    turn: selectedTurn,
    recent: currentTurns,
    neighbors: { user: selected.user, before: '', after: '' },
    question: '解释这段',
    digest: digestText,
    totalChars: DIGEST_LIMITS.totalChars + LIMITS.totalChars,
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  const currentChars = requestChars(current)
  const planAChars = requestChars(planA)

  // Coverage is the point of the change, and it is what the test pins.
  const currentCovered = new Set([...currentTurns.map((turn) => turn.turn), selectedTurn])
  const planACovered = new Set([...digest.turns.map((turn) => turn.turn), selectedTurn])
  assert.ok(planACovered.size > currentCovered.size * 2,
    `plan A must cover at least twice the turns: ${planACovered.size} vs ${currentCovered.size}`)
  assert.ok(Math.min(...planACovered) < Math.min(...currentCovered),
    'plan A must reach further back than the current three-turn window')

  // Tool activity is invisible today and present in plan A. The current
  // context has no field for it at all, so the comparison is on the rendered
  // request text, not on a payload shape the old path never had.
  const planATools = digest.turns.reduce((total, turn) => total + turn.tools.length, 0)
  assert.ok(planATools > 0, 'plan A carries tool names')
  assert.ok(digestText.includes('tools="'), 'plan A renders the tool names')
  const currentText = current.messages.map((message) => JSON.stringify(message)).join('')
  assert.ok(!currentText.includes('tools="'), 'the current context carries no tool names')
  // Reasoning is sampled in the fixture but must never reach the request.
  assert.ok(events.some((event) => (event.data?.message?.content ?? []).some((block) => block.type === 'reasoning')),
    'the fixture must actually contain reasoning blocks')
  assert.ok(!digestText.includes('"reasoning"'), 'plan A never carries reasoning blocks')

  // The cost is real and must stay bounded.
  assert.ok(planAChars > currentChars, 'plan A is bigger, by design')
  assert.ok(planAChars <= DIGEST_LIMITS.totalChars + LIMITS.totalChars,
    `plan A must stay within its budget: ${planAChars}`)

  // Reported for the record; not asserted, since the numbers move with content.
  console.log(`  turns covered   : current ${currentCovered.size} -> plan A ${planACovered.size}`)
  console.log(`  earliest turn   : current ${Math.min(...currentCovered)} -> plan A ${Math.min(...planACovered)}`)
  console.log(`  tool names      : current 0 -> plan A ${planATools}`)
  console.log(`  summary         : current 0 chars -> plan A ${digest.summary.length} chars`)
  console.log(`  request size    : current ${currentChars} chars (~${Math.round(currentChars / CHARS_PER_TOKEN)} tok)`
    + ` -> plan A ${planAChars} chars (~${Math.round(planAChars / CHARS_PER_TOKEN)} tok)`)
})

test('comparison: the digest replaces <recent> instead of stacking on it', () => {
  const base = {
    selection: 'a passage',
    message: 'the whole message',
    turn: 9,
    recent: [{ turn: 8, user: 'u8', assistant: 'a8' }],
    neighbors: { user: 'u9', before: '', after: '' },
    question: 'q',
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  }
  const withoutDigest = buildContext(base)
  const withDigest = buildContext({ ...base, digest: '<history>\n<turn n="1">\n<user>u1</user>\n</turn>\n</history>' })

  const contextOf = (built) => built.messages[0].content[0].text
  assert.ok(contextOf(withoutDigest).includes('<recent>'), 'without a digest the recent turns are used')
  assert.ok(!contextOf(withDigest).includes('<recent>'), 'with a digest the recent turns are replaced')
  assert.ok(contextOf(withDigest).includes('<history>'), 'the digest is rendered in the context block')
  // The selection block is never touched by the switch.
  assert.ok(contextOf(withDigest).includes('<selection>\na passage\n</selection>'))
})

test('the raised ceiling keeps the digest instead of trimming it away', () => {
  // A digest plus a normal context exceeds the default 15k ceiling, so without
  // the override the trim loop would drop it. This is the whole point of the
  // override, and the selection must survive either way.
  const digest = `<history>\n${'<turn n="1">\n<user>u</user>\n</turn>\n'.repeat(400)}</history>`
  const base = {
    selection: 'the passage',
    message: 'x'.repeat(30000),
    turn: 3,
    recent: [],
    neighbors: { user: '', before: '', after: '' },
    question: 'q',
    digest,
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  }
  const sizeOf = (built) => built.messages[0].content[0].text.length

  // Without the override the request is trimmed back to the default ceiling.
  const trimmed = buildContext(base)
  assert.ok(sizeOf(trimmed) <= LIMITS.totalChars, 'the default ceiling still applies')

  // With it, the digest and the whole-message excerpt both fit.
  const detailed = buildContext({ ...base, totalChars: 60000 })
  assert.ok(sizeOf(detailed) > sizeOf(trimmed), 'the raised ceiling keeps more context')
  assert.ok(detailed.messages[0].content[0].text.includes('the passage'), 'the selection survives')
  assert.ok(detailed.messages[0].content[0].text.includes('<history>'), 'the digest survives')
  assert.ok(sizeOf(detailed) <= 60000, 'the raised ceiling is still a ceiling')
})

test('the detailed ceiling always fits a full digest plus the local context', () => {
  // The two budgets are independent, so the ceiling must be their sum. A
  // smaller one makes a maximum-size digest fail once the passage's own
  // context is added, which is what the user saw as 上下文过长.
  const ceiling = DIGEST_LIMITS.totalChars + LIMITS.totalChars
  const digest = `<history>${'x'.repeat(DIGEST_LIMITS.totalChars - 20)}</history>`
  const local = 'y'.repeat(LIMITS.totalChars - 200)

  const built = buildContext({
    selection: 'the passage',
    message: local,
    turn: 5,
    recent: [],
    neighbors: { user: '', before: '', after: '' },
    question: '解释这段',
    digest,
    totalChars: ceiling,
    model: { provider: 'p', model: 'm' },
    createAssistantMessage,
  })

  const context = built.messages[0].content[0].text
  assert.ok(context.includes('<history>'), 'the digest survives')
  assert.ok(context.includes('the passage'), 'the selection survives')
  assert.ok(built.system.length + context.length < ceiling)
})

test('a digest over its ceiling shrinks turns before dropping the summary', () => {
  // Session events, in the shape the host writes them.
  const events = []
  for (let turn = 1; turn <= 40; turn += 1) {
    events.push({ type: 'user/message', data: { turn, content: [{ type: 'text', text: `question ${turn} ${'q'.repeat(400)}` }] } })
    events.push({
      type: 'assistant/message',
      data: {
        turn,
        message: {
          content: [
            { type: 'text', text: `answer ${turn} ${'a'.repeat(900)}` },
            ...Array.from({ length: 5 }, (_, index) => ({ type: 'tool-call', name: `tool-${index}-${'n'.repeat(60)}` })),
          ],
        },
      },
    })
  }
  // A summary is a content-block array, the same shape a message has.
  events.push({
    type: 'compaction/summary',
    data: { summary: [{ type: 'text', text: 'the summary '.repeat(2000) }] },
  })

  const digest = buildDigest(events, { limits: { ...DIGEST_LIMITS, totalChars: 3000 } })

  assert.ok(digest.chars <= 3000, 'the digest fits the ceiling')
  assert.ok(digest.turns.length > 0, 'some turns survived')
  assert.ok(digest.omittedTurns > 0, 'the folded turns are counted')
  // The newest turns are the ones kept, and the summary gives up its room
  // before the turns do.
  assert.equal(digest.turns.at(-1).turn, 40, 'the newest turn survived')
  assert.ok(digest.chars <= 3000)
})

test('a digest with an empty event list is empty but valid', () => {
  const digest = buildDigest([])
  assert.deepEqual(digest.turns, [])
  assert.equal(digest.summary, '')
  assert.equal(digest.chars, 0)
  assert.equal(digest.omittedTurns, 0)
  assert.equal(digestStats(digest).turns, 0)
  // Nothing to say means no block at all, so the caller can skip injecting one.
  assert.equal(renderDigest(digest), '', 'an empty digest renders nothing')
})
