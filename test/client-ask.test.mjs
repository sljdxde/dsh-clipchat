import { test } from 'node:test'
import assert from 'node:assert/strict'

/** Load the browser bundle through a fake ModuleLoader, returning its test hooks. */
async function loadPlugin() {
  let definition
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  globalThis.document = {
    head: { appendChild() {} },
    createElement() {
      return { dataset: {}, style: {}, textContent: '', remove() {} }
    },
    getSelection() { return null },
  }
  const url = new URL('../client.js', import.meta.url)
  await import(`${url.href}?v=${Date.now()}`)
  assert.ok(definition, 'bundle registered itself')
  const react = {
    createElement: (...args) => ({ args }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  }
  return definition.factory(() => react).__test
}

const test_ = await loadPlugin()

test('SSE decoder yields one frame per data block', () => {
  const decoder = test_.createSseDecoder()
  assert.deepEqual(decoder.push('data: {"type":"delta","text":"a"}\n\n'), [{ type: 'delta', text: 'a' }])
  assert.deepEqual(decoder.push('data: {"type":"done"}\n\n'), [{ type: 'done' }])
})

test('SSE decoder reassembles frames split across chunks and handles CRLF', () => {
  const decoder = test_.createSseDecoder()
  assert.deepEqual(decoder.push('data: {"type":"del'), [])
  assert.deepEqual(decoder.push('ta","text":"b"}\r\n\r\n'), [{ type: 'delta', text: 'b' }])

  assert.deepEqual(decoder.push('data: {"type":"delta","text":"c"}\n\ndata: {"type":"usage","usage":{"inputTokens":1}}\n\n'), [
    { type: 'delta', text: 'c' },
    { type: 'usage', usage: { inputTokens: 1 } },
  ])
})

test('SSE decoder ignores malformed frames and event lines', () => {
  const decoder = test_.createSseDecoder()
  assert.deepEqual(decoder.push('event: ping\ndata: {oops\n\n'), [])
  assert.deepEqual(decoder.push('data: {"type":"done"}\n\n'), [{ type: 'done' }])
})

test('assistant text extraction keeps only text blocks', () => {
  const node = {
    kind: 'assistant-step',
    data: {
      status: 'settled',
      turn: 4,
      blocks: [
        { kind: 'text', text: 'first paragraph' },
        { kind: 'reasoning', text: 'internal reasoning' },
        { kind: 'tool-call' },
        { kind: 'text', text: 'second paragraph' },
      ],
    },
  }
  assert.equal(test_.assistantTextOf(node), 'first paragraph\n\nsecond paragraph')
  assert.equal(test_.assistantTextOf(undefined), '')
})

test('user text extraction keeps only text content blocks', () => {
  const node = {
    kind: 'user',
    content: [{ type: 'text', text: 'a question' }, { type: 'image', source: {} }],
  }
  assert.equal(test_.userTextOf(node), 'a question')
})

/** A three-piece fake Chat snapshot for recent-turn extraction. */
function makeSnapshot({ selectedTurn = 5, openTurns = [] } = {}) {
  const nodes = new Map([
    ['5:assistant-step1:1', {
      kind: 'assistant-step',
      visibility: 'visible',
      location: { kind: 'step', turn: { turn: 5 } },
      data: { status: 'settled', turn: 5, blocks: [{ kind: 'text', text: 'target answer' }] },
    }],
  ])
  const turns = new Map()
  for (const turn of [1, 2, 3, 4, 5]) {
    const status = openTurns.includes(turn) ? 'open' : 'closed'
    turns.set(turn, { turn, status })
    if (turn !== selectedTurn) {
      nodes.set(`${turn}:user1:0`, {
        kind: 'user',
        visibility: 'visible',
        location: { kind: 'turn', turn: { turn } },
        content: [{ type: 'text', text: `u${turn}` }],
      })
      nodes.set(`${turn}:assistant-step1:1`, {
        kind: 'assistant-step',
        visibility: 'visible',
        location: { kind: 'step', turn: { turn } },
        data: {
          status: 'settled',
          turn,
          blocks: [
            { kind: 'text', text: `a${turn}` },
            { kind: 'reasoning', text: `r${turn}` },
            { kind: 'tool-call' },
          ],
        },
      })
    }
  }
  const keysByTurn = {}
  for (const key of nodes.keys()) {
    const turn = Number(key.slice(0, key.indexOf(':')))
    ;(keysByTurn[turn] ??= []).push(key)
  }
  return {
    nodes: { get: (key) => nodes.get(key) },
    timeline: { turnOrder: [1, 2, 3, 4, 5], turns },
    locations: { getTurn: (turn) => keysByTurn[turn] ?? [] },
  }
}

test('recent turns resolve through useChat: last three completed turns before the selection', () => {
  const turns = test_.recentTurnsOf(makeSnapshot(), '5:assistant-step1:1', 3)
  assert.deepEqual(turns.map((turn) => turn.turn), [2, 3, 4])
  assert.deepEqual(turns.at(-1), { turn: 4, user: 'u4', assistant: 'a4' })
})

test('recent turns skip open turns and reasoning or tool blocks', () => {
  const turns = test_.recentTurnsOf(makeSnapshot({ openTurns: [4] }), '5:assistant-step1:1', 3)
  assert.deepEqual(turns.map((turn) => turn.turn), [1, 2, 3])
  assert.equal(turns.at(-1).assistant, 'a3')
  assert.ok(!turns.at(-1).assistant.includes('r3'), 'reasoning text is dropped')
})

test('nodeTurn prefers the location turn and falls back to assistant data', () => {
  assert.equal(test_.nodeTurn({ location: { kind: 'step', turn: { turn: 7 } } }), 7)
  assert.equal(test_.nodeTurn({ data: { turn: 9 } }), 9)
  assert.equal(test_.nodeTurn({}), undefined)
})

test('route error codes map to readable localized messages', () => {
  const translate = (key) => key
  assert.equal(test_.errorMessageOf({ error: 'no-model' }, translate), 'noModel')
  assert.equal(test_.errorMessageOf({ error: 'selection-too-long' }, translate), 'selectionTooLong')
  assert.equal(test_.errorMessageOf({ error: 'llm-unavailable' }, translate), 'llmUnavailable')
  assert.equal(test_.errorMessageOf({ error: 'unauthorized' }, translate), 'forbidden')
  assert.equal(test_.errorMessageOf({ error: 'other', message: 'detail' }, translate), 'detail')
  assert.equal(test_.errorMessageOf(undefined, translate), 'failed')
})

test('recent turns are empty when the selected node is unknown', () => {
  assert.deepEqual(test_.recentTurnsOf(makeSnapshot(), 'missing', 3), [])
  assert.deepEqual(test_.recentTurnsOf(undefined, 'missing', 3), [])
})
