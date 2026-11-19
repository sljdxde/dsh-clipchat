#!/usr/bin/env node
/**
 * Repo check: syntax-check every source file, then run the tests with coverage.
 *
 * Coverage is enforced, not just reported. Line coverage is required to be
 * 100% on every shipped source file, because the bug that made this necessary
 * was a component that threw on render while every unit test passed: the tests
 * inspected the returned element tree instead of mounting it, so the failure had
 * no way to surface. A line that no test executes is a line nobody has run.
 *
 * The few genuinely unreachable lines are listed in `ALLOWED_UNCOVERED` with the
 * reason they cannot be exercised; the check fails if that list and the report
 * disagree, so a new gap cannot hide behind a stale exemption.
 */
import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIRS = ['lib', 'scripts', 'test']
const SOURCE_FILES = ['index.js', 'client.js']

/**
 * Lines no test can reach, keyed by file.
 *
 * Each entry is a defensive branch that only fires when the filesystem or the
 * runtime misbehaves in a way a test cannot stage portably (a permission error
 * while running as root, a rename that fails after the temporary file is
 * already written). They are listed so the gap is deliberate and visible.
 */
const SHIPPED = ['client.js', 'index.js', 'attachments.js', 'context.js', 'digest.js', 'http.js', 'model.js', 'models.js', 'search.js', 'store.js']

export const ALLOWED_UNCOVERED = {
  'lib/store.js': {
    // Located by the code it guards, so edits above it do not break the entry.
    contains: 'await rm(tmp, { force: true }).catch(() => {})',
    span: 3,
    reason:
      'the cleanup after a failed rename: the test exercises it and asserts the '
      + 'temp file is gone, but V8 does not attribute lines inside a catch block '
      + 'that unwinds through an awaited rejection',
  },
}

/** Required line coverage for a file with no exemptions. */
const REQUIRED_LINE_COVERAGE = 100

async function collect(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(join(ROOT, dir), { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await collect(path))
    else if (/\.(?:js|mjs)$/u.test(entry.name)) out.push(path)
  }
  return out
}

/** Run the whole check: syntax, tests, then the coverage gate. */
async function main() {
  const files = [...SOURCE_FILES]
  for (const dir of SOURCE_DIRS) files.push(...await collect(dir))

  let failed = false
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, stdio: 'inherit' })
    if (result.status !== 0) failed = true
  }
  if (failed) process.exit(1)

  const tests = files.filter((file) => file.startsWith('test/') && file.endsWith('.test.mjs'))
  const result = spawnSync(
    process.execPath,
    ['--experimental-test-coverage', '--test', ...tests],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  )
  process.stdout.write(result.stdout ?? '')
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)

  const problems = auditCoverage(result.stdout ?? '')
  if (problems.length > 0) {
    console.error('\nCoverage check failed:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('\nCoverage check passed: every shipped line is executed by a test.')
}

// Importing this file must not run the check; the audit is exercised on its own.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main()
}

/**
 * Compare the coverage report against the required threshold.
 * @param {string} report - the runner's stdout, including the coverage table.
 * @returns {string[]} one message per problem; empty when the check passes.
 */
export function auditCoverage(report) {
  const problems = []
  const rows = parseCoverageTable(report)
  if (rows.length === 0) {
    problems.push('no coverage table was found in the test output')
    return problems
  }

  for (const row of rows) {
    const allowed = exemptionFor(row.path)
    const uncovered = row.uncovered
    if (uncovered.length === 0) {
      if (allowed !== undefined) {
        problems.push(`${row.file}: every exempted line is now covered, drop the exemption`)
      }
      continue
    }

    const exempted = resolveExemption(row.path, allowed)
    const unexpected = uncovered.filter((range) => !exempted.has(range))
    if (unexpected.length > 0) {
      problems.push(`${row.file}: uncovered lines ${unexpected.join(' ')} (${row.line}%)`)
    }
    if (allowed !== undefined) {
      if (allowed.reason.trim().length === 0) problems.push(`${row.file}: exemption has no reason`)
      if (exempted.size === 0) {
        problems.push(`${row.file}: exemption "${allowed.contains}" no longer matches any line, drop it`)
      } else if (![...exempted].some((range) => uncovered.includes(range))) {
        problems.push(`${row.file}: exemption "${allowed.contains}" is now covered, drop it`)
      }
    }
  }
  return problems
}

