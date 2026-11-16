/**
 * Route resolution for the clipchat host half.
 *
 * The answer must use the model the user is already talking to, so the chain
 * mirrors the main loop: an explicit request model, then the session's next
 * request header, then the configured default. No model is a reported state,
 * never a guessed provider.
 *
 * @module dsh-clipchat/lib/model
 */

/** @typedef {{ provider: string, model: string, reasoningEffort?: string }} ModelRoute */

/**
 * Copy one complete route, dropping every other field.
 *
 * Shared by route resolution, the model catalog and the highlight store so a
 * persisted selection and a request selection have exactly one shape.
 * @param {unknown} value - candidate route from a request body or disk.
 * @returns {ModelRoute | null} a detached route, or null when incomplete.
 */
export function normalizeModelRoute(value) {
  if (value === null || typeof value !== 'object') return null
  const { provider, model, reasoningEffort } = /** @type {Record<string, unknown>} */ (value)
  if (typeof provider !== 'string' || provider.length === 0) return null
  if (typeof model !== 'string' || model.length === 0) return null
  return typeof reasoningEffort === 'string' && reasoningEffort.length > 0
    ? { provider, model, reasoningEffort }
    : { provider, model }
}

/**
 * Keep only a complete explicit route.
 * @param {unknown} value - candidate route from the request body.
 * @returns {ModelRoute | undefined} a detached route, or undefined.
 */
function readExplicit(value) {
  return normalizeModelRoute(value) ?? undefined
}

/**
 * Read the model the session will use for its next request.
 *
 * `adapterDefaults.reasoningEffort` marks an effort the adapter chose, not the
 * user; sending it back would pin that default, so it is omitted.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {string | undefined} sessionId - browser-reported session.
 * @returns {ModelRoute | undefined} the session route, or undefined.
 */
function readSessionRoute(ctx, sessionId) {
  try {
    const sessions = ctx.get('sessions')
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const session = sessions?.get?.(sessionId)
    const header = typeof session?.requestHeader === 'function' ? session.requestHeader() : undefined
    const config = header?.config
    if (config === null || typeof config !== 'object') return undefined
    if (typeof config.provider !== 'string' || typeof config.model !== 'string') return undefined
    if (config.provider.length === 0 || config.model.length === 0) return undefined
    const adapterDefault = header?.adapterDefaults?.reasoningEffort === true
    return !adapterDefault && typeof config.reasoningEffort === 'string' && config.reasoningEffort.length > 0
      ? { provider: config.provider, model: config.model, reasoningEffort: config.reasoningEffort }
      : { provider: config.provider, model: config.model }
  } catch {
    return undefined
  }
}

/**
 * Read the configured default selection.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @returns {ModelRoute | undefined} the default route, or undefined.
 */
function readDefaultRoute(ctx) {
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    return readExplicit(selection)
  } catch {
    return undefined
  }
}

/**
 * Resolve the route for one clipchat call.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ sessionId?: string, model?: unknown }} [request] - route hints.
 * @returns {ModelRoute | undefined} resolved route, or undefined when none exists.
 */
export function resolveModel(ctx, request = {}) {
  return readExplicit(request.model)
    ?? readSessionRoute(ctx, request.sessionId)
    ?? readDefaultRoute(ctx)
}
