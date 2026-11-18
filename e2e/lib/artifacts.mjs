/**
 * Result files, logs, and the one place that knows how to redact a secret.
 *
 * Every artifact written by the runner passes through `redact`: the Web URL
 * carries a bearer-like token and page logs can echo request headers, so
 * redaction happens at write time instead of relying on each caller.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const TOKEN_QUERY = /([?&]token=)[^&\s"'<>]+/gu
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gu
const AUTH_HEADER = /(authorization["']?\s*[:=]\s*["']?)[^"'\r\n]+/giu

/**
 * Replace secrets and token-shaped strings in one piece of text.
 * @param {string} text - raw text.
 * @param {string[]} [secrets] - exact values that must never be written.
 * @returns {string} redacted text.
 */
export function redact(text, secrets = []) {
  let out = String(text)
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) out = out.split(secret).join('***')
  }
  out = out.replace(TOKEN_QUERY, '$1***')
  out = out.replace(BEARER, '$1***')
  out = out.replace(AUTH_HEADER, '$1***')
  return out
}

/**
 * Recursively redact every string inside a JSON-like value.
 * @param {unknown} value - value to sanitize.
 * @param {string[]} [secrets] - exact values that must never be written.
 * @returns {unknown} sanitized copy.
 */
export function sanitize(value, secrets = []) {
  if (typeof value === 'string') return redact(value, secrets)
  if (Array.isArray(value)) return value.map((item) => sanitize(item, secrets))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = sanitize(item, secrets)
    return out
  }
  return value
}

/** Append one line to a log file, creating its directory first. */
export function createLogWriter(filePath) {
  return async (message) => {
    await mkdir(dirname(filePath), { recursive: true })
    await appendFile(filePath, `${redact(String(message))}\n`)
  }
}

/** Write one text artifact. */
export async function writeText(filePath, text, secrets = []) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, redact(text, secrets))
}

/** Write one JSON artifact with secrets redacted inside every string. */
export async function writeJson(filePath, value, secrets = []) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(sanitize(value, secrets), null, 2)}\n`)
}

/** Read a text file as-is. */
export async function readText(filePath) {
  return await readFile(filePath, 'utf8')
}

/**
 * Build the standard `result.json` payload.
 * @param {object} options - result fields.
 * @param {string} options.runId - run identity.
 * @param {string} options.caseId - case id.
 * @param {boolean} options.passed - whether every assertion passed.
 * @param {number} options.startedAt - epoch milliseconds when the run started.
 * @param {{name: string, passed: boolean, detail: string}[]} options.assertions - assertion records.
 * @param {Record<string, unknown>} options.env - environment versions.
 * @param {Record<string, string>} options.artifacts - artifact paths relative to the run directory.
 * @param {string | null} options.error - environment/setup failure, if any.
 * @returns {object} serializable result.
 */
export function makeResult({ runId, caseId, passed, startedAt, assertions, env, artifacts, error = null }) {
  return {
    runId,
    case: caseId,
    passed,
    durationMs: Date.now() - startedAt,
    assertions,
    env,
    artifacts,
    error,
  }
}

/** Name of the failure screenshot for one case. */
export function failurePaths(dir, caseId) {
  return {
    screenshot: join(dir, `failure-${caseId}.png`),
    html: join(dir, `failure-${caseId}.html`),
  }
}
