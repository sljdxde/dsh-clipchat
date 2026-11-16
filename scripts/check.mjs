#!/usr/bin/env node
/** Repo check: syntax-check every source file, then run the test suite. */
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SOURCE_DIRS = ['lib', 'scripts', 'test']
const SOURCE_FILES = ['index.js', 'client.js']

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
const result = spawnSync(process.execPath, ['--test', ...tests], { cwd: ROOT, stdio: 'inherit' })
process.exit(result.status ?? 1)
