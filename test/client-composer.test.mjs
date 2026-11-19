/**
 * Composer behaviour: the three-row box, folding a long paste into a snippet,
 * and carrying attachments with the question.
 *
 * These mount the real card, so a handler that throws or a payload that loses a
 * field fails here instead of in the browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { act } from 'react'
import { click } from './helpers/dom.mjs'
import { askFetch, flush, pasteText, pickFiles, withCard } from './helpers/card.mjs'

test('a long paste folds into a snippet instead of filling the box', async () => {
  await withCard(async ({ container }) => {
    const event = await pasteText(container, '第一行\n第二行\n第三行\n第四行')
    assert.equal(event.defaultPrevented, true, 'the paste is intercepted')
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 1)
    assert.equal(container.querySelector('.clipchat-card__ta').value, '', 'the box stays empty')
    assert.match(container.querySelector('.clipchat-card__snippet-body pre').textContent, /第一行/)
  })
})

test('a short paste stays in the textarea', async () => {
  await withCard(async ({ container }) => {
    const event = await pasteText(container, '两行\n就够了')
    assert.equal(event.defaultPrevented, false)
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 0)
  })
})

test('a snippet is enough to send, and it travels as text', async () => {
  const { fetchImpl, calls } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    await pasteText(container, '一\n二\n三\n四')
    const send = container.querySelector('.clipchat-card__send')
    assert.equal(send.disabled, false, 'attachments alone enable send')
    await act(async () => { click(send) })
    await flush(80)

    const ask = calls.find((call) => call.url.includes('/dsh-clipchat/ask'))
    assert.ok(ask, 'the ask route was called')
    const body = JSON.parse(ask.init.body)
    assert.match(body.question, /【附加文本】/)
    assert.match(body.question, /一\n二\n三\n四/)
  })
})

test('a picked file shows as a chip and rides with the ask body', async () => {
  const { fetchImpl, calls } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const input = container.querySelector('input[type="file"]')
    const file = new globalThis.window.File(['# notes'], 'notes.md', { type: 'text/markdown' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
      input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }))
    })

    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1)
    assert.match(container.querySelector('.clipchat-card__fname').textContent, /notes\.md/)

    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(120)

    const ask = calls.find((call) => call.url.includes('/dsh-clipchat/ask'))
    assert.ok(ask, 'the ask route was called')
    const body = JSON.parse(ask.init.body)
    assert.equal(body.attachments.length, 1)
    assert.equal(body.attachments[0].kind, 'file')
    assert.equal(body.attachments[0].name, 'notes.md')
    assert.equal(typeof body.attachments[0].data, 'string')
    // The question bubble keeps the file next to the question.
    assert.equal(container.querySelectorAll('.clipchat-card__q .clipchat-card__fchip').length, 1)
  })
})

test('the remove button drops an attachment again', async () => {
  await withCard(async ({ container }) => {
    const input = container.querySelector('input[type="file"]')
    const file = new globalThis.window.File(['x'], 'plan.md', { type: 'text/markdown' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
      input.dispatchEvent(new globalThis.window.Event('change', { bubbles: true }))
    })
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1)
    await act(async () => { click(container.querySelector('.clipchat-card__fx')) })
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 0)
  })
})

test('the textarea is sized to whole rows and capped at three', async () => {
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set

    // jsdom reports no layout, so scrollHeight is 0: the cap still applies to
    // the inline height the effect writes, and the class marks the cap.
    Object.defineProperty(ta, 'scrollHeight', { value: 100, configurable: true })
    await act(async () => {
      setter.call(ta, 'a\nb\nc\nd\ne')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    assert.equal(ta.style.height, '60px')
    assert.ok(ta.classList.contains('is-capped'))

    Object.defineProperty(ta, 'scrollHeight', { value: 20, configurable: true })
    await act(async () => {
      setter.call(ta, 'one line')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    assert.equal(ta.style.height, '20px')
    assert.equal(ta.classList.contains('is-capped'), false)
  })
})
