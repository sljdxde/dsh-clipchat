#!/usr/bin/env node
/**
 * E2E runner: prepare a throwaway DSH home, generate a 60-turn fixture, boot
 * the real Web surface, drive system Chrome, and archive everything a failing
 * run needs to be understood without a re-run.
 *
 * Usage:
 *   node e2e/run.mjs --prepare-only   # profiles + mock + fixture, no browser
 *   node e2e/run.mjs                  # full P0-4 run
 *   node e2e/run.mjs --headed         # visible browser
 *   node e2e/run.mjs --keep           # keep the temporary DSH home
 *   node e2e/run.mjs --browser-smoke  # launch + screenshot about:blank
 *
 * Exit codes: 0 every assertion passed, 1 an assertion failed, 2 the
 * environment or a precondition failed before the case could decide.
 */
import { rm } from 'node:fs/promises'
import { writeSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { makeResult, createLogWriter, redact, writeJson } from './lib/artifacts.mjs'
import { attachPageLogs, browserVersions, captureFailure, launchBrowser } from './lib/browser.mjs'
import { assertDshBin, dshVersion, dumpConfig, resolveDshBin, startWeb } from './lib/dsh.mjs'
import {
  ANCHOR, TARGET_TURN, TURNS, assertPlaintextOnly, generateSeedSession, purgeProjectionCache, rewriteFixture,
} from './lib/fixture.mjs'
import { startMockLlm } from './lib/mock-llm.mjs'
import { assertPluginLink, writeProfiles } from './lib/profile.mjs'
import { createRunDirs, makeRunId, pathsFor, removeRunDir, removeRunDirSync } from './lib/paths.mjs'
import { findFreePort } from './lib/port.mjs'

/** Failure that means the environment is unusable, not that the case failed. */
class EnvironmentError extends Error {}

/** Currently running case id, so archiving knows what to name the failure files. */
const CASE_ID = 'p0-04'

/**
 * Parse the runner's own flags.
 * @param {string[]} argv - process arguments after the script name.
 * @returns {object} parsed options.
 */
function parseArgs(argv) {
  const options = {
    prepareOnly: false,
    browserSmoke: false,
    keep: process.env.E2E_KEEP_TMP === '1',
    headed: process.env.E2E_HEADED === '1',
    caseId: CASE_ID,
    unknown: [],
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--prepare-only') options.prepareOnly = true
    else if (arg === '--browser-smoke') options.browserSmoke = true
    else if (arg === '--keep') options.keep = true
    else if (arg === '--headed') options.headed = true
    else if (arg === '--case') {
      options.caseId = argv[index + 1] ?? ''
      index += 1
    } else options.unknown.push(arg)
  }
  return options
}

/**
 * Load the case module and fail loudly when the id is unknown.
 * @param {string} caseId - requested case id.
 * @returns {Promise<{run: Function}>} case module.
 */
async function loadCase(caseId) {
  if (caseId !== CASE_ID) throw new EnvironmentError(`unknown case ${caseId}; only ${CASE_ID} exists`)
  return await import('./cases/p0-04-locate.mjs')
}

/**
 * Environment label file contents.
 * @param {object} extra - additional version facts.
 * @returns {object} env payload.
 */
function envPayload(extra) {
  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    dsh: extra.dshVersion,
    chrome: extra.chrome,
    puppeteer: extra.puppeteer,
  }
}

