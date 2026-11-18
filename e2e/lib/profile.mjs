/**
 * Two throwaway DSH profiles assembled without a package manager.
 *
 * The E2E never writes the user's `~/.dsh`: `DSH_HOME` points at this run's
 * temporary home, the two profiles are written from scratch, and each one gets
 * a node_modules directory made of symlinks into the local DSH installation.
 * That is enough for Node resolution (`@deepseek-ai/*` is symlinked wholesale)
 * and for the plugin under test (repo root symlinked as `dsh-clipchat`), with
 * no install step and no network.
 */
import { access, mkdir, readdir, symlink, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { REPO_ROOT } from './paths.mjs'

/** Bundles mounted for the browser surface. */
const WEB_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-clipchat']
/** Bundles mounted for the one-shot fixture generator. */
const HEADLESS_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless']

/**
 * Profile patch shared by both profiles: plaintext JSONL, the mock provider,
 * the default model, and no telemetry egress.
 * @returns {string} YAML patch body.
 */
function patchYaml() {
  return `# E2E profile overlay: plaintext session logs, one local mock provider.
- id: session-persistence-jsonl
  config:
    root: !!js dshHomePath('sessions')
    compression: none
- id: llm-pi-ai
  config:
    providers:
      e2e-mock:
        displayName: E2E Mock
        apiKeyEnv: E2E_MOCK_API_KEY
        api: openai-completions
        baseURL: !!js process.env.E2E_MOCK_BASE_URL
        models:
          - id: mock-answer
            name: mock-answer
            contextWindow: 200000
            maxTokens: 8192
            input: [text]
- id: agent-default-model
  config:
    provider: e2e-mock
    model: mock-answer
- id: session-telemetry-otel
  disabled: true
`
}

/**
 * Write one profile directory: bundle list, empty root config, and overlay.
 * @param {string} home - temporary DSH home.
 * @param {string} name - profile name.
 * @param {string[]} bundles - profile bundles.
 * @returns {Promise<string>} the profile directory.
 */
async function writeProfile(home, name, bundles) {
  const dir = join(home, 'profiles', name)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles } },
  }, null, 2)}\n`)
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  await writeFile(join(dir, 'cordis.patch.yml'), patchYaml())
  await mkdir(join(dir, 'node_modules'), { recursive: true })
  return dir
}

/**
 * Symlink every top-level entry of the DSH installation's node_modules into a
 * profile, then add `dsh-clipchat` pointing at the repository under test.
 * @param {string} profileDir - profile whose node_modules receives the links.
 * @param {string} installNodeModules - `<DSH installation>/node_modules`.
 * @returns {Promise<void>} resolves once the farm exists.
 */
async function linkNodeModules(profileDir, installNodeModules) {
  const target = join(profileDir, 'node_modules')
  const entries = await readdir(installNodeModules)
  for (const entry of entries) {
    if (entry === 'dsh-clipchat') continue
    await symlink(join(installNodeModules, entry), join(target, entry), 'dir')
  }
  await symlink(REPO_ROOT, join(target, 'dsh-clipchat'), 'dir')
}

/**
 * Assert the local installation is the hoisted layout this runner supports.
 * @param {string} installNodeModules - `<DSH installation>/node_modules`.
 * @returns {Promise<void>} rejects with `E2E_DSH_LAYOUT_UNSUPPORTED` when a bundle is absent.
 */
export async function assertHoistedLayout(installNodeModules) {
  const required = ['dsh-base', 'dsh-web-app', 'dsh-headless']
  for (const name of required) {
    try {
      await access(join(installNodeModules, '@deepseek-ai', name, 'package.json'), constants.R_OK)
    } catch {
      throw new Error(
        `E2E_DSH_LAYOUT_UNSUPPORTED: ${join(installNodeModules, '@deepseek-ai', name, 'package.json')} is not readable. `
        + 'The E2E runner supports only a hoisted DSH installation; set DSH_BIN to that installation.',
      )
    }
  }
}

/**
 * Write both profiles and their symlink farms.
 * @param {object} options - profile inputs.
 * @param {string} options.home - temporary DSH home.
 * @param {string} options.dshBin - DSH launcher path.
 * @returns {Promise<{web: string, headless: string}>} the two profile directories.
 */
export async function writeProfiles({ home, dshBin }) {
  const installNodeModules = resolve(dirname(dshBin), '../../..')
  await assertHoistedLayout(installNodeModules)
  const web = await writeProfile(home, 'e2e-web', WEB_BUNDLES)
  const headless = await writeProfile(home, 'e2e-headless', HEADLESS_BUNDLES)
  await linkNodeModules(web, installNodeModules)
  await linkNodeModules(headless, installNodeModules)
  return { web, headless }
}

/**
 * Assert the plugin symlink actually resolves to this working tree.
 * @param {string} profileDir - profile to check.
 * @returns {Promise<void>} rejects when `<profile>/node_modules/dsh-clipchat/package.json` is unreadable.
 */
export async function assertPluginLink(profileDir) {
  const path = join(profileDir, 'node_modules', 'dsh-clipchat', 'package.json')
  try {
    await access(path, constants.R_OK)
  } catch {
    throw new Error(`E2E_PROFILE_LINK_BROKEN: ${path} is not readable`)
  }
}
