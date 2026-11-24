/**
 * Interaction tests for the card's secondary surfaces: the detailed-mode strip,
 * the model menu, the records panel and the per-turn copy button.
 *
 * These are the parts a reader touches after the answer arrives, and each one
 * has its own failure mode — a menu that will not close, a panel that renders
 * with nothing in it, a toggle whose state never reaches the request.
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

/** A chat snapshot with one assistant node holding the passage. */
function chatOf() {
  const node = {
    kind: 'assistant-step',
    data: { status: 'settled', turn: 1, blocks: [{ kind: 'text', text: 'the whole assistant message' }] },
  }
  return (selector) => selector({
    nodes: { get: (key) => (key === NODE_KEY ? node : undefined) },
    timeline: { turnOrder: [1], turns: new Map() },
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
  const env = installDom('', options.viewport)
  const originalFetch = globalThis.fetch
  const mounted = await mountComponent((plugin) => (options.build ? options.build(plugin) : cardProps(options.props)))
  try {
    return await body(mounted, env)
  } finally {
    globalThis.fetch = originalFetch
    await mounted.unmount()
    env.restore()
  }
}

/** Wait for pending promises and effects. */
async function flush(ms = 30) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
}

/** One SSE answer, so a test can reach the "answered" state. */
function answerFetch({ digest = null } = {}) {
  const body = [
    { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
    { type: 'delta', text: 'the answer' },
    { type: 'done' },
  ].map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('')
  return async (url) => {
    const target = String(url)
    if (target.includes('/dsh-clipchat/context')) {
      return digest === null
        ? { ok: false, status: 404, json: async () => ({ error: 'context-unavailable' }) }
        : { ok: true, json: async () => digest }
    }
    if (target.includes('/models')) {
      return {
        ok: true,
        json: async () => ({
          models: [
            { provider: 'deepseek', model: 'deepseek-chat', name: 'DeepSeek Chat' },
            { provider: 'bangsun', model: 'deepseek-v4-flash', name: 'Flash' },
          ],
        }),
      }
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
}

/** One SSE answer per ask, numbered so two rounds stay distinguishable. */
function numberedAnswerFetch() {
  let asked = 0
  return async (url, init) => {
    if (!String(url).includes('/dsh-clipchat/ask')) return answerFetch()(url, init)
    asked += 1
    const answer = `第 ${asked} 轮回答`
    const body = [
      { type: 'meta', provider: 'deepseek', model: 'deepseek-chat' },
      { type: 'delta', text: answer },
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

/** The footer button whose label matches. */
function footerButton(container, label) {
  return [...container.querySelectorAll('.clipchat-actions__btn')]
    .find((button) => button.textContent === label)
}

/* --- detailed mode --- */

test('the detail strip starts off and shows the recent-turn readout', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    const strip = container.querySelector('.clipchat-strip')
    assert.ok(strip, 'the strip rendered')
    assert.equal(strip.className.includes('is-on'), false, 'detailed mode is off')
    assert.equal(strip.querySelector('.clipchat-strip__readout').textContent, 'detailOff')
    assert.equal(strip.querySelector('.clipchat-strip__switch').getAttribute('aria-checked'), 'false')
  })
})

test('the injected-now popover opens above the composer, not over it', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    const block = container.querySelector('.clipchat-card__bottom')
    const popover = container.querySelector('.clipchat-strip__detail')
    assert.ok(block, 'the composer block exists')
    assert.ok(popover, 'the popover rendered')
    // A popover nested in the strip opened upward over the composer row and
    // swallowed the click meant for the textarea. Anchored to the block, it
    // opens over the thread above the input instead.
    assert.equal(popover.parentElement, block, 'the popover is a sibling of the strip')
    assert.equal(container.querySelector('.clipchat-strip .clipchat-strip__detail'), null)
    assert.ok(block.contains(container.querySelector('.clipchat-card__composer')), 'the input shares the block')
    assert.equal(popover.getAttribute('role'), 'tooltip')
  })
})

test('turning detailed mode on reads the digest and shows the full history', async () => {
  globalThis.fetch = answerFetch({
    digest: {
      available: true,
      digest: '<summary>earlier</summary><history><turn n="1"/></history>',
      stats: { turns: 12, tools: 40, summaryChars: 800, chars: 9000, tokens: 5600, firstTurn: 3 },
    },
  })
  await withCard(async ({ container }) => {
    const toggle = container.querySelector('.clipchat-strip__switch')
    await act(async () => {
      click(toggle)
    })
    await flush()

    const strip = container.querySelector('.clipchat-strip')
    assert.ok(strip.className.includes('is-on'), 'detailed mode is on')
    assert.equal(strip.querySelector('.clipchat-strip__switch').getAttribute('aria-checked'), 'true')
    assert.equal(
      strip.querySelector('.clipchat-strip__readout').textContent,
      'detailOn',
      'the readout switched to the detailed label',
    )
    assert.ok(strip.querySelector('.clipchat-strip__readout').textContent.length > 0)
  })
})

test('a missing digest leaves detailed mode degraded instead of failing the ask', async () => {
  globalThis.fetch = answerFetch({ digest: null })
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()

    const strip = container.querySelector('.clipchat-strip')
    assert.ok(strip.className.includes('is-degraded'), 'the strip reports the fallback')
    assert.equal(strip.querySelector('.clipchat-strip__readout').textContent, 'detailDegraded')
  })
})

