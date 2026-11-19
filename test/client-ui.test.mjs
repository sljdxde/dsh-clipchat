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
    { children: [{ text: 'b' }], strong: true },
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
    { turns: [{ question: 'old q', answer: 'old a' }] },
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
  const turns = plugin.__test.threadTurns([], null, { turns: [{ question: 'old q', answer: 'old a' }] })
  assert.deepEqual(turns, [{ question: 'old q', answer: 'old a', streaming: false, error: '', attachments: [], snippets: [], usage: null }])
  assert.deepEqual(plugin.__test.threadTurns([], null, null), [])
  // Every turn of a multi-question record shows, oldest first.
  const many = plugin.__test.threadTurns([], null, {
    turns: [
      { question: 'q1', answer: 'a1' },
      { question: 'q2', answer: 'a2' },
    ],
  })
  assert.deepEqual(many.map((turn) => [turn.question, turn.answer]), [['q1', 'a1'], ['q2', 'a2']])
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
  const payload = plugin.__test.insertPayloadOf('passage', [{ question: 'why?', answer: 'because' }])
  assert.ok(payload.quote.startsWith('passage'), 'the passage leads the quote')
  assert.ok(payload.quote.includes('〔滑词〕'), 'the marker names the thread')
  assert.equal(payload.quote, payload.quote.trim())
  assert.ok(payload.plain.startsWith('> passage'), 'the fallback is a blockquote')
  assert.equal(payload.plain, payload.plain.trim())
  // The fallback is blockquoted line by line, the way the host quotes text.
  assert.ok(payload.plain.split('\n').every((line) => line.startsWith('> ')), 'every line is quoted')
  assert.equal(plugin.__test.insertPayloadOf('passage', [{ question: 'why?', answer: '' }]), null)
})

test('insertPayloadOf carries the whole answer, not a 200-character summary', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const answer = `${'第一段说明。'.repeat(40)}\n\n- 第二段要点\n- 第三段要点\n\n\`\`\`js\nconst x = 1\n\`\`\``
  const payload = plugin.__test.insertPayloadOf('passage', [{ question: 'why?', answer }])
  assert.ok(payload.quote.includes(answer), 'the complete answer is present')
  assert.ok(payload.quote.length > 250, `length ${payload.quote.length}`)
  assert.ok(payload.quote.includes('\n'), 'line breaks survive')
  assert.ok(payload.quote.includes('问：why?'))
  // What the composer *shows* is the compact summary, not the answer itself.
  assert.equal(payload.summary.label.includes('第一段说明'), false)
  assert.ok(payload.summary.body.length <= 61, 'the inline body stays short')
})

test('insertPayloadOf carries every turn of the thread, oldest first', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const turns = [
    { question: '第一问', answer: '第一答\n- 要点 A\n- 要点 B' },
    { question: '第二问', answer: '```js\nconst second = 2\n```' },
    // A turn that never got an answer must not leave an empty block behind.
    { question: '第三问', answer: '' },
    { question: '第四问', answer: '第四答' },
  ]
  const payload = plugin.__test.insertPayloadOf('passage', turns)
  assert.ok(payload.quote.includes('问：第一问'), 'the first question is carried')
  assert.ok(payload.quote.includes('第一答\n- 要点 A\n- 要点 B'), 'the first answer keeps its shape')
  assert.ok(payload.quote.includes('问：第二问'), 'the second question is carried')
  assert.ok(payload.quote.includes('const second = 2'), 'the second answer keeps its code block')
  assert.ok(payload.quote.includes('问：第四问'), 'the newest question is carried too')
  assert.equal(payload.quote.includes('问：第三问'), false, 'an unanswered turn is skipped')
  assert.ok(
    payload.quote.indexOf('第一问') < payload.quote.indexOf('第二问')
    && payload.quote.indexOf('第二问') < payload.quote.indexOf('第四问'),
    'turns stay in order',
  )
  // The transcript is not a single-turn payload: it keeps every separator.
  assert.ok(payload.quote.includes('\n\n---\n\n'), 'rounds are visibly separated')
  assert.equal(payload.summary.label, '〔滑词〕3 轮问答', 'the chip counts only answered rounds')
})

test('the composer summary stays small while the quote carries everything', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const payload = plugin.__test.insertPayloadOf('a long selected passage', [
    { question: '第一问', answer: 'A'.repeat(500) },
    { question: '第二问', answer: 'B'.repeat(500) },
  ])
  assert.equal(payload.summary.label, '〔滑词〕2 轮问答')
  assert.ok(payload.summary.title.startsWith('选段：'), 'the popover names the selection')
  assert.ok(payload.summary.detail.includes('2 轮问答'), 'the popover counts the rounds')
  assert.equal(payload.summary.body, '第二问', 'the chip shows the newest question')
  assert.ok(
    payload.summary.label.length + payload.summary.body.length < 60,
    'what the composer shows stays one small chip',
  )
  assert.ok(payload.quote.length > 1000, 'the quote itself still carries both answers')
})

