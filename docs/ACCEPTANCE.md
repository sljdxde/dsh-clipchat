# Acceptance checklist (main-agent, manual)

Preconditions: dev link exists (`scripts/dev-link.sh`), bundle installed in the web
profile, page reloaded, and an assistant reply is visible.

Select a passage, then run through:

1. **Menu**: `.clipchat-menu` shows the native `引用文本` plus `问这段`; user messages show
   only the native quote.
2. **Card**: click `问这段` → `.clipchat-card` opens, textarea focused, `×` / Esc / blank
   click close it.
3. **Ask**: send a question → streamed answer, `in/out` token line, second question keeps
   the first Q&A (`history` grows).
4. **Stop**: during streaming the send button becomes `停止`; clicking it keeps the draft
   and shows `已停止，可重新发送`.
5. **Model**: `select.clipchat-card__model` lists `跟随主会话` + providers; choosing one
   puts `model` in the `/dsh-clipchat/ask` body.
6. **Highlight**: `高亮这段` → `.clipchat-layer__rect` appears; card stays open; close +
   reload → rect restored; re-select the same text → `取消高亮`.
7. **Click highlight**: click the rect → card opens with `此前问答`, original question and
   answer, no menu, focus stays in the composer.
8. **留痕**: `留痕` → `留痕 N` increments, list shows `当前选段`; delete → count drops and
   the JSON file records array empties.
9. **带回主线**: `带回主线` → composer gets the quote capsule + `〔滑词〕` summary; no
   auto-send. Success closes the card (focus moves to the composer).
10. **Storage**: `~/.dsh/clipchat/<sessionId>.json` holds highlights/records; 8-day-old
    and orphan files are removed on next load/apply; a corrupt file is left alone.

Residual (not covered here): English UI, uninstall/restore, read-only/subagent notice
lives in `ClipNotice` (unit-tested only), multi-span re-anchor.
