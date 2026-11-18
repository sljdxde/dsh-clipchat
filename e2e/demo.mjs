#!/usr/bin/env node
/**
 * Record the README demo: select a passage, ask in place, keep the answer, then
 * jump back to the passage from the record list.
 *
 * This reuses the E2E harness (throwaway DSH home, mock provider, 60-turn
 * fixture, real Web + Chrome) and writes `docs/demo.gif`. It is a recording
 * tool, not an assertion suite; failures leave the WebM and logs in
 * `artifacts/demo/` so the frame that broke is visible.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { redact } from './lib/artifacts.mjs'
import { launchBrowser } from './lib/browser.mjs'
import { assertDshBin, dumpConfig, resolveDshBin, startWeb } from './lib/dsh.mjs'
import { generateSeedSession, purgeProjectionCache, rewriteFixture, TARGET_TURN } from './lib/fixture.mjs'
import { startMockLlm } from './lib/mock-llm.mjs'
import { REPO_ROOT } from './lib/paths.mjs'
import { findFreePort } from './lib/port.mjs'
import { assertPluginLink, writeProfiles } from './lib/profile.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The answer the mock streams in the demo card. */
const DEMO_ANSWER = '不会。裁剪先从最旧的一轮开始删，system 提示和本次选段始终保留；'
  + '只有当选段加上必要上下文仍超过上限时，才会提示缩短选段。'

/** The passage the demo selects and later locates. */
const TARGET_TEXT = '裁剪时先保留 system 与本次选段，再从最近一轮往前加；'
  + '总长超过上限就从最旧的一轮开始删，选段本身永远不裁。'

/** Eight realistic exchanges used to fill the 60-turn fixture. */
const EXCHANGES = [
  ['上下文裁剪会先删哪部分？', '裁剪会先保留 system 和本次选段，再从最近一轮往前加；超过上限就从最旧的一轮开始删。'],
  ['SSE 中途断开，已经生成的内容会丢吗？', '不会。前端按帧累积文本，断开时保留已收到的内容，并给出可重试的错误。'],
  ['为什么记录要绑定到高亮？', '记录是选段的附属物：取消高亮会一并删记录，取消记录不会影响高亮。'],
  ['定位到原文时，那一轮还没挂载怎么办？', '会先把轮次导航轨滚到目标附近，让“加载并跳转”按钮重新出现，再加载历史并居中下划线。'],
  ['详细回答开关打开后注入什么？', '关闭时注入选段、整条消息、同轮前后和前 3 轮；打开后改注会话分层摘要。'],
  ['模型选择会跟着高亮保存吗？', '会。高亮的 anchor 里保存 provider 和 model，刷新后按它恢复。'],
  ['带回主线会自动发送吗？', '不会。只把选段引用和不超过 200 字的问答摘要插入主输入框。'],
  ['跨会话搜索会修改主线吗？', '不会。搜索只读记录，不写 session，也不改变当前对话。'],
]

/**
 * Profile patch for the demo: same isolated composition as E2E, with a
 * human-readable local model label instead of the test marker.
 * @returns {string} YAML body.
 */
function demoPatch() {
  return `# Demo profile: plaintext logs, a local mock provider, no telemetry.
- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('sessions')
    compression: none
- id: llm-pi-ai
  config:
    providers:
      local-demo:
        displayName: 本地演示
        apiKeyEnv: E2E_MOCK_API_KEY
        api: openai-completions
        baseURL: !!js process.env.E2E_MOCK_BASE_URL
        models:
          - id: demo
            name: 本地演示模型
            contextWindow: 200000
            maxTokens: 8192
            input: [text]
- id: agent-default-model
  config:
    provider: local-demo
    model: demo
- id: session-telemetry-otel
  disabled: true
`
}

/**
 * Replace the synthetic fixture text with readable demo copy.
 * @param {string} path - plaintext session log.
 * @returns {Promise<void>} resolves after the rewrite.
 */
