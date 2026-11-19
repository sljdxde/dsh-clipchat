/**
 * Gaps found in review: streaming races, the reserved tail, the jump control
 * when everything fits or the records panel is open, attachment totals, and the
 * token total surviving a re-keep.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'

import { installDom, click } from './helpers/dom.mjs'
import { loadBundle, makeReact } from './helpers/load-client.mjs'
import { mountComponent } from './helpers/mount.mjs'
import { askFetch, cardProps, flush, pickFiles, withCard } from './helpers/card.mjs'

/** A fetch whose SSE stream never finishes, so streaming stays true. */
function endlessFetch() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/dsh-clipchat/models')) return { ok: true, json: async () => ({ models: [] }) }
    const chunk = new TextEncoder().encode('data: {"type":"delta","text":"第一段"}\n\n')
    let sent = false
    const signal = init?.signal
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (!sent) { sent = true; return { value: chunk, done: false } }
            // Hang until the card aborts or unmounts, then close cleanly so the
            // test process does not keep a pending promise alive.
            return new Promise((resolve) => {
              if (signal?.aborted) return resolve({ value: undefined, done: true })
              signal?.addEventListener?.('abort', () => resolve({ value: undefined, done: true }), { once: true })
              setTimeout(() => resolve({ value: undefined, done: true }), 2000)
            })
          },
        }),
      },
    }
  }
  return { fetchImpl, calls }
}

/** A fetch that answers with usage frames on every call. */
function usageFetch() {
  const bodies = []
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/models')) return { ok: true, json: async () => ({ models: [] }) }
    bodies.push(JSON.parse(init.body))
    const body = 'data: {"type":"meta","provider":"deepseek","model":"deepseek-chat"}\n\n'
      + 'data: {"type":"delta","text":"ok"}\n\n'
      + 'data: {"type":"usage","usage":{"inputTokens":321,"outputTokens":45}}\n\n'
      + 'data: {"type":"done"}\n\n'
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
  return { fetchImpl, bodies }
}

async function typeAndSend(container, text) {
  const ta = container.querySelector('.clipchat-card__ta')
  const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
  await act(async () => {
    setter.call(ta, text)
    ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
  })
  await act(async () => { click(container.querySelector('.clipchat-card__send')) })
}

test('a second send while the answer is streaming is dropped', async () => {
  const { fetchImpl, calls } = endlessFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    await typeAndSend(container, '第一问')
    await flush(80)
    // The stream hangs, so the card is still streaming; a second send must no-op.
    await typeAndSend(container, '第二问')
    await flush(80)
    const asks = calls.filter((call) => call.url.includes('/dsh-clipchat/ask'))
    assert.equal(asks.length, 1)
    assert.equal(container.querySelectorAll('.clipchat-card__turn').length, 1)
  })
})

test('the thread reserves a tail while streaming and releases it after', async () => {
  // A slow stream: one delta now, the terminal frame a beat later, so the test
  // can observe the reserved tail mid-answer.
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/dsh-clipchat/models')) return { ok: true, json: async () => ({ models: [] }) }
    const first = new TextEncoder().encode('data: {"type":"delta","text":"ok"}\n\n')
    const last = new TextEncoder().encode('data: {"type":"done"}\n\n')
    let step = 0
    return {
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            step += 1
            if (step === 1) return { value: first, done: false }
            if (step === 2) { await new Promise((resolve) => setTimeout(resolve, 300)); return { value: last, done: false } }
            return { value: undefined, done: true }
          },
        }),
      },
    }
  }
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 900, configurable: true })
    await typeAndSend(container, '一问')
    await flush(60)
    assert.notEqual(thread.style.paddingBottom, '', 'the tail is reserved while answering')
    await flush(400)
    assert.equal(thread.style.paddingBottom, '', 'the tail is released when the answer settles')
  })
})

