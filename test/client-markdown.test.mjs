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

/** All text under a rendered node tree, concatenated, the way the reader sees it. */
function textOf(node) {
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'string') return node
  if (node === null || typeof node !== 'object' || !Array.isArray(node.args)) return ''
  return node.args.slice(2).map(textOf).join('')
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

test('a cell keeps a backslash that does not escape punctuation', async () => {
  const t = await helpers()
  // `\U` and `\n` are not escapes: a Windows path and a literal escape
  // sequence must reach the reader unchanged, not as `C:Usersme`.
  const source = '| 路径 | 备注 |\n| --- | --- |\n| C:\\Users\\me | a\\nb |'
  const table = t.answerBlocks(source).find((block) => block.kind === 'table')
  assert.deepEqual(table.rows, [['C:\\Users\\me', 'a\\nb']])
  assert.equal(t.answerPlain(source), '路径\t备注\nC:\\Users\\me\ta\\nb')
  // Punctuation is still an escape, as GFM says: `\.` is a literal dot, so a
  // path that wants the backslash before a dot writes `\\.`. The cell text keeps
  // the pair for the inline pass, which drops the backslash it escapes.
  const dotted = '| a |\n| --- |\n| C:\\Users\\me\\.dsh |'
  assert.deepEqual(t.answerBlocks(dotted)[0].rows, [['C:\\Users\\me\\.dsh']])
  assert.equal(t.answerPlain(dotted), 'a\nC:\\Users\\me.dsh')
})

test('a cell backslash escapes ASCII punctuation only, and the cell still parses inline', async () => {
  const t = await helpers()
  // `\*` is a literal star: it must not open emphasis, and the backslash itself
  // must not reach the reader or the clipboard.
  const source = '| a |\n| --- |\n| a\\*b |'
  const table = t.answerBlocks(source).find((block) => block.kind === 'table')
  assert.deepEqual(table.rows, [['a\\*b']])
  assert.equal(t.answerPlain(source), 'a\na*b')
  const nodes = t.answerView(source)
  assert.equal(textOf(nodesOf(nodes, 'td')[0]), 'a*b')
})

