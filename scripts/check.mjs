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
const SHIPPED = ['client.js', 'index.js', 'context.js', 'digest.js', 'http.js', 'model.js', 'models.js', 'search.js', 'store.js']

const ALLOWED_UNCOVERED = {
  'lib/store.js': {
    lines: ['483-485', '620-622'],
    reason: 'a write and a read that fail for reasons a portable test cannot stage',
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

/**
 * Compare the coverage report against the required threshold.
 * @param {string} report - the runner's stdout, including the coverage table.
 * @returns {string[]} one message per problem; empty when the check passes.
 */
function auditCoverage(report) {
  const problems = []
  const rows = parseCoverageTable(report)
  if (rows.length === 0) {
    problems.push('no coverage table was found in the test output')
    return problems
  }

  for (const row of rows) {
    const allowed = ALLOWED_UNCOVERED[row.file]
    const uncovered = row.uncovered.length > 0 ? row.uncovered : []
    const exempted = new Set(allowed?.lines ?? [])

    if (row.line < REQUIRED_LINE_COVERAGE && uncovered.length === 0) {
      problems.push(`${row.file}: ${row.line}% line coverage but no uncovered lines listed`)
      continue
    }
    if (uncovered.length === 0) continue

    const unexpected = uncovered.filter((range) => !exempted.has(range))
    if (unexpected.length > 0) {
      problems.push(`${row.file}: uncovered lines ${unexpected.join(' ')} (${row.line}%)`)
    }
    for (const range of exempted) {
      if (!uncovered.includes(range)) {
        problems.push(`${row.file}: exemption ${range} is stale, that line is now covered`)
      }
    }
    if (allowed !== undefined && allowed.reason.length === 0) {
      problems.push(`${row.file}: exemption has no reason`)
    }
  }
  return problems
}

/**
 * Read the coverage table the test runner prints.
 * @param {string} report - runner stdout.
 * @returns {Array<{ file: string, line: number, uncovered: string[] }>} one row per source file.
 */
function parseCoverageTable(report) {
  const rows = []
  // A row is `# <name> | line% | branch% | func% | uncovered`; the name column
  // is indented for a file inside a directory group, and the group itself has
  // no percentages.
  const rowPattern = /^#\s+(\S+)\s+\|\s+([\d.]+)\s+\|\s+[\d.]+\s+\|\s+[\d.]+\s+\|\s*(.*)$/u
  const groupPattern = /^#\s+(\S+)\s+\|\s*\|\s*\|\s*\|\s*$/u
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
      file,
      line: Number.parseFloat(percent),
      uncovered: uncovered.trim().length === 0 ? [] : uncovered.trim().split(/\s+/u),
    })
  }
  return rows
}
