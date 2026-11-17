/**
 * Render the browser bundle's components with real React into a real DOM.
 *
 * The unit tests elsewhere call `ClipCard` directly and inspect the returned
 * element tree. That catches pure helpers but not the bugs that matter most:
 * a component that throws on render, an effect that never cleans up, a click
 * that hits nothing. Those only appear when React actually mounts the tree, so
 * this helper mounts for real.
 */
import assert from 'node:assert/strict'
import * as REACT from 'react'

import { loadBundle } from './load-client.mjs'

/**
 * react-dom, imported only after a DOM exists.
 *
 * It probes `document` once at module scope to decide whether the browser
 * supports `input` events; imported before `installDom()`, it concludes there is
 * no DOM and installs an IE-era polyfill, after which React's `onChange` never
 * fires and every controlled input looks broken. Importing it lazily, after the
 * document is in place, keeps it on the modern path.
 */
let reactDomPromise

/** @returns {Promise<{ createRoot: Function }>} react-dom/client. */
function reactDom() {
  reactDomPromise ??= import('react-dom/client')
  return reactDomPromise
}

/**
 * Load the bundle and mount one component into a real container.
 *
 * @param {(React: object) => object} build - given the real React, returns the props to mount.
 * @param {object} [options] - mount options.
 * @param {object} [options.component] - component to mount; defaults to the card.
 * @param {string} [options.html] - body markup the component measures against.
 * @returns {Promise<{ container: HTMLElement, plugin: object, unmount: () => Promise<void>, rerender: (props: object) => Promise<void> }>} the mounted tree.
 */
export async function mountComponent(build, options = {}) {
  assert.ok(globalThis.document, 'installDom() must run before mountComponent()')
  const { createRoot } = await reactDom()
  const { createElement, act } = REACT
  const { definition } = await loadBundle()
  // The bundle asks the loader for `react`; hand it the real one so hooks work.
  const plugin = definition.factory((name) => {
    if (name === 'react') return require_react()
    throw new Error(`unexpected module: ${name}`)
  })

  const document = globalThis.document
  if (options.html !== undefined) document.body.innerHTML = options.html

  const container = document.createElement('div')
  container.className = 'clipchat-test-root'
  document.body.appendChild(container)
  const root = createRoot(container)

  // `component` is either a component or the name of one on the test surface.
  const component = typeof options.component === 'string'
    ? plugin.__test[options.component === 'menu' ? 'ClipMenu' : options.component]
    : (options.component ?? plugin.__test.ClipCard)
  assert.equal(typeof component, 'function', 'the component to mount exists')
  const props = build(plugin)

  await act(async () => {
    root.render(createElement(component, props))
  })

  return {
    container,
    plugin,
    rerender: async (nextProps) => {
      await act(async () => {
        root.render(createElement(component, nextProps))
      })
    },
    unmount: async () => {
      await act(async () => root.unmount())
      container.remove()
    },
  }
}

/** React itself, handed to the bundle's `require('react')`. */
function require_react() {
  return REACT
}

/**
 * Let pending effects, timers and promise callbacks settle.
 * @param {number} [ms] - how long to wait.
 */
export async function settle(ms = 0) {
  await REACT.act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}
