/**
 * dsh-clipchat host half.
 *
 * Four routes, all behind the host's own request fence:
 *   GET  /dsh-clipchat/status    → { ok, guard, model } for development self-checks
 *   POST /dsh-clipchat/ask       → SSE answer for one in-card question
 *   GET  /dsh-clipchat/session   → { highlights, records } of one conversation
 *   POST /dsh-clipchat/highlight → { highlights } after an add or remove
 *
 * The ask route only calls `llm.stream`: it never writes a session, never
 * creates a hidden one and never declares tools. The client closing the SSE
 * response aborts the upstream call. Highlight state lives in the clipchat
 * store, never in the host session.
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
import { createStore, isValidHighlight, isValidSessionId } from './lib/store.js'

const PREFIX = '/dsh-clipchat'
const STATUS_PATH = `${PREFIX}/status`
const ASK_PATH = `${PREFIX}/ask`
const SESSION_PATH = `${PREFIX}/session`
const HIGHLIGHT_PATH = `${PREFIX}/highlight`
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
 * Session id of a reader request, from its query string.
 * @param {import('node:http').IncomingMessage} req - the request.
 * @returns {string | null} the raw value, or null when absent.
 */
function sessionIdOf(req) {
  const raw = typeof req.url === 'string' ? req.url : ''
  try {
    return new URL(raw, 'http://localhost').searchParams.get('sessionId')
  } catch {
    return null
  }
}

/**
 * Add one usable session id to a keep set; blank and non-string ids are ignored.
 * @param {Set<string>} ids - destination set.
 * @param {unknown} value - candidate id.
 * @returns {void}
 */
function addSessionId(ids, value) {
  if (typeof value === 'string' && value.length > 0) ids.add(value)
}

/**
 * Session ids the host currently treats as existing: live sessions, archived
 * conversations and the complete persisted corpus. `sessions.list()` alone is
 * live-only, so the persisted listing is required — without it every closed
 * conversation would look like an orphan.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {Promise<Set<string> | null>} the keep set, or null when it cannot be
 *   established (the caller must then skip the sweep entirely).
 */
async function liveSessionIdsOf(ctx) {
  const sessions = ctx.get('sessions')
  if (typeof sessions?.list !== 'function') return null
  let listed
  try {
    listed = sessions.list()
  } catch {
    return null
  }
  if (!Array.isArray(listed)) return null
  const ids = new Set()
  for (const entry of listed) {
    addSessionId(ids, typeof entry === 'string' ? entry : entry?.id)
  }

  // An archived conversation keeps its data even though it is usually not live.
  try {
    const registry = ctx.get('workspaceRegistry') ?? ctx.get('workspace')
    const archived = registry?.archivedSessionIds
    if (Array.isArray(archived)) {
      for (const id of archived) addSessionId(ids, id)
    }
  } catch {
    /* An unavailable registry only narrows the keep set, never widens it. */
  }

  // The complete corpus: live-preferred records for every persisted session.
  const query = ctx.get('sessionQuery')
  if (typeof query?.listSessions !== 'function') return null
  let records
  try {
    records = await query.listSessions()
  } catch {
    return null
  }
  if (!Array.isArray(records) || records.length === 0) return null
  let persisted = 0
  for (const record of records) {
    const id = record?.header?.id
    if (typeof id === 'string' && id.length > 0) {
      ids.add(id)
      persisted += 1
    }
  }
  // Records with no usable header id mean the corpus could not be read after all.
  if (persisted === 0) return null
  return ids
}

/**
 * Install both routes against a live `webServer`.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ storeRoot?: string }} [options] - test seams; the host passes none.
 */
export function apply(ctx, options = {}) {
  const store = options.storeRoot === undefined
    ? createStore()
    : createStore({ root: options.storeRoot })

  /**
   * Best-effort orphan/TTL cleanup. Without a usable complete keep set the
   * sweep is skipped entirely, so an unavailable session list or session corpus
   * can never look like "every conversation was deleted"; `store.load` still
   * enforces the TTL.
   * @returns {Promise<void>} resolves after cleanup, never rejects.
   */
  const sweepStore = async () => {
    try {
      const liveSessionIds = await liveSessionIdsOf(ctx)
      if (liveSessionIds === null || liveSessionIds.size === 0) return
      await store.sweep({ liveSessionIds })
    } catch {
      /* Cleanup is opportunistic and must not break a request. */
    }
  }

  // Once at startup; the session route also sweeps before answering.
  void sweepStore()

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

  /** `GET /dsh-clipchat/session`: persisted highlights and records of one conversation. */
  const handleSession = async (req, res) => {
    if (guard(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    const sessionId = sessionIdOf(req)
    if (sessionId === null || sessionId.length === 0) {
      sendJson(res, 400, { error: 'missing-session-id' })
      return
    }
    if (!isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'invalid-session-id' })
      return
    }
    try {
      await sweepStore()
      const state = await store.load(sessionId)
      sendJson(res, 200, { highlights: state.highlights, records: state.records })
    } catch (error) {
      sendJson(res, 500, { error: 'store-unavailable', message: String(error?.message ?? error) })
    }
  }

  /** `POST /dsh-clipchat/highlight`: add or remove one highlight, then return the list. */
  const handleHighlight = async (req, res) => {
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

    const sessionId = body?.sessionId
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      sendJson(res, 400, { error: 'missing-session-id' })
      return
    }
    if (!isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'invalid-session-id' })
      return
    }

    const op = body?.op
    if (op !== 'add' && op !== 'remove') {
      sendJson(res, 404, { error: 'unknown-op' })
      return
    }

    try {
      if (op === 'add') {
        if (!isValidHighlight(body.highlight)) {
          sendJson(res, 400, { error: 'invalid-highlight' })
          return
        }
        const state = await store.addHighlight(sessionId, body.highlight)
        sendJson(res, 200, { highlights: state.highlights })
        return
      }
      const id = body?.highlight?.id
      if (typeof id !== 'string' || id.length === 0) {
        sendJson(res, 400, { error: 'invalid-highlight' })
        return
      }
      const state = await store.removeHighlight(sessionId, id)
      sendJson(res, 200, { highlights: state.highlights })
    } catch (error) {
      sendJson(res, 500, { error: 'store-unavailable', message: String(error?.message ?? error) })
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
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: SESSION_PATH, handler: handleSession }),
      'dsh-clipchat: session route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: HIGHLIGHT_PATH, handler: handleHighlight }),
      'dsh-clipchat: highlight route',
    )
  })
}
