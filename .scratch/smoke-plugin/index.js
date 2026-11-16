/**
 * dsh-clipchat-smoke — Ticket 09 host half.
 *
 * Proves the smallest end-to-end slice:
 *   GET  /dsh-clipchat-smoke/status  → is the bridge armed, which model, which guard
 *   POST /dsh-clipchat-smoke/ask     → { sessionId, selection, question, history } → SSE
 *
 * The second turn sends the first answer back as assistant history, so the route
 * exercises the documented `createAssistantMessage({ content, source })` path.
 * Nothing is written to the session store or to disk.
 *
 * @module dsh-clipchat-smoke
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const PREFIX = '/dsh-clipchat-smoke'
const ASK_PATH = `${PREFIX}/ask`
const STATUS_PATH = `${PREFIX}/status`
const MAX_BODY_BYTES = 512 * 1024
const MAX_HISTORY = 12
const MAX_MESSAGE_CHARS = 8000
const MAX_ANSWER_TOKENS = 1024
const SYSTEM_PROMPT = [
  '你是 DSH 的划词问答助手。用户会选中对话里的一段文字并向你提问。',
  '回答只围绕选段与上下文，简洁、直接，不给无关建议。',
].join('\n')

/**
 * Read a JSON request body with a hard cap.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {Promise<unknown>} parsed JSON.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
    req.on('error', reject)
  })
}

/**
 * One JSON response.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON body.
 */
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * One SSE frame.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {unknown} payload - frame payload.
 */
function writeFrame(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * Resolve the route the user is currently talking to: the session's request
 * header first, then the configured default selection.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string | undefined} sessionId - browser session.
 * @returns {{ provider: string, model: string, reasoningEffort?: string } | undefined} route.
 */
function resolveModel(ctx, sessionId) {
  try {
    const sessions = ctx.get('sessions')
    const session = sessions && typeof sessionId === 'string' ? sessions.get(sessionId) : undefined
    const config = session && typeof session.requestHeader === 'function'
      ? session.requestHeader()?.config
      : undefined
    if (config?.provider && config?.model) {
      return { provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort }
    }
  } catch {
    /* Fall through to the configured default. */
  }
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    if (selection?.provider && selection?.model) {
      return { provider: selection.provider, model: selection.model, reasoningEffort: selection.reasoningEffort }
    }
  } catch {
    /* No model is a reported condition, not a crash. */
  }
  return undefined
}

/**
 * Load the host LLM helpers. A linked local bundle resolves outside the
 * profile's node_modules chain, so fall back to the running installation.
 * @returns {Promise<{ createAssistantMessage: Function }>} the helpers.
 */
async function loadLlmHelpers() {
  try {
    return await import('@deepseek-ai/dsh-llm')
  } catch {
    /* A linked local bundle resolves outside the profile's node_modules chain. */
  }
  const candidates = []
  if (typeof process.argv[1] === 'string' && process.argv[1].length > 0) {
    candidates.push(process.argv[1])
  }
  const install = process.env.DSH_INSTALL_DIR
  if (typeof install === 'string' && install.length > 0) {
    candidates.push(join(install, 'package.json'))
  }
  for (const from of candidates) {
    try {
      const resolved = createRequire(from).resolve('@deepseek-ai/dsh-llm')
      return await import(pathToFileURL(resolved).href)
    } catch {
      /* Try the next anchor. */
    }
  }
  throw new Error('cannot resolve @deepseek-ai/dsh-llm')
}

/**
 * Build the provider-neutral messages for one smoke turn.
 * @param {unknown} body - parsed request.
 * @param {{ provider: string, model: string }} model - resolved route.
 * @param {{ createAssistantMessage: Function }} helpers - host LLM helpers.
 * @returns {Array<Record<string, unknown>>} request messages.
 */