test('insertPayloadOf cuts only a runaway transcript, and says so', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const huge = plugin.__test.insertPayloadOf('passage', [
    { question: 'q1', answer: '答'.repeat(12000) },
    { question: 'q2', answer: '答'.repeat(12000) },
  ])
  assert.ok(huge.quote.length < 21000, `length ${huge.quote.length}`)
  assert.ok(huge.quote.includes('已截断'))
  assert.ok(huge.quote.includes('passage'))
  // The blockquote fallback is cut at the same place, never a second time.
  assert.ok(huge.plain.includes('已截断'))
})

test('turnsOfResult prefers every stored turn and falls back to the flat pair', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const many = [{ question: 'q1', answer: 'a1' }, { question: 'q2', answer: 'a2' }]
  assert.deepEqual(plugin.__test.turnsOfResult({ turns: many, question: 'q2', answer: 'a2' }), many)
  assert.deepEqual(
    plugin.__test.turnsOfResult({ question: 'old q', answer: 'old a' }),
    [{ question: 'old q', answer: 'old a' }],
  )
  assert.deepEqual(plugin.__test.turnsOfResult(null), [{ question: undefined, answer: undefined }])
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
  // The step segment is the turn; the leading segment is only a sequence.
  assert.equal(plugin.__test.turnOfNodeKey('14:assistant-step22:51'), 22)
  assert.equal(plugin.__test.turnOfNodeKey('14:assistant-step17:65'), 17)
  assert.equal(plugin.__test.turnOfNodeKey('7:user1:0'), 7)
  assert.equal(plugin.__test.turnOfNodeKey('nope'), null)
  assert.equal(plugin.__test.turnOfNodeKey('0:x'), null)
  assert.equal(plugin.__test.turnOfNodeKey(null), null)
})

test('an answer renders as blocks instead of raw Markdown', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const blocks = plugin.__test.answerBlocks([
    '### 它要解决的问题',
    '',
    '第一段**加粗**和 `code`。',
    '',
    '- 要点一',
    '- 要点二',
    '',
    '1. 第一步',
    '2. 第二步',
    '',
    '> 引用一句',
  ].join('\n'))
  assert.deepEqual(blocks.map((block) => block.kind), ['h', 'p', 'ul', 'ol', 'quote'])
  assert.equal(blocks[0].level, 3)
  assert.equal(blocks[0].text, '它要解决的问题')
  assert.deepEqual(blocks[2].items.map((item) => item.text), ['要点一', '要点二'])
  assert.deepEqual(blocks[3].items.map((item) => item.text), ['第一步', '第二步'])
  assert.equal(blocks[4].text, '引用一句')
})

test('the clipboard text of an answer drops block markers', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.equal(plugin.__test.answerPlain('### 标题\n\n正文'), '标题\n\n正文')
  assert.equal(plugin.__test.answerPlain('- a\n- b'), '- a\n- b')
  assert.equal(plugin.__test.answerPlain('1. a\n2. b'), '1. a\n2. b')
  assert.equal(plugin.__test.answerPlain('> 引用'), '“引用”')
  assert.equal(plugin.__test.answerPlain(''), '')
})

test('the detail strip lists what the request actually carries', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const pieces = {
    selection: 'x'.repeat(100),
    message: 'y'.repeat(200),
    neighbors: { user: 'a'.repeat(10), before: '', after: '' },
    recent: [{ user: 'b'.repeat(20), assistant: 'c'.repeat(30) }],
  }

  // Off: four rows, total is the sum of the local context.
  const off = plugin.__test.contextRowsOf({ ...pieces, stats: null })
  assert.deepEqual(off.rows.map((row) => row.id), ['selection', 'message', 'neighbors', 'recent'])
  assert.equal(off.chars, 100 + 200 + 10 + 50)
  assert.equal(off.rows.every((row) => row.isNew === undefined), true)

  // On: the recent row is marked replaced and the digest rows are marked new.
  const on = plugin.__test.contextRowsOf({
    ...pieces,
    stats: { turns: 18, tools: 207, summaryChars: 8000, chars: 42000, tokens: 26250 },
  })
  assert.deepEqual(on.rows.map((row) => row.id), ['selection', 'message', 'neighbors', 'recent', 'turns', 'tools', 'summary'])
  assert.equal(on.rows.find((row) => row.id === 'recent').isOff, true)
  assert.deepEqual(on.rows.filter((row) => row.isNew === true).map((row) => row.id), ['turns', 'tools', 'summary'])
  assert.equal(on.chars, off.chars + 42000)
  assert.ok(on.tokens > off.tokens)
})

test('fillTemplate replaces known placeholders and leaves unknown ones', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.equal(plugin.__test.fillTemplate('全史 {turns} 轮', { turns: 18 }), '全史 18 轮')
  assert.equal(plugin.__test.fillTemplate('{a}-{b}', { a: 1 }), '1-{b}')
  assert.equal(plugin.__test.fillTemplate('', {}), '')
  assert.equal(plugin.__test.fillTemplate(null, {}), '')
})
