/**
 * Locate the local DSH launcher, prove the composed profile loads, and boot the
 * Web surface with a readiness probe that cannot mistake an error page for a
 * running server.
 */
import { access } from 'node:fs'
import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnLogged, waitForLine } from './process.mjs'
import { redact } from './artifacts.mjs'

/** Startup line the Web app prints with the authenticated URL. */
const URL_LINE = /dsh web:\s+(http:\/\/\S+)/u

/**
 * Resolve the DSH launcher: `DSH_BIN`, else the standard local runtime path.
 * @returns {string} absolute launcher path.
 */
export function resolveDshBin() {
  const fromEnv = process.env.DSH_BIN
  const candidate = fromEnv !== undefined && fromEnv.length > 0
    ? fromEnv
    : join(homedir(), '.dsh', 'runtime', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return candidate
}

/**
 * Fail early with an actionable message when the launcher is missing.
 * @param {string} dshBin - candidate launcher path.
 * @returns {Promise<void>} rejects with exit-code-2 semantics upstream.
 */
export async function assertDshBin(dshBin) {
  try {
    await new Promise((resolve, reject) => {
      access(dshBin, constants.R_OK, (error) => { if (error) reject(error); else resolve() })
    })
  } catch {
    throw new Error(
      `E2E_DSH_NOT_FOUND: ${dshBin} is not readable. Install DSH 0.2.2-rc.3 locally or set DSH_BIN `
      + 'to its lib/bin.js.',
    )
  }
}

/**
 * Compose the profile without binding a port; this catches patch or bundle
 * mistakes before a server is started.
 * @param {object} options - check inputs.
 * @param {string} options.dshBin - launcher path.
 * @param {NodeJS.ProcessEnv} options.env - environment carrying `DSH_HOME`.
 * @param {string} options.profile - profile name.
 * @returns {Promise<{stdout: string, stderr: string}>} dump output.
 */
export async function dumpConfig({ dshBin, env, profile }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dshBin, '--profile', profile, '--dump-config'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`dsh --dump-config exited ${code}: ${stderr.slice(-2000)}`))
        return
      }
      if (!stdout.includes('session-persistence-jsonl')) {
        reject(new Error('dsh --dump-config did not compose the session-persistence-jsonl row'))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

/**
 * Start the Web surface and wait until it serves a non-empty page.
 * @param {object} options - startup inputs.
 * @param {string} options.dshBin - launcher path.
 * @param {NodeJS.ProcessEnv} options.env - environment carrying `DSH_HOME`.
 * @param {string} options.cwd - working directory.
 * @param {number} options.port - free port.
 * @param {string} options.logPath - web.log path.
 * @returns {Promise<{handle: object, url: string, token: string}>} running server.
 */
export async function startWeb({ dshBin, env, cwd, port, logPath }) {
  const handle = spawnLogged({
    command: process.execPath,
    args: [dshBin, '--profile', 'e2e-web', '--no-open', '--host', '127.0.0.1', '--port', String(port)],
    cwd,
    env,
    logPath,
  })
  let match
  // A failed startup must not leave the detached Web process group behind; the
  // caller never receives the handle, so it cannot stop it later.
  const abort = async (message) => {
    const tail = redact(handle.tail())
    await handle.stop()
    throw new Error(`${message}\nweb.log tail:\n${tail}`)
  }
  try {
    match = await waitForLine(handle, URL_LINE, 30_000)
  } catch (error) {
    await abort(error.message)
  }
  const url = match[1]
  const token = new URL(url).searchParams.get('token') ?? ''
  const deadline = Date.now() + 30_000
  let lastError = null
  while (Date.now() < deadline) {
    if (handle.exitCode !== null) {
      await abort(`web exited before becoming ready (code=${handle.exitCode})`)
    }
    try {
      // Node's fetch has no cookie jar: the token URL answers 303 that sets
      // the session cookie, and following it without the cookie lands on 401.
      // The redirect status alone proves the server is serving.
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status >= 200 && response.status < 400) {
        return { handle, url, token }
      }
      const body = await response.text()
      lastError = new Error(`HTTP ${response.status} with ${body.length} bytes`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  await abort(`web did not become ready within 30s (${lastError?.message ?? 'no response'})`)
}

/**
 * Read the launcher's version from the package that owns it.
 *
 * Deriving the package root from `dshBin` keeps `env.json` truthful when
 * `DSH_BIN` points at a different installation than the default runtime.
 *
 * @param {string} [dshBin] - launcher path; defaults to the resolved launcher.
 * @returns {Promise<string>} installed DSH version, or `unknown`.
 */
export async function dshVersion(dshBin = resolveDshBin()) {
  try {
    const { readFile } = await import('node:fs/promises')
    const candidates = [
      // `<pkg>/lib/bin.js` → `<pkg>/package.json`
      join(dirname(dshBin), '..', 'package.json'),
      // A launcher at the package root (`.../dsh/bin.js`)
      join(dirname(dshBin), 'package.json'),
    ]
    for (const path of candidates) {
      try {
        const parsed = JSON.parse(await readFile(path, 'utf8'))
        if (typeof parsed.version === 'string') return parsed.version
      } catch { /* try the next layout */ }
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
