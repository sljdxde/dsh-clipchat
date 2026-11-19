/**
 * Composer edge cases: measurement, media types, reading files, drag and drop,
 * preview, snippet controls and every refusal path.
 *
 * The repo requires every shipped line to be executed by a test, so the small
 * defensive branches live here too — each one is a real user-visible path, not
 * filler.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { act } from 'react'

import { click, installDom } from './helpers/dom.mjs'
import { loadBundle, makeReact } from './helpers/load-client.mjs'
import { mountComponent } from './helpers/mount.mjs'
import { askFetch, cardProps, drag, flush, pasteText, pickFiles, withCard } from './helpers/card.mjs'

test('visualLineCount uses measured height when the engine reports one', async () => {
  const env = installDom('')
  try {
    const { definition } = await loadBundle()
    const plugin = definition.factory(() => makeReact())
    const proto = globalThis.window.Element.prototype
    const original = Object.getOwnPropertyDescriptor(proto, 'scrollHeight')
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { return 40 } })
    assert.equal(plugin.__test.visualLineCount('任意文字', 400), 2)
    if (original === undefined) delete proto.scrollHeight
    else Object.defineProperty(proto, 'scrollHeight', original)
    // Zero height falls back to source line breaks.
    assert.equal(plugin.__test.visualLineCount('a\nb\nc', 400), 3)
    assert.equal(plugin.__test.visualLineCount('', 400), 0)
  } finally {
    env.restore()
  }
})

test('small pure helpers handle their remaining branches', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const t = plugin.__test

  // hasFilePayload: function-style types, array-style types, and no payload.
  assert.equal(t.hasFilePayload({ dataTransfer: { types: { includes: () => true } } }), true)
  assert.equal(t.hasFilePayload({ dataTransfer: { types: ['Files'] } }), true)
  // An array-like without includes exercises the Array.from path.
  assert.equal(t.hasFilePayload({ dataTransfer: { types: { 0: 'Files', length: 1 } } }), true)
  assert.equal(t.hasFilePayload({ dataTransfer: { types: ['text/plain'] } }), false)
  assert.equal(t.hasFilePayload({}), false)

  // formatBytes across all three scales, plus an unusable value.
  assert.equal(t.formatBytes(2 * 1024 * 1024), '2.0 MB')
  assert.equal(t.formatBytes(-1), '—')

  // mediaTypeOf derives a type from the extension when the browser sends none.
  const fileOf = (name) => ({ name, type: '' })
  assert.equal(t.mediaTypeOf(fileOf('a.png')), 'image/png')
  assert.equal(t.mediaTypeOf(fileOf('a.jpg')), 'image/jpeg')
  assert.equal(t.mediaTypeOf(fileOf('a.jpeg')), 'image/jpeg')
  assert.equal(t.mediaTypeOf(fileOf('a.gif')), 'image/gif')
  assert.equal(t.mediaTypeOf(fileOf('a.webp')), 'image/webp')
  assert.equal(t.mediaTypeOf(fileOf('a.bin')), 'application/octet-stream')

  // SVG is not previewable as a raster image.
  assert.equal(t.isImageFile({ name: 'a.svg', type: 'image/svg+xml' }), false)
  assert.equal(t.isImageFile({ name: 'a.png', type: 'image/png' }), true)
})

test('readFileAsBase64 handles a FileReader runtime', async () => {
  const env = installDom('')
  const savedReader = globalThis.FileReader
  try {
    const { definition } = await loadBundle()
    const plugin = definition.factory(() => makeReact())
    class FakeReader {
      readAsDataURL() {
        this.result = 'data:text/plain;base64,aGk='
        this.onload()
      }
    }
    globalThis.FileReader = FakeReader
    assert.equal(await plugin.__test.readFileAsBase64({ name: 'a.txt' }), 'aGk=')

    class BadReader {
      readAsDataURL() {
        this.error = new Error('boom')
        this.onerror()
      }
    }
    globalThis.FileReader = BadReader
    await assert.rejects(() => plugin.__test.readFileAsBase64({ name: 'a.txt' }), /boom/)
  } finally {
    if (savedReader === undefined) delete globalThis.FileReader
    else globalThis.FileReader = savedReader
    env.restore()
  }
})

test('readFileAsBase64 falls back to arrayBuffer, and refuses without either', async () => {
  const env = installDom('')
  const savedReader = globalThis.FileReader
  try {
    const { definition } = await loadBundle()
    const plugin = definition.factory(() => makeReact())
    delete globalThis.FileReader
    const file = { name: 'a.bin', arrayBuffer: async () => new Uint8Array([104, 105]).buffer }
    assert.equal(await plugin.__test.readFileAsBase64(file), 'aGk=')
    await assert.rejects(() => plugin.__test.readFileAsBase64({ name: 'x' }), /no-file-reader/)
  } finally {
    if (savedReader !== undefined) globalThis.FileReader = savedReader
    env.restore()
  }
})

test('base64OfBytes works without Buffer', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.equal(plugin.__test.base64OfBytes(new Uint8Array([104, 105])), 'aGk=')

  const savedBuffer = globalThis.Buffer
  const savedBtoa = globalThis.btoa
  try {
    delete globalThis.Buffer
    globalThis.btoa = (value) => `b64:${value}`
    assert.equal(plugin.__test.base64OfBytes(new Uint8Array([104, 105])), 'b64:hi')
    delete globalThis.btoa
    assert.throws(() => plugin.__test.base64OfBytes(new Uint8Array([104])), /no-base64/)
  } finally {
    globalThis.Buffer = savedBuffer
    if (savedBtoa === undefined) delete globalThis.btoa
    else globalThis.btoa = savedBtoa
  }
})

test('a pasted image becomes an attachment, not text', async () => {
  const env = installDom('')
  const originalCreate = globalThis.URL.createObjectURL
  globalThis.URL.createObjectURL = () => 'blob:preview'
  try {
    const mounted = await mountComponent(() => cardProps())
    const container = mounted.container
    const ta = container.querySelector('.clipchat-card__ta')
    const file = new globalThis.window.File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
    const event = new globalThis.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        getData: () => 'ignored',
      },
    })
    await act(async () => { ta.dispatchEvent(event) })
    assert.equal(event.defaultPrevented, true)
    assert.equal(container.querySelectorAll('.clipchat-card__thumb').length, 1)
    await mounted.unmount()
  } finally {
    globalThis.URL.createObjectURL = originalCreate
    env.restore()
  }
})

test('dropping files shows the overlay and attaches them', async () => {
  await withCard(async ({ container }) => {
    const file = new globalThis.window.File(['# x'], 'dropped.md', { type: 'text/markdown' })
    await drag(container, 'dragover', [file])
    assert.ok(container.querySelector('.clipchat-card__drop'), 'the drop hint rendered')
    assert.ok(container.querySelector('.clipchat-card').className.includes('is-dragover'))
    await drag(container, 'drop', [file])
    assert.equal(container.querySelector('.clipchat-card__drop'), null)
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1)
  })
})

test('dragging something that is not a file is ignored', async () => {
  await withCard(async ({ container }) => {
    const card = container.querySelector('.clipchat-card')
    for (const type of ['dragover', 'dragleave', 'drop']) {
      const event = new globalThis.window.Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'dataTransfer', { value: { types: ['text/plain'], files: [] } })
      await act(async () => { card.dispatchEvent(event) })
      assert.equal(event.defaultPrevented, false)
    }
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 0)
  })
})

test('leaving the card clears a drag in progress', async () => {
  await withCard(async ({ container }) => {
    const file = new globalThis.window.File(['x'], 'a.md', { type: 'text/markdown' })
    await drag(container, 'dragover', [file])
    const card = container.querySelector('.clipchat-card')
    const leave = new globalThis.window.Event('dragleave', { bubbles: true, cancelable: true })
    Object.defineProperty(leave, 'dataTransfer', { value: { types: ['Files'], files: [file] } })
    Object.defineProperty(leave, 'relatedTarget', { value: null })
    Object.defineProperty(leave, 'currentTarget', { value: card })
    await act(async () => { card.dispatchEvent(leave) })
    assert.equal(container.querySelector('.clipchat-card__drop'), null)
  })
})

test('snippets expand, collapse and can be discarded', async () => {
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const paste = new globalThis.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { items: [], getData: () => '1\n2\n3\n4' } })
    await act(async () => { ta.dispatchEvent(paste) })

    const snippet = () => container.querySelector('.clipchat-card__snippet')
    assert.equal(snippet().className.includes('is-open'), false)
    const [toggle, remove] = container.querySelectorAll('.clipchat-card__snippet-btn')
    await act(async () => { click(toggle) })
    assert.equal(snippet().className.includes('is-open'), true)
    await act(async () => { click(container.querySelectorAll('.clipchat-card__snippet-btn')[0]) })
    assert.equal(snippet().className.includes('is-open'), false)

    // A second snippet proves discarding removes only the one asked for.
    await act(async () => { ta.dispatchEvent(paste) })
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 2)
    const removeButtons = container.querySelectorAll('.clipchat-card__snippet-btn')
    await act(async () => { click(removeButtons[removeButtons.length - 1]) })
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 1)
  })
})

test('a huge paste is truncated and says so', async () => {
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const paste = new globalThis.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(paste, 'clipboardData', { value: { items: [], getData: () => 'x'.repeat(25000) } })
    await act(async () => { ta.dispatchEvent(paste) })
    assert.equal(container.querySelector('.clipchat-card__snippet-body pre').textContent.length, 20000)
    assert.match(container.querySelector('.clipchat-card__snippet-meta').textContent, /snippetTruncated/)
  })
})

test('too many attachments and oversized files are refused with a message', async () => {
  await withCard(async ({ container }) => {
    const many = Array.from({ length: 6 }, (_, index) => new globalThis.window.File(['x'], `f${index}.md`, { type: 'text/markdown' }))
    await pickFiles(container, many)
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 6)

    const extra = new globalThis.window.File(['x'], 'extra.md', { type: 'text/markdown' })
    await pickFiles(container, [extra])
    assert.match(container.querySelector('.clipchat-card__hint').textContent, /attachTooMany/)

    // Reset by removing all, then try a file over the byte cap.
    for (const button of [...container.querySelectorAll('.clipchat-card__fx')]) {
      await act(async () => { click(button) })
    }
    const huge = new globalThis.window.File(['x'], 'huge.zip', { type: 'application/zip' })
    Object.defineProperty(huge, 'size', { value: 5 * 1024 * 1024 })
    await pickFiles(container, [huge])
    assert.match(container.querySelector('.clipchat-card__hint').textContent, /attachTooLarge/)
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 0)
  })
})

test('the same file twice is attached once', async () => {
  await withCard(async ({ container }) => {
    const file = new globalThis.window.File(['x'], 'same.md', { type: 'text/markdown' })
    await pickFiles(container, [file])
    await pickFiles(container, [file])
    assert.equal(container.querySelectorAll('.clipchat-card__fchip').length, 1)
  })
})

test('clicking an image preview opens it and clicking again closes it', async () => {
  const env = installDom('')
  const originalCreate = globalThis.URL.createObjectURL
  globalThis.URL.createObjectURL = () => 'blob:preview'
  try {
    const mounted = await mountComponent(() => cardProps())
    const container = mounted.container
    const file = new globalThis.window.File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    await pickFiles(container, [file])
    await act(async () => { click(container.querySelector('.clipchat-card__thumb-img')) })
    assert.ok(container.querySelector('.clipchat-card__lightbox'))
    await act(async () => { click(container.querySelector('.clipchat-card__lightbox')) })
    assert.equal(container.querySelector('.clipchat-card__lightbox'), null)
    await mounted.unmount()
  } finally {
    globalThis.URL.createObjectURL = originalCreate
    env.restore()
  }
})

test('removing an image attachment revokes its preview URL', async () => {
  const env = installDom('')
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL
  const revoked = []
  globalThis.URL.createObjectURL = () => 'blob:preview'
  globalThis.URL.revokeObjectURL = (url) => revoked.push(url)
  try {
    const mounted = await mountComponent(() => cardProps())
    const container = mounted.container
    const file = new globalThis.window.File([new Uint8Array([1])], 'shot.png', { type: 'image/png' })
    await pickFiles(container, [file])
    assert.equal(container.querySelectorAll('.clipchat-card__thumb').length, 1)
    await act(async () => { click(container.querySelector('.clipchat-card__thumb-x')) })
    assert.equal(container.querySelectorAll('.clipchat-card__thumb').length, 0)
    assert.deepEqual(revoked, ['blob:preview'])
    await mounted.unmount()
  } finally {
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
    env.restore()
  }
})

test('a file that cannot be read is reported instead of sent', async () => {
  const { fetchImpl, calls } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const file = new globalThis.window.File(['x'], 'bad.md', { type: 'text/markdown' })
    // The bytes path is preferred now, so an unreadable blob has to fail there.
    Object.defineProperty(file, 'arrayBuffer', { value: async () => { throw new Error('boom') } })
    await pickFiles(container, [file])
    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(80)
    const banner = container.querySelector('.clipchat-card__error')
    assert.ok(banner, 'the failure is shown')
    assert.match(banner.textContent, /attachReadFailed/)
    assert.equal(calls.some((call) => call.url.includes('/dsh-clipchat/ask')), false)
  })
})

test('an empty paste adds nothing and a second send cannot start mid-encode', async () => {
  const { fetchImpl, calls } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const empty = new globalThis.window.Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(empty, 'clipboardData', { value: { items: [], getData: () => '' } })
    await act(async () => { ta.dispatchEvent(empty) })
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 0)

    const file = new globalThis.window.File(['x'], 'a.md', { type: 'text/markdown' })
    await pickFiles(container, [file])
    const send = container.querySelector('.clipchat-card__send')
    await act(async () => {
      click(send)
      click(send)
    })
    await flush(120)
    const asks = calls.filter((call) => call.url.includes('/dsh-clipchat/ask'))
    assert.equal(asks.length, 1, 'the second click is dropped while encoding')
  })
})

test('the pill stays hidden while both ends are on screen', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 400, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 400, configurable: true })
    Object.defineProperty(thread, 'scrollTop', { value: 0, configurable: true, writable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 400, left: 0, right: 300, width: 300, height: 400 })

    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setter.call(ta, 'short')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(120)

    const turn = container.querySelector('.clipchat-card__turn')
    turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: 0, bottom: 30, left: 0, right: 300, width: 300, height: 30 })
    turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 30, bottom: 200, left: 0, right: 300, width: 300, height: 170 })
    await act(async () => { thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true })) })
    assert.equal(container.querySelector('.clipchat-card__jump'), null)
  })
})

test('the jump pill points at the answer end, then back at the question', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 600, configurable: true })
    Object.defineProperty(thread, 'scrollTop', { value: 0, configurable: true, writable: true })
    const bounds = { top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200 }
    thread.getBoundingClientRect = () => bounds

    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setter.call(ta, 'question')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(120)

    const turn = container.querySelector('.clipchat-card__turn')
    turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: -40, bottom: -10, left: 0, right: 300, width: 300, height: 30 })
    turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 300, bottom: 500, left: 0, right: 300, width: 300, height: 200 })
    await act(async () => {
      thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true }))
    })
    const pill = container.querySelector('.clipchat-card__jump')
    assert.ok(pill, 'the pill appears')
    assert.match(pill.textContent, /jumpEnd/)
    await act(async () => { click(pill) })
    assert.equal(thread.scrollTop, 600)
  })
})

test('a recalled record sums every round into the footer total', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  assert.deepEqual(plugin.__test.initialTokensOf({
    turns: [{ usage: { input: 1, output: 2 } }, { usage: { input: 30, output: 40 } }],
  }), { input: 31, output: 42 })
  // A round without usage contributes nothing, not a null result.
  assert.deepEqual(plugin.__test.initialTokensOf({
    turns: [{ usage: { input: 5, output: 6 } }, { usage: null }],
  }), { input: 5, output: 6 })
  assert.equal(plugin.__test.initialTokensOf({ turns: [] }), null)
  assert.equal(plugin.__test.initialTokensOf(null), null)
  assert.deepEqual(plugin.__test.addUsage({ input: 1, output: 2 }, null), { input: 1, output: 2 })
  assert.deepEqual(plugin.__test.addUsage(null, { input: 3, output: 4 }), { input: 3, output: 4 })
  assert.equal(plugin.__test.addUsage(null, null), null)
})

test('without any usage frame the footer says so instead of inventing numbers', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setter.call(ta, '第一问')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(120)
    assert.equal(container.querySelector('.clipchat-card__tokens').textContent, 'noTokens')
  })
})

test('the footer reports the total of every round, not one round at a time', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/dsh-clipchat/models')) return { ok: true, json: async () => ({ models: [] }) }
    const body = 'data: {"type":"delta","text":"ok"}\n\ndata: {"type":"usage","usage":{"inputTokens":321,"outputTokens":45}}\n\ndata: {"type":"done"}\n\n'
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
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    const ask = async (text) => {
      await act(async () => {
        setter.call(ta, text)
        ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
      })
      await act(async () => { click(container.querySelector('.clipchat-card__send')) })
      await flush(120)
    }
    await ask('带用量的一问')
    assert.match(container.querySelector('.clipchat-card__tokens').textContent, /321/)
    assert.match(container.querySelector('.clipchat-card__tokens').textContent, /45/)
    // A second round adds to the same total (321 + 321, 45 + 45).
    await ask('第二问')
    const total = container.querySelector('.clipchat-card__tokens').textContent
    assert.match(total, /642/)
    assert.match(total, /90/)
    // No per-turn copy of the number.
    assert.equal(container.querySelector('.clipchat-card__turn-tokens'), null)
  })
})

test('with one round the pill jumps straight to that question', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 600, configurable: true })
    Object.defineProperty(thread, 'scrollTop', { value: 300, configurable: true, writable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200 })

    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    await act(async () => {
      setter.call(ta, '唯一一问')
      ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
    })
    await act(async () => { click(container.querySelector('.clipchat-card__send')) })
    await flush(120)

    const turn = container.querySelector('.clipchat-card__turn')
    Object.defineProperty(turn, 'offsetTop', { value: 120, configurable: true })
    // The question is scrolled above the fold, the answer is fully visible.
    turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: -60, bottom: -30, left: 0, right: 300, width: 300, height: 30 })
    turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 10, bottom: 90, left: 0, right: 300, width: 300, height: 80 })
    await act(async () => { thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true })) })

    const pill = container.querySelector('.clipchat-card__jump')
    assert.match(pill.textContent, /jumpStart/)
    await act(async () => { click(pill) })
    await flush(40)
    assert.equal(thread.scrollTop, 118)
  })
})

test('the jump pill opens a round picker and jumps to the chosen question', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 900, configurable: true })
    Object.defineProperty(thread, 'scrollTop', { value: 0, configurable: true, writable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200 })

    const ta = container.querySelector('.clipchat-card__ta')
    const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
    for (const text of ['第一问', '第二问']) {
      await act(async () => {
        setter.call(ta, text)
        ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
      })
      await act(async () => { click(container.querySelector('.clipchat-card__send')) })
      await flush(120)
    }

    const turns = [...container.querySelectorAll('.clipchat-card__turn')]
    assert.equal(turns.length, 2)
    for (const turn of turns) {
      turn.querySelector('.clipchat-card__q').getBoundingClientRect = () => ({ top: 0, bottom: 30, left: 0, right: 300, width: 300, height: 30 })
      turn.querySelector('.clipchat-card__a').getBoundingClientRect = () => ({ top: 250, bottom: 400, left: 0, right: 300, width: 300, height: 150 })
    }
    await act(async () => { thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true })) })

    const pill = container.querySelector('.clipchat-card__jump')
    const caret = container.querySelector('.clipchat-card__jumpcaret')
    assert.ok(pill, 'the pill is visible')
    assert.ok(caret, 'the caret is there for multiple rounds')
    assert.ok(container.querySelector('.clipchat-card__jumpbar'), 'the control sits in its own row')
    assert.match(container.querySelector('.clipchat-card__jumphint').textContent, /jumpRounds/)

    // The label itself jumps to the end, without opening anything.
    await act(async () => { click(pill) })
    await flush(40)
    assert.equal(thread.scrollTop, thread.scrollHeight)
    assert.equal(container.querySelector('.clipchat-card__jumpmenu'), null)

    await act(async () => { click(caret) })
    const menu = container.querySelector('.clipchat-card__jumpmenu')
    assert.ok(menu, 'the picker opened')
    const items = [...menu.querySelectorAll('.clipchat-card__jumpitem')]
    assert.equal(items.length, 3, 'two rounds plus the end action')
    assert.match(items[0].textContent, /第一问/)

    await act(async () => { click(items[0]) })
    await flush(40)
    assert.equal(container.querySelector('.clipchat-card__jumpmenu'), null)
    assert.equal(thread.scrollTop, 0)

    // An outside press closes it again.
    await act(async () => { click(caret) })
    assert.ok(container.querySelector('.clipchat-card__jumpmenu'))
    await act(async () => {
      document.body.dispatchEvent(new globalThis.window.Event('pointerdown', { bubbles: true }))
    })
    assert.equal(container.querySelector('.clipchat-card__jumpmenu'), null)

    // The end action in the picker jumps to the bottom and closes it.
    await act(async () => { click(caret) })
    const endItem = [...container.querySelectorAll('.clipchat-card__jumpitem')].at(-1)
    await act(async () => { click(endItem) })
    await flush(40)
    assert.equal(container.querySelector('.clipchat-card__jumpmenu'), null)
    assert.equal(thread.scrollTop, thread.scrollHeight)
  })
})


test('a seventh pasted snippet is refused instead of growing without bound', async () => {
  await withCard(async ({ container }) => {
    for (let index = 0; index < 7; index += 1) {
      await pasteText(container, Array.from({ length: 20 }, (_, line) => `第${index}段第${line}行`).join('\n'))
    }
    assert.equal(container.querySelectorAll('.clipchat-card__snippet').length, 6)
    assert.match(container.querySelector('.clipchat-card__hint').textContent, /snippetTooMany/)
  })
})

test('a finished answer is parsed once and its nodes are reused', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const answer = '## 标题\n\n正文有 **加粗** 和 `代码`。'
  const first = plugin.__test.answerView(answer)
  assert.equal(plugin.__test.answerView(answer), first, 'the same node array comes back')
  assert.notEqual(plugin.__test.answerView('另一条答案'), first, 'a different answer builds its own tree')
})

test('base64OfBytes encodes more than one window without padding drift', async () => {
  const { definition } = await loadBundle()
  const plugin = definition.factory(() => makeReact())
  const savedBuffer = globalThis.Buffer
  const bytes = new Uint8Array(16381)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 251
  const expected = savedBuffer.from(bytes).toString('base64')
  try {
    // The browser path: no Buffer, so the windowed encoder is what runs.
    delete globalThis.Buffer
    assert.equal(plugin.__test.base64OfBytes(bytes), expected)
  } finally {
    globalThis.Buffer = savedBuffer
  }
})

test('a scroll burst measures the jump control once per frame', async () => {
  await withCard(async ({ container }) => {
    const thread = container.querySelector('.clipchat-card__thread')
    Object.defineProperty(thread, 'clientHeight', { value: 200, configurable: true })
    Object.defineProperty(thread, 'scrollHeight', { value: 900, configurable: true })
    thread.getBoundingClientRect = () => ({ top: 0, bottom: 200, left: 0, right: 300, width: 300, height: 200 })

    const frames = []
    const realRaf = globalThis.requestAnimationFrame
    const realCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length }
    globalThis.cancelAnimationFrame = () => {}
    try {
      await act(async () => {
        for (let index = 0; index < 3; index += 1) {
          thread.dispatchEvent(new globalThis.window.Event('scroll', { bubbles: true }))
        }
      })
      assert.equal(frames.length, 1, 'three events share one frame')
      // Run the frame so the pending handle is cleared before unmount.
      await act(async () => { for (const frame of frames) frame(0) })
    } finally {
      globalThis.requestAnimationFrame = realRaf
      globalThis.cancelAnimationFrame = realCancel
    }
  })
})

test('a turn that falls off the thread releases its preview URL', async () => {
  const { fetchImpl } = askFetch()
  globalThis.fetch = fetchImpl
  const revoked = []
  let created = 0
  const originalCreate = globalThis.URL.createObjectURL
  const originalRevoke = globalThis.URL.revokeObjectURL
  globalThis.URL.createObjectURL = () => `blob:preview-${created += 1}`
  globalThis.URL.revokeObjectURL = (url) => { revoked.push(url) }
  try {
    await withCard(async ({ container }) => {
      const file = new globalThis.window.File(['x'], 'shot.png', { type: 'image/png' })
      await pickFiles(container, [file])
      const ta = container.querySelector('.clipchat-card__ta')
      const setter = Object.getOwnPropertyDescriptor(globalThis.window.HTMLTextAreaElement.prototype, 'value').set
      for (let index = 0; index < 7; index += 1) {
        await act(async () => {
          setter.call(ta, `第${index}问`)
          ta.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }))
        })
        await act(async () => { click(container.querySelector('.clipchat-card__send')) })
        await flush(120)
      }
      assert.ok(revoked.includes('blob:preview-1'), 'the dropped turn released its preview')
    })
  } finally {
    globalThis.URL.createObjectURL = originalCreate
    globalThis.URL.revokeObjectURL = originalRevoke
  }
})


test('both locale dictionaries carry the same keys', async () => {
  const { definition } = await loadBundle()
  const { dictionaries } = definition.factory(() => makeReact()).__test
  assert.deepEqual(
    Object.keys(dictionaries.en).sort(),
    Object.keys(dictionaries.zh).sort(),
    'a key added to one language must be added to the other',
  )
})
