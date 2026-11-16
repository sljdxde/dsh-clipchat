import { test } from 'node:test'
import assert from 'node:assert/strict'

function makeReact() {
  return {
    createElement: (...args) => ({ args }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: 'Fragment',
  }
}

async function loadBundle() {
  let definition
  const styles = []
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  globalThis.document = {
    head: { appendChild(node) { styles.push(node) } },
    createElement() {
      return { dataset: {}, style: {}, textContent: '', remove() {} }
    },
  }
  const url = new URL('../client.js', import.meta.url)
  await import(`${url.href}?v=${Date.now()}`)
  assert.ok(definition, 'bundle called __ModuleLoader__.load')
  return { definition, styles }
}

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
