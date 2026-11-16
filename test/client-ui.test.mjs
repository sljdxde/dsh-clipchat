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