test('with two rounds that both fit, the round picker is still reachable', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    // Nothing to scroll: the thread box and every turn inside it fit.
    Object.defineProperty(thread, 'clientHeight', { value: 900, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 900, configurable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 900, left: 0, right: 300, width: 300, height: 900 })
    for (const text of ['第一问', '第二问']) {
      await typeAndSend(container, text)
      await flush(120)
      for (const turn of container.querySelectorAll('.clipchat-card__turn')) {
        turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: 10, bottom: 40, left: 0, right: 300, width: 300, height: 30 })
        turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 50, bottom: 200, left: 0, right: 300, width: 300, height: 150 })
      }
      await act(async () => { thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true })) })
      await flush(60)
    }
    const bar = container.querySelector('.clipchat-card__jumpbar')
    assert.ok(bar, 'the bar is present for the round menu')
    assert.equal(container.querySelector('.clipchat-card__jump'), null, 'no jump button when nothing overflows')
    assert.ok(container.querySelector('.clipchat-card__jumpcaret'), 'the picker caret is still there')
    assert.match(container.querySelector('.clipchat-card__jumphint').textContent, /jumpRounds/)
  })
})

test('the jump bar disappears while the records panel is open', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 900, configurable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200 })
    await typeAndSend(container, '一问')
    await flush(120)
    const turn = container.querySelector('.clipchat-card__turn')
    turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: -40, bottom: -10, left: 0, right: 300, width: 300, height: 30 })
    turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 300, bottom: 500, left: 0, right: 300, width: 300, height: 200 })
    await act(async () => { thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true })) })
    assert.ok(container.querySelector('.clipchat-card__jumpbar'))

    const recordsButton = [...container.querySelectorAll('.clipchat-actions__btn')]
      .find((button) => /records/.test(button.textContent))
    assert.ok(recordsButton, 'the records button exists')
    await act(async () => { click(recordsButton) })
    assert.equal(container.querySelector('.clipchat-card__jumpbar'), null, 'the bar is hidden in the records view')
  })
})

test('two 4 MB files are refused once their total passes the cap', async () => {
  await withCard(async ({ container }) => {
    const first = new globalThis.window.File(['a'], 'a.bin', { type: 'application/octet-stream' })
    const second = new globalThis.window.File(['b'], 'b.bin', { type: 'application/octet-stream' })
    Object.defineProperty(first, 'size', { value: 4 * 1024 * 1024 })
    Object.defineProperty(second, 'size', { value: 4 * 1024 * 1024 })
    await pickFiles(container, [first])
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1)
    await pickFiles(container, [second])
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1, 'the total cap keeps the first only')
    assert.match(container.querySelector('.clipchat-card__hint').textContent, /attachTotalTooLarge/)
  })
})

test('re-keeping an answer stores that round usage, not the running total', async () => {
  const { fetchImpl } = usageFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container, plugin }) => {
    for (const text of ['第一问', '第二问']) {
      await typeAndSend(container, text)
      await flush(120)
    }
    assert.match(container.querySelector('.clipchat-card__tokens').textContent, /642/)

    // 取消记录 then 记录 re-keeps the last answer through the fallback path.
    const toggle = () => [...container.querySelectorAll('.clipchat-actions__btn')]
      .find((button) => button.textContent === 'unrecord' || button.textContent === 'record')
    assert.equal(toggle().textContent, 'unrecord', 'the answer is kept by default')
    // Both rounds live in one record: cancel twice to drop it entirely, then
    // keep again — that is the fallback path that used to store the running total.
    for (let i = 0; i < 2; i += 1) {
      await act(async () => { click(toggle()) })
      await flush(30)
    }
    assert.equal(toggle().textContent, 'record', 'the record is gone after two cancels')
    await act(async () => { click(toggle()) })
    await flush(30)

    const records = plugin.__test.recordList()
    const turns = records.flatMap((record) => record.turns ?? [])
    const last = turns[turns.length - 1]
    assert.ok(last, 'a record turn exists')
    assert.deepEqual(last.usage, { input: 321, output: 45 }, 'the stored usage is one round, not the total')
  })
})

test('attachment and body errors map to one card message', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const t = (key) => `T:${key}`
  assert.equal(plugin.__test.errorMessageOf({ error: 'attachment-too-many' }, t), 'T:attachReadFailed')
  assert.equal(plugin.__test.errorMessageOf({ error: 'attachment-too-large' }, t), 'T:attachReadFailed')
  assert.equal(plugin.__test.errorMessageOf({ error: 'attachment-unreadable' }, t), 'T:attachReadFailed')
  assert.equal(plugin.__test.errorMessageOf({ error: 'body-too-large' }, t), 'T:contextTooLong')
  assert.equal(plugin.__test.errorMessageOf({ error: 'mystery', message: 'host said so' }, t), 'host said so')
  assert.equal(plugin.__test.errorMessageOf({ error: 'mystery' }, t), 'T:failed')
})
