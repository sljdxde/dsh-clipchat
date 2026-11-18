/**
 * Fixture session: one real headless run, then rewritten to 60 deterministic
 * turns of plaintext JSONL.
 *
 * The seed run is what keeps the fixture honest: its header and event shapes
 * come from the installed DSH, not from a hand-written guess. The rewrite only
 * clones the six per-turn event templates and replaces the seed text, so a
 * schema change in a future DSH surfaces as a missing template instead of a
 * session that loads but renders nothing.
 */
import { access, open, readFile, readdir, realpath, rename, rm, unlink } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnLogged } from './process.mjs'
import { SEED_ANSWER, SEED_MARKER } from './mock-llm.mjs'

/** Turns the fixture contains. */
export const TURNS = 60
/** Turn the case selects and locates. */
export const TARGET_TURN = 10
/** User text planted in the fixture (no marker; the case only reads the answer). */
export const TURN_TEXT = 'E2E_TURN'
/** Marker only the target turn's assistant text carries. */
export const ANCHOR = 'E2E_ANCHOR_10'

/** The six event types cloned per turn, in append order. */
const TEMPLATE_TYPES = ['turn/start', 'step/start', 'user/message', 'assistant/message', 'step/end', 'turn/end']

/**
 * Walk the temporary session root for plaintext session logs.
 * @param {string} root - `$DSH_HOME/sessions`.
 * @returns {Promise<string[]>} absolute JSONL paths.
 */
async function listSessionLogs(root) {
  let entries
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true })
  } catch {
    return []
  }
  const paths = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name !== 'session.v4.jsonl') continue
    paths.push(join(entry.parentPath ?? root, entry.name))
  }
  return paths
}

/**
 * Read the header line of one session log.
 * @param {string} path - session log path.
 * @returns {Promise<object>} parsed header.
 */
async function readHeader(path) {
  const text = await readFile(path, 'utf8')
  const first = text.split('\n', 1)[0]
  return JSON.parse(first)
}

/**
 * Locate the session log for one generated id, falling back to the newest log.
 * @param {string} home - temporary DSH home.
 * @param {string} sessionId - id reported by `--json`.
 * @returns {Promise<string>} absolute log path.
 */
async function locateLog(home, sessionId) {
  const logs = await listSessionLogs(join(home, 'sessions'))
  if (logs.length === 0) throw new Error('no session.v4.jsonl was produced by the headless seed run')
  for (const path of logs) {
    try {
      const header = await readHeader(path)
      if (header.id === sessionId) return path
    } catch { /* unreadable candidate: keep looking */ }
  }
  const stats = await Promise.all(logs.map(async (path) => {
    const { stat } = await import('node:fs/promises')
    return { path, mtime: (await stat(path)).mtimeMs }
  }))
  stats.sort((left, right) => right.mtime - left.mtime)
  return stats[0].path
}

/**
 * Run the headless seed task and return the id it reports.
 * @param {object} options - seed inputs.
 * @param {string} options.dshBin - launcher path.
 * @param {NodeJS.ProcessEnv} options.env - environment with `DSH_HOME` and mock URL.
 * @param {string} options.cwd - fixture working directory.
 * @param {string} options.logPath - fixture.log path.
 * @param {number} [options.timeoutMs] - maximum runtime.
 * @returns {Promise<{sessionId: string, logPath: string, output: string}>} seed result.
 */
export async function generateSeedSession({ dshBin, env, cwd, logPath, timeoutMs = 180_000 }) {
  const handle = spawnLogged({
    command: process.execPath,
    args: [
      dshBin, '--profile', 'e2e-headless', 'headless', '--json',
      `${SEED_MARKER}: reply with ${SEED_ANSWER}`,
    ],
    cwd,
    env,
    logPath,
  })
  const timedOut = await Promise.race([
    handle.wait().then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), timeoutMs)),
  ])
  if (timedOut) {
    await handle.stop()
    throw new Error(`headless seed run exceeded ${timeoutMs}ms\nfixture.log tail:\n${handle.tail()}`)
  }
  const { code } = await handle.wait()
  const output = await readFile(logPath, 'utf8')
  if (code !== 0) {
    throw new Error(`headless seed run exited ${code}\nfixture.log tail:\n${handle.tail()}`)
  }
  let sessionId = ''
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    let event
    try { event = JSON.parse(trimmed) } catch { continue }
    if (event?.type !== 'session') continue
    sessionId = typeof event.sessionId === 'string' ? event.sessionId : (typeof event.id === 'string' ? event.id : '')
    if (sessionId.length > 0) break
  }
  if (sessionId.length === 0) {
    const logs = await listSessionLogs(join(env.DSH_HOME, 'sessions'))
    if (logs.length === 0) throw new Error('headless seed run reported no session and wrote no plaintext log')
    const newest = await locateLog(env.DSH_HOME, '')
    sessionId = (await readHeader(newest)).id
  }
  const path = await locateLog(env.DSH_HOME, sessionId)
  return { sessionId, logPath: path, output }
}

