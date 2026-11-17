/**
 * Load the browser bundle with a fresh module state each time.
 *
 * The bundle keeps its highlights, records and style tag in module-level
 * variables, so tests need a fresh copy. A cache-busting query string would do
 * that, but every distinct URL becomes a separate script in V8's coverage
 * report, and only one of them is counted — which silently understates
 * coverage. Running the source through `vm` with a fixed filename gives the
 * isolation without fragmenting the report.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const CLIENT_URL = new URL('../../client.js', import.meta.url)
const CLIENT_PATH = fileURLToPath(CLIENT_URL)

/** The bundle source, read once. */
let sourcePromise

/** @returns {Promise<string>} the bundle source. */
function clientSource() {
  sourcePromise ??= readFile(CLIENT_PATH, 'utf8')
  return sourcePromise
}

/**
 * Minimal React stand-in for tests that only inspect the returned element tree.
 *
 * Hooks do not re-render here, so this is for pure helpers and one-shot render
 * assertions. For anything that must actually run (effects, events, DOM
 * measurement) mount the component instead — see `mount.mjs`.
 */
export function makeReact() {
  return {
    createElement: (...args) => ({ args }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    Fragment: 'Fragment',
  }
}

/** @returns {boolean} whether a real document is installed. */
function hasRealDocument() {
  return globalThis.document?.nodeType === 9
    && typeof globalThis.document?.createElement === 'function'
}

/**
 * Load the browser bundle, capturing its `__ModuleLoader__` definition.
 *
 * When a real DOM is installed (see `dom.mjs`) it is kept and only the module
 * loader is added, so the bundle runs against jsdom. With no DOM present a stub
 * document is installed, which is enough for pure helpers.
 *
 * @returns {Promise<{ definition: object, styles: object[] }>} the bundle definition.
 */
export async function loadBundle() {
  let definition
  const styles = []
  const loader = { load(value) { definition = value } }

  if (hasRealDocument()) {
    // Real DOM: attach the loader to it and record style tags as they arrive.
    globalThis.window.__ModuleLoader__ = loader
    const head = globalThis.document.head
    const original = head.appendChild.bind(head)
    head.appendChild = (node) => {
      if (node?.tagName === 'STYLE') styles.push(node)
      return original(node)
    }
  } else if (typeof globalThis.document?.querySelector === 'function') {
    // A hand-written document stub: keep it, it is what the test measures.
    globalThis.window ??= {}
    globalThis.window.__ModuleLoader__ = loader
  } else {
    globalThis.window = { __ModuleLoader__: loader }
    globalThis.document = {
      head: { appendChild(node) { styles.push(node) } },
      createElement() {
        return { dataset: {}, style: {}, textContent: '', remove() {} }
      },
    }
  }

  // A fixed filename keeps every load on one coverage entry; `vm` still gives
  // each load its own module scope, so state never leaks between tests.
  vm.runInThisContext(await clientSource(), {
    filename: CLIENT_PATH,
    displayErrors: true,
  })
  assert.ok(definition, 'bundle called __ModuleLoader__.load')
  return { definition, styles }
}
