/**
 * Interaction tests for the mounted card: asking, streaming, copying, keeping
 * and dropping records, and switching models.
 *
 * These drive the real component through its rendered DOM, so a handler that
 * throws, a state update that never lands, or a request body that lost a field
 * fails here rather than in the browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'

import { installDom, click } from './helpers/dom.mjs'
import { mountComponent } from './helpers/mount.mjs'

const { act } = React

const NODE_KEY = '1:assistant-step1:1'

/** The anchor a real card captures from the live selection. */
const ANCHOR = {
  nodeKey: NODE_KEY,
  sourceIndex: 0,
  spans: [{ blockIndex: 0, start: 0, end: 16 }],
  text: 'selected passage',
}

/** A chat snapshot whose one assistant node holds the selected passage. */
function chatOf() {
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
function cardProps(overrides = {}) {
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

/** Install a DOM, mount a card, run one body, always unmount and restore. */
async function withCard(body, options = {}) {
  const env = installDom(options.html ?? '', options.viewport)
  const originalFetch = globalThis.fetch
  const mounted = await mountComponent(
    (plugin) => (options.build ? options.build(plugin) : cardProps(options.props)),
    options.mount,
  )
  try {
    return await body(mounted, env)
  } finally {
    globalThis.fetch = originalFetch
    await mounted.unmount()
    env.restore()
  }
}

/** A fetch that answers with one SSE response built from `frames`. */
function sseFetch(frames, { status = 200 } = {}) {
  const calls = []
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/dsh-clipchat/models')) {
      return { ok: true, json: async () => ({ models: [] }) }
    }
    if (status !== 200) {
      return { ok: false, status, json: async () => ({ error: 'llm-unavailable' }) }
    }
    const bytes = new TextEncoder().encode(body)
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

/** Type a question into the composer and press Enter. */
async function askQuestion(container, question) {
  const textarea = container.querySelector('.clipchat-card__ta')
  const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => {
    setter.call(textarea, question)
    textarea.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
  })
  await act(async () => {
    textarea.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  })
}

/** A preset button by its label. */
function presetButton(container, label) {
  return [...container.querySelectorAll('.clipchat-card__preset')]
    .find((button) => button.textContent === label)
}

test('a preset asks with the selection, message and turn', async () => {
  const { fetchImpl, calls } = sseFetch([
    { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
    { type: 'delta', text: 'an answer' },
    { type: 'usage', usage: { input: 10, output: 5 } },
    { type: 'done' },
  ])
  globalThis.fetch = fetchImpl

  await withCard(async ({ container }) => {
    const preset = presetButton(container, 'presetExplain')
    assert.ok(preset, 'the preset rendered')
    await act(async () => {
      click(preset)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    const ask = calls.find((call) => call.url.includes('/dsh-clipchat/ask'))
    assert.ok(ask, 'the ask route was called')
    const body = JSON.parse(ask.init.body)
    assert.equal(body.selection, 'selected passage')
    assert.equal(body.message, 'the whole assistant message')
    assert.equal(body.turn, 1)
    assert.equal(body.detail, undefined, 'detailed mode is off by default')
  })
})

test('an answer streams into the card and clears the composer', async () => {
  const { fetchImpl } = sseFetch([
    { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
    { type: 'delta', text: 'first half. ' },
    { type: 'delta', text: 'second half.' },
    { type: 'usage', usage: { input: 10, output: 5 } },
    { type: 'done' },
  ])
  globalThis.fetch = fetchImpl

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    const answer = container.querySelector('.clipchat-card__a')
    assert.ok(answer.textContent.includes('first half'), 'the streamed answer rendered')
    assert.ok(answer.textContent.includes('second half'), 'both deltas rendered')
    assert.equal(container.querySelector('.clipchat-card__ta').value, '', 'the composer was cleared')
    assert.ok(container.querySelector('.clipchat-card__tokens').textContent.includes('10'), 'usage was shown')
  })
})

test('a failed request shows the mapped error and stops streaming', async () => {
  globalThis.fetch = sseFetch([], { status: 503 }).fetchImpl

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    const error = container.querySelector('.clipchat-card__error')
    assert.ok(error, 'an error was shown')
    assert.equal(error.textContent, 'llmUnavailable')
  })
})

test('a stream error frame is reported and no answer is kept', async () => {
  globalThis.fetch = sseFetch([{ type: 'error', message: 'boom' }]).fetchImpl

  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    assert.equal(container.querySelector('.clipchat-card__error').textContent, 'boom')
    assert.equal(plugin.__test.recordCount(), 0, 'a failed answer is not recorded')
  })
})

test('an empty answer is reported as a failure', async () => {
  globalThis.fetch = sseFetch([{ type: 'done' }]).fetchImpl

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    assert.equal(container.querySelector('.clipchat-card__error').textContent, 'failed')
  })
})

test('a network throw is reported', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return { ok: true, json: async () => ({ models: [] }) }
    throw new Error('offline')
  }

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    assert.equal(container.querySelector('.clipchat-card__error').textContent, 'network')
  })
})

