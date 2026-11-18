/**
 * Child processes that can always be shut down.
 *
 * DSH starts a small tree of children, so every spawned process is `detached`
 * and therefore its own process-group leader: signalling `-pid` reaches the
 * whole group even when the direct child already exited. Both streams are
 * pumped into one log file and a bounded in-memory tail, so a startup failure
 * can report the last few kilobytes without holding the whole log in memory.
 */
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { redact } from './artifacts.mjs'

/** How much trailing output stays in memory for error messages. */
const TAIL_LIMIT = 4096

/**
 * Start one logged, detachable child.
 * @param {object} options - process options.
 * @param {string} options.command - executable.
 * @param {string[]} options.args - arguments.
 * @param {string} options.cwd - working directory.
 * @param {NodeJS.ProcessEnv} options.env - complete environment.
 * @param {string} options.logPath - file that receives both streams.
 * @returns {object} handle with `child`, `tail`, `wait`, `stop`, and `onLine`.
 */
export function spawnLogged({ command, args, cwd, env, logPath }) {
  const log = createWriteStream(logPath, { flags: 'a' })
  let tail = ''
  const lineListeners = []
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const pump = (chunk) => {
    // The Web session token is only known after `startWeb` sees the URL line,
    // so the exact value cannot be passed in here. `redact` also replaces
    // `token=`-shaped values, which keeps every file write safe during startup
    // errors. The in-memory copy stays raw: `waitForLine` needs the real URL to
    // extract that token, and callers redact `tail()` before printing it.
    const raw = chunk.toString()
    log.write(redact(raw))
    tail = (tail + raw).slice(-TAIL_LIMIT)
    for (const line of raw.split(/\r?\n/u)) {
      if (line.length === 0) continue
      for (const listener of lineListeners) listener(line)
    }
  }
  child.stdout?.on('data', pump)
  child.stderr?.on('data', pump)

  let exitCode = null
  let exitSignal = null
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exitCode = code
      exitSignal = signal
      log.end()
      resolve({ code, signal })
    })
  })

  /**
   * Observe every complete line from either stream.
   * @param {(line: string) => void} listener - called for each line.
   * @returns {void}
   */
  const onLine = (listener) => { lineListeners.push(listener) }

  /**
   * Stop the whole process group, escalating to SIGKILL after a grace period.
   * @param {number} [graceMs] - how long SIGTERM gets before SIGKILL.
   * @returns {Promise<void>} resolves when the child has exited.
   */
  const stop = async (graceMs = 5000) => {
    if (exitCode !== null || exitSignal !== null) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      try { child.kill('SIGTERM') } catch { /* already gone */ }
    }
    const timedOut = await Promise.race([
      exited.then(() => false),
      new Promise((resolve) => setTimeout(() => resolve(true), graceMs)),
    ])
    if (!timedOut) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
    await exited
  }

  return {
    child,
    onLine,
    tail: () => tail,
    wait: () => exited,
    get exitCode() { return exitCode },
    stop,
  }
}

/**
 * Wait until one line matches a pattern, or reject on timeout/exit.
 * @param {ReturnType<typeof spawnLogged>} handle - spawned process.
 * @param {RegExp} pattern - pattern to match against each complete line.
 * @param {number} timeoutMs - maximum wait.
 * @returns {Promise<RegExpExecArray>} the match.
 */
export async function waitForLine(handle, pattern, timeoutMs) {
  const match = handle.tail().match(pattern)
  if (match !== null) return match
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms waiting for ${pattern}`))
    }, timeoutMs)
    handle.onLine((line) => {
      const found = pattern.exec(line)
      if (found === null) return
      clearTimeout(timer)
      resolve(found)
    })
    handle.wait().then(({ code, signal }) => {
      clearTimeout(timer)
      reject(new Error(`process exited (code=${code}, signal=${signal}) before ${pattern}`))
    })
  })
}