/**
 * Run the whole pipeline and return the process exit code.
 * @returns {Promise<number>} exit code.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2))
  const runId = makeRunId()
  const paths = pathsFor(runId)
  await createRunDirs(paths)
  const startedAt = Date.now()
  const secrets = []
  const artifacts = {}
  const assertions = []
  const logs = {
    web: join(paths.artifactsDir, 'web.log'),
    mock: join(paths.artifactsDir, 'mock-llm.log'),
    fixture: join(paths.artifactsDir, 'fixture.log'),
    browser: join(paths.artifactsDir, 'browser.log'),
  }
  const mockLog = createLogWriter(logs.mock)
  const fixtureLog = createLogWriter(logs.fixture)
  const browserLog = createLogWriter(logs.browser)

  let mock = null
  let web = null
  let browser = null
  let page = null
  let dshBin = null
  let chromePath = 'n/a'
  let puppeteerVersion = 'n/a'
  let failure = null
  let exitCode = 0

  const say = (line) => process.stdout.write(`${line}\n`)

  /** One teardown path shared by normal completion and a signalled shutdown. */
  const cleanup = async () => {
    try { await browser?.browser.close() } catch (error) { say(`WARN browser close: ${error?.message ?? error}`) }
    try { await web?.handle.stop() } catch (error) { say(`WARN web stop: ${error?.message ?? error}`) }
    try { await mock?.close() } catch (error) { say(`WARN mock close: ${error?.message ?? error}`) }
  }

  /** Kill the detached Web group and the browser without awaiting anything. */
  const killChildrenSync = () => {
    const webPid = web?.handle.child.pid
    if (Number.isInteger(webPid)) {
      try { process.kill(-webPid, 'SIGKILL') } catch {
        try { process.kill(webPid, 'SIGKILL') } catch { /* already gone */ }
      }
    }
    const chrome = browser?.browser.process?.()
    if (chrome !== null && chrome !== undefined) {
      try { chrome.kill('SIGKILL') } catch { /* already gone */ }
    }
  }

  // A SIGINT while `puppeteer.launch` is in flight is the sharpest case:
  // @puppeteer/browsers installs its own SIGINT listener that calls
  // `process.exit(130)` as soon as this listener returns. The critical cleanup
  // therefore runs synchronously here; the async teardown is best effort.
  let shuttingDown = false
  const onSignal = (signal) => {
    if (shuttingDown) return
    shuttingDown = true
    try { writeSync(1, `signal=${signal} cleaning up\n`) } catch { /* stdout closed */ }
    killChildrenSync()
    let removed = false
    if (!options.keep) {
      try {
        removeRunDirSync(paths)
        removed = true
      } catch (error) {
        try { writeSync(2, `WARN cleanup refused: ${error?.message ?? error}\n`) } catch { /* stderr closed */ }
      }
    }
    void (async () => {
      await cleanup()
      if (!removed && !options.keep) {
        try { await removeRunDir(paths) } catch (error) { say(`WARN cleanup refused: ${error?.message ?? error}`) }
      }
      process.exit(signal === 'SIGINT' ? 130 : 143)
    })()
  }
  const signalHandlers = {
    SIGINT: () => onSignal('SIGINT'),
    SIGTERM: () => onSignal('SIGTERM'),
  }
  for (const [signal, handler] of Object.entries(signalHandlers)) process.on(signal, handler)

  try {
    say(`runId=${runId}`)
    say(`case=${options.caseId}`)
    say(`tmp=${paths.tmpRoot}`)
    say(`artifacts=${paths.artifactsDir}`)

    dshBin = resolveDshBin()
    await assertDshBin(dshBin)
    await writeProfiles({ home: paths.home, dshBin })
    const profileDir = join(paths.home, 'profiles', 'e2e-web')
    await assertPluginLink(profileDir)
    say('profile=ok')

    const baseEnv = {
      ...process.env,
      DSH_HOME: paths.home,
      E2E_MOCK_API_KEY: 'mock-e2e',
    }
    await dumpConfig({ dshBin, env: baseEnv, profile: 'e2e-web' })
    say('dump-config=ok')

    mock = await startMockLlm({ log: mockLog })
    baseEnv.E2E_MOCK_BASE_URL = mock.baseUrl
    say(`mock=${mock.baseUrl}`)

    const seed = await generateSeedSession({
      dshBin,
      env: baseEnv,
      cwd: paths.workspace,
      logPath: logs.fixture,
    })
    say(`fixtureSessionId=${seed.sessionId}`)
    await fixtureLog(`seed session=${seed.sessionId} raw=${seed.logPath}`)

    const rewritten = await rewriteFixture({
      sourcePath: seed.logPath,
      sessionId: seed.sessionId,
      workspace: paths.workspace,
    })
    const removed = await purgeProjectionCache(paths.home, seed.sessionId)
    await assertPlaintextOnly(rewritten.path)
    await fixtureLog(`rewrote turns=${TURNS} target=${TARGET_TURN} lines=${rewritten.lines} projectionCache=${removed.length}`)
    say(`rawJsonl=${rewritten.path}`)
    say(`turns=${TURNS} target=${TARGET_TURN} anchor=${ANCHOR}`)
    say(`projectionCache=${removed.length === 0 ? 'absent' : 'removed'}`)

    if (options.prepareOnly) say('prepare-only: ok')

    if (options.browserSmoke) {
      browser = await launchBrowser({ headed: options.headed })
      chromePath = browser.executablePath
      const versions = await browserVersions(browser.browser)
      puppeteerVersion = versions.puppeteer
      page = await browser.browser.newPage()
      await page.goto('about:blank')
      const screenshot = join(paths.artifactsDir, 'browser-smoke.png')
      await page.screenshot({ path: screenshot })
      artifacts.smokeScreenshot = relative(paths.artifactsDir, screenshot)
      say(`browser-smoke=ok chrome=${chromePath} puppeteer=${puppeteerVersion}`)
    } else if (!options.prepareOnly) {
      const webPort = await findFreePort()
      web = await startWeb({
        dshBin,
        env: baseEnv,
        cwd: paths.workspace,
        port: webPort,
        logPath: logs.web,
      })
      secrets.push(web.token)
      await writeJson(join(paths.artifactsDir, 'pids.json'), {
        // The mock is an HTTP server inside this runner, not a child process.
        mock: 'in-process',
        web: web.handle.child.pid,
      })
      say(`web=${redact(web.url, secrets)}`)

      browser = await launchBrowser({ headed: options.headed })
      chromePath = browser.executablePath
      const versions = await browserVersions(browser.browser)
      puppeteerVersion = versions.puppeteer
      page = await browser.browser.newPage()
      attachPageLogs(page, { log: browserLog, secrets })

      const caseModule = await loadCase(options.caseId)
      const outcome = await caseModule.run({ page, paths, url: web.url, sessionId: seed.sessionId, log: say })
      assertions.push(...outcome.assertions)
      for (const assertion of assertions) {
        const timing = Number.isFinite(assertion.durationMs) ? ` (${assertion.durationMs}ms)` : ''
        say(`${assertion.passed ? 'PASS' : 'FAIL'} ${assertion.name}${timing} - ${assertion.detail}`)
      }
    }
  } catch (error) {
    failure = error
    exitCode = error instanceof EnvironmentError ? 2 : 1
    say(`ERROR ${error?.message ?? error}`)
    if (page !== null) {
      try {
        const written = await captureFailure(page, paths.artifactsDir, options.caseId, secrets)
        artifacts.failureScreenshot = relative(paths.artifactsDir, written.screenshot)
        artifacts.failureHtml = relative(paths.artifactsDir, written.html)
      } catch (archiveError) {
        say(`WARN failure artifacts incomplete: ${archiveError?.message ?? archiveError}`)
      }
    }
    if (Array.isArray(error?.assertions)) assertions.push(...error.assertions)
    else {
      assertions.push({
        name: 'case-error',
        passed: false,
        detail: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`,
      })
    }
  } finally {
    await cleanup()
  }

  const passed = exitCode === 0 && assertions.every((assertion) => assertion.passed)
  if (!passed && exitCode === 0) exitCode = 1
  // A passing run keeps the compact evidence (result, Web log, mock log). The
  // page and fixture logs are large and only matter when something failed;
  // E2E_KEEP_LOGS=1 keeps them for a green run that needs a closer look.
  const keepLogs = !passed || process.env.E2E_KEEP_LOGS === '1'
  if (!keepLogs) {
    await rm(logs.browser, { force: true })
    await rm(logs.fixture, { force: true })
  }
  artifacts.webLog = relative(paths.artifactsDir, logs.web)
  artifacts.mockLog = relative(paths.artifactsDir, logs.mock)
  if (keepLogs) {
    artifacts.fixtureLog = relative(paths.artifactsDir, logs.fixture)
    artifacts.browserLog = relative(paths.artifactsDir, logs.browser)
  }

  const result = makeResult({
    runId,
    caseId: options.caseId,
    passed,
    startedAt,
    assertions,
    env: envPayload({
      dshVersion: await dshVersion(dshBin ?? undefined),
      chrome: chromePath,
      puppeteer: puppeteerVersion,
    }),
    artifacts,
    error: failure === null ? null : `${failure.name}: ${failure.message}`,
  })
  await writeJson(join(paths.artifactsDir, 'result.json'), result, secrets)
  await writeJson(join(paths.artifactsDir, 'env.json'), result.env, secrets)
  say(`result=${join(paths.artifactsDir, 'result.json')}`)
  say(passed ? `RESULT passed total=${result.durationMs}ms` : `RESULT failed (exit ${exitCode}) total=${result.durationMs}ms`)

  if (!options.keep) {
    try {
      await removeRunDir(paths)
    } catch (error) {
      say(`WARN cleanup refused: ${error?.message ?? error}`)
      if (exitCode === 0) exitCode = 2
    }
  } else {
    say(`kept tmp=${paths.tmpRoot}`)
  }
  for (const [signal, handler] of Object.entries(signalHandlers)) process.removeListener(signal, handler)
  return passed ? 0 : exitCode
}

const code = await main().catch((error) => {
  process.stderr.write(`fatal: ${error?.stack ?? error}\n`)
  return 2
})
process.exit(code)