async function humanizeFixture(path) {
  const lines = (await readFile(path, 'utf8')).split('\n').filter((line) => line.length > 0)
  const out = lines.map((line) => {
    const event = JSON.parse(line)
    if (event.type === 'session') return JSON.stringify(event)
    const replace = (value) => {
      if (typeof value === 'string') {
        if (value.includes('E2E_TURN_10 的回答')) return TARGET_TEXT
        const answer = /E2E_TURN_(\d+) 的回答/u.exec(value)
        if (answer !== null) return EXCHANGES[(Number(answer[1]) - 1) % EXCHANGES.length][1]
        const question = /E2E_TURN_(\d+) 的用户问题/u.exec(value)
        if (question !== null) {
          const turn = Number(question[1])
          return turn === TARGET_TURN ? '裁剪时选段会被删掉吗？' : EXCHANGES[(turn - 1) % EXCHANGES.length][0]
        }
        return value.replace(/ ?E2E_ANCHOR_10/u, '')
      }
      if (Array.isArray(value)) return value.map(replace)
      if (value !== null && typeof value === 'object') {
        for (const key of Object.keys(value)) value[key] = replace(value[key])
      }
      return value
    }
    const next = replace(event)
    if (next.type === 'session/title' && next.data !== undefined) next.data.title = '上下文裁剪的三个边界'
    return JSON.stringify(next)
  })
  await writeFile(path, `${out.join('\n')}\n`, { mode: 0o600 })
}

/**
 * Click one element through the DOM.
 * @param {object} page - puppeteer page.
 * @param {string} selector - CSS selector.
 * @returns {Promise<boolean>} whether it existed.
 */
async function click(page, selector) {
  return await page.evaluate((css) => {
    const element = document.querySelector(css)
    if (element === null) return false
    element.click()
    return true
  }, selector)
}

/**
 * Click the first button whose trimmed text matches a pattern.
 * @param {object} page - puppeteer page.
 * @param {RegExp} pattern - text matcher.
 * @returns {Promise<boolean>} whether a button matched.
 */
async function clickText(page, pattern) {
  return await page.evaluate((source) => {
    const regex = new RegExp(source, 'u')
    const button = [...document.querySelectorAll('button')]
      .find((candidate) => regex.test((candidate.textContent ?? '').trim()))
    if (button === undefined) return false
    button.click()
    return true
  }, pattern.source)
}

/**
 * Open the fixture session and wait for the transcript.
 * @param {object} page - puppeteer page.
 * @param {string} sessionId - fixture session id.
 * @returns {Promise<void>} resolves once turns are mounted.
 */
async function openSession(page, sessionId) {
  const selector = `[data-row-key="session:${sessionId}"]`
  await page.waitForSelector(selector, { timeout: 30_000 })
  await click(page, selector)
  await page.waitForSelector('[data-chat-turn]', { timeout: 30_000 })
  await sleep(1200)
}

/**
 * Scroll the turn rail so a far turn's mark renders, then click it.
 * @param {object} page - puppeteer page.
 * @param {number} turn - target turn.
 * @returns {Promise<void>} resolves once the turn is mounted.
 */
async function jumpToTurn(page, turn) {
  await page.evaluate((wanted) => {
    const marks = [...document.querySelectorAll('button[data-index][aria-label]')]
      .filter((mark) => (mark.getAttribute('aria-label') ?? '').includes('轮'))
    if (marks.length === 0) return
    const anchor = marks[0]
    let scroller = anchor.parentElement
    while (scroller !== null) {
      const style = getComputedStyle(scroller)
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll')
        && scroller.scrollHeight > scroller.clientHeight) break
      scroller = scroller.parentElement
    }
    if (scroller === null) return
    const index = Number.parseInt(anchor.getAttribute('data-index') ?? '', 10)
    const offset = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const pitch = Number.isInteger(index) && index > 0 && offset > 0 ? offset / index : 10
    scroller.scrollTop = Math.max(0, (wanted - 1) * pitch - scroller.clientHeight / 2)
  }, turn)
  await sleep(700)
  await page.evaluate((wanted) => {
    const label = [...document.querySelectorAll('button[aria-label]')]
      .find((candidate) => (candidate.getAttribute('aria-label') ?? '') === `加载并跳转到第 ${wanted} 轮`
        || (candidate.getAttribute('aria-label') ?? '') === `跳转到第 ${wanted} 轮`)
    label?.click()
  }, turn)
  await page.waitForSelector(`[data-chat-turn="${turn}"]`, { timeout: 20_000 })
  await sleep(6500)
}

