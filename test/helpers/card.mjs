/**
 * Shared harness for the mounted clipchat card.
 *
 * Both composer suites drive the same component against the same chat snapshot,
 * fetch stub and DOM setup. Keeping one copy here is what the repo's test
 * standard asks for: behaviour tests share harnesses instead of cloning them.
 */
import * as React from 'react'

import { installDom, click } from './dom.mjs'
import { mountComponent } from './mount.mjs'

const { act } = React

/** The assistant node every card fixture points at. */
export const NODE_KEY = '1:assistant-step1:1'

/** The anchor a real card captures from the live selection. */
export const ANCHOR = {
  nodeKey: NODE_KEY,
  sourceIndex: 0,
  spans: [{ blockIndex: 0, start: 0, end: 16 }],
  text: 'selected passage',
}

/** A chat snapshot whose one assistant node holds the selected passage. */
export function chatOf() {
  const node = {
    kind: 'assistant-step',
    data: { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: 'the whole assistant message' }] },
  }
  return (selector) => selector({
    nodes: { get: (key) => (key === NODE_KEY ? node : undefined) },
    timeline: { turnOrder: [1], turns: new Map([[1, { user: 'q', steps: [] }]]) },
    locations: { getTurn: () => [] },
  })
}

/** Card props with sensible defaults. */
export function cardProps(overrides = {}) {
  return {
    selection: 'selected passage',
    nodeKey: NODE_KEY,
    anchor: ANCHOR,
    dismiss() {},
    translate: (key) => key,
    sessionId: 'session-test',
    useChat: chatOf(),
    initialHighlightId: undefined,
    ...overrides,
  }
}

/** Let pending effects and promises settle inside act(). */
export const flush = (ms = 60) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })

/** A fetch that records the ask body and returns one short SSE answer. */
export function askFetch() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/dsh-clipchat/models')) return { ok: true, json: async () => ({ models: [] }) }
    const bytes = new TextEncoder().encode('data: {"type":"delta","text":"ok"}\n\ndata: {"type":"done"}\n\n')
    let sent = false
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { value: undefined, done: true }
            sent = true
            return { value: bytes, done: false }
          },
        }),
      },
    }
  }
  return { fetchImpl, calls }
}

/** Install a DOM, mount a card, run one body, always unmount and restore. */
export async function withCard(body, options = {}) {
  const env = installDom(options.html ?? '', options.viewport)
  const originalFetch = globalThis.fetch
  const mounted = await mountComponent(() => cardProps(options.props), options.mount)
  try {
    return await body(mounted, env)
  } finally {
    globalThis.fetch = originalFetch
    await mounted.unmount()
    env.restore()
  }
}

/** Attach files through the hidden input. */
export async function pickFiles(container, files) {
  const input = container.querySelector('input[type="file"]')
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  await act(async () => {
    input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }))
  })
}

/** Fire a drag event the way the browser would, with a file payload. */
export async function drag(container, type, files) {
  const card = container.querySelector('.clipchat-card')
  const event = new globalThis.window.Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files, dropEffect: 'none' } })
  await act(async () => { card.dispatchEvent(event) })
  return event
}

/** Fire a clipboard paste with text at the textarea. */
export async function pasteText(container, text) {
  const ta = container.querySelector('.clipchat-card__ta')
  const event = new globalThis.window.Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text, items: [] } })
  await act(async () => { ta.dispatchEvent(event) })
  return event
}

export { click }
