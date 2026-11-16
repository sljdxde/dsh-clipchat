# 0005 — Highlight as a green underline, and a wider editorial card

**Context.** The first M1 card filled the selected text with a translucent brand tint and
was 382px wide. Manual review: the fill obscured the reply and the card felt cramped; the
highlight should read as a margin mark under the passage, not a selection state.

**Decision.** Draw each highlight line as a transparent overlay strip with a 2px green
bottom border (`--dsw-alias-state-success-primary`, green fallback), still clickable, still
outside the chat DOM (ADR 0001). Widen the card to 600px capped at 64vh, with a quiet
editorial treatment: generous padding, a hairline-ruled thread with a brand accent,
roomier leading, a solid send button, and pills for presets and actions.

**Consequences.** Highlights no longer tint the text, so reading stays uninterrupted and
the green line reads as an annotation. The card covers more of the reply while open but
stays above the composer. Hover adds a 9% green wash for click affordance.