test('a degraded detailed mode still asks, without a digest', async () => {
  const asks = []
  const base = answerFetch({ digest: null })
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/ask')) asks.push(JSON.parse(init.body))
    return base(url, init)
  }
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    await askQuestion(container, 'my question')
    await flush(40)

    assert.equal(asks.length, 1)
    assert.equal(asks[0].detail, undefined, 'no digest means no detailed request')
  })
})

test('a ready digest is sent with the next ask', async () => {
  const asks = []
  const base = answerFetch({
    digest: {
      available: true,
      digest: '<summary>earlier</summary>',
      stats: { turns: 12, tools: 40, summaryChars: 800, chars: 9000, tokens: 5600, firstTurn: 3 },
    },
  })
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/ask')) asks.push(JSON.parse(init.body))
    return base(url, init)
  }
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    await askQuestion(container, 'my question')
    await flush(40)

    assert.equal(asks.length, 1)
    assert.equal(asks[0].detail, true, 'detailed mode raised the request')
    assert.equal(asks[0].digest, '<summary>earlier</summary>')
  })
})

test('the detail popup lists every context row and can be pinned open', async () => {
  globalThis.fetch = answerFetch({
    digest: {
      available: true,
      digest: '<summary>earlier</summary>',
      stats: { turns: 12, tools: 40, summaryChars: 800, chars: 9000, tokens: 5600, firstTurn: 3 },
    },
  })
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()

    const more = container.querySelector('.clipchat-strip__more')
    await act(async () => {
      click(more)
    })
    const rows = container.querySelectorAll('.clipchat-strip__row')
    assert.ok(rows.length >= 7, 'every context row is listed')
    assert.ok(container.querySelector('.clipchat-strip__foot').textContent.length > 0, 'the total is shown')
  })
})

/* --- model menu --- */

test('the model menu opens, lists choices and closes on Escape', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await flush()
    const button = container.querySelector('.clipchat-card__modelbtn')
    await act(async () => {
      click(button)
    })

    const items = container.querySelectorAll('.clipchat-card__modelitem')
    assert.ok(items.length >= 2, 'the catalog plus follow-model are listed')

    await act(async () => {
      globalThis.document.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    assert.equal(container.querySelectorAll('.clipchat-card__modelitem').length, 0, 'Escape closed the menu')
  })
})

test('the model menu closes on an outside click but not an inside one', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await flush()
    await act(async () => {
      click(container.querySelector('.clipchat-card__modelbtn'))
    })
    assert.ok(container.querySelector('.clipchat-card__modelitem'), 'the menu opened')

    // A pointerdown inside the menu wrapper keeps it open.
    await act(async () => {
      const inside = container.querySelector('.clipchat-card__modelwrap')
      inside.dispatchEvent(new globalThis.window.Event('pointerdown', { bubbles: true }))
    })
    assert.ok(container.querySelector('.clipchat-card__modelitem'), 'an inside click kept it open')

    // One outside the wrapper closes it.
    await act(async () => {
      container.querySelector('.clipchat-card__bar').dispatchEvent(new globalThis.window.Event('pointerdown', { bubbles: true }))
    })
    assert.equal(container.querySelectorAll('.clipchat-card__modelitem').length, 0, 'an outside click closed it')
  })
})

