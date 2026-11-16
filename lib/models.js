/**
 * Model catalog for the clipchat picker.
 *
 * The picker offers the routes the host's `llm` service currently advertises,
 * plus whatever route the session itself would use. Catalogs are re-read on
 * every request: provider registration and model discovery change at runtime,
 * so a cached list would go stale.
 *
 * @module dsh-clipchat/lib/models
 */

import { normalizeModelRoute, resolveModel } from './model.js'

/** @typedef {{ provider: string, model: string, name: string }} ModelEntry */

/**
 * Model id of one advertised model: the canonical `id`, or a tolerated `model`.
 * @param {unknown} entry - one `llm.listModels` entry.
 * @returns {string} the id, or an empty string.
 */
function modelIdOf(entry) {
  if (entry === null || typeof entry !== 'object') return ''
  const { id, model } = /** @type {Record<string, unknown>} */ (entry)
  if (typeof id === 'string' && id.length > 0) return id
  return typeof model === 'string' && model.length > 0 ? model : ''
}

/**
 * Normalize advertised models into detached picker entries.
 *
 * Malformed entries are dropped, duplicates (by provider and model) keep the
 * first entry, and a missing display name falls back to the model id.
 * @param {unknown} entries - `llm.listModels(provider)` result.
 * @param {string} [fallbackProvider] - provider route when entries omit it.
 * @returns {ModelEntry[]} picker entries.
 */
export function normalizeModelList(entries, fallbackProvider) {
  const models = []
  const seen = new Set()
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry === null || typeof entry !== 'object') continue
    const raw = /** @type {Record<string, unknown>} */ (entry)
    const model = modelIdOf(entry)
    const provider = typeof raw.provider === 'string' && raw.provider.length > 0
      ? raw.provider
      : typeof fallbackProvider === 'string' ? fallbackProvider : ''
    if (provider.length === 0 || model.length === 0) continue
    const key = `${provider}\u0000${model}`
    if (seen.has(key)) continue
    seen.add(key)
    const name = typeof raw.name === 'string' && raw.name.trim().length > 0 ? raw.name : model
    models.push({ provider, model, name })
  }
  return models
}

/**
 * Read the live model catalog and the session's current route.
 *
 * Provider or model failures are tolerated: a provider whose catalog cannot be
 * read is skipped, and when nothing can be listed the current route is still
 * offered, so the picker never has less than the active model.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {{ sessionId?: string }} [options] - browser-reported session.
 * @returns {Promise<{ models: ModelEntry[], current: import('./model.js').ModelRoute | null }>} catalog.
 */
export async function listModelChoices(ctx, options = {}) {
  const current = resolveModel(ctx, { sessionId: options.sessionId }) ?? null
  let models = []
  try {
    const llm = ctx.get('llm')
    const providers = typeof llm?.listProviders === 'function' ? llm.listProviders() : []
    if (Array.isArray(providers) && typeof llm?.listModels === 'function') {
      for (const provider of providers) {
        if (provider === null || typeof provider !== 'object') continue
        const id = typeof provider.id === 'string' ? provider.id : ''
        if (id.length === 0) continue
        try {
          models = models.concat(normalizeModelList(await llm.listModels(id), id))
        } catch {
          /* One unreadable provider catalog must not hide the rest. */
        }
      }
    }
  } catch {
    /* Listing is advisory; the current route below keeps the picker usable. */
  }

  models = normalizeModelList(models)
  if (current !== null && !models.some((entry) => (
    entry.provider === current.provider && entry.model === current.model
  ))) {
    models.push({ provider: current.provider, model: current.model, name: current.model })
  }
  return { models, current }
}

/**
 * Decide whether one explicit selection is usable on this host.
 *
 * A shaped route is accepted when the host cannot enumerate anything, since
 * the picker may be fed by an adapter without a catalog. When a provider
 * catalog is readable, the provider must be advertised and the model must be
 * one of its entries.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {unknown} value - candidate route from an ask body.
 * @returns {Promise<boolean>} whether the selection may be called.
 */
export async function isModelAvailable(ctx, value) {
  const route = normalizeModelRoute(value)
  if (route === null) return false
  const llm = ctx.get('llm')
  if (typeof llm?.listProviders !== 'function') return true

  let providers
  try {
    providers = llm.listProviders()
  } catch {
    return true
  }
  if (!Array.isArray(providers)) return true
  const ids = providers
    .map((provider) => (provider !== null && typeof provider === 'object' && typeof provider.id === 'string'
      ? provider.id
      : ''))
    .filter((id) => id.length > 0)
  if (ids.length === 0) return true
  if (!ids.includes(route.provider)) return false
  if (typeof llm.listModels !== 'function') return true

  try {
    const entries = await llm.listModels(route.provider)
    if (!Array.isArray(entries) || entries.length === 0) return true
    return normalizeModelList(entries, route.provider).some((entry) => entry.model === route.model)
  } catch {
    return true
  }
}
