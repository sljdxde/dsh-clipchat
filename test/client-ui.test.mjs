import { test } from 'node:test'
import assert from 'node:assert/strict'

import { loadBundle, makeReact } from './helpers/load-client.mjs'

test('the disabled-conversation notice uses the locale t prop', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const view = plugin.__test.ClipNotice({ dismiss() {}, t: (key) => `T:${key}` })
  const text = JSON.stringify(view)
  assert.match(text, /T:title/)
  assert.match(text, /T:unavailable/)
  assert.throws(() => plugin.__test.ClipNotice({ dismiss() {} }), /t is not a function/)
})