test('a doubled backslash is one literal backslash and still ends the cell', async () => {
  const t = await helpers()
  // `\\|` is a literal `\` followed by a cell boundary, not an escaped pipe.
  const table = t.answerBlocks('| a | b |\n| --- | --- |\n| x\\\\ | y |').find((block) => block.kind === 'table')
  assert.deepEqual(table.rows, [['x\\\\', 'y']])
  assert.equal(t.answerPlain('| a | b |\n| --- | --- |\n| x\\\\ | y |'), 'a\tb\nx\\\ty')
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

test('an ordered list keeps the number it was written with', async () => {
  const t = await helpers()
  const source = '3. 三\n4. 四'
  assert.equal(t.answerBlocks(source)[0].start, 3)
  assert.equal(t.answerView(source)[0].args[1].start, 3)
  assert.equal(t.answerPlain(source), '3. 三\n4. 四')
  // A list that starts at one carries no attribute at all.
  assert.equal(t.answerView('1. 一')[0].args[1].start, undefined)
  assert.equal(t.answerPlain('1. 一'), '1. 一')
})

test('a fenced block inside a list item stays inside that list', async () => {
  const t = await helpers()
  const source = ['1. 步一', '   ```js', '   const a = 1', '   ```', '2. 步二'].join('\n')
  const blocks = t.answerBlocks(source)
  // One list, not two: closing the fence must not renumber `步二` from one.
  assert.equal(blocks.length, 1)
  assert.deepEqual(blocks[0].items.map((item) => item.text), ['步一', '步二'])
  assert.deepEqual(blocks[0].items[0].children, [{ kind: 'code', lang: 'js', text: 'const a = 1' }])
  assert.deepEqual(tagsOf(t.answerView(source)), ['ol', 'li', 'div', 'span', 'pre', 'code', 'li'])
  assert.equal(t.answerPlain(source), ['1. 步一', '  const a = 1', '2. 步二'].join('\n'))
})

test('a quote marker on a list continuation line is markup, not text', async () => {
  const t = await helpers()
  const source = '- a\n  > q'
  assert.equal(t.answerBlocks(source)[0].items[0].text, 'a\nq')
  assert.equal(t.answerPlain(source), '- a\nq')
})

test('a list nested thousands of levels deep is clamped, not thrown', async () => {
  const t = await helpers()
  // Indentation that grows on every line is what makes the recursive renderer
  // overflow the stack. Four levels is deeper than a card can show.
  const source = Array.from({ length: 5000 }, (_, index) => `${' '.repeat(index)}- 层${index}`).join('\n')
  const depthOf = (list) => 1 + Math.max(0, ...list.items.flatMap((item) => item.children.map(depthOf)))
  const blocks = t.answerBlocks(source)
  assert.equal(blocks.length, 1)
  assert.ok(depthOf(blocks[0]) <= 4, `nesting is clamped to four levels, got ${depthOf(blocks[0])}`)
  // The deepest lines are merged into the deepest item instead of disappearing.
  assert.ok(blocks[0].items[0].text.startsWith('层0'))
  assert.ok(t.answerPlain(source).includes('层4999'))
  assert.deepEqual(tagsOf(t.answerView(source)).slice(0, 1), ['ul'])
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
      { children: [{ text: 'b' }], strong: true },
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
  // An http(s) image is an image; a local path has nothing the card can show and
  // stays literal instead of turning into a broken link.
  assert.deepEqual(t.inlineParts('![图](https://x.y/i.png)'), [{ text: '图', href: 'https://x.y/i.png', image: true }])
  assert.deepEqual(t.inlineParts('![图](./i.png)'), [{ text: '![图](./i.png)' }])
  assert.deepEqual(t.inlineParts(''), [])
  assert.deepEqual(t.inlineParts(null), [])
})

test('a backslash escape of ASCII punctuation keeps the character, not the slash', async () => {
  const t = await helpers()
  const joined = (source) => t.inlineParts(source).map((part) => part.text).join('')
  assert.equal(joined('a\\*b \\_c\\_ \\`d\\` \\\\e'), 'a*b _c_ `d` \\e')
  // An escaped star is text: it must not open emphasis.
  assert.deepEqual(tagsOf(t.answerView('a\\*b')), ['p'])
  assert.equal(textOf(t.answerView('a\\*b')), 'a*b')
  // A backslash that is not escaping punctuation is part of the text.
  assert.equal(joined('C:\\Users\\me a\\nb'), 'C:\\Users\\me a\\nb')
  assert.equal(t.answerPlain('一段 \\*注意\\* 和 a\\nb'), '一段 *注意* 和 a\\nb')
})

test('a link scheme is read case-insensitively and a parenthesised target stays whole', async () => {
  const t = await helpers()
  assert.deepEqual(t.inlineParts('[x](HTTPS://A.B/C)'), [{ text: 'x', href: 'HTTPS://A.B/C' }])
  // A target with its own brackets is one target, not one target plus a stray `)`.
  assert.deepEqual(t.inlineParts('[x](https://a.b/a_(b))'), [{ text: 'x', href: 'https://a.b/a_(b)' }])
  assert.deepEqual(t.inlineParts('[x](https://a.b?q=1&r=2)'), [{ text: 'x', href: 'https://a.b?q=1&r=2' }])
  // A non-http target with brackets keeps the whole construct: no orphan `)`.
  assert.deepEqual(t.inlineParts('[x](javascript:alert(1))'), [{ text: '[x](javascript:alert(1))' }])
})

test('a bold run keeps the markup inside it instead of printing Markdown', async () => {
  const t = await helpers()
  const linked = t.answerView('**[文档](https://a.b)**')
  assert.deepEqual(tagsOf(linked), ['p', 'strong', 'a'])
  assert.equal(nodesOf(linked, 'a')[0].args[1].href, 'https://a.b')
  assert.equal(nodesOf(linked, 'strong')[0].args.slice(2)[0].args[0], 'a', 'the link sits inside the bold run')

  const coded = t.answerView('**`y`**')
  assert.deepEqual(tagsOf(coded), ['p', 'strong', 'code'])
  assert.deepEqual(nodesOf(coded, 'code')[0].args.slice(2), ['y'])

  for (const source of ['**[文档](https://a.b)**', '**`y`**']) {
    assert.equal(t.answerPlain(source).includes(']('), false, source)
    assert.equal(t.answerPlain(source).includes('`'), false, source)
  }
  assert.equal(t.answerPlain('**[文档](https://a.b)**'), '文档')
  assert.equal(t.answerPlain('**`y`**'), 'y')
})

test('italic runs render as emphasis, including the ones nested in bold', async () => {
  const t = await helpers()
  const nodes = t.answerView('这是 *斜体* 和 _也是斜体_。')
  assert.deepEqual(tagsOf(nodes), ['p', 'em', 'em'])
  assert.equal(textOf(nodes), '这是 斜体 和 也是斜体。')

  // `*` inside a bold run, and bold inside an italic run, each keep one wrapper.
  const nested = t.answerView('**带 *斜体* 的粗体**')
  assert.deepEqual(tagsOf(nested), ['p', 'strong', 'em'])
  assert.equal(textOf(nested), '带 斜体 的粗体')
  const reverse = t.answerView('*带 **粗体** 的斜体*')
  assert.deepEqual(tagsOf(reverse), ['p', 'em', 'strong'])
  assert.equal(textOf(reverse), '带 粗体 的斜体')

  // `***x***` is both at once.
  const both = t.answerView('***粗斜***')
  assert.deepEqual(tagsOf(both), ['p', 'strong', 'em'])
  assert.equal(textOf(both), '粗斜')

  // An underscore inside a word is part of the name, not emphasis.
  assert.equal(textOf(t.answerView('snake_case_name 与 file_name.js')), 'snake_case_name 与 file_name.js')
  // An escaped underscore is a character: it neither opens nor closes emphasis.
  assert.equal(textOf(t.answerView('a\\_b\\_c 和 \\*星\\*')), 'a_b_c 和 *星*')
})

test('an image becomes an img, and its alt text is what the clipboard gets', async () => {
  const t = await helpers()
  const nodes = t.answerView('看图：![分布图](https://e.com/a.png) 完毕')
  assert.deepEqual(tagsOf(nodes), ['p', 'img'])
  const image = nodesOf(nodes, 'img')[0].args[1]
  assert.equal(image.src, 'https://e.com/a.png')
  assert.equal(image.alt, '分布图')
  assert.equal(image.loading, 'lazy')
  assert.equal(t.answerPlain('看图：![分布图](https://e.com/a.png) 完毕'), '看图：分布图 完毕')
  // A non-http source never reaches the DOM as an image.
  assert.deepEqual(tagsOf(t.answerView('![本地](./a.png)')), ['p'])
})

test('task list items carry a checkbox, in the card and in the copy', async () => {
  const t = await helpers()
  const nodes = t.answerView('- [ ] 未完成\n- [x] 已完成')
  assert.deepEqual(tagsOf(nodes), ['ul', 'li', 'span', 'li', 'span'])
  assert.deepEqual(nodesOf(nodes, 'span').map((node) => node.args.slice(2)), [['☐ '], ['☑ ']])
  assert.equal(textOf(nodes), '☐ 未完成☑ 已完成')
  assert.equal(t.answerPlain('- [ ] 未完成\n- [x] 已完成'), '- ☐ 未完成\n- ☑ 已完成')
})

test('code spans, link titles, autolinks and setext headings are read the way Markdown writes them', async () => {
  const t = await helpers()
  // A span fenced with two backticks keeps the single tick inside it.
  const ticks = t.inlineParts('``a`b``')
  assert.deepEqual(ticks, [{ text: 'a`b', code: true }])
  // The optional link title is not part of the label, and a bare URL in angle
  // brackets is already a link.
  assert.deepEqual(t.inlineParts('[文档](https://e.com "标题")'), [{ text: '文档', href: 'https://e.com' }])
  assert.deepEqual(t.inlineParts('<https://e.com>'), [{ text: 'https://e.com', href: 'https://e.com' }])
  // `标题` over `===` is a first-level heading, over `---` a second.
  const nodes = t.answerView('标题一\n===\n\n标题二\n---')
  assert.deepEqual(tagsOf(nodes), ['h3', 'h4'])
  assert.deepEqual(nodes.map((node) => textOf(node)), ['标题一', '标题二'])
  // A nested quote is one quotation, not a line starting with `>`.
  assert.equal(textOf(t.answerView('> 第一层\n>> 第二层')), '第一层\n第二层')
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

/* --- table styles */

/**
 * The declarations that apply to one selector, in stylesheet order.
 *
 * jsdom parses the injected stylesheet, so this reads the same cascade the
 * browser uses instead of matching a string that a later edit could reformat.
 * @param {string} selector - exact selector text.
 * @returns {Array<object>} matching declaration blocks, in order.
 */
function declarationsFor(selector) {
  const out = []
  for (const sheet of globalThis.document.styleSheets) {
    for (const rule of sheet.cssRules) {
      if (rule.selectorText === undefined) continue
      const selectors = rule.selectorText.split(',').map((part) => part.trim())
      if (selectors.includes(selector)) out.push(rule.style)
    }
  }
  return out
}

/** Load the bundle and inject its stylesheet, so the CSSOM can be read. */
async function withStyles(run) {
  const env = installDom('')
  try {
    const { definition, styles } = await loadBundle()
    definition.factory(() => makeReact()).__test.ensureStyle()
    assert.equal(styles.length, 1, 'the bundle injected its stylesheet')
    await run()
  } finally {
    env.restore()
  }
}

test('a table header never wraps, so a wide grid cannot squeeze it to one character per line', async () => {
  await withStyles(() => {
    // The shared cell rule wraps everything; the later header rule wins for th,
    // which puts the header's full width into the table's minimum width. Eight
    // columns then overflow the scroll box instead of compressing one char wide.
    const headers = declarationsFor('.clipchat-card__table th')
    const wrap = headers.findIndex((style) => style.whiteSpace === 'pre-wrap')
    const nowrap = headers.map((style) => style.whiteSpace).lastIndexOf('nowrap')
    assert.ok(wrap >= 0, 'the shared th/td rule still wraps by default')
    assert.ok(nowrap > wrap, 'a later header rule keeps the header on one line')
  })
})

test('a table still fills the card and a long cell still wraps', async () => {
  await withStyles(() => {
    const table = declarationsFor('.clipchat-card__table').at(-1)
    assert.equal(table.width, '100%', 'a narrow table stretches to the card')
    assert.equal(table.tableLayout, 'auto', 'columns keep their natural widths')
    const cells = declarationsFor('.clipchat-card__table td').at(-1)
    assert.equal(cells.whiteSpace, 'pre-wrap', 'a long cell wraps instead of running on')
    // The scroll box absorbs a grid wider than the card; the card never grows.
    assert.equal(declarationsFor('.clipchat-card__tablewrap').at(-1).overflowX, 'auto')
  })
})

test('a short data cell keeps room for three characters instead of one per line', async () => {
  await withStyles(() => {
    // `pre-wrap` breaks CJK text after any character and a mixed table gives the
    // spare width to the long prose column, so a label like 主副本 used to stack
    // one character per line in a 320px card. A minimum width is what holds the
    // cell open (4.5em at the 12.5px table font is about four CJK characters);
    // the long cell still wraps and a wide grid still scrolls.
    const cells = declarationsFor('.clipchat-card__table td').at(-1)
    assert.equal(cells.whiteSpace, 'pre-wrap', 'a long cell still wraps')
    assert.ok(cells.minWidth.endsWith('em'), `the cell carries a font-relative minimum width, got ${JSON.stringify(cells.minWidth)}`)
    assert.ok(Number.parseFloat(cells.minWidth) >= 3, `${cells.minWidth} leaves room for at least three characters`)
  })
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

/* --- scale, and the fallback that keeps a broken answer readable */

test('a line of 100k unmatched brackets parses in linear time', async () => {
  const t = await helpers()
  // The label scan used to run to the end of the line at every `[`, which is
  // quadratic: this input took ~9s before the character classes excluded `[`.
  const source = '['.repeat(100_000)
  const started = performance.now()
  const nodes = t.answerView(source)
  const elapsed = performance.now() - started
  assert.ok(elapsed < 500, `answerView took ${elapsed.toFixed(0)}ms for 100k unmatched brackets`)
  assert.deepEqual(tagsOf(nodes), ['p'])
  assert.equal(textOf(nodes), source)
})

test('hostile answer text never throws out of the renderer', async () => {
  const t = await helpers()
  const deep = Array.from({ length: 5000 }, (_, index) => `${' '.repeat(index)}- 层${index}`).join('\n')
  const cases = [
    '', '\u0000', '```', '```js', '~~~', '|', '| a |', '| a |\n| --- |\n|',
    '**'.repeat(5000), '`'.repeat(5000), '['.repeat(50_000), '[x]('.repeat(5000),
    '|a'.repeat(20_000), '- '.repeat(2000), '\n'.repeat(10_000), '> '.repeat(5000),
    deep,
  ]
  for (const source of cases) {
    const label = `${source.length}:${JSON.stringify(source.slice(0, 12))}`
    assert.doesNotThrow(() => t.answerBlocks(source), label)
    assert.doesNotThrow(() => t.answerView(source), label)
    assert.doesNotThrow(() => t.answerPlain(source), label)
  }
})

test('answerView falls back to the raw text when the parser throws', async () => {
  const t = await helpers()
  // The guard lives inside React's render, where a throw would blank the answer
  // area. Nothing parses into a throw today, so the parser is injected here.
  const boom = () => { throw new RangeError('Maximum call stack size exceeded') }
  const source = '| a |\n| --- |\n| 1 |'
  const nodes = t.answerView(source, boom)
  assert.deepEqual(tagsOf(nodes), ['pre'])
  assert.equal(nodes[0].args[1].className, 'clipchat-card__pre')
  assert.equal(nodes[0].args[2], source)
})

test('html in an answer is text, and a non-http target never becomes a link', async () => {
  const t = await helpers()
  const nodes = t.answerView('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
  assert.deepEqual(tagsOf(nodes), ['p', 'p'])
  assert.equal(textOf(nodes[0]), '<script>alert(1)</script>')
  assert.equal(textOf(nodes[1]), '<img src=x onerror=alert(1)>')

  const refused = [
    '[x](javascript:alert(1))', '[x](JavaScript:alert(1))', '[x](data:text/html;base64,QQ==)',
    '[x](ftp://a.b)', '[x](//evil.example)', '[x](https://a.b/" onmouseover="alert(1))',
  ]
  for (const source of refused) {
    const view = t.answerView(source)
    assert.equal(nodesOf(view, 'a').length, 0, source)
    assert.equal(nodesOf(view, 'script').length, 0, source)
  }
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

test('the text the copy button produces is the text the card shows', async () => {
  const env = installDom('')
  try {
    // A table is where the two used to drift: the clipboard ran its own pass over
    // the cells, so a Windows path or `a\nb` was copied with its backslashes gone
    // even though the reader saw them.
    const answer = [
      '| 路径 | 说明 |',
      '| --- | --- |',
      '| C:\\Users\\me | a\\nb |',
      '| a\\*b | `x` |',
    ].join('\n')
    let view
    let plain
    const mounted = await mountComponent(
      (plugin) => {
        view = plugin.__test.answerView
        plain = plugin.__test.answerPlain
        return {}
      },
      { component: () => view(answer) },
    )
    const { container } = mounted
    const shown = [...container.querySelectorAll('th, td')].map((cell) => cell.textContent)
    const copied = plain(answer).split('\n').flatMap((line) => line.split('\t'))
    assert.deepEqual(copied, shown)
    assert.deepEqual(shown, ['路径', '说明', 'C:\\Users\\me', 'a\\nb', 'a*b', 'x'])
    await mounted.unmount()
  } finally {
    env.restore()
  }
})
