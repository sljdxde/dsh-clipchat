import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadBundle, makeReact } from './helpers/load-client.mjs'

test('the disabled-conversation notice uses the locale t prop', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const view = plugin.__test.ClipNotice({ dismiss() {}, t: (key) => `T:${key}` })
  const text = JSON.stringify(view)
  assert.match(text, /T:title/)
  assert.match(text, /T:unavailable/)
  assert.throws(() => plugin.__test.ClipNotice({ dismiss() {} }), /t is not a function/)
})

test('presets expose four localized one-click questions', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const presets = plugin.__test.presetList((key) => `T:${key}`)
  assert.deepEqual(presets.map((preset) => preset.id), ['explain', 'translate', 'critique', 'example'])
  assert.equal(presets.length, 4)
  for (const preset of presets) {
    assert.match(preset.label, /^T:preset/)
    assert.match(preset.question, /^T:preset/)
    assert.notEqual(preset.label, preset.question, 'label and question are separate strings')
  }
})

test('inlineParts keeps bold and code but leaves everything else literal', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.deepEqual(plugin.__test.inlineParts('a **b** `c` <d>'), [
    { text: 'a ' },
    { text: 'b', strong: true },
    { text: ' ' },
    { text: 'c', code: true },
    { text: ' <d>' },
  ])
  assert.deepEqual(plugin.__test.inlineParts('plain'), [{ text: 'plain' }])
  assert.deepEqual(plugin.__test.inlineParts(''), [])
  assert.deepEqual(plugin.__test.inlineParts(null), [])
  assert.deepEqual(plugin.__test.inlineParts('**open'), [{ text: '**open' }])
})

test('threadTurns keeps the recalled record, completed pairs and the in-flight turn in order', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const turns = plugin.__test.threadTurns(
    [
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
      { role: 'user', text: 'q2' },
    ],
    { question: 'q3', answer: 'partial', streaming: true, error: '' },
    { question: 'old q', answer: 'old a' },
  )
  assert.deepEqual(turns.map((turn) => [turn.question, turn.answer]), [
    ['old q', 'old a'],
    ['q1', 'a1'],
    ['q2', ''],
    ['q3', 'partial'],
  ])
  assert.equal(turns.at(-1).streaming, true)
})

test('threadTurns shows the recalled record alone before any new question', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const turns = plugin.__test.threadTurns([], null, { question: 'old q', answer: 'old a' })
  assert.deepEqual(turns, [{ question: 'old q', answer: 'old a', streaming: false, error: '' }])
  assert.deepEqual(plugin.__test.threadTurns([], null, null), [])
})

test('recordToggleLabel offers 留痕 until an answer is kept, then 取消留痕', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const translate = (key) => `T:${key}`
  assert.equal(plugin.__test.recordToggleLabel(null, translate), 'T:record')
  assert.equal(plugin.__test.recordToggleLabel('r1', translate), 'T:unrecord')
})

test('insertPayloadOf never starts or ends with a newline', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const payload = plugin.__test.insertPayloadOf('passage', 'why?', 'because')
  assert.ok(payload.text.startsWith('〔滑词〕'), 'summary text starts with the marker')
  assert.equal(payload.text, payload.text.trim())
  assert.ok(payload.plain.startsWith('> passage'), 'plain fallback starts with the quote')
  assert.equal(payload.plain, payload.plain.trim())
  assert.equal(plugin.__test.insertPayloadOf('passage', 'why?', ''), null)
})

test('removing a highlight also targets the records kept for that passage', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const entries = [
    { id: 'r1', highlightId: 'h1', selection: 'same passage' },
    { id: 'r2', selection: 'same passage' },
    { id: 'r3', highlightId: 'h1', selection: 'other' },
    { id: 'r4', highlightId: 'h2', selection: 'elsewhere' },
    { id: '', selection: 'same passage' },
    null,
  ]
  assert.deepEqual(plugin.__test.recordIdsOfHighlight(entries, 'h1', 'same passage'), ['r1', 'r2', 'r3'])
  assert.deepEqual(plugin.__test.recordIdsOfHighlight(entries, null, 'same passage'), ['r1', 'r2'])
  assert.deepEqual(plugin.__test.recordIdsOfHighlight([], 'h1', 'x'), [])
  assert.deepEqual(plugin.__test.recordIdsOfHighlight(undefined, 'h1', 'x'), [])
})

test('a record resolves to the highlight of its passage', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const anchor = { nodeKey: '9:assistant-step1:1', sourceIndex: 0, spans: [{ blockIndex: 0, start: 0, end: 7 }], text: 'passage' }
  const id = plugin.__test.addHighlight(anchor, null)
  assert.equal(typeof id, 'string')

  assert.equal(plugin.__test.highlightIdOfRecord({ highlightId: id, selection: 'passage' }), id)
  assert.equal(plugin.__test.highlightIdOfRecord({ selection: 'passage' }), id, 'older records match by text')
  assert.equal(plugin.__test.highlightIdOfRecord({ highlightId: 'missing', selection: 'passage' }), id)
  assert.equal(plugin.__test.highlightIdOfRecord({ highlightId: 'missing', selection: 'gone' }), null)
  assert.equal(plugin.__test.highlightIdOfRecord(null), null)
})

test('a chat node key yields its turn number', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.equal(plugin.__test.turnOfNodeKey('14:assistant-step22:51'), 14)
  assert.equal(plugin.__test.turnOfNodeKey('7:user1:0'), 7)
  assert.equal(plugin.__test.turnOfNodeKey('nope'), null)
  assert.equal(plugin.__test.turnOfNodeKey('0:x'), null)
  assert.equal(plugin.__test.turnOfNodeKey(null), null)
})
