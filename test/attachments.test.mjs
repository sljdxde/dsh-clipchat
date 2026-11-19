import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ATTACH_LIMITS,
  AttachmentInputError,
  normalizeRequestAttachments,
  resolveAttachmentBlocks,
} from '../lib/attachments.js'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

/** One valid wire attachment. */
function imageEntry(overrides = {}) {
  return {
    kind: 'image',
    name: 'shot.png',
    mediaType: 'image/png',
    data: PNG.toString('base64'),
    ...overrides,
  }
}

test('normalizeRequestAttachments accepts a valid image and a valid file', () => {
  const items = normalizeRequestAttachments([
    imageEntry(),
    { kind: 'file', name: 'notes.md', mediaType: 'text/markdown', data: Buffer.from('# hi').toString('base64') },
  ])
  assert.equal(items.length, 2)
  assert.equal(items[0].kind, 'image')
  assert.equal(items[0].mediaType, 'image/png')
  assert.ok(Buffer.isBuffer(items[0].bytes))
  assert.equal(items[1].kind, 'file')
  assert.equal(items[1].name, 'notes.md')
})

test('a declared image type outside the raster list is carried as a file', () => {
  const items = normalizeRequestAttachments([imageEntry({ mediaType: 'image/svg+xml' })])
  assert.equal(items[0].kind, 'file')
})

test('normalizeRequestAttachments refuses malformed lists with stable codes', () => {
  const cases = [
    ['not-an-array', 'attachment-unreadable'],
    [Array.from({ length: ATTACH_LIMITS.maxFiles + 1 }, () => imageEntry()), 'attachment-too-many'],
    [[{ kind: 'image', name: 'empty.png', mediaType: 'image/png' }], 'attachment-unreadable'],
    [[imageEntry({ data: Buffer.alloc(ATTACH_LIMITS.maxBytes + 1).toString('base64') })], 'attachment-too-large'],
  ]
  for (const [input, code] of cases) {
    assert.throws(() => normalizeRequestAttachments(input), (error) => {
      assert.ok(error instanceof AttachmentInputError)
      assert.equal(error.code, code)
      return true
    })
  }
})

test('a non-object entry and an empty payload are refused', () => {
  assert.throws(() => normalizeRequestAttachments([null]), (error) => {
    assert.equal(error.code, 'attachment-unreadable')
    return true
  })
  assert.throws(() => normalizeRequestAttachments([{}]), (error) => {
    assert.match(error.message, /attachment/)
    return true
  })
})

test('a file with no display name still gets a usable label', () => {
  const items = normalizeRequestAttachments([
    { kind: 'file', mediaType: 'text/plain', data: Buffer.from('x').toString('base64') },
  ])
  assert.equal(items[0].name, 'attachment')
})

test('fallback notes scale up to megabytes', async () => {
  const big = Buffer.alloc(2 * 1024 * 1024)
  const items = normalizeRequestAttachments([
    { kind: 'file', name: 'big.bin', mediaType: 'application/octet-stream', data: big.toString('base64') },
  ])
  const { notes } = await resolveAttachmentBlocks(items, undefined)
  assert.match(notes[0], /2\.0 MB/)
})

test('the combined size of several attachments is capped', () => {
  const each = Buffer.alloc(Math.floor(ATTACH_LIMITS.maxTotalBytes / 2) + 1024).toString('base64')
  assert.throws(
    () => normalizeRequestAttachments([imageEntry({ data: each }), imageEntry({ data: each })]),
    (error) => error.code === 'attachment-too-large',
  )
})

test('without an attachment service every item degrades to one text note', async () => {
  const items = normalizeRequestAttachments([
    imageEntry(),
    { kind: 'file', name: 'notes.md', mediaType: 'text/markdown', data: 'aGk=' },
  ])
  const { blocks, notes } = await resolveAttachmentBlocks(items, undefined)
  assert.deepEqual(blocks, [])
  assert.equal(notes.length, 2)
  assert.match(notes[0], /shot\.png/)
  assert.match(notes[1], /notes\.md/)
})

test('with an attachment service images and files become content blocks', async () => {
  const calls = []
  const store = {
    async saveImage(input) {
      calls.push(['image', input])
      return { attachmentId: 'a1', mediaType: input.mediaType, bytes: input.data.length, width: 1, height: 1 }
    },
    async saveFile(input) {
      calls.push(['file', input])
      return { attachmentId: 'f1', name: input.name, bytes: input.data.length }
    },
  }
  const items = normalizeRequestAttachments([
    imageEntry(),
    { kind: 'file', name: 'notes.md', mediaType: 'text/markdown', data: 'aGk=' },
  ])
  const { blocks, notes } = await resolveAttachmentBlocks(items, store)
  assert.deepEqual(notes, [])
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].type, 'image')
  assert.equal(blocks[0].attachment.attachmentId, 'a1')
  assert.equal(blocks[1].type, 'file')
  assert.deepEqual(calls.map((call) => call[0]), ['image', 'file'])
  assert.equal(calls[0][1].name, 'shot.png')
})


