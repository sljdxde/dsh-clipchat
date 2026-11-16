/** Load the browser bundle under a fake module loader and a stub React. */
import assert from 'node:assert/strict'

export function makeReact() {
  return {
    createElement: (...args) => ({ args }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: 'Fragment',
  }
}

export async function loadBundle() {
  let definition
  const styles = []
  globalThis.window = { __ModuleLoader__: { load(value) { definition = value } } }
  globalThis.document = {
    head: { appendChild(node) { styles.push(node) } },
    createElement() {
      return { dataset: {}, style: {}, textContent: '', remove() {} }
    },
  }
  const url = new URL('../../client.js', import.meta.url)
  await import(`${url.href}?v=${Date.now()}-${Math.random()}`)
  assert.ok(definition, 'bundle called __ModuleLoader__.load')
  return { definition, styles }
}
