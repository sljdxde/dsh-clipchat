/**
 * The coverage gate's own tests.
 *
 * A gate that silently stops enforcing is worse than no gate: it reports success
 * while covering nothing. These drive the audit against synthetic reports, so
 * the failure modes are exercised without editing real source.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../scripts/check.mjs', import.meta.url))

/** Run the gate's audit over a synthetic report. */
function audit(report) {
  const result = execFileSync(process.execPath, ['-e', `
    import(${JSON.stringify(SCRIPT)}).then((module) => {
      process.stdout.write(JSON.stringify(module.auditCoverage(${JSON.stringify(report)})))
    }).catch((error) => {
      process.stdout.write(JSON.stringify(['import failed: ' + error.message]))
    })
  `], { encoding: 'utf8' })
  return JSON.parse(result)
}

/**
 * The range the store.js exemption currently covers.
 *
 * It is derived from the source, so the test does not pin a line number that
 * every unrelated edit above it would invalidate.
 */
function exemptionRange() {
  const result = execFileSync(process.execPath, ['-e', `
    import(${JSON.stringify(SCRIPT)}).then((module) => {
      const ranges = module.resolveExemption('store.js', module.ALLOWED_UNCOVERED['lib/store.js'])
      process.stdout.write(JSON.stringify([...ranges]))
    })
  `], { encoding: 'utf8' })
  return JSON.parse(result)[0]
}

/** One coverage table row, as the runner prints it. */
function row(file, percent, uncovered) {
  return `#  ${file.padEnd(28)} | ${percent.toFixed(2).padStart(6)} |    88.00 |  100.00 | ${uncovered}`
}

/**
 * The same row as Node 24's spec reporter prints it.
 *
 * The marker changed from `#` to `ℹ`, and the gate read the table by marker, so
 * a Node upgrade turned the check red with "no coverage table was found". These
 * fixtures keep both spellings parsed.
 */
function node24Row(file, percent, uncovered, indent = '') {
  return `ℹ ${indent}${file.padEnd(28)} | ${percent.toFixed(2).padStart(6)} |    88.00 |  100.00 | ${uncovered}`
}

test('a fully covered file passes', () => {
  const report = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('client.js', 100, ''),
  ].join('\n')

  assert.deepEqual(audit(report), [])
})

test('an uncovered line fails the gate', () => {
  const report = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('client.js', 99.5, '12-14'),
  ].join('\n')

  const problems = audit(report)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /client\.js: uncovered lines 12-14/)
})

test('an exempted line passes only while it is still the exempted code', () => {
  // lib/store.js carries the one real exemption: the failed-rename cleanup.
  const matching = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('store.js', 99.6, exemptionRange()),
  ].join('\n')
  assert.deepEqual(audit(matching), [], 'the exemption applies to the line it names')

  // The same report with a different range must fail: the exemption is not a
  // blanket "store.js may miss lines" pass.
  const elsewhere = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('store.js', 99.6, '1-3'),
  ].join('\n')
  const problems = audit(elsewhere)
  assert.ok(problems.some((line) => line.includes('uncovered lines 1-3')),
    'an unrelated gap is reported')
  assert.ok(
    problems.some((line) => line.includes('no longer matches any line') || line.includes('is now covered')),
    'and the exemption is flagged as not applying to this gap',
  )
})

test('an exemption that is now covered fails, so it cannot linger', () => {
  const report = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('store.js', 100, ''),
  ].join('\n')

  const problems = audit(report)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /now covered|no longer matches/)
})

test('test files are not audited', () => {
  const report = [
    '# file                           | line % | branch % | funcs % | uncovered lines',
    row('client.test.mjs', 80, '1-40'),
    row('helpers.mjs', 50, '2-9'),
    row('client.js', 100, ''),
  ].join('\n')

  assert.deepEqual(audit(report), [], 'only shipped sources are held to the bar')
})

test('a report with no table fails instead of passing silently', () => {
  assert.deepEqual(audit('no coverage here'), ['no coverage table was found in the test output'])
})

test('the table node 24 spec reporter prints is read the same way', () => {
  const report = [
    'ℹ file                           | line % | branch % | funcs % | uncovered lines',
    'ℹ --------------------------------------------------------------------------',
    node24Row('client.js', 100, ''),
    node24Row('index.js', 100, ''),
    'ℹ lib         |        |         |        | ',
    node24Row('context.js', 100, '', ' '),
    node24Row('store.js', 99.6, exemptionRange(), ' '),
    'ℹ all files   |  99.13 |    88.91 |   91.53 | ',
  ].join('\n')

  assert.deepEqual(audit(report), [], 'both markers and the directory grouping parse')
})

test('a node 24 row with a gap is still caught', () => {
  const report = [
    'ℹ file                           | line % | branch % | funcs % | uncovered lines',
    node24Row('client.js', 99.5, '12-14'),
  ].join('\n')

  const problems = audit(report)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /client\.js: uncovered lines 12-14/)
})
