import { loadBundle, makeReact } from './helpers/load-client.mjs'

import { test } from 'node:test'
import assert from 'node:assert/strict'

function makeContext(entries) {
  const disposers = []
  const registrations = []
  const ctx = {
    effect(fn) { const dispose = fn(); disposers.push(dispose); return dispose },
    locale: {
      register(ns, dicts) { registrations.push({ ns, dicts }); return () => {} },
      bind(ns) { return (key) => `${ns}:${key}` },
    },
    slots: {
      entries() { return entries },
      subscribe() { return () => {} },
      inject(_name, fn) { const dispose = fn(); disposers.push(dispose); return dispose },
    },
  }
  return { ctx, disposers, registrations }
}

test('wraps the native quote surface and restores it on dispose', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const original = function Original() { return null }
  const entry = { options: { key: 'quote' }, component: original }
  const { ctx, disposers, registrations } = makeContext([entry])

  plugin.apply(ctx)

  assert.notEqual(entry.component, original, 'quote entry is wrapped')
  assert.equal(registrations.length, 1, 'clipchat locale dictionary registered')

  for (const dispose of disposers.reverse()) dispose()
  assert.equal(entry.component, original, 'quote entry restored')
})

test('applying twice does not double-wrap the quote entry', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const original = function Original() { return null }
  const entry = { options: { key: 'quote' }, component: original }
  const first = makeContext([entry])
  plugin.apply(first.ctx)
  const wrapped = entry.component

  const second = makeContext([entry])
  plugin.apply(second.ctx)
  assert.equal(entry.component, wrapped, 'second apply leaves the wrapper in place')

  for (const dispose of second.disposers.reverse()) dispose()
  assert.equal(entry.component, wrapped, 'second cleanup does not restore the first wrapper')
})

test('classifies assistant node keys and rejects user keys', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.equal(plugin.__test.isAssistantNodeKey('14:assistant-step11:3'), true)
  assert.equal(plugin.__test.isAssistantNodeKey('14:user12:0'), false)
  assert.equal(plugin.__test.isAssistantNodeKey(null), false)
})

test('splits a span across text nodes without losing offsets', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.deepEqual(plugin.__test.segmentsForSpan([10, 10], 2, 15), [
    { index: 0, from: 2, to: 10 },
    { index: 1, from: 0, to: 5 },
  ])
  assert.deepEqual(plugin.__test.segmentsForSpan([5, 5, 5], 6, 9), [
    { index: 1, from: 1, to: 4 },
  ])
  assert.deepEqual(plugin.__test.segmentsForSpan([4], 1, 9), [{ index: 0, from: 1, to: 4 }])
})

test('re-anchors a span when block text shifted, else gives up', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const span = { blockIndex: 2, start: 4, end: 10 }
  assert.deepEqual(plugin.__test.resolvedSpanAt('0123abcdef', span, 'abcdef'), span)
  assert.deepEqual(plugin.__test.resolvedSpanAt('前缀--0123abcdef', span, 'abcdef'), { blockIndex: 2, start: 8, end: 14 })
  assert.equal(plugin.__test.resolvedSpanAt('完全不同的文字', span, 'abcdef'), null)
})

test('folding a paste keys on visual rows and on raw length', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  // No layout engine in jsdom, so rows fall back to source line breaks.
  assert.equal(plugin.__test.shouldFoldPaste('一行'), false)
  assert.equal(plugin.__test.shouldFoldPaste('a\nb\nc'), false)
  assert.equal(plugin.__test.shouldFoldPaste('a\nb\nc\nd'), true)
  assert.equal(plugin.__test.shouldFoldPaste('x'.repeat(241)), true)
  assert.equal(plugin.__test.shouldFoldPaste('   '), false)
  assert.equal(plugin.__test.visualLineCount('a\nb'), 2)
  assert.equal(plugin.__test.formatBytes(0), '0 B')
  assert.equal(plugin.__test.formatBytes(2048), '2.0 KB')
  assert.equal(plugin.__test.fileExtOf('a.tar.gz'), 'GZ')
  assert.equal(plugin.__test.fileExtOf('noext'), 'FILE')
})
