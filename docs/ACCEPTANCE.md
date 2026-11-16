# Acceptance checklist (main-agent, manual)

Preconditions: dev link exists (`scripts/dev-link.sh`), bundle installed in the web
profile, page reloaded, and an assistant reply is visible.

Select a passage, then run through:

1. **Menu**: `.clipchat-menu` shows the native `引用文本` plus `问这段`; user messages show
   only the native quote.
2. **Card shape**: click `问这段` → a 600px-wide `.clipchat-card` (capped at 64vh) opens
   with a selection bar (`✦` + ellipsized passage + `×`), four preset chips, the thread
   area, the composer, and a footer (model button, token line,
   highlight/keep/send-to-main/kept-count). The textarea is focused; `×` / Esc / blank
   click close the card; the card stays above the composer.
3. **Presets**: `解释这段 / 翻译 / 找问题 / 举个例子` (English on an English UI) are visible
   above the composer and disabled while streaming. Clicking one asks that question.
4. **Ask**: send a question → the Q&A appears as a thread turn with a streaming cursor;
   after the answer the token line shows `输入 X / 输出 Y`. A second question appends a
   second turn and `history` grows.
5. **Auto-highlight**: the first ask on a passage draws a green underline
   (`.clipchat-layer__line`) under the passage and the footer button becomes `取消高亮`,
   without clicking it. Selecting a passage and closing the card without asking leaves no
   line and no stored highlight.
6. **Stop**: during streaming the send button becomes `■`; clicking it keeps the partial
   answer, stops the request, and shows `已停止，可重新发送`.
7. **Model**: the footer model button lists `跟随主会话` + providers in a menu; choosing one
   closes the menu and updates the label; Esc closes the menu without closing the card; the
   choice is sent as `model` in the next `/dsh-clipchat/ask` body.
8. **Highlight toggle**: `取消高亮` → line disappears and storage records the removal;
   `高亮这段` restores it; reload → green line restored.
9. **Click highlight**: click the line → card opens with the `此前问答` turn, no menu, focus
   stays in the composer.
10. **留痕**: `留痕` → `留痕 N` increments, list shows `当前选段`; delete → count drops and
    the JSON file's records array empties.
11. **带回主线**: `带回主线` → composer gets the quote capsule + `〔滑词〕` summary; no
    auto-send. Success closes the card (focus moves to the composer).
12. **Storage**: `~/.dsh/clipchat/<sessionId>.json` holds highlights/records; 8-day-old and
    orphan files are removed on next load/apply; a corrupt file is left alone.

Residual (not covered here): English UI, uninstall/restore, read-only/subagent notice lives
in `ClipNotice` (unit-tested only), multi-span re-anchor.

## M2 — cross-session search (after restarting dsh so the host half reloads)

1. Open a card in one conversation, open `留痕` → switch to `全部会话`, search a phrase
   that only exists in another conversation's kept answer: the row appears with selection,
   question, answer snippet, model, date and session tail.
2. Empty search lists recent kept answers (up to 20); `truncated` shows a hint when more
   matches exist.
3. Expand shows the full answer; `复制` copies the Q&A; `插入主输入框` inserts the quote +
   summary without sending.
4. `本会话` tab still lists the current session's records and delete still works.