/**
 * Bounding box of the assistant paragraph for one turn.
 * @param {object} page - puppeteer page.
 * @param {number} turn - turn number.
 * @param {string} [contains] - required text fragment.
 * @returns {Promise<object>} paragraph box.
 */
async function paragraphBox(page, turn, contains = '') {
  await page.evaluate((wanted) => {
    document.querySelector(`[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"]`)
      ?.scrollIntoView({ block: 'center' })
  }, turn)
  await sleep(600)
  const box = await page.evaluate(({ wanted, text }) => {
    for (const paragraph of document.querySelectorAll(
      `[data-chat-turn="${wanted}"][data-chat-node-key*="assistant-step"] [data-text-interaction-source] p`,
    )) {
      const rect = paragraph.getBoundingClientRect()
      if (rect.height <= 0 || rect.width <= 0) continue
      if (text.length > 0 && !(paragraph.textContent ?? '').includes(text)) continue
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return null
  }, { wanted: turn, text: contains })
  if (box === null) throw new Error(`no assistant paragraph for turn ${turn}`)
  return box
}

/**
 * Drag across one paragraph to select it.
 * @param {object} page - puppeteer page.
 * @param {object} box - paragraph box.
 * @returns {Promise<void>} resolves after the drag.
 */
async function dragSelect(page, box) {
  const middle = box.y + box.height / 2
  await page.mouse.move(box.x + 1, middle)
  await page.mouse.down()
  await page.mouse.move(box.x + 10, middle)
  await page.mouse.move(box.x + box.width - 2, middle, { steps: 12 })
  await page.mouse.up()
  await sleep(700)
}

/**
 * Select a passage, open its card, ask the demo question, and keep the answer.
 * @param {object} page - puppeteer page.
 * @param {number} turn - turn to select.
 * @param {string} [contains] - required paragraph text.
 * @returns {Promise<void>} resolves after the answer is recorded.
 */
async function askOnTurn(page, turn, contains = '') {
  const box = await paragraphBox(page, turn, contains)
  await dragSelect(page, box)
  await page.waitForSelector('.clipchat-menu__ask', { timeout: 5000 })
  await sleep(700)
  await click(page, '.clipchat-menu__ask')
  await page.waitForSelector('.clipchat-card__ta', { timeout: 10_000 })
  await sleep(700)
  await page.keyboard.type('裁剪时选段会被删掉吗？', { delay: 55 })
  await sleep(250)
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => {
    const answer = document.querySelector('.clipchat-card__a')
    return answer !== null && (answer.textContent ?? '').includes('不会。')
  }, { timeout: 30_000, polling: 100 })
  await sleep(1400)
}

/**
 * Scroll the conversation to the tail like a reader, not with a jump cut.
 * @param {object} page - puppeteer page.
 * @returns {Promise<void>} resolves after the scroll settles.
 */
async function scrollToTail(page) {
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  })
  await sleep(1400)
}

/**
 * Run the demo and write the GIF.
 * @returns {Promise<void>} resolves when the GIF exists.
 */
