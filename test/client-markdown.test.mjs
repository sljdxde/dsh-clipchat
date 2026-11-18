/**
 * Markdown rendering of an answer: parsing, inline markup, the rendered node
 * tree, and a mounted DOM check.
 *
 * The card used to recognise only headings, lists, quotes and paragraphs, so a
 * table arrived as raw pipes and a code fence as literal backticks. These tests
 * pin the shapes that were missing, plus the streaming cases that make a
 * half-written table or fence render as text instead of throwing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { installDom } from './helpers/dom.mjs'
import { loadBundle, makeReact } from './helpers/load-client.mjs'
import { mountComponent } from './helpers/mount.mjs'

/** Load the bundle with a plain React stand-in for helper-level assertions. */
async function helpers() {
  const { definition } = await loadBundle()
  return definition.factory(() => makeReact()).__test
}

/** Flatten a rendered node tree into tag names, depth-first. */
function tagsOf(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) tagsOf(child, out)
    return out
  }
  if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return out
  out.push(node.args[0])
  tagsOf(node.args.slice(2), out)
  return out
}

/** Every node with the given tag, depth-first. */
function nodesOf(node, tag, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) nodesOf(child, tag, out)
    return out
  }
  if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return out
  if (node.args[0] === tag) out.push(node)
  nodesOf(node.args.slice(2), tag, out)
  return out
}

/* --- tables */

test('a pipe table becomes head, alignment and full rows', async () => {
  const t = await helpers()
  const blocks = t.answerBlocks([
    '| 分区 | 主副本 | 从副本1 |',
    '|:---|:---:|---:|',
    '| p0 | A | B |',
    '| p1 | B |',
    '',
    '表后正文',
  ].join('\n'))

  assert.deepEqual(blocks.map((block) => block.kind), ['table', 'p'])
  assert.deepEqual(blocks[0].head, ['分区', '主副本', '从副本1'])
  assert.deepEqual(blocks[0].align, ['left', 'center', 'right'])
  // A short row is padded so every row has one cell per column.
  assert.deepEqual(blocks[0].rows, [['p0', 'A', 'B'], ['p1', 'B', '']])
  assert.equal(blocks[1].text, '表后正文')
})

test('a table without outer pipes, extra cells and an escaped pipe still parse', async () => {
  const t = await helpers()
  const table = t.answerBlocks('a | b\n--- | ---\n1 | 2 | 3\nx \\| y | z').find((b) => b.kind === 'table')
  assert.deepEqual(table.head, ['a', 'b'])
  assert.deepEqual(table.align, [null, null])
  // The extra cell is dropped, and `\|` belongs to its cell instead of splitting it.
  assert.deepEqual(table.rows, [['1', '2'], ['x | y', 'z']])
})

test('a table row ending in an escaped pipe keeps it in the cell', async () => {
  const t = await helpers()
  const table = t.answerBlocks('| a |\n| --- |\n| x \\|').find((b) => b.kind === 'table')
  assert.deepEqual(table.rows, [['x |']])
})

test('a trailing lone backslash in a cell stays literal', async () => {
  const t = await helpers()
  const table = t.answerBlocks('| a |\n| --- |\n| x\\').find((b) => b.kind === 'table')
  assert.deepEqual(table.rows, [['x\\']])
})

test('prose with a pipe is not a table', async () => {
  const t = await helpers()
  const cases = [
    'a | b', // no delimiter row: the answer ends
    'a | b\nplain line',
    'a | b\n--- | --- | ---', // column count disagrees
    'a | b\n--- | not-a-marker',
    'plain\n--- | ---',
  ]
  for (const text of cases) {
    assert.equal(t.answerBlocks(text).some((block) => block.kind === 'table'), false, text)
  }
})

/* --- fenced code */

test('a fenced block keeps its content literal and its language', async () => {
  const t = await helpers()
  const blocks = t.answerBlocks([
    '```js',
    'const a = 1 ** 2',
    'if (a) { console.log("**x**") }',
    '',
    '```',
  ].join('\n'))
  assert.deepEqual(blocks, [{
    kind: 'code',
    lang: 'js',
    text: 'const a = 1 ** 2\nif (a) { console.log("**x**") }\n',
  }])
})

