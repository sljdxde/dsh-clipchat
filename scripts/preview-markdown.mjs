#!/usr/bin/env node
/**
 * Render one answer through the bundle's own renderer and CSS, then screenshot
 * it in Chrome.
 *
 * The unit tests assert the node tree; this shows what a person actually sees.
 * It is the check for a rendering change too fiddly to review as markup: a wide
 * table, alignment, a long code line, a nested list, a link, a rule.
 *
 * Usage: node scripts/preview-markdown.mjs [--out <dir>] [--headed] [--card <px>] [--wide]
 * `--card` pins the card width, which is how a narrow chat column is reproduced;
 * `--wide` renders only the tables that decide whether a grid stays readable.
 * Output: <dir>/preview.html and <dir>/preview.png (default artifacts/markdown-preview).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as React from 'react'

import { installDom } from '../test/helpers/dom.mjs'
import { loadBundle } from '../test/helpers/load-client.mjs'
import { resolveChromePath } from '../e2e/lib/browser.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The answer the preview renders: every block kind the card supports. */
const ANSWER = [
  '### 主副本怎么定',
  '',
  '主副本由配额 `m=[3,2,1]` 决定：A 拿 3 个，B 拿 2 个，C 拿 1 个。**P=6** 时就是 p0 到 p2 放 A。',
  '',
  '| 分区 | 主副本 | 从副本1 | 从副本2 |',
  '|:---|:---:|---:|---|',
  '| p0 | A | B | C |',
  '| p1 | A | B | C |',
  '| p2 | A | B | C |',
  '| p3 | B | C | A |',
  '',
  '从副本按规则「转」出来：',
  '',
  '```javascript',
  'const placement = (p, m) => m.slice(0, p.length - 1).reduce((acc, n) => acc.concat(n), [])',
  '// 每个分区的主副本按配额依次分配，再从下一个副本开始轮转',
  'for (const [i, node] of p.entries()) console.log(i, "**不是加粗**")',
  '```',
  '',
  '要点：',
  '',
  '1. 主副本先定',
  '2. 从副本再转',
  '   - 一次一个',
  '   - 遇到末尾回到开头',
  '',
  '---',
  '',
  '> 「纯」指每台机器上的副本都是独立的，不是同一份的别名。',
  '',
  '参考 [RocksDB 的 placement 文档](https://github.com/facebook/rocksdb)，~~旧方案已废弃~~。',
].join('\n')

/**
 * The tables that decide whether a grid is readable in a narrow card.
 *
 * Eight columns used to be squeezed into the card's width, one character per
 * line under each header. The three-column table is the counter-case: it must
 * still fill the card, and its long cell must still wrap.
 */
const WIDE_ANSWER = [
  '### 宽表与普通表',
  '',
  '| 分区 | 主副本 | 从副本一 | 从副本二 | 从副本三 | 从副本四 | 从副本五 | 从副本六 |',
  '|---|---|---|---|---|---|---|---|',
  '| p0 | A | B | C | D | E | F | G |',
  '| p1 | A | B | C | D | E | F | G |',
  '',
  '普通三列表：',
  '',
  '| 项 | 说明 | 量 |',
  '|---|---|---|',
  '| 主副本 | 这一段很长的说明文字，用来确认普通两三列的表仍然占满卡片宽度，并且长单元格会换行，而不是被 nowrap 拉成一条读不完的长线。 | 3 |',
].join('\n')

/** Parse the runner's own flags. */
function parseArgs(argv) {
  const options = { out: join(ROOT, 'artifacts', 'markdown-preview'), headed: false, card: null, wide: false }
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') {
      options.out = argv[index + 1] ?? options.out
      index += 1
    } else if (argv[index] === '--card') {
      options.card = Number.parseInt(argv[index + 1] ?? '', 10)
      index += 1
    } else if (argv[index] === '--wide') {
      options.wide = true
    } else if (argv[index] === '--headed') {
      options.headed = true
    }
  }
  return options
}

/**
 * The page: the bundle's stylesheet, the card chrome that surrounds an answer,
 * and the answer's own nodes as static markup.
 * @param {{ wide: boolean, card: number | null }} options - what to render and how wide.
 * @returns {Promise<string>} complete HTML.
 */
