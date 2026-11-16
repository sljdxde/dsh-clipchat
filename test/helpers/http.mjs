/** Shared HTTP doubles for host-route tests. */
import { EventEmitter } from 'node:events'

export class FakeResponse extends EventEmitter {
  constructor() {
    super()
    this.status = 0
    this.headers = {}
    this.raw = ''
    this.ended = false
    this.writableEnded = false
  }

  writeHead(status, headers) {
    this.status = status
    this.headers = headers ?? {}
    return this
  }

  write(chunk) {
    this.raw += String(chunk)
    return true
  }

  end(body) {
    if (body !== undefined) this.raw += String(body)
    this.ended = true
    this.writableEnded = true
  }
}

/** A request double: emits a JSON body asynchronously, like a socket would. */
export function makeRequest({ method = 'POST', url, headers = {}, body } = {}) {
  const req = new EventEmitter()
  req.method = method
  req.url = url
  req.headers = headers
  req.destroyed = false
  req.destroy = () => { req.destroyed = true }
  if (body !== undefined) {
    setImmediate(() => {
      req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)))
      req.emit('end')
    })
  }
  return req
}

/** Drive a captured route handler to completion. */
export async function call(handler, request) {
  const res = new FakeResponse()
  await handler(request, res)
  return res
}