test('a fence without a language, a tilde fence and an unclosed fence all render as code', async () => {
  const t = await helpers()
  assert.deepEqual(t.answerBlocks('```\nplain\n```'), [{ kind: 'code', lang: '', text: 'plain' }])
  assert.deepEqual(t.answerBlocks('~~~\nx\n~~~'), [{ kind: 'code', lang: '', text: 'x' }])
  // Streaming: the closing fence has not arrived yet.
  assert.deepEqual(t.answerBlocks('```py\nprint(1)'), [{ kind: 'code', lang: 'py', text: 'print(1)' }])
})

test('a fence only closes on its own character and a long enough run', async () => {
  const t = await helpers()
  const blocks = t.answerBlocks([
    '````',
    '```',
    'still code',
    '```',
    '````',
    'after',
  ].join('\n'))
  assert.deepEqual(blocks.map((block) => block.kind), ['code', 'p'])
  assert.equal(blocks[0].text, '```\nstill code\n```')
})

test('inline markup inside a code block is never interpreted', async () => {
  const t = await helpers()
  const nodes = t.answerView('```\n**not bold** `not code` [x](https://a.b)\n```')
  assert.deepEqual(tagsOf(nodes), ['div', 'pre', 'code'])
})

/* --- rules, quotes, lists */

test('a rule, a multi-line quote and a nested list all parse', async () => {
  const t = await helpers()
  const blocks = t.answerBlocks([
    '* * *',
    '> 第一行',
    '> 第二行',
    '- 一',
    '  - 一之一',
    '  - 一之二',
    '- 二',
    '1. 一',
    '2. 二',
  ].join('\n'))

  assert.deepEqual(blocks.map((block) => block.kind), ['hr', 'quote', 'ul', 'ol'])
  assert.equal(blocks[1].text, '第一行\n第二行')
  assert.deepEqual(blocks[2].items.map((item) => item.text), ['一', '二'])
  assert.deepEqual(blocks[2].items[0].children[0].items.map((item) => item.text), ['一之一', '一之二'])
  assert.deepEqual(blocks[3].items.map((item) => item.text), ['一', '二'])
})

test('a list continues across a blank line, an indented line continues its item, and a marker change starts a new list', async () => {
  const t = await helpers()
  const blocks = t.answerBlocks([
    '- 一',
    '',
    '- 二',
    '  补充说明',
    '- 三',
    '  - 子项',
    '1. 换了序号',
    '- 又换回',
    '正文收尾',
  ].join('\n'))

  assert.deepEqual(blocks.map((block) => block.kind), ['ul', 'ol', 'ul', 'p'])
  assert.deepEqual(blocks[0].items.map((item) => item.text), ['一', '二\n补充说明', '三'])
  // The bullet under `三` is a child list, not a sibling of the top level.
  assert.deepEqual(blocks[0].items[2].children[0].items.map((item) => item.text), ['子项'])
  assert.deepEqual(blocks[1].items.map((item) => item.text), ['换了序号'])
  assert.deepEqual(blocks[2].items.map((item) => item.text), ['又换回'])
  assert.equal(blocks[3].text, '正文收尾')
})

test('an indented list line shallower than the open list starts a new list', async () => {
  const t = await helpers()
  // An indented list is where the answer started, and the dedented line that
  // follows is a new list rather than a continuation of it.
  const blocks = t.answerBlocks('  - 一\n    - 一之一\n- 二')
  assert.deepEqual(blocks.map((block) => block.kind), ['ul', 'ul'])
  assert.deepEqual(blocks[0].items[0].children[0].items.map((item) => item.text), ['一之一'])
  assert.deepEqual(blocks[1].items.map((item) => item.text), ['二'])
})

/* --- plain text for the clipboard */

test('the clipboard text of every block kind is the way the reader sees it', async () => {
  const t = await helpers()
  assert.equal(
    t.answerPlain([
      '### 标题',
      '',
      '一段**加粗**和 `code`，见 [文档](https://a.b)。',
      '',
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '```js',
      'const a = 1 ** 2',
      '```',
      '',
      '- 一',
      '  - 一之一',
      '',
      '1. 一',
      '',
      '---',
      '',
      '> 引用',
    ].join('\n')),
    [
      '标题',
      '一段加粗和 code，见 文档。',
      'a\tb\n1\t2',
      'const a = 1 ** 2',
      '- 一\n  - 一之一',
      '1. 一',
      '---',
      '“引用”',
    ].join('\n\n'),
  )
})

/* --- inline markup */