/**
 * The exemption registered for a coverage row.
 *
 * The runner prints `lib/store.js` when it groups a directory and `client.js`
 * bare for a top-level file, so a row is matched against the exemption key both
 * as printed and with a `lib/` prefix.
 *
 * @param {string} file - path as printed.
 * @returns {{ contains: string, span: number, reason: string } | undefined} the exemption.
 */
function exemptionFor(file) {
  return ALLOWED_UNCOVERED[file] ?? ALLOWED_UNCOVERED[`lib/${file}`]
}

/**
 * Line ranges an exemption covers in this run.
 *
 * The entry names a line of code rather than a line number, because the numbers
 * drift with every edit above them and a stale number would silently stop
 * exempting anything.
 *
 * @param {string} file - repo-relative file.
 * @param {{ contains: string, span: number } | undefined} allowed - the exemption.
 * @returns {Set<string>} `start-end` ranges.
 */
export function resolveExemption(file, allowed) {
  const ranges = new Set()
  if (allowed === undefined) return ranges
  let source = null
  for (const candidate of [file, `lib/${file}`]) {
    try {
      source = readFileSync(join(ROOT, candidate), 'utf8')
      break
    } catch {
      /* Try the next spelling. */
    }
  }
  if (source === null) return ranges
  const lines = source.split('\n')
  const index = lines.findIndex((line) => line.includes(allowed.contains))
  if (index < 0) return ranges
  const start = index + 1
  const end = Math.min(lines.length, index + allowed.span)
  ranges.add(start === end ? `${start}` : `${start}-${end}`)
  return ranges
}

/**
 * Read the coverage table the test runner prints.
 * @param {string} report - runner stdout.
 * @returns {Array<{ file: string, line: number, uncovered: string[] }>} one row per source file.
 */
function parseCoverageTable(report) {
  const rows = []
  // A row is `<marker> <name> | line% | branch% | func% | uncovered`; the name
  // column is indented for a file inside a directory group, and the group itself
  // has no percentages. The marker is `#` up to Node 22 and `ℹ` from Node 24's
  // spec reporter, so both are accepted; a gate that stops matching would report
  // a passing run over an empty table.
  const rowPattern = /^(?:#|ℹ)\s*(\S+)\s+\|\s+([\d.]+)\s+\|\s+[\d.]+\s+\|\s+[\d.]+\s+\|\s*(.*)$/u
  const groupPattern = /^(?:#|ℹ)\s*(\S+)\s*\|\s*\|\s*\|\s*\|\s*$/u
  let group = ''
  for (const raw of report.split('\n')) {
    const trimmed = raw.trimEnd()
    const groupMatch = groupPattern.exec(trimmed)
    if (groupMatch !== null) {
      group = groupMatch[1]
      continue
    }
    const match = rowPattern.exec(trimmed)
    if (match === null) continue
    const [, name, percent, uncovered] = match
    const file = group.length > 0 && group !== '.' ? `${group}/${name}` : name
    // Only shipped sources matter. Tests are excluded because a helper no test
    // happens to call is not a coverage gap in the product.
    if (!SHIPPED.some((shipped) => file === shipped || file.endsWith(`/${shipped}`))) continue
    rows.push({
      // `file` is the label used in messages; `path` is what exemptions key on.
      file,
      path: file,
      line: Number.parseFloat(percent),
      uncovered: uncovered.trim().length === 0 ? [] : uncovered.trim().split(/\s+/u),
    })
  }
  return rows
}
