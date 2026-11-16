import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isModelAvailable,
  listModelChoices,
  normalizeModelList,
} from '../lib/models.js'

/** Fake context exposing services by name, the way cordis does. */
function context(services) {
  return { get: (name) => services[name] }
}

function provider(id) {
  return { id, name: id.toUpperCase() }
}

function model(providerId, id, name) {
  return { provider: providerId, id, name }
}

test('normalizes provider model entries into picker entries', () => {
  assert.deepEqual(normalizeModelList([
    { provider: 'deepseek', id: 'chat', name: 'DeepSeek Chat' },
    { provider: 'deepseek', id: 'reasoner' },
    { provider: 'deepseek', id: 'chat', name: 'duplicate' },
    { provider: 'deepseek', id: '' },
    { provider: '', id: 'orphan' },
    { provider: 'bad', model: 'legacy' },
    null,
    'nope',
  ]), [
    { provider: 'deepseek', model: 'chat', name: 'DeepSeek Chat' },
    { provider: 'deepseek', model: 'reasoner', name: 'reasoner' },
    { provider: 'bad', model: 'legacy', name: 'legacy' },
  ])
})

test('uses a provider fallback and dedupes by provider and model', () => {
  assert.deepEqual(normalizeModelList([
    { id: 'm1', name: 'M1' },
    { id: 'm1', name: 'M1 again' },
  ], 'p'), [
    { provider: 'p', model: 'm1', name: 'M1' },
  ])
})

test('lists every provider model and resolves the session route as current', async () => {
  const calls = []
  const llm = {
    listProviders: () => [provider('a'), provider('b')],
    async listModels(id) {
      calls.push(id)
      return id === 'a'
        ? [model('a', 'a1', 'A1'), model('a', 'a2', 'A2')]
        : [model('b', 'b1', 'B1')]
    },
  }
  const ctx = context({
    llm,
    sessions: { get: () => ({ requestHeader: () => ({ config: { provider: 'a', model: 'a2' } }) }) },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'd' }) },
  })

  assert.deepEqual(await listModelChoices(ctx, { sessionId: 's' }), {
    models: [
      { provider: 'a', model: 'a1', name: 'A1' },
      { provider: 'a', model: 'a2', name: 'A2' },
      { provider: 'b', model: 'b1', name: 'B1' },
    ],
    current: { provider: 'a', model: 'a2' },
  })
  assert.deepEqual(calls, ['a', 'b'])
})

test('falls back to the current route when provider listing throws', async () => {
  const ctx = context({
    llm: {
      listProviders() { throw new Error('registry offline') },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'd' }) },
  })

  assert.deepEqual(await listModelChoices(ctx, {}), {
    models: [{ provider: 'default', model: 'd', name: 'd' }],
    current: { provider: 'default', model: 'd' },
  })
})

test('skips one failing provider catalog and still lists the others', async () => {
  const llm = {
    listProviders: () => [provider('a'), provider('b')],
    async listModels(id) {
      if (id === 'a') throw new Error('discovery failed')
      return [model('b', 'b1', 'B1')]
    },
  }
  const ctx = context({
    llm,
    agentDefaultModel: { currentSelection: () => ({ provider: 'b', model: 'b1' }) },
  })

  assert.deepEqual((await listModelChoices(ctx, {})).models, [
    { provider: 'b', model: 'b1', name: 'B1' },
  ])
})

test('adds the current route when the catalog does not advertise it', async () => {
  const ctx = context({
    llm: {
      listProviders: () => [provider('a')],
      listModels: async () => [model('a', 'a1', 'A1')],
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'a', model: 'unlisted' }) },
  })

  const { models, current } = await listModelChoices(ctx, {})
  assert.deepEqual(current, { provider: 'a', model: 'unlisted' })
  assert.deepEqual(models.at(-1), { provider: 'a', model: 'unlisted', name: 'unlisted' })
})

test('reports no current route when none can be resolved', async () => {
  assert.deepEqual(await listModelChoices(context({}), {}), { models: [], current: null })
})

test('validates an explicit route against provider and model shape', async () => {
  const llm = {
    listProviders: () => [provider('a')],
    listModels: async () => [model('a', 'a1', 'A1')],
  }
  const ctx = context({ llm })

  assert.equal(await isModelAvailable(ctx, { provider: 'a', model: 'a1' }), true)
  assert.equal(await isModelAvailable(ctx, { provider: 'a', model: 'missing' }), false)
  assert.equal(await isModelAvailable(ctx, { provider: 'other', model: 'a1' }), false)
  assert.equal(await isModelAvailable(ctx, { provider: 'a' }), false)
  assert.equal(await isModelAvailable(ctx, { provider: '', model: 'a1' }), false)
})

test('accepts a shaped route when the host cannot list models', async () => {
  assert.equal(await isModelAvailable(context({}), { provider: 'p', model: 'm' }), true)
  assert.equal(await isModelAvailable(context({
    llm: { listProviders: () => { throw new Error('boom') } },
  }), { provider: 'p', model: 'm' }), true)
  assert.equal(await isModelAvailable(context({
    llm: {
      listProviders: () => [provider('p')],
      listModels: async () => { throw new Error('boom') },
    },
  }), { provider: 'p', model: 'm' }), true)
})
