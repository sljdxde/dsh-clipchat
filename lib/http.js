/**
 * HTTP transport helpers for the clipchat routes.
 *
 * A plugin route owns the raw `IncomingMessage` / `ServerResponse` pair, so
 * body reading, JSON replies, SSE framing and the same-origin fallback all
 * live here instead of being re-implemented per route.
 *
 * @module dsh-clipchat/lib/http
 */

/** Hard request-body cap shared by every write route. */
export const MAX_BODY_BYTES = 512 * 1024

/** An invalid or oversized body; `code` is safe to expose to the client. */
export class RequestBodyError extends Error {
  /**
   * @param {'body-too-large' | 'invalid-request'} code - stable error code.
   * @param {string} message - human-readable detail.
   */
  constructor(code, message) {
    super(message)
    this.name = 'RequestBodyError'
    this.code = code
  }
}

/**
 * Read and parse a JSON request body with a hard byte cap.
 * @param {import('node:http').IncomingMessage} req - the raw request.
 * @param {number} [limit] - maximum accepted bytes.
 * @returns {Promise<unknown>} parsed JSON body.
 */
export function readJsonBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      bytes += chunk.length
      if (bytes > limit) {
        // Keep draining the request so the response can still be delivered.
        fail(new RequestBodyError('body-too-large', '请求体超过 512 KB'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new RequestBodyError('invalid-request', '请求体不是合法 JSON'))
      }
    })
    req.on('error', (error) => fail(new RequestBodyError('invalid-request', String(error?.message ?? error))))
  })
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON-serialisable body.
 */
export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/**
 * Open an SSE response.
 * @param {import('node:http').ServerResponse} res - the response.
 */
export function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
}

/**
 * Write one SSE frame; a response closed by the client is left untouched.
 * @param {import('node:http').ServerResponse} res - the response.
 * @param {unknown} payload - frame payload.
 * @param {() => boolean} [closed] - whether the client already disconnected.
 */
export function writeFrame(res, payload, closed = () => false) {
  if (closed() || res.writableEnded === true) return
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

/**
 * Fallback fence used only when the host has no `connection` service: require
 * the request to look same-origin. This is weaker than `requestRejection`
 * (no credential check), which the status route reports as `same-origin`.
 * @param {{ headers?: Record<string, string | string[] | undefined> }} req - request headers.
 * @returns {401 | 403 | undefined} rejection status, or undefined when allowed.
 */
export function sameOriginRejection(req) {
  const headers = req?.headers ?? {}
  const host = typeof headers.host === 'string' ? headers.host : undefined
  if (host === undefined || host.length === 0) return 403

  const fetchSite = headers['sec-fetch-site']
  if (typeof fetchSite === 'string' && fetchSite !== 'same-origin' && fetchSite !== 'none') return 403

  for (const name of ['origin', 'referer']) {
    const value = headers[name]
    if (typeof value !== 'string' || value.length === 0) continue
    try {
      if (new URL(value).host !== host) return 403
    } catch {
      return 403
    }
  }
  return undefined
}
