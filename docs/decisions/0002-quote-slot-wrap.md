# 0002 — Add `问这段` by wrapping the native quote slot

**Context.** `message-quotes` already owns the `selection` text-interaction and opens its
own surface; a competing interaction is never called. Replacing the quote UI or building a
full overlay would duplicate or break shipped behaviour.

**Decision.** Find the `quote` entry in `conversation.chat.text-interaction`, keep its
component, and render it beside a `问这段` button in the same surface. Restore the original
component on dispose and re-apply on slot changes.

**Consequences.** The native quote action is untouched; no duplicate floating UI. This
depends on undocumented slot-entry internals (`slots.entries`, `entry.component`), the same
coordination dsh-sidenote uses. Fallback order if it breaks: register the `quote` key
ourselves, then a self-built overlay.
