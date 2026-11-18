/** Find a port the kernel says is free, without racing a fixed number. */
import { createServer } from 'node:net'

/**
 * Ask the kernel for an unused loopback port.
 *
 * Binding to port 0 and reading back the assignment is the only way to avoid
 * guessing; the socket is closed before the caller uses the number, which is
 * what every command-line server does. A transient `EADDRINUSE` is retried.
 *
 * @param {number} [attempts] - how many times to retry before failing.
 * @returns {Promise<number>} the free port.
 */
export async function findFreePort(attempts = 5) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const server = createServer()
        server.unref()
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
          const address = server.address()
          const port = typeof address === 'object' && address !== null ? address.port : null
          server.close(() => {
            if (port === null) reject(new Error('no port was assigned'))
            else resolve(port)
          })
        })
      })
    } catch (error) {
      lastError = error
      if (error?.code !== 'EADDRINUSE') throw error
    }
  }
  throw lastError ?? new Error('could not find a free port')
}
