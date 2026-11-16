/**
 * dsh-clipchat host half.
 *
 * Two routes, both behind the host's own request fence:
 *   GET  /dsh-clipchat/status  → { ok, guard, model } for development self-checks
 *   POST /dsh-clipchat/ask     → SSE answer for one in-card question
 *
 * The ask route only calls `llm.stream`: it never writes a session, never
 * creates a hidden one and never declares tools. The client closing the SSE
 * response aborts the upstream call.
 *
 * @module dsh-clipchat
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildContext, ContextError, LIMITS } from './lib/context.js'
import {
  RequestBodyError, openSse, readJsonBody, sameOriginRejection, sendJson, writeFrame,
} from './lib/http.js'
import { resolveModel } from './lib/model.js'

const PREFIX = '/dsh-clipchat'
const STATUS_PATH = `${PREFIX}/status`
const ASK_PATH = `${PREFIX}/ask`
const ANSWER_MAX_TOKENS = 2048

/**
 * Load the host LLM message helpers. A linked local bundle resolves outside
 * the profile's node_modules chain, so fall back to the running installation.
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
  for (const anchor of candidates) {
    try {
      const resolved = createRequire(anchor).resolve('@deepseek-ai/dsh-llm')
      return await import(pathToFileURL(resolved).href)
    } catch {
      /* Try the next anchor. */
    }
  }
  throw new Error('cannot resolve @deepseek-ai/dsh-llm')
}

/**
 * Install both routes against a live `webServer`.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  /** @returns {401 | 403 | undefined} the host fence verdict for this request. */
  const reject = (req) => {
    const connection = ctx.get('connection')
    if (typeof connection?.requestRejection === 'function') return connection.requestRejection(req)
    return sameOriginRejection(req)
  }

  /** @returns {'requestRejection' | 'same-origin'} which fence is active. */
  const guardName = () => typeof ctx.get('connection')?.requestRejection === 'function'
    ? 'requestRejection'
    : 'same-origin'

  /**
   * Answer a rejected request, when it is rejected.
   * @param {import('node:http').IncomingMessage} req - the request.
   * @param {import('node:http').ServerResponse} res - the response.
   * @returns {boolean} whether the request was answered here.
   */
  const guard = (req, res) => {
    const rejection = reject(req)
    if (rejection === undefined) return false
    const status = rejection === 401 ? 401 : 403
    sendJson(res, status, { error: status === 401 ? 'unauthorized' : 'forbidden' })
    return true
  }

  /** `GET /dsh-clipchat/status`: what the host sees right now. */
  const handleStatus = (req, res) => {
    if (guard(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    sendJson(res, 200, {
      ok: true,
      guard: guardName(),
      model: resolveModel(ctx, {}) ?? null,
    })
  }

  /** `POST /dsh-clipchat/ask`: one streamed, session-free answer. */
  const handleAsk = async (req, res) => {
    if (guard(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }

    let body
    try {
      body = await readJsonBody(req)
    } catch (error) {
      const invalid = error instanceof RequestBodyError
      sendJson(res, invalid && error.code === 'body-too-large' ? 413 : 400, {
        error: invalid ? error.code : 'invalid-request',
        message: String(error?.message ?? error),
      })
      return
    }

    if (Array.isArray(body?.history) && body.history.length > LIMITS.historyMessages) {
      sendJson(res, 400, {
        error: 'history-too-long',
        message: `历史问答超过 ${LIMITS.historyMessages} 条`,
      })
      return
    }

    const llm = ctx.get('llm')
    if (typeof llm?.stream !== 'function') {
      sendJson(res, 503, { error: 'llm-unavailable' })
      return
    }

    const model = resolveModel(ctx, {
      sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
      model: body?.model,
    })
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

    let built
    try {
      built = buildContext({
        selection: body?.selection,
        message: body?.message,
        turn: body?.turn,
        recent: body?.recent,
        history: body?.history,
        question: body?.question,
        model,
        createAssistantMessage: helpers.createAssistantMessage,
      })
    } catch (error) {
      if (error instanceof ContextError) {
        sendJson(res, 400, { error: error.code, message: error.message })
        return
      }
      throw error
    }

    // Client disconnect (panel closed, new question, unmount) cancels the call.
    const controller = new AbortController()
    let closed = false
    const onClose = () => {
      closed = true
      controller.abort()
    }
    res.on('close', onClose)
    if (res.destroyed === true) {
      res.off('close', onClose)
      return
    }

    openSse(res)
    writeFrame(res, { type: 'meta', provider: model.provider, model: model.model }, () => closed)

    const startedAt = performance.now()
    let firstTokenMs = null
    let settled = false
    try {
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort },
        system: built.system,
        maxTokens: ANSWER_MAX_TOKENS,
        messages: built.messages,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta') {
          if (firstTokenMs === null) firstTokenMs = Math.max(0, Math.round(performance.now() - startedAt))
          writeFrame(res, { type: 'delta', text: chunk.text }, () => closed)
        } else if (chunk?.type === 'usage') {
          writeFrame(res, {
            type: 'usage',
            usage: chunk.usage,
            inputTokens: chunk.usage?.inputTokens,
            outputTokens: chunk.usage?.outputTokens,
          }, () => closed)
        } else if (chunk?.type === 'finish') {
          settled = true
          const reason = chunk.reason ?? { kind: 'stop' }
          if (reason.kind === 'error' || reason.kind === 'aborted') {
            writeFrame(res, {
              type: 'error',
              code: reason.failure?.code,
              message: reason.failure?.message ?? reason.kind,
            }, () => closed)
          } else {
            writeFrame(res, { type: 'done', reason: reason.kind, firstTokenMs }, () => closed)
          }
        }
      }
      if (!settled && !controller.signal.aborted) {
        writeFrame(res, {
          type: 'error',
          code: 'STREAM_CLOSED',
          message: '上游流意外结束，请重试',
        }, () => closed)
      }
    } catch (error) {
      writeFrame(res, {
        type: 'error',
        message: String(error?.message ?? error),
      }, () => closed)
    } finally {
      res.off('close', onClose)
      if (res.destroyed !== true && res.writableEnded !== true) res.end()
    }
  }

  // A child fiber declaring the dependency is what exposes `scope.webServer`.
  ctx.inject(['webServer'], (scope) => {
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: STATUS_PATH, handler: handleStatus }),
      'dsh-clipchat: status route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: ASK_PATH, handler: handleAsk }),
      'dsh-clipchat: ask route',
    )
  })
}
