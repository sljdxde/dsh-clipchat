/**
 * Request attachments for one clipchat turn.
 *
 * The client sends images and files inline as base64 because the card is a
 * one-shot ask, not a session write: nothing is persisted on the conversation
 * side. This module validates that payload, hands each item to the host
 * attachment service, and returns provider-neutral content blocks.
 *
 * When no attachment service is mounted (older hosts, tests) the same items
 * degrade to one text note naming each file, so the model still knows what the
 * user attached instead of silently losing it.
 *
 * @module dsh-clipchat/lib/attachments
 */

/** Accepted sizes, kept under the ask route's body cap after base64 expansion. */
export const ATTACH_LIMITS = Object.freeze({
  maxFiles: 6,
  maxBytes: 4 * 1024 * 1024,
  maxTotalBytes: 6 * 1024 * 1024,
})

/** Raster formats the attachment service accepts. `client.js` mirrors this list. */
export const IMAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** A caller mistake that maps to one 400 response. */
export class AttachmentInputError extends Error {
  /**
   * @param {string} code - stable error code for the client.
   * @param {string} message - human-readable message.
   */
  constructor(code, message) {
    super(message)
    this.name = 'AttachmentInputError'
    this.code = code
  }
}

/**
 * Decode one canonical base64 string to bytes.
 * @param {string} data - base64 payload without a data-URL prefix.
 * @returns {Buffer} decoded bytes.
 */
function decodeBase64(data) {
  // Buffer's base64 decoder never throws: invalid characters are ignored, and
  // the byte cap is what protects the route from a padded payload.
  return Buffer.from(data, 'base64')
}

/**
 * Normalise the client's attachment list.
 *
 * @param {unknown} raw - `attachments` from the request body.
 * @returns {Array<{ kind: 'image' | 'file', name: string, mediaType: string, bytes: Buffer }>} accepted items.
 * @throws {AttachmentInputError} when the list is malformed or over a limit.
 */
export function normalizeRequestAttachments(raw) {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new AttachmentInputError('attachment-unreadable', 'attachments 必须是数组')
  }
  if (raw.length > ATTACH_LIMITS.maxFiles) {
    throw new AttachmentInputError('attachment-too-many', `最多 ${ATTACH_LIMITS.maxFiles} 个附件`)
  }
  const items = []
  let total = 0
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') {
      throw new AttachmentInputError('attachment-unreadable', '附件条目格式不正确')
    }
    const name = typeof entry.name === 'string' && entry.name.length > 0 ? entry.name.slice(0, 200) : 'attachment'
    if (typeof entry.data !== 'string' || entry.data.length === 0) {
      throw new AttachmentInputError('attachment-unreadable', `${name} 没有内容`)
    }
    // Decide on the encoded length first: decoding a payload that is already
    // over the cap would allocate the very bytes the cap exists to refuse.
    const data = entry.data
    const padding = data.endsWith('==') ? 2 : (data.endsWith('=') ? 1 : 0)
    const estimate = Math.floor(data.length * 3 / 4) - padding
    if (estimate > ATTACH_LIMITS.maxBytes) {
      throw new AttachmentInputError('attachment-too-large', `${name} 超过 ${ATTACH_LIMITS.maxBytes / 1024 / 1024} MB`)
    }
    if (total + estimate > ATTACH_LIMITS.maxTotalBytes) {
      throw new AttachmentInputError('attachment-too-large', '附件总大小超过上限')
    }

    const bytes = decodeBase64(data)
    // Buffer's decoder ignores invalid characters, so a garbage string decodes
    // to zero bytes. Storing that would silently attach an empty file.
    if (bytes.length === 0) {
      throw new AttachmentInputError('attachment-unreadable', `${name} 的内容为空`)
    }
    // A malformed payload can decode to more bytes than the estimate promised,
    // so the decoded size is still the final word.
    if (bytes.length > ATTACH_LIMITS.maxBytes) {
      throw new AttachmentInputError('attachment-too-large', `${name} 超过 ${ATTACH_LIMITS.maxBytes / 1024 / 1024} MB`)
    }
    total += bytes.length
    if (total > ATTACH_LIMITS.maxTotalBytes) {
      throw new AttachmentInputError('attachment-too-large', '附件总大小超过上限')
    }
    const declared = typeof entry.mediaType === 'string' ? entry.mediaType : ''
    const kind = entry.kind === 'image' && IMAGE_TYPES.includes(declared) ? 'image' : 'file'
    items.push({
      kind,
      name,
      mediaType: kind === 'image' ? declared : (declared || 'application/octet-stream'),
      bytes,
    })
  }
  return items
}

/** Short human size for a fallback note. */
function sizeText(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Resolve validated attachments into model content blocks.
 *
 * Images become `image` blocks (the runtime projects them to text for a
 * text-only route), files become `file` blocks (always projected to a handle
 * naming the stored copy). Without a store, everything degrades to one note.
 *
 * @param {Array<{ kind: string, name: string, mediaType: string, bytes: Buffer }>} items - validated items.
 * @param {{ saveImage?: Function, saveFile?: Function } | undefined} store - host attachment service.
 * @returns {Promise<{ blocks: Array<object>, notes: string[] }>} blocks and fallback notes.
 */
export async function resolveAttachmentBlocks(items, store) {
  if (items.length === 0) return { blocks: [], notes: [] }
  const usable = store !== null && store !== undefined
    && typeof store.saveImage === 'function' && typeof store.saveFile === 'function'
  if (!usable) {
    return {
      blocks: [],
      notes: items.map((item) => `附件：${item.name}（${sizeText(item.bytes.length)}）`),
    }
  }
  const blocks = []
  for (const item of items) {
    if (item.kind === 'image') {
      const ref = await store.saveImage({ data: item.bytes, mediaType: item.mediaType, name: item.name })
      blocks.push({ type: 'image', attachment: ref })
      continue
    }
    const ref = await store.saveFile({ data: item.bytes, name: item.name })
    blocks.push({ type: 'file', attachment: ref })
  }
  return { blocks, notes: [] }
}
