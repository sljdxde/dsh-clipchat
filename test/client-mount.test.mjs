/**
 * Regression tests for the card's mount path.
 *
 * These mount the real component with real React into a real DOM. The unit
 * tests that inspect a returned element tree cannot see a component that throws
 * on render — the tree looks fine right up until React runs it — and that is
 * exactly how reopening a highlight broke: a field the record no longer had was
 * read during the first render.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { installDom, click } from './helpers/dom.mjs'
import { mountComponent, settle } from './helpers/mount.mjs'

const { act } = await import('react')

/** Let effects and promises settle. */
async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** Props for one mounted card, with a chat snapshot that resolves one node. */
function cardProps(overrides = {}) {
  const nodeKey = '1:assistant-step1:1'
  return {
    selection: 'selected passage',
    nodeKey,
    anchor: null,
    dismiss() {},
    translate: (key) => key,
    sessionId: 'session-test',
    useChat: (selector) => selector({
      nodes: { get: () => undefined },
      timeline: { turnOrder: [], turns: new Map() },
      locations: { getTurn: () => [] },
    }),
    initialHighlightId: undefined,
    ...overrides,
  }
}

/** Install a DOM, run one body, always restore. */
async function withDom(body, html = '') {
  const env = installDom(html)
  const originalFetch = globalThis.fetch
  try {
    return await body(env)
  } finally {
    globalThis.fetch = originalFetch
    env.restore()
  }
}

test('the card mounts without throwing', async () => {
  await withDom(async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const mounted = await mountComponent(() => cardProps())
    try {
      assert.ok(mounted.container.querySelector('.clipchat-card'), 'the card rendered')
      assert.ok(mounted.container.querySelector('.clipchat-card__ta'), 'the composer rendered')
    } finally {
      await mounted.unmount()
    }
  })
})

test('reopening a highlight mounts and shows every stored turn', async () => {
  await withDom(async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const mounted = await mountComponent((plugin) => {
      plugin.__test.addRecord({
        id: 'r-reopen',
        highlightId: 'h-reopen',
        selection: 'selected passage',
        turns: [
          { question: 'first question', answer: 'first answer', provider: 'deepseek', model: 'deepseek-chat', createdAt: 1000 },
          { question: 'second question', answer: 'second answer', provider: 'deepseek', model: 'deepseek-chat', createdAt: 2000 },
        ],
        createdAt: 1000,
        updatedAt: 2000,
      }, 'session-test')
      return cardProps({ initialHighlightId: 'h-reopen' })
    })
    try {
      const questions = [...mounted.container.querySelectorAll('.clipchat-card__q')].map((node) => node.textContent)
      assert.deepEqual(questions, ['first question', 'second question'], 'both stored turns render')
      const composer = mounted.container.querySelector('.clipchat-card__ta')
      assert.equal(composer.value, '', 'a recalled record must not refill the composer')
    } finally {
      await mounted.unmount()
    }
  })
})

test('reopening a highlight whose record has a single turn still renders', async () => {
  await withDom(async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const mounted = await mountComponent((plugin) => {
      plugin.__test.addRecord({
        id: 'r-one',
        highlightId: 'h-one',
        selection: 'selected passage',
        turns: [{ question: 'only question', answer: 'only answer', provider: 'p', model: 'm', createdAt: 1000 }],
        createdAt: 1000,
        updatedAt: 1000,
      }, 'session-test')
      return cardProps({ initialHighlightId: 'h-one' })
    })
    try {
      assert.equal(mounted.container.querySelectorAll('.clipchat-card__turn').length, 1)
    } finally {
      await mounted.unmount()
    }
  })
})

test('reopening a highlight with no stored record still renders', async () => {
  await withDom(async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const mounted = await mountComponent(() => cardProps({ initialHighlightId: 'h-missing' }))
    try {
      assert.ok(mounted.container.querySelector('.clipchat-card'))
      assert.equal(mounted.container.querySelectorAll('.clipchat-card__turn').length, 0)
    } finally {
      await mounted.unmount()
    }
  })
})

/* --- ClipMenu: the first surface a reader sees --- */

/** A chat column with one assistant step, so a selection resolves. */
function selectionHtml() {
  return `
    <div data-chat-flow>
      <div data-chat-turn="1">
        <div data-chat-node-key="1:assistant-step1:1">
          <div data-text-interaction-source="0"><p id="p1">the selected passage</p></div>
        </div>
      </div>
    </div>
  `
}