/**
 * Replace the seed markers in every string of one cloned event.
 * @param {unknown} value - cloned value.
 * @param {number} turn - turn number being synthesized.
 * @returns {unknown} value with seed text replaced.
 */
function replaceSeedText(value, turn) {
  if (typeof value === 'string') {
    let text = value.split(SEED_MARKER).join(`${TURN_TEXT}_${turn} 的用户问题`)
    text = text.split(SEED_ANSWER).join(turn === TARGET_TURN
      ? `${TURN_TEXT}_${turn} 的回答 ${ANCHOR}`
      : `${TURN_TEXT}_${turn} 的回答`)
    return text
  }
  if (Array.isArray(value)) return value.map((item) => replaceSeedText(item, turn))
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = replaceSeedText(item, turn)
    return out
  }
  return value
}

/**
 * Give one event the turn/step and identity a synthetic turn needs.
 * @param {any} event - cloned template event.
 * @param {number} turn - turn number.
 * @returns {any} mutated event.
 */
function stampEvent(event, turn) {
  const data = event.data ?? (event.data = {})
  if (typeof data.turn === 'number') data.turn = turn
  if (typeof data.step === 'number') data.step = 1
  const userText = `${TURN_TEXT}_${turn} 的用户问题`
  const answerText = turn === TARGET_TURN
    ? `${TURN_TEXT}_${turn} 的回答 ${ANCHOR}`
    : `${TURN_TEXT}_${turn} 的回答`
  if (event.type === 'user/message') {
    data.id = `e2e-u${turn}`
    data.role = 'user'
    data.source = { kind: 'user' }
    data.content = [{ type: 'text', text: userText }]
  }
  if (event.type === 'assistant/message') {
    const message = data.message
    if (message !== null && typeof message === 'object') {
      message.id = `e2e-a${turn}`
      message.content = [{ type: 'text', text: answerText }]
      if (message.source !== null && typeof message.source === 'object') {
        if ('provider' in message.source) message.source.provider = 'e2e-mock'
        if ('model' in message.source) message.source.model = 'mock-answer'
      }
    }
    if (Array.isArray(data.stream)) {
      for (const entry of data.stream) {
        if (entry?.type === 'text-chunks') {
          entry.texts = [answerText]
          entry.dt = [0]
        }
        const chunk = entry?.chunk
        if (chunk?.type === 'block-start') chunk.blockType = 'text'
        if (chunk?.type === 'block-end') chunk.block = { type: 'text', text: answerText }
      }
    }
  }
  return event
}

/**
 * Rewrite the seed log into 60 plaintext turns.
 * @param {object} options - rewrite inputs.
 * @param {string} options.sourcePath - seed log path.
 * @param {string} options.sessionId - session id.
 * @param {string} options.workspace - expected cwd.
 * @returns {Promise<{path: string, lines: number, events: number}>} rewritten log.
 */