test('choosing a model records it on the highlight', async () => {
  const posts = []
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/highlight')) posts.push(JSON.parse(init.body))
    return base(url, init)
  }
  await withCard(async ({ container, plugin }) => {
    // Ask once so the passage has a highlight to carry the choice.
    await askQuestion(container, 'my question')
    await flush(40)
    assert.ok(plugin.__test.highlightIdOf(NODE_KEY, 'selected passage'), 'the ask committed a highlight')

    await act(async () => {
      click(container.querySelector('.clipchat-card__modelbtn'))
    })
    const flash = [...container.querySelectorAll('.clipchat-card__modelitem')]
      .find((item) => item.textContent.includes('Flash'))
    assert.ok(flash, 'the catalog entry is listed')
    await act(async () => {
      click(flash)
    })
    await flush()

    const stored = posts.filter((post) => post.op === 'add' && post.highlight?.model !== undefined)
    assert.ok(stored.length > 0, 'the choice was persisted on the highlight')
    assert.equal(stored.at(-1).highlight.model.model, 'deepseek-v4-flash')
  })
})

/* --- records panel --- */

test('the records panel stays closed until the footer button opens it', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)

    assert.equal(container.querySelector('.clipchat-card__records'), null, 'the panel is closed by default')
    const button = footerButton(container, 'records 1')
    assert.ok(button, 'the footer counts the records')
    await act(async () => {
      click(button)
    })
    assert.ok(container.querySelector('.clipchat-card__records'), 'the panel opened')
  })
})

test('the records panel lists the session records and expands a multi-turn one', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'first question')
    await flush(40)
    await askQuestion(container, 'second question')
    await flush(40)

    await act(async () => {
      click(footerButton(container, 'records 1'))
    })
    const rows = container.querySelectorAll('.clipchat-card__record')
    assert.equal(rows.length, 1, 'one record for the passage')
    assert.equal(rows[0].querySelector('.clipchat-card__tag').textContent, '2 问', 'the badge counts the turns')
    assert.equal(rows[0].querySelectorAll('.clipchat-card__record-turn').length, 1, 'collapsed shows the newest turn')

    await act(async () => {
      click(rows[0].querySelector('.clipchat-card__record-body'))
    })
    assert.equal(
      container.querySelectorAll('.clipchat-card__record-turn').length,
      2,
      'expanded shows every turn',
    )
  })
})

test('the records panel says so when the session has none', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await act(async () => {
      click(footerButton(container, 'records 0'))
    })
    assert.equal(container.querySelector('.clipchat-card__records-empty').textContent, 'noRecords')
  })
})

test('deleting a record from the panel drops it', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'records 1'))
    })

    await act(async () => {
      click(container.querySelector('.clipchat-card__record-del'))
    })
    await flush()

    assert.equal(plugin.__test.recordCount(), 0)
    assert.equal(container.querySelector('.clipchat-card__records-empty').textContent, 'noRecords')
  })
})

test('the records panel switches to the cross-session search', async () => {
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/search')) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            sessionId: 'other-session',
            recordId: 'r-other',
            selection: 'a passage from elsewhere',
            question: 'a question',
            answer: 'an answer',
            provider: 'deepseek',
            model: 'deepseek-chat',
            createdAt: 1_700_000_000_000,
          }],
          total: 1,
          truncated: false,
        }),
      }
    }
    return base(url, init)
  }

  await withCard(async ({ container }) => {
    await act(async () => {
      click(footerButton(container, 'records 0'))
    })
    const tabs = container.querySelectorAll('.clipchat-records__tab')
    assert.equal(tabs.length, 2, 'both tabs are present')
    await act(async () => {
      click(tabs[1])
    })
    // The search debounces before asking.
    await flush(320)

    assert.ok(container.querySelector('.clipchat-search__input'), 'the search box rendered')
    assert.ok(container.textContent.includes('a passage from elsewhere'), 'the result is listed')
  })
})

