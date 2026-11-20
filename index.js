/**
 * dsh-clipchat host half.
 *
 * Eight routes, all behind the host's own request fence:
 *   GET  /dsh-clipchat/status    → { ok, guard, model } for development self-checks
 *   GET  /dsh-clipchat/models    → { models, current } for the per-highlight picker
 *   POST /dsh-clipchat/ask       → SSE answer for one in-card question
 *   GET  /dsh-clipchat/session   → { highlights, records } of one conversation
 *   GET  /dsh-clipchat/context   → { digest, stats } of one conversation for detailed mode
 *   GET  /dsh-clipchat/search    → { items, total, truncated } across every session
 *   POST /dsh-clipchat/highlight → { highlights } after an add or remove
 *   POST /dsh-clipchat/record    → { records } after an add or remove
 *
 * The ask route only calls `llm.stream`: it never writes a session, never
 * creates a hidden one and never declares tools. The client closing the SSE
 * response aborts the upstream call. Highlight and record state lives in the
 * clipchat store, never in the host session.
 *
 * @module dsh-clipchat
 */

import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { ATTACH_LIMITS, AttachmentInputError, normalizeRequestAttachments, resolveAttachmentBlocks } from './lib/attachments.js'
import { buildContext, ContextError, LIMITS } from './lib/context.js'
import { buildDigest, DIGEST_LIMITS, digestStats, renderDigest } from './lib/digest.js'
import {
  RequestBodyError, openSse, readJsonBody, sameOriginRejection, sendJson, writeFrame,
} from './lib/http.js'
import { normalizeModelRoute, resolveModel } from './lib/model.js'
import { isModelAvailable, listModelChoices } from './lib/models.js'
import { createStore, isValidHighlight, isValidRecord, isValidSessionId } from './lib/store.js'
import { SEARCH_LIMITS, searchLimitOf, searchRecords } from './lib/search.js'

const PREFIX = '/dsh-clipchat'
const STATUS_PATH = `${PREFIX}/status`
const ASK_PATH = `${PREFIX}/ask`
const SESSION_PATH = `${PREFIX}/session`
const HIGHLIGHT_PATH = `${PREFIX}/highlight`
const RECORD_PATH = `${PREFIX}/record`
const MODELS_PATH = `${PREFIX}/models`
const SEARCH_PATH = `${PREFIX}/search`
const CONTEXT_PATH = `${PREFIX}/context`
/** How long the context route waits for a cold session log before degrading. */
const CONTEXT_READ_TIMEOUT_MS = 1200
/**
 * Ceiling for one detailed request.
 *
 * Derived, not guessed: the digest is capped at `DIGEST_LIMITS.totalChars` and
 * the local context at `LIMITS.totalChars`, so their sum is the smallest ceiling
 * that can always hold both. A smaller number would make a full digest fail with
 * `context-too-long` once the passage's own context is added.
 */
const DETAIL_TOTAL_CHARS = DIGEST_LIMITS.totalChars + LIMITS.totalChars
/**
 * Body cap for the ask route.
 *
 * Larger than the shared 512 KB because one turn may carry up to
 * `ATTACH_LIMITS.maxTotalBytes` of attachments, which base64 expands by 4/3;
 * the remainder covers the context, history and JSON envelope.
 */
const ASK_BODY_LIMIT = Math.ceil(ATTACH_LIMITS.maxTotalBytes * 4 / 3) + 1024 * 1024
/**
 * How many asks may be in flight at once.
 *
 * Each ask holds an upstream model call for as long as the user reads the
 * answer, so the cap protects the host from an unbounded burst. A request over
 * the cap is refused with 503 instead of waiting: the card is a one-shot ask,
 * and a queued one would be stale by the time a slot opened.
 */