export async function rewriteFixture({ sourcePath, sessionId, workspace }) {
  const text = await readFile(sourcePath, 'utf8')
  const lines = text.split('\n').filter((line) => line.length > 0)
  if (lines.length < 2) throw new Error(`seed session ${sourcePath} has no events`)
  const header = JSON.parse(lines[0])
  if (header.type !== 'session') throw new Error(`seed header type is ${header.type}, expected session`)
  if (header.version !== 4) throw new Error(`seed header version is ${header.version}, expected 4`)
  if (header.id !== sessionId) throw new Error(`seed header id ${header.id} does not match ${sessionId}`)
  if (typeof header.cwd !== 'string') throw new Error('seed header has no cwd')
  const [recordedCwd, expectedCwd] = await Promise.all([
    realpath(header.cwd).catch(() => header.cwd),
    realpath(workspace).catch(() => workspace),
  ])
  if (recordedCwd !== expectedCwd) {
    throw new Error(`seed header cwd ${header.cwd} does not match ${workspace}`)
  }
  const seedEvents = lines.slice(1).map((line) => JSON.parse(line))
  const templates = new Map()
  let requestHeader = null
  for (const event of seedEvents) {
    if (event.type === 'request/header' && requestHeader === null) requestHeader = event
    if (!TEMPLATE_TYPES.includes(event.type)) continue
    if (event.type === 'user/message' && !JSON.stringify(event).includes(SEED_MARKER)) continue
    if (!templates.has(event.type)) templates.set(event.type, event)
  }
  for (const type of TEMPLATE_TYPES) {
    if (!templates.has(type)) throw new Error(`seed session has no ${type} event; cannot synthesize turns`)
  }

  const out = [header]
  // Event sequence numbers are per-file and contiguous from 0; the header row
  // is not an event. Reusing the seed's maximum would leave a gap at row 0 and
  // the storage scanner rejects the session as corrupt.
  let seq = -1
  let time = Date.now() - TURNS * TEMPLATE_TYPES.length * 1000
  const push = (event) => {
    seq += 1
    time += 1000
    event.seq = seq
    event.time = time
    out.push(event)
    return event
  }
  let firstUserSeq = null
  for (let turn = 1; turn <= TURNS; turn += 1) {
    for (const type of TEMPLATE_TYPES) {
      const clone = stampEvent(structuredClone(templates.get(type)), turn)
      if (type === 'user/message' && firstUserSeq === null) firstUserSeq = seq + 1
      push(clone)
      // The validator requires request/header inside an open turn; the seed's
      // header travels with the first turn's user message.
      if (type === 'user/message' && turn === 1 && requestHeader !== null) {
        push(replaceSeedText(structuredClone(requestHeader), 1))
      }
    }
  }
  const titleTemplate = seedEvents.find((event) => event.type === 'session/title')
  if (titleTemplate !== undefined && firstUserSeq !== null) {
    const title = structuredClone(titleTemplate)
    title.data = {
      ...title.data,
      title: `E2E fixture ${TURNS} turns`,
      messageSeqs: [firstUserSeq],
      source: { kind: 'fallback' },
    }
    push(title)
  }

  const dir = dirname(sourcePath)
  const target = join(dir, 'session.v4.jsonl')
  const tmp = `${target}.tmp`
  const body = `${out.map((event) => JSON.stringify(event)).join('\n')}\n`
  const handle = await open(tmp, 'w', 0o600)
  try {
    await handle.writeFile(body, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(tmp, target)
  const zstd = `${target}.zstd`
  await rm(zstd, { force: true })

  const written = await readFile(target, 'utf8')
  const writtenLines = written.split('\n').filter((line) => line.length > 0)
  const anchorLine = writtenLines.find((line) => line.includes(`"turn":${TARGET_TURN}`) && line.includes(ANCHOR))
  if (anchorLine === undefined) throw new Error(`rewritten log has no ${ANCHOR} in turn ${TARGET_TURN}`)
  return { path: target, lines: writtenLines.length, events: out.length - 1 }
}

/**
 * Delete the projection cache for one session, if this DSH version has one.
 * @param {string} home - temporary DSH home.
 * @param {string} sessionId - session id.
 * @returns {Promise<string[]>} paths that were removed.
 */
export async function purgeProjectionCache(home, sessionId) {
  const dir = join(home, 'storages', 'session_projcache', 'sessions')
  const candidates = [join(dir, `${sessionId}.json`), join(dir, `${sessionId.replace(/^session-/u, '')}.json`)]
  const removed = []
  for (const path of candidates) {
    try {
      await access(path, constants.F_OK)
      await unlink(path)
      removed.push(path)
    } catch { /* absent: nothing to remove */ }
  }
  return removed
}

/**
 * Assert the fixture directory holds a plaintext log and no compressed sibling.
 * @param {string} path - rewritten log path.
 * @returns {Promise<void>} rejects when a `.zstd` file remained.
 */
export async function assertPlaintextOnly(path) {
  const dir = dirname(path)
  const entries = await readdir(dir)
  if (entries.some((entry) => entry.endsWith('.zstd'))) {
    throw new Error(`compressed session log survived in ${dir}; the profile's compression: none did not apply`)
  }
}