test('a successful answer is recorded automatically, and cancelling drops it', async () => {
  const { fetchImpl } = sseFetch([
    { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
    { type: 'delta', text: 'the answer' },
    { type: 'done' },
  ])
  globalThis.fetch = fetchImpl

  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    assert.equal(plugin.__test.recordCount(), 1, 'the answer was recorded by default')
    const record = plugin.__test.recordList()[0]
    assert.equal(record.turns.length, 1)
    assert.equal(record.turns[0].question, 'my question')
    assert.equal(record.turns[0].answer, 'the answer')

    const toggle = [...container.querySelectorAll('.clipchat-actions__btn')]
      .find((button) => button.textContent === 'unrecord')
    assert.ok(toggle, 'the button offers to cancel')
    await act(async () => {
      click(toggle)
    })

    assert.equal(plugin.__test.recordCount(), 0, 'the only turn was dropped with the record')
  })
})

test('asking twice about one passage keeps a single record with two turns', async () => {
  // Count only asks: the card also POSTs to /highlight and /record, and those
  // are not rounds of conversation.
  let round = 0
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (!target.includes('/dsh-clipchat/ask')) {
      return { ok: true, json: async () => ({ models: [] }) }
    }
    round += 1
    const body = [
      { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
      { type: 'delta', text: `answer ${round}` },
      { type: 'done' },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
    const bytes = new TextEncoder().encode(body)
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

  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'first question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    await askQuestion(container, 'second question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    assert.equal(plugin.__test.recordCount(), 1, 'one record for the passage')
    const record = plugin.__test.recordList()[0]
    assert.deepEqual(record.turns.map((turn) => turn.question), ['first question', 'second question'])
    assert.deepEqual(record.turns.map((turn) => turn.answer), ['answer 1', 'answer 2'])
    assert.ok(record.highlightId, 'the record is bound to the highlight')
  })
})

test('cancelling one of two turns keeps the earlier answer', async () => {
  // Count only asks: the card also POSTs to /highlight and /record, and those
  // are not rounds of conversation.
  let round = 0
  globalThis.fetch = async (url) => {
    const target = String(url)
    if (!target.includes('/dsh-clipchat/ask')) {
      return { ok: true, json: async () => ({ models: [] }) }
    }
    round += 1
    const body = [
      { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
      { type: 'delta', text: `answer ${round}` },
      { type: 'done' },
    ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
    const bytes = new TextEncoder().encode(body)
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

  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'first question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    await askQuestion(container, 'second question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    const toggle = [...container.querySelectorAll('.clipchat-actions__btn')]
      .find((button) => button.textContent === 'unrecord')
    await act(async () => {
      click(toggle)
    })

    assert.equal(plugin.__test.recordCount(), 1, 'the record survives')
    assert.deepEqual(plugin.__test.recordList()[0].turns.map((turn) => turn.question), ['first question'])
  })
})

test('asking with no readable message reports no context', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ models: [] }) })

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    assert.equal(container.querySelector('.clipchat-card__error').textContent, 'noContext')
  }, {
    props: {
      useChat: (selector) => selector({
        nodes: { get: () => undefined },
        timeline: { turnOrder: [], turns: new Map() },
        locations: { getTurn: () => [] },
      }),
    },
  })
})

test('a preset is disabled while a request is in flight', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return { ok: true, json: async () => ({ models: [] }) }
    // Never resolves: the request stays in flight.
    return { ok: true, body: { getReader: () => ({ read: () => new Promise(() => {}) }) } }
  }

  await withCard(async ({ container }) => {
    const preset = presetButton(container, 'presetExplain')
    await act(async () => {
      click(preset)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    assert.equal(presetButton(container, 'presetExplain').disabled, true, 'presets are disabled while streaming')
  })
})

test('a non-JSON rejection still reports its status', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return { ok: true, json: async () => ({ models: [] }) }
    return { ok: false, status: 502, json: async () => { throw new Error('not json') } }
  }

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    assert.ok(container.querySelector('.clipchat-card__error'), 'an error was still shown')
  })
})

test('a response with no readable body reports a failure', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) return { ok: true, json: async () => ({ models: [] }) }
    return { ok: true, body: {} }
  }

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })
    assert.equal(container.querySelector('.clipchat-card__error').textContent, 'failed')
  })
})

test('an answer rendered as markdown produces headings, lists and quotes', async () => {
  globalThis.fetch = sseFetch([
    { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
    { type: 'delta', text: '## A heading\n\n- one\n- two\n\n> quoted\n\nplain paragraph' },
    { type: 'done' },
  ]).fetchImpl

  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40))
    })

    const answer = container.querySelector('.clipchat-card__a')
    assert.ok(answer.querySelector('.clipchat-card__h'), 'the heading rendered')
    assert.ok(answer.querySelector('.clipchat-card__list'), 'the list rendered')
    assert.ok(answer.querySelector('.clipchat-card__quote'), 'the quote rendered')
    assert.ok(answer.querySelector('.clipchat-card__p'), 'the paragraph rendered')
    assert.equal(answer.textContent.includes('##'), false, 'the raw markers are gone')
  })
})