test('the size caps are inclusive at the boundary and exclusive past it', () => {
  const exact = Buffer.alloc(ATTACH_LIMITS.maxBytes)
  assert.equal(normalizeRequestAttachments([
    { kind: 'file', name: 'exact.bin', mediaType: 'application/octet-stream', data: exact.toString('base64') },
  ]).length, 1)

  const half = Buffer.alloc(Math.floor(ATTACH_LIMITS.maxTotalBytes / 2))
  const rest = Buffer.alloc(ATTACH_LIMITS.maxTotalBytes - half.length)
  assert.equal(normalizeRequestAttachments([
    { kind: 'file', name: 'a.bin', mediaType: 'application/octet-stream', data: half.toString('base64') },
    { kind: 'file', name: 'b.bin', mediaType: 'application/octet-stream', data: rest.toString('base64') },
  ]).length, 2)

  assert.throws(() => normalizeRequestAttachments([
    { kind: 'file', name: 'a.bin', mediaType: 'application/octet-stream', data: half.toString('base64') },
    { kind: 'file', name: 'b.bin', mediaType: 'application/octet-stream', data: rest.toString('base64') },
    { kind: 'file', name: 'c.bin', mediaType: 'application/octet-stream', data: 'aGk=' },
  ]), (error) => error.code === 'attachment-too-large')
})

test('an empty media type falls back, and an image kind without a raster type becomes a file', () => {
  const items = normalizeRequestAttachments([
    { kind: 'file', name: 'plain', mediaType: '', data: Buffer.from('x').toString('base64') },
    { kind: 'image', name: 'no-type', data: Buffer.from('y').toString('base64') },
  ])
  assert.equal(items[0].mediaType, 'application/octet-stream')
  assert.equal(items[1].kind, 'file')
})

test('a payload that decodes to zero bytes is refused', () => {
  assert.throws(() => normalizeRequestAttachments([
    { kind: 'file', name: 'empty.bin', mediaType: 'application/octet-stream', data: '!!!' },
  ]), (error) => error.code === 'attachment-unreadable')
})

test('an over-limit payload is refused before it is decoded', () => {
  // Every character is invalid base64: decoding yields zero bytes, so only the
  // encoded length can raise the size error, which proves the check runs first.
  const oversized = '!'.repeat(Math.ceil(ATTACH_LIMITS.maxBytes * 4 / 3) + 16)
  assert.throws(() => normalizeRequestAttachments([
    { kind: 'file', name: 'huge.bin', mediaType: 'application/octet-stream', data: oversized },
  ]), (error) => {
    assert.ok(error instanceof AttachmentInputError)
    assert.equal(error.code, 'attachment-too-large')
    assert.match(error.message, /huge\.bin/)
    return true
  })
})

test('a payload whose decoded size beats the estimate is still refused', () => {
  // One '=' past the padding the encoder produced: the estimate is one byte
  // short, and only the decoded size can catch it.
  const data = Buffer.alloc(ATTACH_LIMITS.maxBytes + 1).toString('base64') + '='
  assert.equal(Buffer.from(data, 'base64').length, ATTACH_LIMITS.maxBytes + 1,
    'the payload really decodes past the per-file cap')
  assert.throws(() => normalizeRequestAttachments([
    { kind: 'file', name: 'drift.bin', mediaType: 'application/octet-stream', data },
  ]), (error) => {
    assert.equal(error.code, 'attachment-too-large')
    return true
  })
})

test('the cumulative cap is re-checked against the decoded sizes', () => {
  // Each item estimates one byte short, so the early cumulative check lands
  // exactly on the cap while the decoded total is one byte over it.
  const first = Buffer.alloc(ATTACH_LIMITS.maxTotalBytes - ATTACH_LIMITS.maxBytes + 3).toString('base64')
  const second = Buffer.alloc(ATTACH_LIMITS.maxBytes - 2).toString('base64') + '='
  assert.equal(Buffer.from(second, 'base64').length, ATTACH_LIMITS.maxBytes - 2,
    'the second item decodes one byte past its estimate')
  assert.throws(() => normalizeRequestAttachments([
    { kind: 'file', name: 'a.bin', mediaType: 'application/octet-stream', data: first },
    { kind: 'file', name: 'b.bin', mediaType: 'application/octet-stream', data: second },
  ]), (error) => {
    assert.equal(error.code, 'attachment-too-large')
    assert.match(error.message, /总大小/)
    return true
  })
})