const MAX_CONCURRENT_ASKS = 4

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

  /** In-flight ask count; the ask route's concurrency limit reads and holds it. */
  let activeAsks = 0

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

  /**
   * One ask, run while a concurrency slot is held: read the body, validate it
   * and stream the answer.
   * @param {import('node:http').IncomingMessage} req - the request.
   * @param {import('node:http').ServerResponse} res - the response.
   * @returns {Promise<void>} resolves once the response has been ended.
   */
  const answerAsk = async (req, res) => {
    let body
    try {
      body = await readJsonBody(req, ASK_BODY_LIMIT)
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

    let model
    if (body?.model !== undefined && body?.model !== null) {
      const explicit = normalizeModelRoute(body.model)
      if (explicit === null || !(await isModelAvailable(ctx, explicit))) {
        sendJson(res, 400, { error: 'invalid-model' })
        return
      }
      model = explicit
    } else {
      model = resolveModel(ctx, {
        sessionId: typeof body?.sessionId === 'string' ? body.sessionId : undefined,
      })
    }
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

    // Attachments are validated and persisted before the context is built: a
    // refused upload must not spend an LLM call, and the blocks belong to the
    // new question only.
    let attachmentItems
    try {
      attachmentItems = normalizeRequestAttachments(body?.attachments)
    } catch (error) {
      if (error instanceof AttachmentInputError) {
        sendJson(res, 400, { error: error.code, message: error.message })
        return
      }
      throw error
    }

    let attachmentBlocks = []
    let attachmentNotes = []
    try {
      const resolved = await resolveAttachmentBlocks(attachmentItems, ctx.get('attachments'))
      attachmentBlocks = resolved.blocks
      attachmentNotes = resolved.notes
    } catch (error) {
      sendJson(res, 400, { error: 'attachment-unreadable', message: String(error?.message ?? error) })
      return
    }

    const typedQuestion = typeof body?.question === 'string' ? body.question : ''
    const questionWithNotes = [typedQuestion, ...attachmentNotes]
      .filter((part) => typeof part === 'string' && part.length > 0)
      .join('\n\n')
    // A question that is only an attachment still needs a sentence to act on.
    const questionText = questionWithNotes.length > 0
      ? questionWithNotes
      : (attachmentItems.length > 0 ? '请看附件后回答。' : '')

    let built
    try {
      built = buildContext({
        selection: body?.selection,
        message: body?.message,
        turn: body?.turn,
        recent: body?.recent,
        // Detailed mode: the client passes the digest it fetched, plus the
        // raised ceiling that lets both it and the local context fit.
        digest: body?.digest,
        totalChars: body?.detail === true ? DETAIL_TOTAL_CHARS : undefined,
        neighbors: body?.neighbors,
        history: body?.history,
        question: questionText,
        attachmentBlocks,
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

    // Retention is extended only now, once the request is known to reach the
    // model: a refused body, attachment or context never rewrites a state file.
    if (typeof body?.sessionId === 'string' && isValidSessionId(body.sessionId)) {
      try {
        await store.touch(body.sessionId)
      } catch {
        /* Retention is best-effort; the answer still proceeds. */
      }
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
    let answeredChars = 0
    let settled = false
    try {
      // No `maxTokens`: a fixed output budget is shared with a reasoning model's
      // thinking, so it can be spent entirely on reasoning and leave the answer
      // empty, and it cuts long answers mid-sentence. The provider's own
      // per-model budget is the only number that fits the model it belongs to;
      // the system prompt, not a token cap, is what keeps answers short.
      const stream = llm.stream({
        provider: model.provider,
        model: model.model,
        ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort },
        system: built.system,
        messages: built.messages,
        signal: controller.signal,
      })
      for await (const chunk of stream) {
        if (chunk?.type === 'text-delta') {
          if (typeof chunk.text === 'string') answeredChars += chunk.text.length
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
          } else if (answeredChars === 0) {
            // A normal finish with no text is not a network failure: the model
            // spent its output budget on reasoning, or returned nothing at all.
            // Saying so is what lets the user retry or switch models knowingly.
            writeFrame(res, {
              type: 'error',
              code: 'empty-answer',
              message: '模型这次没有返回正文，请重试或换一个模型',
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

  /**
   * `POST /dsh-clipchat/ask`: one streamed, session-free answer.
   *
   * The slot is taken as soon as the request is known to be a valid ask and
   * released by a single `finally`, so every path below — a refused body, a
   * failed stream or a normal answer — hands the slot back.
   */
  const handleAsk = async (req, res) => {
    if (guard(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    if (activeAsks >= MAX_CONCURRENT_ASKS) {
      sendJson(res, 503, { error: 'busy', message: '同时进行的提问过多，请稍后再试' })
      return
    }
    activeAsks += 1
    try {
      await answerAsk(req, res)
    } finally {
      activeAsks -= 1
    }
  }

  /**
   * Wrap one read-only route with the guard, method check and error mapping.
   * @param {string} errorCode - stable code for an unexpected failure.
   * @param {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} handle - route body.
   * @returns {Function} the request handler.
   */
  const readRoute = (errorCode, handle) => async (req, res) => {
    if (guard(req, res)) return
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'method-not-allowed' })
      return
    }
    try {
      await handle(req, res)
    } catch (error) {
      sendJson(res, 500, { error: errorCode, message: String(error?.message ?? error) })
    }
  }

  /** `GET /dsh-clipchat/models`: picker catalog plus the session's current route. */
  const handleModels = readRoute('models-unavailable', async (req, res) => {
    const sessionId = sessionIdOf(req)
    if (sessionId !== null && sessionId.length > 0 && !isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'invalid-session-id' })
      return
    }
    const { models, current } = await listModelChoices(ctx, {
      sessionId: sessionId ?? undefined,
    })
    sendJson(res, 200, {
      models: models.map((entry) => ({
        ...entry,
        isDefault: current !== null
          && entry.provider === current.provider
          && entry.model === current.model,
      })),
      current,
    })
  })

  /**
   * Read one conversation's events for the detailed-mode digest.
   *
   * `observeSession` is the only supported read path: it works for a live
   * session and for a cold one restored from persistence, and the returned
   * observation is a disposable lease over an immutable cut. The lease is
   * always released, so a burst of asks cannot pin session preparations.
   *
   * @param {string} sessionId - conversation to read.
   * @param {AbortSignal} [signal] - cancels a cold preparation.
   * @returns {Promise<{ events: readonly object[] } | null>} the cut, or null when unavailable.
   */
  const readSessionEvents = async (sessionId, signal) => {
    const query = ctx.get('sessionQuery')
    if (typeof query?.observeSession !== 'function') return null
    let observation
    try {
      observation = await query.observeSession(sessionId, {
        projectionMode: 'none',
        ...signal === undefined ? {} : { signal },
      })
    } catch {
      // Not persisted, not readable, or not a session: detailed mode degrades.
      return null
    }
    try {
      const events = observation?.events
      return Array.isArray(events) ? { events } : null
    } finally {
      if (typeof observation?.[Symbol.dispose] === 'function') {
        try {
          observation[Symbol.dispose]()
        } catch {
          /* Releasing a lease must never fail the request. */
        }
      }
    }
  }

  /**
   * `GET /dsh-clipchat/context`: the session digest detailed mode injects.
   *
   * Returns the rendered block and the numbers the card shows. An unavailable
   * conversation is not an error: the client falls back to the near-turn
   * context and marks the toggle degraded.
   */
  const handleContext = readRoute('context-unavailable', async (req, res) => {
    const sessionId = sessionIdOf(req)
    if (sessionId === null || sessionId.length === 0) {
      sendJson(res, 400, { error: 'missing-session-id' })
      return
    }
    if (!isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'invalid-session-id' })
      return
    }

    // A slow or missing log must not hold the ask: the client gives up first.
    // `AbortSignal.timeout` is the declarative form of the old
    // AbortController + setTimeout pair; readSessionEvents swallows every
    // error (the timeout included) and returns null, so the degrade path is
    // unchanged.
    const read = await readSessionEvents(sessionId, AbortSignal.timeout(CONTEXT_READ_TIMEOUT_MS))
    if (read === null) {
      sendJson(res, 200, { available: false })
      return
    }

    const digest = buildDigest(read.events)
    sendJson(res, 200, {
      available: true,
      digest: renderDigest(digest),
      stats: digestStats(digest),
    })
  })

  /** `GET /dsh-clipchat/search`: substring search across every session's records. */
  const handleSearch = readRoute('search-unavailable', async (req, res) => {
    let url
    try {
      url = new URL(typeof req.url === 'string' ? req.url : '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { error: 'invalid-request' })
      return
    }
    const query = url.searchParams.get('q') ?? ''
    if (query.length > SEARCH_LIMITS.maxQueryChars) {
      sendJson(res, 400, { error: 'query-too-long' })
      return
    }
    const limit = searchLimitOf(url.searchParams.get('limit'))
    const corpus = await store.readAllForSearch()
    const found = searchRecords(corpus.sessions, query, limit)
    sendJson(res, 200, {
      query,
      total: found.total,
      truncated: corpus.truncated || found.truncated,
      items: found.items,
    })
  })

  /** `GET /dsh-clipchat/session`: persisted highlights and records of one conversation. */
  const handleSession = readRoute('store-unavailable', async (req, res) => {
    const sessionId = sessionIdOf(req)
    if (sessionId === null || sessionId.length === 0) {
      sendJson(res, 400, { error: 'missing-session-id' })
      return
    }
    if (!isValidSessionId(sessionId)) {
      sendJson(res, 400, { error: 'invalid-session-id' })
      return
    }
    await sweepStore()
    const state = await store.load(sessionId)
    sendJson(res, 200, { highlights: state.highlights, records: state.records })
  })

  /**
   * Build one add/remove entity route over the session store.
   * @param {{ noun: string, listKey: string, validate: Function, add: Function, remove: Function }} shape - entity contract.
   * @returns {Function} the request handler.
   */
  const entityRoute = ({ noun, listKey, validate, add, remove }) => async (req, res) => {
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
        if (!validate(body[noun])) {
          sendJson(res, 400, { error: `invalid-${noun}` })
          return
        }
        const state = await add(sessionId, body[noun])
        sendJson(res, 200, { [listKey]: state[listKey] })
        return
      }
      const id = body?.[noun]?.id
      if (typeof id !== 'string' || id.length === 0) {
        sendJson(res, 400, { error: `invalid-${noun}` })
        return
      }
      const state = await remove(sessionId, id)
      sendJson(res, 200, { [listKey]: state[listKey] })
    } catch (error) {
      sendJson(res, 500, { error: 'store-unavailable', message: String(error?.message ?? error) })
    }
  }

  const handleHighlight = entityRoute({
    noun: 'highlight',
    listKey: 'highlights',
    validate: isValidHighlight,
    add: (sessionId, value) => store.addHighlight(sessionId, value),
    remove: (sessionId, value) => store.removeHighlight(sessionId, value),
  })
  const handleRecord = entityRoute({
    noun: 'record',
    listKey: 'records',
    validate: isValidRecord,
    add: (sessionId, value) => store.addRecord(sessionId, value),
    remove: (sessionId, value) => store.removeRecord(sessionId, value),
  })

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
      () => scope.webServer.register({ kind: 'exact', path: CONTEXT_PATH, handler: handleContext }),
      'dsh-clipchat: context route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: SEARCH_PATH, handler: handleSearch }),
      'dsh-clipchat: search route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: HIGHLIGHT_PATH, handler: handleHighlight }),
      'dsh-clipchat: highlight route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: MODELS_PATH, handler: handleModels }),
      'dsh-clipchat: models route',
    )
    scope.effect(
      () => scope.webServer.register({ kind: 'exact', path: RECORD_PATH, handler: handleRecord }),
      'dsh-clipchat: record route',
    )
  })
}