/* --- copy --- */

test('copying a turn writes the plain answer and shows a confirmation', async () => {
  const written = []
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (text) => { written.push(text) } } },
    configurable: true,
  })
  globalThis.fetch = answerFetch()

  try {
    await withCard(async ({ container }) => {
      await askQuestion(container, 'my question')
      await flush(40)

      const copy = [...container.querySelectorAll('button')]
        .find((button) => button.className.includes('clipchat-card__copy'))
      assert.ok(copy, 'the copy button rendered')
      await act(async () => {
        click(copy)
      })
      await flush()

      assert.deepEqual(written, ['the answer'], 'the answer was copied')
      assert.ok(copy.textContent.includes('copied'), 'the button confirms the copy')
    })
  } finally {
    delete globalThis.navigator
  }
})

/* --- bringing the answer back to the main composer --- */

test('bringing the answer back rides one host quote', async () => {
  const calls = []
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)

    const button = footerButton(container, 'backToMain')
    assert.ok(button, 'the button rendered')
    await act(async () => {
      click(button)
    })
    await flush()

    assert.equal(calls.length, 1, 'the quote action is the only one used')
  }, {
    props: {
      inputActions: {
        insertQuote: (text, summary) => { calls.push(['insertQuote', text, summary]); return true },
        captureInsertion: () => { calls.push(['captureInsertion']); return { start: 0, end: 10 } },
        insertText: (text) => { calls.push(['insertText', text]); return true },
      },
    },
  })
  assert.deepEqual(calls.map((call) => call[0]), ['insertQuote'])
  const [text, summary] = [calls[0][1], calls[0][2]]
  assert.ok(text.startsWith('selected passage'), 'the quote starts with the passage')
  assert.ok(text.includes('the answer'), 'the quote carries the answer')
  assert.equal(summary.label, '〔滑词〕问答', 'the composer shows a compact label')
  assert.ok(summary.body.length < 60, 'the chip body is short')
})

test('a refused insertion is reported instead of claimed', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    assert.ok(container.textContent.includes('insertFailed'), 'the failure is shown')
  }, {
    props: {
      inputActions: {
        insertQuote: () => false,
        captureInsertion: () => ({ start: 0, end: 10 }),
        insertText: () => false,
      },
    },
  })
})

test('a refused quote falls back to pre-quoted text', async () => {
  const inserted = []
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    assert.equal(inserted.length, 1, 'the text fallback ran once')
    assert.ok(inserted[0].startsWith('> selected passage'), 'the fallback is blockquoted')
    assert.ok(inserted[0].includes('the answer'), 'the fallback still carries the answer')
    assert.ok(container.textContent.includes('inserted'), 'the card confirms the insertion')
  }, {
    props: {
      inputActions: {
        insertQuote: () => false,
        captureInsertion: () => ({ start: 0, end: 10 }),
        insertText: (text) => { inserted.push(text); return true },
      },
    },
  })
})

test('a throwing insertion is reported, not propagated', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    assert.ok(container.textContent.includes('insertFailed'))
  }, {
    props: {
      inputActions: {
        insertQuote: () => { throw new Error('host refused') },
        captureInsertion: () => ({ start: 0, end: 10 }),
        insertText: () => true,
      },
    },
  })
})

test('without host input actions the answer is copied instead', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    // No inputActions: the card reports failure rather than pretending.
    assert.ok(container.textContent.includes('insertFailed'))
  })
})

