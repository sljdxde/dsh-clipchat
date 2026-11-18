/**
 * System Chrome resolution, puppeteer launch, page logs, and failure capture.
 *
 * No browser is downloaded: `puppeteer-core` only drives one that already
 * exists. The resolution order is explicit so a missing browser produces the
 * list of paths that were tried instead of a generic launch error.
 */
import { access } from 'node:fs'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import { redact, writeText } from './artifacts.mjs'

/** macOS browser locations, in preference order. */
const MAC_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
]
/** Linux executable names, in preference order. */
const LINUX_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

/**
 * Whether a path is an executable file.
 * @param {string} path - candidate.
 * @returns {Promise<boolean>} executable?
 */
async function executable(path) {
  try {
    await new Promise((resolve, reject) => access(path, constants.X_OK, (error) => {
      if (error) reject(error)
      else resolve()
    }))
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a Chromium executable, preferring `E2E_CHROME_PATH`.
 * @returns {Promise<{path: string, tried: string[]}>} resolved path and candidates.
 */
export async function resolveChromePath() {
  const tried = []
  const fromEnv = process.env.E2E_CHROME_PATH
  if (fromEnv !== undefined && fromEnv.length > 0) {
    tried.push(fromEnv)
    if (await executable(fromEnv)) return { path: fromEnv, tried }
  }
  if (process.platform === 'darwin') {
    for (const path of MAC_CANDIDATES) {
      tried.push(path)
      if (await executable(path)) return { path, tried }
    }
  }
  for (const name of LINUX_NAMES) {
    for (const dir of (process.env.PATH ?? '').split(':')) {
      if (dir.length === 0) continue
      const path = join(dir, name)
      tried.push(path)
      if (await executable(path)) return { path, tried }
    }
  }
  return { path: null, tried }
}

/**
 * Launch the system browser.
 * @param {object} options - launch options.
 * @param {boolean} [options.headed] - run with a visible window.
 * @returns {Promise<{browser: object, executablePath: string, tried: string[]}>} running browser.
 */
export async function launchBrowser({ headed = false } = {}) {
  const { path, tried } = await resolveChromePath()
  if (path === null) {
    throw new Error(
      'E2E_CHROME_NOT_FOUND: no Chrome or Chromium was found. Set E2E_CHROME_PATH. Tried:\n'
      + tried.map((candidate) => `  - ${candidate}`).join('\n'),
    )
  }
  const browser = await puppeteer.launch({
    executablePath: path,
    headless: !headed,
    defaultViewport: { width: 1440, height: 900 },
    args: ['--disable-dev-shm-usage', '--disable-gpu'],
  })
  return { browser, executablePath: path, tried }
}

/**
 * Forward console, page errors, and failed requests into one log.
 * @param {object} page - puppeteer page.
 * @param {object} options - logging options.
 * @param {(line: string) => void} options.log - line sink.
 * @param {string[]} [options.secrets] - values to redact.
 * @returns {void}
 */
export function attachPageLogs(page, { log, secrets = [] }) {
  page.on('console', (message) => {
    log(`console.${message.type()}: ${redact(message.text(), secrets)}`)
  })
  page.on('pageerror', (error) => {
    log(`pageerror: ${redact(error?.stack ?? String(error), secrets)}`)
  })
  page.on('requestfailed', (request) => {
    log(`requestfailed: ${redact(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`, secrets)}`)
  })
}

/**
 * Write a full-page screenshot and the DOM at the moment of failure.
 *
 * Neither write may replace the assertion error: an artifact failure is
 * reported as a warning by the caller.
 * @param {object} page - puppeteer page.
 * @param {string} dir - artifact directory.
 * @param {string} caseId - case id used in the file names.
 * @param {string[]} [secrets] - values to redact from the HTML.
 * @returns {Promise<{screenshot: string, html: string}>} written paths.
 */
export async function captureFailure(page, dir, caseId, secrets = []) {
  const screenshot = join(dir, `failure-${caseId}.png`)
  const html = join(dir, `failure-${caseId}.html`)
  await mkdir(dir, { recursive: true })
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.screenshot({ path: screenshot, fullPage: true })
  await writeText(html, await page.content(), secrets)
  return { screenshot, html }
}

/**
 * Browser and puppeteer versions for `env.json`.
 * @param {object} browser - puppeteer browser.
 * @returns {Promise<{browser: string, puppeteer: string}>} version labels.
 */
export async function browserVersions(browser) {
  const version = await browser.version()
  const pkg = await import('puppeteer-core/package.json', { with: { type: 'json' } }).catch(() => ({ default: {} }))
  return { browser: version, puppeteer: pkg.default?.version ?? 'unknown' }
}