function buildMessages(body, model, helpers) {
  const messages = []
  const selection = typeof body?.selection === 'string' ? body.selection.trim() : ''
  const anchors = typeof body?.message === 'string' ? body.message.trim() : ''
  const recent = Array.isArray(body?.recent) ? body.recent : []
  const context = [
    selection.length > 0 ? `[选中文字]\n${selection.slice(0, MAX_MESSAGE_CHARS)}` : '',
    anchors.length > 0 ? `[所在消息]\n${anchors.slice(0, MAX_MESSAGE_CHARS)}` : '',
    ...recent.slice(-4).map((turn) => `[最近对话]\n${String(turn?.text ?? '').slice(0, 2000)}`),
  ].filter((part) => part.length > 0).join('\n\n')
  if (context.length > 0) {
    messages.push({ role: 'user', content: [{ type: 'text', text: context }] })
  }
  const history = Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY) : []
  for (const entry of history) {
    const text = typeof entry?.text === 'string' ? entry.text.slice(0, MAX_MESSAGE_CHARS) : ''
    if (text.trim().length === 0) continue
    if (entry?.role === 'assistant') {
      messages.push(helpers.createAssistantMessage({
        content: [{ type: 'text', text }],
        source: { provider: model.provider, model: model.model },
      }))
    } else {
      messages.push({ role: 'user', content: [{ type: 'text', text }] })
    }
  }
  return messages
}

/**
 * Install the two routes.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  const guard = (req) => {
    const connection = ctx.get('connection')
    if (typeof connection?.requestRejection !== 'function') return undefined
    return connection.requestRejection(req)
  }
  const guardName = typeof ctx.get('connection')?.requestRejection === 'function'
    ? 'requestRejection'
    : 'none'

  const handleStatus = (req, res) => {
    const rejection = guard(req)
    if (rejection !== undefined) {
      sendJson(res, Number(rejection), { error: 'rejected' })
      return
    }
    const llm = ctx.get('llm')
    const model = resolveModel(ctx, undefined)
    sendJson(res, 200, {
      ok: true,
      guard: guardName,
      llm: typeof llm?.stream === 'function',
      model: model ?? null,
    })
  }

  const handleAsk = async (req, res) => {
    const rejection = guard(req)
    if (rejection !== undefined) {
      sendJson(res, Number(rejection), { error: 'rejected' })
      return
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    let body
    try {
      body = await readBody(req)
    } catch (error) {
      sendJson(res, 400, { error: 'invalid-request', message: String(error?.message ?? error) })
      return
    }
    const llm = ctx.get('llm')
    if (typeof llm?.stream !== 'function') {
      sendJson(res, 503, { error: 'llm-unavailable' })
      return
    }
    const model = resolveModel(ctx, body?.sessionId)
    if (model === undefined) {
      sendJson(res, 503, { error: 'no-model' })
      return
    }
    let helpers
    try {
      helpers = await loadLlmHelpers()
    } catch (error) {
      sendJson(res, 500, { error: 'llm-helper-unavailable', message: String(error?.message ?? error) })
      return
    }
    const question = typeof body?.question === 'string' ? body.question.trim() : ''
    const messages = buildMessages(body, model, helpers)
    if (question.length > 0) {
      messages.push({ role: 'user', content: [{ type: 'text', text: question.slice(0, MAX_MESSAGE_CHARS) }] })
    }
    if (messages.length === 0) {
      sendJson(res, 400, { error: 'empty-request' })
      return
    }

    const controller = new AbortController()
    const onClose = () => controller.abort()
    res.on('close', onClose)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    try {
      writeFrame(res, { type: 'meta', provider: model.provider, model: model.model })
      for await (const chunk of llm.stream({
        provider: model.provider,
        model: model.model,
        reasoningEffort: model.reasoningEffort,
        system: SYSTEM_PROMPT,
        maxTokens: MAX_ANSWER_TOKENS,
        messages,
        signal: controller.signal,
      })) {
        if (chunk?.type === 'text-delta') {
          writeFrame(res, { type: 'delta', text: chunk.text })
        } else if (chunk?.type === 'usage') {
          writeFrame(res, { type: 'usage', usage: chunk.usage })
        } else if (chunk?.type === 'finish') {
          const reason = chunk.reason
          if (reason?.kind === 'error' || reason?.kind === 'aborted') {
            writeFrame(res, { type: 'error', message: reason?.failure?.message ?? reason?.kind })
          } else {
            writeFrame(res, { type: 'done', reason: reason?.kind })
          }
        }
      }
    } catch (error) {
      writeFrame(res, { type: 'error', message: String(error?.message ?? error) })
    } finally {
      res.off('close', onClose)
      res.end()
    }
  }

  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: handleStatus }),
      'clipchat-smoke: status route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ASK_PATH, handler: handleAsk }),
      'clipchat-smoke: ask route',
    )
  })
}
