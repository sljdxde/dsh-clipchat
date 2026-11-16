# 0004 — M1 card parity: prototype form, auto-highlight on ask, fixed presets

**Context.** Manual testing reported that the card looked nothing like the confirmed v2
prototype, that asking did not leave a highlight, and that the prototype's quick questions
were missing. The confirmed baseline (ticket 03) said the card opens with a selection bar,
four presets, the thread, the composer and a footer, and that asking commits the highlight.

**Decision.** Restore that form without expanding scope: a selection bar (`✦`, passage,
`×`), four fixed presets, a scrollable Q&A thread, a composer and a footer with the model
menu, token line and actions. Asking commits and persists the highlight at send time; the
explicit highlight toggle still works. No context selector and no session-highlight list
(neither is in the M1 spec).

**Consequences.** The card renders all turns, not only the latest answer. Auto-highlight
still never fires on a bare selection: it needs one question. The quick questions are fixed
strings in the locale dictionaries, not configurable until M2.

**Refinements (2026-11-16, same review cycle).** The selection bar is a single ellipsized
line (full text in `title`), not a three-line scroll box; the footer token line shows the
latest completed answer. Answer text renders as plain text with only `**bold**` and inline
`code` recognized — no markdown engine, so literal asterisks and backticks are not
reformatted. These are the card's settled presentation rules.
