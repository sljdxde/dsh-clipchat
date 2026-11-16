# 0001 — Render highlights as overlay rects, not DOM marks

**Context.** The first implementation wrapped selection ranges in `<mark>` elements inside
the chat DOM. Live testing showed the host surface dismissed itself after a mark was
inserted: splitting text nodes invalidated the host's stored selection Range check.

**Decision.** Draw highlights as absolutely positioned rects in a `pointer-events: none`
layer inside `[data-chat-flow]`, driven by a read-only Range per stored anchor. Never split
or wrap chat text.

**Consequences.** Chat re-renders and React reconciliation leave highlights alone; rects
scroll with content. Reflow needs a redraw (MutationObserver + resize). Click handling is
delegation on the layer, not on text nodes.