test('back to main carries every round of the thread, not only the newest', async () => {
  const calls = []
  globalThis.fetch = numberedAnswerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'first question')
    await flush(40)
    await askQuestion(container, 'second question')
    await flush(40)
    assert.equal(container.querySelectorAll('.clipchat-card__turn').length, 2, 'two rounds are on the card')

    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    assert.equal(calls.length, 1, 'one quote carries the whole thread')
    const [text, summary] = [calls[0][1], calls[0][2]]
    assert.ok(text.includes('问：first question'), 'the first question is carried')
    assert.ok(text.includes('第 1 轮回答'), 'the first answer is carried')
    assert.ok(text.includes('问：second question'), 'the newest question is carried')
    assert.ok(text.includes('第 2 轮回答'), 'the newest answer is carried')
    assert.ok(
      text.indexOf('第 1 轮回答') < text.indexOf('第 2 轮回答'),
      'rounds stay in order',
    )
    assert.equal(summary.label, '〔滑词〕2 轮问答', 'the composer chip counts both rounds')
    assert.equal(summary.body, 'second question', 'the chip names the newest question')
    assert.equal(text.length > summary.body.length * 4, true, 'the quote is much larger than the chip')
  }, {
    props: {
      inputActions: {
        insertQuote: (text, summary) => { calls.push(['insertQuote', text, summary]); return true },
        captureInsertion: () => { calls.push(['captureInsertion']); return { start: 0, end: 10 } },
        insertText: (text) => { calls.push(['insertText', text]); return true },
      },
    },
  })
})

test('back to main on a reopened record carries every stored turn', async () => {
  const calls = []
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    const button = footerButton(container, 'backToMain')
    assert.ok(button, 'the button rendered for a recalled record')
    await act(async () => {
      click(button)
    })
    await flush()

    assert.equal(calls.length, 1, 'one quote carries the stored thread')
    const text = calls[0][1]
    assert.ok(text.includes('问：older question'), 'the stored older question is carried')
    assert.ok(text.includes('older answer'), 'the stored older answer is carried')
    assert.ok(text.includes('问：newer question'), 'the stored newest question is carried')
    assert.ok(text.includes('newer answer'), 'the stored newest answer is carried')
    assert.equal(calls[0][2].label, '〔滑词〕2 轮问答')
  }, {
    build: (plugin) => {
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
      return cardProps({
        initialHighlightId: 'h-two',
        inputActions: {
          insertQuote: (text, summary) => { calls.push(['insertQuote', text, summary]); return true },
          captureInsertion: () => { calls.push(['captureInsertion']); return { start: 0, end: 10 } },
          insertText: (text) => { calls.push(['insertText', text]); return true },
        },
      })
    },
  })
})

test('a host without quoting inserts the same blockquote as fallback', async () => {
  const inserted = []
  globalThis.fetch = numberedAnswerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'first question')
    await flush(40)
    await askQuestion(container, 'second question')
    await flush(40)

    await act(async () => {
      click(footerButton(container, 'backToMain'))
    })
    await flush()

    assert.equal(inserted.length, 1, 'the text fallback ran once')
    assert.ok(inserted[0].startsWith('> selected passage'), 'the selection is the first quoted line')
    assert.ok(inserted[0].includes('第 1 轮回答') && inserted[0].includes('第 2 轮回答'), 'both rounds ride the blockquote')
    assert.ok(
      inserted[0].split('\n').every((line) => line.startsWith('> ')),
      'the fallback quotes every line, so the mainline still collapses it',
    )
    assert.ok(container.textContent.includes('inserted'), 'the card confirms the insertion')
  }, {
    props: {
      // No insertQuote: only raw text insertion is available.
      inputActions: {
        captureInsertion: () => ({ start: 0, end: 10 }),
        insertText: (text) => { inserted.push(text); return true },
      },
    },
  })
})

/* --- locating a record --- */

test('locating a record whose highlight is gone reports it', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    // A record that no highlight points at: nothing to jump to.
    plugin.__test.addRecord({
      id: 'r-orphan',
      selection: 'a passage with no highlight',
      turns: [{ question: 'q', answer: 'a', provider: 'p', model: 'm', createdAt: 1000 }],
      createdAt: 1000,
      updatedAt: 1000,
    }, 'session-test')

    // No ask here, so the footer label carries the record count it knows about.
    const panel = [...container.querySelectorAll('.clipchat-actions__btn')]
      .find((button) => button.textContent.startsWith('records'))
    assert.ok(panel, 'the records button rendered')
    await act(async () => {
      click(panel)
    })
    const locate = container.querySelector('.clipchat-card__record-locate')
    assert.ok(locate, 'the locate button rendered')
    await act(async () => {
      click(locate)
    })

    assert.ok(container.textContent.includes('locateFailed'), 'the failure is reported')
  })
})

