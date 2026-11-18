/**
 * A deterministic, local OpenAI-compatible endpoint.
 *
 * The E2E must exercise the real provider adapter, streaming, and answer
 * rendering without touching a model service. This server answers both
 * `/v1/models` discovery and `/v1/chat/completions` (JSON and SSE), and keeps a
 * request summary that never includes credentials.
 */
import { createServer } from 'node:http'

/** Prefix the fixture generator's seed request must contain. */
export const SEED_MARKER = 'E2E_FIXTURE_SEED'
/** Marker the fixture generator's answer contains. */
export const SEED_ANSWER = 'E2E_SEED_OK'
/** Prefix every ordinary mock answer carries, so the case can assert on it. */
export const ANSWER_PREFIX = 'E2E_MOCK_ANSWER'

/**
 * Markdown the ordinary mock answer carries.
 *
 * Every run therefore drives the answer renderer with the shapes that used to
 * come out as raw characters: a table with an aligned column, a fenced code
 * block, a nested list, italics, a titled link, an autolink and a task list. The first line stays a plain paragraph so the
 * streaming assertions still have something unambiguous to wait for. One cell
 * carries a Windows path on purpose: a table cell that drops the backslash of
 * `C:\Users\me` is the escape bug this fixture keeps an eye on.
 */
export const ANSWER_BLOCKS = [
  '| 档位 | 携带 | 成本 |',
  '| --- | --- | ---: |',
  '| 默认 | 选段 + 整条消息 | 2-6k |',
  '| 详细 | 会话分层摘要 C:\\Users\\me | 20-30k |',
  '',
  '```js',
  'const plan = { tier: "default", tokens: 2600 }',
  '```',
  '',
  '1. 先保留选段',
  '   - 再从最近一轮往前加',
  '2. 超上限才从最旧的删',
  '',
  '强调：*这一句只是斜体*，链接见 [RocksDB 文档](https://github.com/facebook/rocksdb "RocksDB") 与 <https://rocksdb.org>。',
  '',
  '- [x] 主副本定位',
  '- [ ] 从副本轮转',
].join('\n')

/**
 * Read a request body as UTF-8 text.
 * @param {import('node:http').IncomingMessage} request - incoming request.
 * @returns {Promise<string>} body text.
 */
async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Flatten one message's content, which may be a string or content parts.
 * @param {unknown} content - message content.
 * @returns {string} plain text.
 */
function contentText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part
      if (part !== null && typeof part === 'object' && typeof part.text === 'string') return part.text
      return ''
    }).join('')
  }
  return ''
}

/**
 * The prompt that decides the mock answer: the last user message.
 * @param {unknown[]} messages - request messages.
 * @returns {string} prompt text.
 */
function lastUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === null || typeof message !== 'object') continue
    if (message.role !== 'user') continue
    const text = contentText(message.content)
    if (text.length > 0) return text
  }
  return ''
}

/**
 * Start the mock provider.
 * @param {object} options - server options.
 * @param {(line: string) => Promise<void>|void} options.log - one-line request log.
 * @param {(prompt: string) => string} [options.answer] - optional deterministic
 *   reply builder; the demo uses it, the E2E keeps the marker reply.
 * @returns {Promise<{baseUrl: string, port: number, close: () => Promise<void>}>} running mock.
 */
export async function startMockLlm({ log, answer: answerOf }) {
  const server = createServer((request, response) => {
    void (async () => {
      const started = Date.now()
      const method = request.method ?? 'GET'
      const path = (request.url ?? '/').split('?')[0]
      try {
        if (method === 'GET' && path === '/v1/models') {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-answer', object: 'model' }] }))
          await log(`${method} ${path} 200 ${Date.now() - started}ms`)
          return
        }
        if (method !== 'POST' || path !== '/v1/chat/completions') {
          response.writeHead(404, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'not found' } }))
          await log(`${method} ${path} 404 ${Date.now() - started}ms`)
          return
        }
        const body = await readBody(request)
        let payload
        try {
          payload = JSON.parse(body)
        } catch {
          response.writeHead(400, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ error: { message: 'invalid json' } }))
          await log(`${method} ${path} 400 ${Date.now() - started}ms`)
          return
        }
        const model = typeof payload.model === 'string' ? payload.model : 'mock-answer'
        const messages = Array.isArray(payload.messages) ? payload.messages : []
        const prompt = lastUserText(messages)
        const answer = typeof answerOf === 'function'
          ? answerOf(prompt)
          : prompt.includes(SEED_MARKER)
            ? `${SEED_ANSWER}: fixture seed answer.`
            : `${ANSWER_PREFIX}: ${prompt.slice(0, 80)}\n\n${ANSWER_BLOCKS}`
        await log(
          `${method} ${path} 200 ${Date.now() - started}ms model=${model} `
          + `prompt=${prompt.replace(/\s+/gu, ' ').slice(0, 120)}`,
        )

        if (payload.stream === true) {
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          })
          const id = `chatcmpl-e2e-${Date.now()}`
          const created = Math.floor(Date.now() / 1000)
          const chunk = (delta, finish = null, usage = null) => {
            const frame = {
              id,
              object: 'chat.completion.chunk',
              created,
              model,
              choices: usage === null ? [{ index: 0, delta, finish_reason: finish }] : [],
              ...(usage === null ? {} : { usage }),
            }
            response.write(`data: ${JSON.stringify(frame)}\n\n`)
          }
          chunk({ role: 'assistant' })
          const parts = [answer.slice(0, 24), answer.slice(24)]
          for (const part of parts) {
            if (part.length === 0) continue
            chunk({ content: part })
          }
          chunk({}, 'stop')
          const promptTokens = Math.max(1, Math.ceil(prompt.length / 4))
          const completionTokens = Math.max(1, Math.ceil(answer.length / 4))
          chunk({}, null, {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          })
          response.write('data: [DONE]\n\n')
          response.end()
          return
        }

        const promptTokens = Math.max(1, Math.ceil(prompt.length / 4))
        const completionTokens = Math.max(1, Math.ceil(answer.length / 4))
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({
          id: `chatcmpl-e2e-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          },
        }))
      } catch (error) {
        if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: String(error?.message ?? error) } }))
        await log(`${method} ${path} 500 ${Date.now() - started}ms ${error?.message ?? error}`)
      }
    })()
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0

  const close = async () => {
    const closed = new Promise((resolve) => server.close(() => resolve()))
    server.closeAllConnections?.()
    const timedOut = await Promise.race([
      closed.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), 2000)),
    ])
    if (timedOut) await log('mock-llm: close timed out after 2s; continuing cleanup')
  }

  return { baseUrl: `http://127.0.0.1:${port}/v1`, port, close }
}
