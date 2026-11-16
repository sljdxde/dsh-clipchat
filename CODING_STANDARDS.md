# Coding standards (reviewer-facing)

Judgement calls only. Mechanical checks live in `npm run check`; do not add rules for
syntax, unused imports, or formatting here.

1. **Single-file client stays navigable.** `client.js` is one hand-written browser
   bundle (no build step). Keep the section order: constants → styles → pure helpers →
   components → `apply`. A new behaviour gets its own section comment; do not scatter
   one feature across the file.
2. **Theme tokens over literals.** Colours and typography use `var(--dsw-*)`; a literal
   fallback is allowed only inside `var(..., #fallback)` for a token that may be absent.
3. **One entity-route factory.** Host add/remove routes (`highlight`, `record`) go through
   `entityRoute`; a second copy of guard/body/session/op handling is a review failure.
4. **Schema changes bump the version.** `lib/store.js` validators (`isValidHighlight`,
   `isValidRecord`) are the single source of shape truth; persisted shape changes require
   a schema-version decision, not a bolted-on field.
5. **No test-only production code.** A helper with no runtime caller (only `__test`) is
   dead code; delete it or wire it. Exceptions must be a deliberate seam with a comment.
6. **Tests assert behaviour.** Use the shared harnesses in `test/helpers/`; do not duplicate
   `FakeResponse`/`makeRequest`/`makeRoot`; no CSS or DOM-structure snapshots.
7. **Cross-bundle duplication is intentional.** `client.js` cannot import `lib/*.js`
   (browser module loader), so `normalizeModelRoute` and limits are intentionally copied.
   Do not "fix" this by adding a build step; if they drift, add a shape test.