/** Props for a mounted ClipMenu. */
function menuProps(overrides = {}) {
  return {
    Original: (props) => globalThis.React.createElement('span', { className: 'quote-original' }, 'original'),
    dismiss() {},
    readText: () => 'the selected passage',
    translate: (key) => key,
    ...overrides,
  }
}

test('the quote menu offers 问这段 and expands into the card', async () => {
  await withDom(async (env) => {
    globalThis.React = (await import('react')).default ?? await import('react')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    // Select inside the assistant passage so the menu resolves a node key.
    const { selectRange } = await import('./helpers/dom.mjs')
    selectRange(env.document.getElementById('p1').firstChild, 4, 12)

    const mounted = await mountComponent(() => menuProps(), { component: 'menu' })
    try {
      // The menu renders the host's original entry plus its own button.
      assert.ok(mounted.container.querySelector('.clipchat-menu'), 'the menu rendered')
      assert.ok(mounted.container.querySelector('.quote-original'), 'the host entry is kept')
      const ask = mounted.container.querySelector('.clipchat-menu__ask')
      assert.ok(ask, 'the ask button rendered')
      assert.equal(ask.textContent, 'ask')
    } finally {
      await mounted.unmount()
    }
  }, selectionHtml())
})

test('the quote menu falls back to the host entry outside an assistant node', async () => {
  await withDom(async () => {
    globalThis.React = (await import('react')).default ?? await import('react')
    const mounted = await mountComponent(() => menuProps(), { component: 'menu' })
    try {
      // No selection: nodeKeyOfSelection() is null, so the host entry renders alone.
      assert.equal(mounted.container.querySelector('.clipchat-menu'), null, 'the plugin menu is not shown')
      assert.ok(mounted.container.querySelector('.quote-original'), 'the host entry rendered')
    } finally {
      await mounted.unmount()
    }
  })
})

test('the quote menu survives a readText that throws', async () => {
  await withDom(async (env) => {
    globalThis.React = (await import('react')).default ?? await import('react')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const { selectRange } = await import('./helpers/dom.mjs')
    selectRange(env.document.getElementById('p1').firstChild, 4, 12)

    const mounted = await mountComponent(() => menuProps({
      readText: () => { throw new Error('no selection') },
    }), { component: 'menu' })
    try {
      assert.ok(mounted.container.querySelector('.clipchat-menu'), 'the menu still rendered')
    } finally {
      await mounted.unmount()
    }
  }, selectionHtml())
})

test('the quote menu expands into the card on 问这段', async () => {
  await withDom(async (env) => {
    globalThis.React = (await import('react')).default ?? await import('react')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const { selectRange, click } = await import('./helpers/dom.mjs')
    selectRange(env.document.getElementById('p1').firstChild, 4, 12)

    const mounted = await mountComponent(() => menuProps(), { component: 'menu' })
    try {
      const ask = mounted.container.querySelector('.clipchat-menu__ask')
      await act(async () => {
        click(ask)
      })
      await flush(30)

      assert.ok(mounted.container.querySelector('.clipchat-card'), 'the card opened')
      assert.equal(mounted.container.querySelectorAll('.clipchat-menu').length, 0, 'the menu is replaced')
    } finally {
      await mounted.unmount()
    }
  }, selectionHtml())
})

test('cancelling a record on a reopened highlight drops only its newest turn', async () => {
  await withDom(async () => {
    globalThis.React = (await import('react')).default ?? await import('react')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })
    const mounted = await mountComponent((plugin) => {
      plugin.__test.addRecord({
        id: 'r-two',
        highlightId: 'h-two',
        selection: 'selected passage',
        turns: [
          { question: 'older question', answer: 'older answer', provider: 'p', model: 'm', createdAt: 1000 },
          { question: 'newer question', answer: 'newer answer', provider: 'p', model: 'm', createdAt: 2000 },
        ],
        createdAt: 1000,
        updatedAt: 2000,
      }, 'session-test')
      return cardProps({ initialHighlightId: 'h-two' })
    })
    try {
      const toggle = [...mounted.container.querySelectorAll('.clipchat-actions__btn')]
        .find((button) => button.textContent === 'unrecord')
      assert.ok(toggle, 'the cancel button rendered for a recalled record')
      await act(async () => {
        click(toggle)
      })
      await flush()
      const record = mounted.plugin.__test.recordList()[0]
      assert.deepEqual(record.turns.map((turn) => turn.question), ['older question'],
        'only the newest turn was dropped')
    } finally {
      await mounted.unmount()
    }
  })
})