async function main() {
  const runId = `${Date.now()}-${process.pid}`
  const root = join(tmpdir(), `dsh-clipchat-demo-${runId}`)
  const home = join(root, 'home')
  const workspace = join(root, 'workspace')
  const artifacts = join(REPO_ROOT, 'artifacts', 'demo')
  const webm = join(artifacts, 'demo.webm')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  await mkdir(home, { recursive: true, mode: 0o700 })
  await mkdir(artifacts, { recursive: true })
  // The harness appends to these logs; a fixed demo path would otherwise feed
  // an earlier run's session id to the seed parser.
  for (const name of ['fixture.log', 'web.log']) await writeFile(join(artifacts, name), '')

  const dshBin = resolveDshBin()
  await assertDshBin(dshBin)
  await writeProfiles({ home, dshBin })
  await assertPluginLink(join(home, 'profiles', 'e2e-web'))
  for (const profile of ['e2e-web', 'e2e-headless']) {
    await writeFile(join(home, 'profiles', profile, 'cordis.patch.yml'), demoPatch())
  }
  const env = { ...process.env, DSH_HOME: home, E2E_MOCK_API_KEY: 'mock-e2e' }
  await dumpConfig({ dshBin, env, profile: 'e2e-web' })

  const mock = await startMockLlm({ log: async (line) => console.log(redact(line)), answer: () => DEMO_ANSWER })
  env.E2E_MOCK_BASE_URL = mock.baseUrl

  let web = null
  let browser = null
  let page = null
  let recorder = null
  try {
    const seed = await generateSeedSession({
      dshBin, env, cwd: workspace, logPath: join(artifacts, 'fixture.log'),
    })
    const rewritten = await rewriteFixture({ sourcePath: seed.logPath, sessionId: seed.sessionId, workspace })
    await humanizeFixture(rewritten.path)
    await purgeProjectionCache(home, seed.sessionId)
    console.log(`fixture ${seed.sessionId} ready`)

    const port = await findFreePort()
    web = await startWeb({
      dshBin, env, cwd: workspace, port, logPath: join(artifacts, 'web.log'),
    })
    console.log(`web ${redact(web.url)}`)

    browser = await launchBrowser({})
    page = await browser.browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(web.url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-row-key]', { timeout: 30_000 })
    await clickText(page, /^继续$/u)
    await openSession(page, seed.sessionId)
    await click(page, 'button[aria-label="收起侧边栏"]')
    await jumpToTurn(page, TARGET_TURN)
    await paragraphBox(page, TARGET_TURN, '裁剪时先保留')
    await sleep(800)

    recorder = await page.screencast({ path: webm, format: 'webm', fps: 30 })
    await sleep(900)
    await askOnTurn(page, TARGET_TURN, '裁剪时先保留')
    await clickText(page, /^记录 \d+$/u)
    await sleep(900)
    await click(page, '.clipchat-card__close')
    await sleep(500)
    await scrollToTail(page)
    await sleep(700)
    const latest = await page.evaluate(() => Math.max(
      ...[...document.querySelectorAll('[data-chat-turn]')].map((row) => Number(row.getAttribute('data-chat-turn'))),
    ))
    await askOnTurn(page, latest)
    await clickText(page, /^记录 \d+$/u)
    await sleep(900)
    await page.waitForSelector('.clipchat-card__record-locate', { timeout: 10_000 })
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.clipchat-card__record')]
        .find((candidate) => (candidate.textContent ?? '').includes('裁剪时先保留'))
      row?.querySelector('.clipchat-card__record-locate')?.click()
    })
    await page.waitForSelector(`[data-chat-turn="${TARGET_TURN}"]`, { timeout: 10_000 })
    await sleep(2600)
    await recorder.stop()
    recorder = null
    console.log(`recorded ${webm}`)
  } finally {
    try { await recorder?.stop() } catch { /* already stopped */ }
    try { await browser?.browser.close() } catch { /* ignore */ }
    try { await web?.handle.stop() } catch { /* ignore */ }
    try { await mock.close() } catch { /* ignore */ }
  }

  const docs = join(REPO_ROOT, 'docs')
  await mkdir(docs, { recursive: true })
  const gif = join(docs, 'demo.gif')
  const poster = join(docs, 'screenshot-card.png')
  const convert = spawnSync('ffmpeg', [
    '-y', '-i', webm,
    '-vf', 'fps=12,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    gif,
  ], { stdio: 'inherit' })
  if (convert.status !== 0) throw new Error(`ffmpeg failed with ${convert.status}`)
  spawnSync('ffmpeg', ['-y', '-ss', '6', '-i', webm, '-frames:v', '1', poster], { stdio: 'inherit' })
  console.log(`wrote ${gif}`)
  console.log(`wrote ${poster}`)
  await rm(root, { recursive: true, force: true })
}

await main().catch((error) => {
  process.stderr.write(`demo failed: ${error?.stack ?? error}\n`)
  process.exit(1)
})