async function buildPage(options) {
  const env = installDom('')
  try {
    const { definition, styles } = await loadBundle()
    // Real React, because the result is rendered, not inspected.
    const plugin = definition.factory((name) => {
      if (name === 'react') return React
      throw new Error(`unexpected module: ${name}`)
    })
    plugin.__test.ensureStyle()
    const css = styles.map((style) => style.textContent).join('\n')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const answer = renderToStaticMarkup(plugin.__test.answerView(options.wide ? WIDE_ANSWER : ANSWER))
    return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dsh-clipchat 回答渲染</title>
<style>
/* The host supplies these tokens; the preview page stands in for a light
   DSH surface, so the same stylesheet has something to resolve against. */
:root{
  --dsw-alias-border-l2:rgba(0,0,0,.16);--dsw-alias-border-l3:rgba(0,0,0,.1);
  --dsw-alias-label-primary:#1c1c1e;--dsw-alias-label-secondary:#6b6b70;
  --dsw-alias-bg-elevated:#fff;--dsw-alias-bg-sunken:rgba(120,120,128,.12);
  --dsw-alias-brand-primary:#2f6fed;--dsw-alias-state-success-primary:#1f9d63;
  --dsw-alias-button-floating-fill:rgba(255,255,255,.9);--dsw-alias-button-floating-hover:rgba(0,0,0,.05);
  --dsw-font-xs-13:12.5px/1.5 -apple-system,"SF Pro Text","PingFang SC",system-ui,sans-serif;
  --dsw-font-mono:ui-monospace,SFMono-Regular,Menlo,monospace;
}
html,body{margin:0;height:100%}
body{background:#f4f4f5;font:14px/1.6 -apple-system,"SF Pro Text","PingFang SC",system-ui,sans-serif;color:#1c1c1e;
  display:flex;align-items:flex-start;justify-content:center;padding:24px}
${css}
.clipchat-card{max-height:none${options.card === null ? '' : `;width:${options.card}px`}}
.clipchat-card__thread{overflow:visible}
</style></head>
<body><div class="clipchat-card">
  <div class="clipchat-card__bar"><span class="clipchat-card__mark">✦</span>
    <span class="clipchat-card__bar-text">滑词对话 · 主副本由配额决定…</span></div>
  <div class="clipchat-card__thread"><div class="clipchat-card__turn">
    <div class="clipchat-card__q">主副本和从副本到底怎么分布的？</div>
    <div class="clipchat-card__a">${answer}</div>
  </div></div>
  <div class="clipchat-card__composer">
    <textarea class="clipchat-card__ta" placeholder="直接问，或选一个快问" rows="1"></textarea>
    <button class="clipchat-card__send" type="button">↑</button>
  </div>
</div></body></html>`
  } finally {
    env.restore()
  }
}

/** Open the page in Chrome and write the screenshot. */
async function shoot(html, out, headed) {
  const { default: puppeteer } = await import('puppeteer-core')
  const { path } = await resolveChromePath()
  const browser = await puppeteer.launch({
    executablePath: path,
    headless: !headed,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 760, height: 1100, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load' })
    // The font must settle before the pixels are taken, or the shot is clipped.
    await page.evaluate(() => document.fonts.ready)
    const card = await page.$('.clipchat-card')
    const file = join(out, 'preview.png')
    await card.screenshot({ path: file })
    const size = await card.boundingBox()
    // A grid wider than its box must scroll inside it, never widen the card.
    const fit = await page.evaluate(() => {
      const wrap = document.querySelector('.clipchat-card__tablewrap')
      return wrap === null ? null : { scroll: wrap.scrollWidth, client: wrap.clientWidth }
    })
    return { file, width: Math.round(size.width), height: Math.round(size.height), fit }
  } finally {
    await browser.close()
  }
}

const options = parseArgs(process.argv.slice(2))
await mkdir(options.out, { recursive: true })
const html = await buildPage(options)
await writeFile(join(options.out, 'preview.html'), html)
const shot = await shoot(html, options.out, options.headed)
console.log(`preview: ${join(options.out, 'preview.html')}`)
console.log(`screenshot: ${shot.file} (${shot.width}×${shot.height})`)
if (shot.fit !== null) console.log(`table box: ${shot.fit.client}px wide, content ${shot.fit.scroll}px`)