test('inline markup covers bold, code, http links, bare labels and strikethrough', async () => {
  const t = await helpers()
  assert.deepEqual(
    t.inlineParts('**b** `c` [l](https://x.y/z) [raw](javascript:1) ~~s~~ 尾巴'),
    [
      { text: 'b', strong: true },
      { text: ' ' },
      { text: 'c', code: true },
      { text: ' ' },
      { text: 'l', href: 'https://x.y/z' },
      { text: ' ' },
      { text: 'raw' },
      { text: ' ' },
      { text: 's', strike: true },
      { text: ' 尾巴' },
    ],
  )
  // An image is not supported, so its syntax stays literal instead of becoming a link.
  assert.deepEqual(t.inlineParts('![图](https://x.y/i.png)'), [{ text: '![图](https://x.y/i.png)' }])
  assert.deepEqual(t.inlineParts(''), [])
  assert.deepEqual(t.inlineParts(null), [])
})

/* --- rendered tree */

test('a table renders a scroll box, a header row and aligned cells', async () => {
  const t = await helpers()
  const nodes = t.answerView('| a | b |\n|:--|--:|\n| 1 | **2** |')
  assert.deepEqual(tagsOf(nodes), ['div', 'table', 'thead', 'tr', 'th', 'th', 'tbody', 'tr', 'td', 'td', 'strong'])
  const wrap = nodesOf(nodes, 'div')[0]
  assert.equal(wrap.args[1].className, 'clipchat-card__tablewrap')
  const headers = nodesOf(nodes, 'th')
  assert.equal(headers[0].args[1].style.textAlign, 'left')
  assert.equal(headers[1].args[1].style.textAlign, 'right')
  assert.deepEqual(nodesOf(nodes, 'strong')[0].args.slice(2), ['2'])
})

test('a column without alignment leaves the cell style alone', async () => {
  const t = await helpers()
  const nodes = t.answerView('| a |\n| --- |\n| 1 |')
  assert.equal(nodesOf(nodes, 'th')[0].args[1].style, undefined)
})

test('a code block renders as one literal pre, with its language when it has one', async () => {
  const t = await helpers()
  const nodes = t.answerView('```js\nconst a = 1\n```')
  assert.deepEqual(tagsOf(nodes), ['div', 'span', 'pre', 'code'])
  assert.equal(nodes[0].args[1].className, 'clipchat-card__code')
  assert.deepEqual(nodesOf(nodes, 'span')[0].args.slice(2), ['js'])
  assert.deepEqual(nodesOf(nodes, 'code')[0].args.slice(2), ['const a = 1'])
  // No language badge when the fence had none.
  assert.deepEqual(tagsOf(t.answerView('```\nx\n```')), ['div', 'pre', 'code'])
})

test('links and strikethrough render as elements, and a rule as one', async () => {
  const t = await helpers()
  const nodes = t.answerView('[l](https://x.y) ~~s~~\n\n---')
  assert.deepEqual(tagsOf(nodes), ['p', 'a', 'del', 'hr'])
  const link = nodesOf(nodes, 'a')[0].args[1]
  assert.equal(link.href, 'https://x.y')
  assert.equal(link.target, '_blank')
  assert.equal(link.rel, 'noopener noreferrer')
})

test('a nested list renders children inside their parent item', async () => {
  const t = await helpers()
  const nodes = t.answerView('1. 一\n  - 一之一')
  assert.deepEqual(tagsOf(nodes), ['ol', 'li', 'ul', 'li'])
})

/* --- mounted DOM */

test('a mounted card shows a real table and code block in the answer', async () => {
  const env = installDom('')
  try {
    const answer = [
      '表格：',
      '',
      '| 分区 | 主副本 |',
      '| --- | --- |',
      '| p0 | A |',
      '',
      '```js',
      'const a = 1',
      '```',
    ].join('\n')
    let view
    const mounted = await mountComponent(
      (plugin) => {
        view = plugin.__test.answerView
        return {}
      },
      { component: () => view(answer) },
    )
    const { container } = mounted
    const table = container.querySelector('table')
    assert.ok(table, 'the table is in the DOM')
    assert.equal(table.querySelectorAll('thead th').length, 2)
    assert.equal(table.querySelectorAll('tbody td').length, 2)
    assert.equal(container.querySelector('pre code').textContent, 'const a = 1')
    assert.notEqual(container.querySelector('pre').closest('.clipchat-card__code'), null)
    await mounted.unmount()
  } finally {
    env.restore()
  }
})
