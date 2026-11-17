/**
 * A real DOM for the browser bundle.
 *
 * The bundle does most of its work against `document` — measuring selections,
 * positioning the overlay, reading chat nodes — so a stub object cannot catch
 * the bugs that matter (a component that throws on render, an anchor that
 * resolves to nothing). This helper installs jsdom's document as the global the
 * bundle reads, and takes it down again afterwards.
 *
 * `installDom()` is idempotent per call but always returns a fresh document;
 * always pair it with `restore()` in a `finally`.
 */
import { JSDOM } from 'jsdom'

/** Globals the bundle reads that jsdom does not provide by default. */
const EXTRA_GLOBALS = [
  'Element',
  'Node',
  'NodeFilter',
  'Range',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'TextDecoder',
  'TextEncoder',
  'AbortController',
]

/**
 * Install a fresh jsdom document as the global `document` / `window`.
 * @param {string} [html] - initial body markup.
 * @param {{ width?: number, height?: number }} [viewport] - element size jsdom reports.
 * @returns {{ dom: JSDOM, window: object, document: Document, restore: () => void }} the environment.
 */
export function installDom(html = '', viewport = {}) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  })
  const { window } = dom
  const saved = new Map()

  /** Assign one global, remembering what was there before. */
  const set = (name, value) => {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    globalThis[name] = value
  }

  set('window', window)
  set('document', window.document)
  // React only turns on act() warnings when this flag is present.
  set('IS_REACT_ACT_ENVIRONMENT', true)
  for (const name of EXTRA_GLOBALS) {
    if (window[name] !== undefined) set(name, window[name])
  }
  // React's legacy input polyfill probes these before using addEventListener.
  // jsdom has no attachEvent, so give it a no-op pair rather than let React throw.
  if (typeof window.Element.prototype.attachEvent !== 'function') {
    window.Element.prototype.attachEvent = () => {}
    window.Element.prototype.detachEvent = () => {}
  }
  // jsdom leaves these at zero; layout maths needs a real box.
  if (viewport.width !== undefined || viewport.height !== undefined) {
    window.Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
      const width = viewport.width ?? 0
      const height = viewport.height ?? 0
      const left = Number(this.dataset?.clipchatLeft ?? 0)
      const top = Number(this.dataset?.clipchatTop ?? 0)
      return {
        x: left,
        y: top,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        toJSON() { return this },
      }
    }
  }

  const restore = () => {
    for (const [name, descriptor] of saved) {
      if (descriptor === undefined) delete globalThis[name]
      else Object.defineProperty(globalThis, name, descriptor)
    }
    dom.window.close()
  }

  return { dom, window, document: window.document, restore }
}

/**
 * Give one element a box, so layout maths can position against it.
 * @param {Element} element - target.
 * @param {{ left?: number, top?: number, width?: number, height?: number }} box - geometry.
 * @returns {Element} the same element.
 */
export function placeElement(element, box) {
  if (box.left !== undefined) element.dataset.clipchatLeft = String(box.left)
  if (box.top !== undefined) element.dataset.clipchatTop = String(box.top)
  if (box.width !== undefined) element.dataset.clipchatWidth = String(box.width)
  if (box.height !== undefined) element.dataset.clipchatHeight = String(box.height)
  return element
}

/**
 * Select a character range inside one text node, as a user drag would.
 * @param {Node} textNode - node holding the text.
 * @param {number} start - first character offset.
 * @param {number} end - one past the last character offset.
 * @returns {Selection} the live selection.
 */
export function selectRange(textNode, start, end) {
  const selection = globalThis.document.getSelection()
  selection.removeAllRanges()
  const range = globalThis.document.createRange()
  range.setStart(textNode, start)
  range.setEnd(textNode, end)
  selection.addRange(range)
  return selection
}

/**
 * Dispatch a bubbling click that looks like a user's.
 * @param {Element} element - target.
 * @param {object} [init] - extra MouseEvent fields.
 * @returns {boolean} whether the event was not cancelled.
 */
export function click(element, init = {}) {
  const window = globalThis.window
  const event = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  })
  return element.dispatchEvent(event)
}
