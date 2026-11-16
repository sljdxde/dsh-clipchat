# 0003 — Archive keeps, deletion sweeps, corrupt files stay

**Context.** The original requirement said archiving clears highlights; the user later
chose reversible archiving. Orphan cleanup needs a trustworthy session list, and
`sessions.list()` only covers live sessions.

**Decision.** Archive keeps data. Orphan sweep requires the complete persisted corpus
(`sessions.list ∪ workspace archived ∪ sessionQuery.listSessions`) and is skipped entirely
when that corpus is unavailable or empty. TTL is 7 days of inactivity, refreshed by reads,
highlights, records, and asks. Sweep removes only orphans and expired files; unreadable
files are left alone.

**Consequences.** A cold start with sessionQuery late-mounted skips one sweep (safe). A
corrupt file stays until an explicit write or user action; it never causes data loss.