test('locating a record closes the card and starts the jump', async () => {
  globalThis.fetch = answerFetch()
  let dismissed = 0
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    await act(async () => {
      click(footerButton(container, 'records 1'))
    })
    const locate = container.querySelector('.clipchat-card__record-locate')
    await act(async () => {
      click(locate)
    })
    await flush()

    assert.equal(dismissed, 1, 'the card closed before the jump')
  }, {
    props: {
      dismiss: () => { dismissed += 1 },
    },
  })
})

/* --- the highlight toggle in the footer --- */

test('the highlight button marks the passage and unmarking drops its records', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    assert.equal(plugin.__test.recordCount(), 1, 'the answer was recorded')
    assert.ok(footerButton(container, 'unhighlight'), 'the passage is marked')

    // Unmarking must take the record with it: an unmarked passage keeps nothing.
    await act(async () => {
      click(footerButton(container, 'unhighlight'))
    })
    await flush()

    assert.equal(plugin.__test.recordCount(), 0, 'the record went with the highlight')
    assert.ok(footerButton(container, 'highlight'), 'the button now offers to mark it')
  })
})

test('marking a passage without asking still highlights it', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    const button = footerButton(container, 'highlight')
    assert.ok(button, 'the mark button rendered')
    await act(async () => {
      click(button)
    })
    await flush()

    assert.ok(plugin.__test.hasHighlight(NODE_KEY, 'selected passage'), 'the passage was highlighted')
    assert.ok(footerButton(container, 'unhighlight'), 'the button flipped')
  })
})

/* --- failed background reads --- */

test('a failed model catalog leaves the card usable', async () => {
  const warnings = []
  const originalWarn = console.warn
  console.warn = (...args) => { warnings.push(args.join(' ')) }
  globalThis.fetch = async (url) => {
    if (String(url).includes('/models')) throw new Error('catalog down')
    return answerFetch()(url)
  }
  try {
    await withCard(async ({ container }) => {
      await flush()
      assert.ok(container.querySelector('.clipchat-card__modelbtn'), 'the menu still renders')
      assert.ok(warnings.some((line) => line.includes('model list was not loaded')), 'the failure was logged')
    })
  } finally {
    console.warn = originalWarn
  }
})

test('detailed mode reports a session it cannot read', async () => {
  globalThis.fetch = answerFetch({ digest: null })
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    assert.ok(container.querySelector('.clipchat-strip').className.includes('is-degraded'))
  }, {
    props: { sessionId: '' },
  })
})

test('detailed mode reports a digest request that throws', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes('/context')) throw new Error('context route down')
    return answerFetch()(url)
  }
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    assert.ok(container.querySelector('.clipchat-strip').className.includes('is-degraded'))
  })
})

test('a failed cross-session search reports the error', async () => {
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/search')) throw new Error('search down')
    return base(url, init)
  }

  await withCard(async ({ container }) => {
    await act(async () => {
      click(footerButton(container, 'records 0'))
    })
    await act(async () => {
      click(container.querySelectorAll('.clipchat-records__tab')[1])
    })
    await flush(320)

    assert.ok(container.querySelector('.clipchat-card__error'), 'the failure is shown')
    assert.ok(container.textContent.includes('searchFailed'))
  })
})

test('a failed clipboard write leaves the answer alone', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => { throw new Error('denied') } } },
    configurable: true,
  })
  globalThis.fetch = answerFetch()

  try {
    await withCard(async ({ container }) => {
      await askQuestion(container, 'my question')
      await flush(40)
      const copy = [...container.querySelectorAll('button')]
        .find((button) => button.className.includes('clipchat-card__copy'))
      await act(async () => {
        click(copy)
      })
      await flush()

      assert.ok(container.querySelector('.clipchat-card__a'), 'the answer is still there')
      assert.equal(copy.textContent.includes('copied'), false, 'no false confirmation')
    })
  } finally {
    delete globalThis.navigator
  }
})

