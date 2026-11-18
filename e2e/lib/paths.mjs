/**
 * Run identity, temporary directories, and the guard that makes deleting them safe.
 *
 * Every run gets its own `<TMPDIR>/dsh-clipchat-e2e/<runId>/` tree and its own
 * `artifacts/e2e/<runId>/` directory, so no run can overwrite another run's
 * evidence. Cleanup refuses anything whose resolved path is not exactly one
 * child of the fixed temporary root and whose basename is not this run's id:
 * a path built from a malformed id can never widen the delete.
 */
import { mkdir, realpath, rm } from 'node:fs/promises'
import { realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root, resolved from this file's location (`e2e/lib/`). */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Fixed parent of every temporary run tree. */
export const TMP_BASE = join(tmpdir(), 'dsh-clipchat-e2e')

/**
 * Build a sortable run id that is also a single safe path segment.
 * @param {Date} [now] - clock used for the timestamp.
 * @returns {string} `<YYYYMMDD-HHmmss>-<pid>`.
 */
export function makeRunId(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `${stamp}-${process.pid}`
}

/**
 * Every path one run owns.
 * @param {string} runId - run identity.
 * @returns {{runId: string, tmpRoot: string, home: string, workspace: string, artifactsDir: string}} resolved paths.
 */
export function pathsFor(runId) {
  const tmpRoot = join(TMP_BASE, runId)
  return {
    runId,
    tmpRoot,
    home: join(tmpRoot, 'home'),
    workspace: join(tmpRoot, 'workspace'),
    artifactsDir: join(REPO_ROOT, 'artifacts', 'e2e', runId),
  }
}

/**
 * Create the temporary home/workspace and the artifact directory.
 * @param {ReturnType<typeof pathsFor>} paths - run paths.
 * @returns {Promise<void>} resolves once all three directories exist.
 */
export async function createRunDirs(paths) {
  await mkdir(paths.home, { recursive: true, mode: 0o700 })
  await mkdir(paths.workspace, { recursive: true, mode: 0o700 })
  await mkdir(paths.artifactsDir, { recursive: true })
}

/**
 * Delete one run's temporary tree, but only when the path is provably this run's.
 *
 * The guard is intentionally redundant: `realpath` collapses `..` and symlinks,
 * then both the parent directory and the basename are compared against values
 * built from fixed inputs. A caller that passes a mangled id gets an error, not
 * a wider delete.
 *
 * @param {{tmpRoot: string, runId: string, workspace: string, home: string, artifactsDir: string}} paths - run paths.
 * @returns {Promise<void>} resolves after the tree is gone.
 */
export async function removeRunDir(paths) {
  const resolvedRoot = await realpath(paths.tmpRoot)
  const resolvedBase = await realpath(TMP_BASE)
  if (dirname(resolvedRoot) !== resolvedBase) {
    throw new Error(`refusing to remove ${resolvedRoot}: not a child of ${resolvedBase}`)
  }
  if (basename(resolvedRoot) !== paths.runId) {
    throw new Error(`refusing to remove ${resolvedRoot}: basename is not the run id ${paths.runId}`)
  }
  await rm(resolvedRoot, { recursive: true, force: true })
}

/**
 * Synchronous twin of `removeRunDir`, for a signal handler that must delete the
 * tree before another SIGINT listener exits the process.
 *
 * @param {{tmpRoot: string, runId: string}} paths - run paths.
 * @returns {void}
 */
export function removeRunDirSync(paths) {
  const resolvedRoot = realpathSync(paths.tmpRoot)
  const resolvedBase = realpathSync(TMP_BASE)
  if (dirname(resolvedRoot) !== resolvedBase) {
    throw new Error(`refusing to remove ${resolvedRoot}: not a child of ${resolvedBase}`)
  }
  if (basename(resolvedRoot) !== paths.runId) {
    throw new Error(`refusing to remove ${resolvedRoot}: basename is not the run id ${paths.runId}`)
  }
  rmSync(resolvedRoot, { recursive: true, force: true })
}
