import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveModel } from '../lib/model.js'

/** Fake context exposing the services by name, the way cordis does. */
function context(services) {
  return { get: (name) => services[name] }
}

function sessionWith(config, adapterDefaults) {
  return {
    requestHeader: () => ({ config, adapterDefaults }),
  }
}

test('an explicit request model wins over the session route', () => {
  const ctx = context({
    sessions: { get: () => sessionWith({ provider: 'session', model: 'session-model' }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  })

  assert.deepEqual(
    resolveModel(ctx, { sessionId: 's', model: { provider: 'explicit', model: 'explicit-model' } }),
    { provider: 'explicit', model: 'explicit-model' },
  )
})

test('the session request header wins over the configured default', () => {
  const ctx = context({
    sessions: { get: () => sessionWith({ provider: 'session', model: 'session-model', reasoningEffort: 'high' }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  })

  assert.deepEqual(resolveModel(ctx, { sessionId: 's' }), {
    provider: 'session',
    model: 'session-model',
    reasoningEffort: 'high',
  })
})

test('omits an adapter-default reasoning effort', () => {
  const ctx = context({
    sessions: { get: () => sessionWith({ provider: 'session', model: 'session-model', reasoningEffort: 'high' }, { reasoningEffort: true }) },
  })

  assert.deepEqual(resolveModel(ctx, { sessionId: 's' }), {
    provider: 'session',
    model: 'session-model',
  })
})

test('falls back to agentDefaultModel.currentSelection when the session has no header', () => {
  const ctx = context({
    sessions: { get: () => ({ requestHeader: () => undefined }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
  })

  assert.deepEqual(resolveModel(ctx, { sessionId: 's' }), { provider: 'default', model: 'default-model' })
})

test('returns undefined when no model is available', () => {
  assert.equal(resolveModel(context({}), { sessionId: 'missing' }), undefined)
})

test('tolerates throwing services', () => {
  const ctx = context({
    sessions: { get: () => { throw new Error('boom') } },
    agentDefaultModel: { currentSelection: () => { throw new Error('boom') } },
  })
  assert.equal(resolveModel(ctx, { sessionId: 's' }), undefined)
})

test('ignores partial explicit models and falls through the chain', () => {
  const ctx = context({
    sessions: { get: () => sessionWith({ provider: 'session', model: 'session-model' }) },
  })
  assert.deepEqual(resolveModel(ctx, { sessionId: 's', model: { provider: '', model: '' } }), {
    provider: 'session',
    model: 'session-model',
  })
})