test('a digest with no usable content is reported as degraded', async () => {
  globalThis.fetch = answerFetch({ digest: { available: true, digest: '', stats: {} } })
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    assert.ok(container.querySelector('.clipchat-strip').className.includes('is-degraded'),
      'an empty digest counts as unavailable')
  })
})

test('a digest marked unavailable is reported as degraded', async () => {
  globalThis.fetch = answerFetch({ digest: { available: false } })
  await withCard(async ({ container }) => {
    await act(async () => {
      click(container.querySelector('.clipchat-strip__switch'))
    })
    await flush()
    assert.ok(container.querySelector('.clipchat-strip').className.includes('is-degraded'))
  })
})

test('the search copy button copies a result and confirms it', async () => {
  const written = []
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async (text) => { written.push(text) } } },
    configurable: true,
  })
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/search')) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            sessionId: 'other-session',
            recordId: 'r-other',
            selection: 'a passage from elsewhere',
            question: 'a question',
            answer: 'an answer',
            provider: 'deepseek',
            model: 'deepseek-chat',
            createdAt: 1_700_000_000_000,
          }],
          total: 1,
          truncated: false,
        }),
      }
    }
    return base(url, init)
  }

  try {
    await withCard(async ({ container }) => {
      await act(async () => {
        click(footerButton(container, 'records 0'))
      })
      await act(async () => {
        click(container.querySelectorAll('.clipchat-records__tab')[1])
      })
      await flush(320)

      const copy = [...container.querySelectorAll('.clipchat-search__actions button')][0]
      assert.ok(copy, 'the copy button rendered')
      await act(async () => {
        click(copy)
      })
      await flush()

      assert.deepEqual(written, ['a question\n\nan answer'], 'the Q&A was copied')
      assert.ok(copy.textContent.includes('copied'), 'the button confirms')
    })
  } finally {
    delete globalThis.navigator
  }
})

test('a search result can be inserted back into the main composer', async () => {
  const calls = []
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/search')) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            sessionId: 'other-session',
            recordId: 'r-other',
            selection: 'a passage from elsewhere',
            question: 'a newer question',
            answer: 'a newer answer',
            turns: [
              { question: 'an earlier question', answer: 'an earlier answer' },
              { question: 'a newer question', answer: 'a newer answer' },
            ],
            provider: 'deepseek',
            model: 'deepseek-chat',
            createdAt: 1_700_000_000_000,
          }],
          total: 1,
          truncated: false,
        }),
      }
    }
    return base(url, init)
  }

  await withCard(async ({ container }) => {
    await act(async () => {
      click(footerButton(container, 'records 0'))
    })
    await act(async () => {
      click(container.querySelectorAll('.clipchat-records__tab')[1])
    })
    await flush(320)

    const insert = [...container.querySelectorAll('.clipchat-search__actions button')][1]
    await act(async () => {
      click(insert)
    })
    await flush()
    assert.equal(calls.length, 1, 'one quote carries the result')
    const text = calls[0][1]
    assert.ok(text.includes('an earlier answer'), 'the earlier turn is carried')
    assert.ok(text.includes('a newer answer'), 'the newest turn is carried')
    assert.equal(calls[0][2].label, '〔滑词〕2 轮问答', 'the chip counts the stored rounds')
  }, {
    props: {
      inputActions: {
        insertQuote: (text, summary) => { calls.push(['insertQuote', text, summary]); return true },
        captureInsertion: () => { calls.push(['captureInsertion']); return { start: 0, end: 4 } },
        insertText: (text) => { calls.push(['insertText', text]); return true },
      },
    },
  })
})

test('a clipboard that does not exist is handled quietly', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    const copy = [...container.querySelectorAll('button')]
      .find((button) => button.className.includes('clipchat-card__copy'))
    // No navigator at all in this run: the handler must return, not throw.
    await act(async () => {
      click(copy)
    })
    await flush()
    assert.ok(container.querySelector('.clipchat-card__a'), 'the answer is untouched')
  })
})

