# dsh-clipchat — project facts

DSH Web plugin for selecting a passage in an assistant reply, asking about it in place, persisting highlights, and keeping Q&A records.

## Layout

- `index.js` — host half: webServer routes (`status`, `ask`, `models`, `session`, `highlight`, `record`), guard, model resolution, store wiring.
- `client.js` — browser half: wraps the native quote `text-interaction` slot, menu/card UI, SSE streaming, highlight overlay, records. Single hand-written bundle, no build step.
- `lib/` — host-side modules: `context`, `http`, `model`, `models`, `store`.
- `test/` — `node:test` suites. No test framework dependency.
- `locale/`, `docs/`, `icon.svg` — bundle display metadata.

## Commands

- Test: `node --test test/*.test.mjs`
- Install locally (dev): point the DSH plugin manager at this directory (or a symlink without a trailing space — the workspace directory name ends with a space, which path-normalizing installers trim).

## Facts

- DSH 0.2.2-rc.3; host imports `@deepseek-ai/dsh-llm` through a `createRequire(process.argv[1])` fallback because a linked local bundle resolves outside the profile module graph.
- The plugin never writes a session, never creates a hidden one, and never declares tools. `ask` only calls `llm.stream`.
- Highlights and records live in `DSH_HOME/clipchat/<sessionId>.json`; 7-day inactivity TTL; orphan sweep uses the persisted session corpus.
- Spec and tickets: `.scratch/dsh-clipchat/` (planning artifacts, not runtime code).