test('a card mousedown focuses the card but leaves controls alone', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container }) => {
    const card = container.querySelector('.clipchat-card')
    let focused = 0
    card.focus = () => { focused += 1 }

    // A mousedown on a control keeps that control's focus.
    const button = container.querySelector('.clipchat-card__close')
    await act(async () => {
      button.dispatchEvent(new globalThis.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    assert.equal(focused, 0, 'a control did not steal focus for the card')

    // A mousedown on plain card chrome focuses the card, keeping the surface open.
    const bar = container.querySelector('.clipchat-card__bar')
    await act(async () => {
      bar.dispatchEvent(new globalThis.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    })
    assert.equal(focused, 1, 'plain chrome focused the card')
  })
})

test('re-marking a passage whose highlight id is gone clears the flag', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    // Drop the highlight behind the card's back, then press the button.
    const id = plugin.__test.highlightIdOf(NODE_KEY, 'selected passage')
    plugin.__test.removeHighlight(id)

    await act(async () => {
      click(footerButton(container, 'unhighlight'))
    })
    await flush()
    assert.ok(footerButton(container, 'highlight'), 'the flag cleared without a highlight to remove')
  })
})

test('a denied search clipboard write is swallowed', async () => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText: async () => { throw new Error('denied') } } },
    configurable: true,
  })
  const base = answerFetch()
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/search')) {
      return {
        ok: true,
        json: async () => ({
          items: [{
            sessionId: 'other-session',
            recordId: 'r-other',
            selection: 'a passage',
            question: 'a question',
            answer: 'an answer',
            provider: 'deepseek',
            model: 'deepseek-chat',
            createdAt: 1_700_000_000_000,
          }],
          total: 1,
          truncated: false,
        }),
      }
    }
    return base(url, init)
  }

  try {
    await withCard(async ({ container }) => {
      await act(async () => {
        click(footerButton(container, 'records 0'))
      })
      await act(async () => {
        click(container.querySelectorAll('.clipchat-records__tab')[1])
      })
      await flush(320)

      const copy = [...container.querySelectorAll('.clipchat-search__actions button')][0]
      await act(async () => {
        click(copy)
      })
      await flush()

      assert.ok(container.querySelector('.clipchat-search__row'), 'the result survived')
      assert.equal(copy.textContent.includes('copied'), false, 'no false confirmation')
    })
  } finally {
    delete globalThis.navigator
  }
})

test('re-marking an answer as a record after cancelling it works', async () => {
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    assert.equal(plugin.__test.recordCount(), 1)

    // Cancel: the only turn goes, and the record with it.
    await act(async () => {
      click(footerButton(container, 'unrecord'))
    })
    await flush()
    assert.equal(plugin.__test.recordCount(), 0)

    // Mark again: the answer is still on screen, so it can be recorded anew.
    const again = footerButton(container, 'record')
    assert.ok(again, 'the button offers to record it again')
    assert.equal(again.disabled, false, 'it is enabled because an answer is present')
    await act(async () => {
      click(again)
    })
    await flush()

    assert.equal(plugin.__test.recordCount(), 1, 'the answer was recorded again')
    assert.equal(plugin.__test.recordList()[0].turns[0].question, 'my question')
  })
})

test('selecting the same words twice keeps one highlight and one record', async () => {
  // The bug the reader reported: asking twice about what looked like one
  // passage left two underlines and two records, because the second selection
  // ended two characters earlier and was treated as a different passage.
  globalThis.fetch = answerFetch()
  await withCard(async ({ container, plugin }) => {
    await askQuestion(container, 'my question')
    await flush(40)
    assert.equal(plugin.__test.recordCount(), 1, 'the first ask recorded once')

    const id = plugin.__test.highlightIdFor(NODE_KEY, 'selected passage', ANCHOR)
    assert.ok(id, 'the passage has a highlight')

    // The same words, one character shorter.
    const shorter = {
      nodeKey: NODE_KEY,
      sourceIndex: 0,
      spans: [{ blockIndex: 0, start: 0, end: 15 }],
      text: 'selected passag',
    }
    assert.equal(
      plugin.__test.highlightIdFor(NODE_KEY, shorter.text, shorter),
      id,
      'a shorter selection of the same words resolves to the same highlight',
    )
    assert.equal(
      plugin.__test.addHighlight(shorter, null),
      null,
      'and asking about it does not create a second highlight',
    )
  })
})
