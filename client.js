window.__ModuleLoader__.load({
  id: 'dsh-clipchat',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'clipchat'
    const ASK_PATH = '/dsh-clipchat/ask'
    const SESSION_PATH = '/dsh-clipchat/session'
    const HIGHLIGHT_PATH = '/dsh-clipchat/highlight'
    const RECORD_PATH = '/dsh-clipchat/record'
    const MODELS_PATH = '/dsh-clipchat/models'
    const SEARCH_PATH = '/dsh-clipchat/search'
    const CONTEXT_PATH = '/dsh-clipchat/context'
    /** Rough characters-per-token for mixed Chinese and code; display only. */
    const CHARS_PER_TOKEN = 1.6
    const FOLLOW_MODEL = 'follow'
    const HISTORY_LIMIT = 12
    const RECENT_LIMIT = 3
    const NEIGHBOR_LIMIT = 2
    const SEARCH_LIMIT = 20

    /* Drag and resize geometry. Distances are CSS pixels. */
    /** Smallest card the user may shrink to; below this the footer has nowhere to go. */
    const CARD_MIN_W = 420
    const CARD_MIN_H = 320
    /** Gap kept between the card and whatever contains it. */
    const CARD_EDGE = 8
    /** Window height reserved above and below the card. */
    const CARD_VIEWPORT_SLACK = 120
    /** How much of the card must stay grabbable once it is dragged off an edge. */
    const CARD_KEEP_W = 96
    const CARD_KEEP_H = 44
    /** Travel below this is a click, not a drag: a shaky hand must not move the card. */
    const CARD_CLICK_DISTANCE = 6
    const CARD_CLICK_MS = 200
    /** How long the card's opening animation gets before its class is dropped. */
    const CARD_POP_MS = 200
    /**
     * A window change is fitted over several frames, not once: the host re-lays
     * its column out after the window resized and re-anchors the card a beat
     * later, and a fit that lands mid-flight measures a column narrower than the
     * window (measured: an 85px card in a 420px window). The fit keeps watching
     * the card until it has held still for a few frames, and gives up after
     * `CARD_FIT_MAX_FRAMES` whatever happens.
     */
    const CARD_FIT_MAX_FRAMES = 90
    const CARD_FIT_STABLE_FRAMES = 6
    /** One arrow key moves 8px, or 40px with Shift. */
    const CARD_KEY_MOVE = 8
    const CARD_KEY_MOVE_LARGE = 40
    /** One Alt+arrow resizes 8px, or 32px with Shift. */
    const CARD_KEY_RESIZE = 8
    const CARD_KEY_RESIZE_LARGE = 32
    /** Width a reset returns the card to, before the viewport caps it. */
    const CARD_DEFAULT_W = 600
    /**
     * Direction letters for the resize hot areas; `se` also draws the visible grip.
     * `ne` is deliberately absent: that corner is where the close button sits, and
     * a hot area over it would swallow every press meant to dismiss the card.
     */
    const CARD_GRIPS = ['nw', 'sw', 'se', 'e', 's']
    /** How many times a covered title bar is pushed clear before giving up. */
    const CARD_REVEAL_ATTEMPTS = 4
    /** A card nobody has moved or resized keeps the size its CSS gives it. */
    /** Arrow keys, in the order the keyboard maps them to card coordinates. */
    const CARD_KEY_VECTORS = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const CARD_BOX_DEFAULT = { w: null, h: null, dx: 0, dy: 0 }

    /* Constants and locale dictionaries. */
    const zh = {
      ask: '问这段',
      title: '滑词对话',
      close: '关闭',
      placeholder: '直接问，或选一个快问',
      placeholderWithFiles: '已附加内容，可补充问题，或直接发送',
      inputHint: 'Enter 发送，Shift+Enter 换行',
      attach: '添加图片或文件',
      attachTooMany: '最多 {max} 个附件',
      attachTooLarge: '{name} 超过 {max}，已跳过',
      attachTotalTooLarge: '附件合计超过 {max}，已跳过',
      attachReadFailed: '附件读取失败，请重试',
      dropHint: '松开以添加附件',
      snippetTitle: '粘贴的文本',
      snippetMeta: '{lines} 行 · {chars} 字',
      snippetTruncated: '已截断',
      snippetTooMany: '最多 {max} 段粘贴文本',
      removeAttachment: '移除',
      jumpEnd: '跳到回答末尾',
      jumpStart: '回到提问',
      jumpPick: '跳到哪一轮',
      jumpTurn: '第 {n} 轮',
      jumpRounds: '共 {n} 轮',
      dragHint: '拖动标题栏移动卡片。方向键移动，Alt+方向键改大小，Home 复位',
      resizeHint: '拖动调整卡片大小',
      empty: '（未读到选段）',
      send: '发送',
      thinking: '正在回答…',
      tokensIn: '输入',
      tokensOut: '输出',
      noTokens: 'token —',
      failed: '请求失败，请重试',
      emptyAnswer: '模型这次没有返回正文（输出可能全用在思考上了），请重试或换个模型',
      network: '网络异常，请重试',
      aborted: '已停止，可重新发送',
      stop: '停止',
      noModel: '当前没有可用模型',
      noContext: '未能读取这条消息，请重新划选',
      selectionTooLong: '选段过长，请缩短到 2000 字以内',
      contextTooLong: '上下文过长，请缩短问题',
      llmUnavailable: '模型服务暂不可用，请稍后重试',
      forbidden: '没有权限或登录已失效，请刷新页面',
      highlight: '高亮这段',
      highlighted: '已高亮',
      unhighlight: '取消高亮',
      unavailable: '当前会话只读或为子会话，暂不支持滑词提问。',
      model: '模型',
      followModel: '跟随主会话',
      invalidModel: '所选模型不可用，请换一个',
      record: '记录',
      unrecord: '取消记录',
      unrecordHint: '已记录，点击取消',
      records: '记录',
      backToMain: '带回主线',
      inserted: '已插入',
      insertFailed: '无法插入，请手动复制',
      currentSelection: '当前选段',
      deleteRecord: '删除',
      noRecords: '本会话暂无记录',
      recordsSession: '本会话',
      recordsAll: '全部会话',
      searchPlaceholder: '搜索全部记录…',
      searchEmpty: '没有匹配的记录',
      searchLoading: '搜索中…',
      searchFailed: '搜索失败，请重试',
      searchTruncated: '结果较多，仅显示最新部分',
      copy: '复制',
      copied: '已复制',
      insertToMain: '插入主输入框',
      expandAnswer: '展开',
      locate: '定位到原文',
      locateFailed: '原文位置已找不到',
      locateHint: '点击展开并定位到原文',
      detail: '详细',
      detailHint: '开启后注入整段会话的历史',
      detailOff: '近 3 轮',
      detailOn: '全部 {turns} 轮',
      detailDegraded: '降级 · 退回近 3 轮',
      detailLoading: '读取历史…',
      detailFailed: '历史读取失败，已退回近轮上下文',
      detailMore: '明细',
      detailHead: '本次注入',
      detailAdded: '详细模式追加',
      detailRows: '注入内容',
      detailTotal: '合计 {chars} · {tokens}',
      detailNoteOff: '只给这一段附近的上下文，不含工具调用与更早的轮次',
      detailNoteOn: '整段会话：从第 {first} 轮起，含更早轮次的压缩摘要',
      detailNoteDegraded: '历史读取失败，已退回近轮上下文；回答不受影响，可重试',
      ctxSelection: '选段',
      ctxMessage: '整条消息',
      ctxNeighbors: '同轮前后',
      ctxRecent: '前 3 轮问答',
      ctxTurns: '历史轮次',
      ctxTools: '工具调用',
      ctxSummary: '压缩摘要',
      collapseAnswer: '收起',
      threadHint: '问一句，这段话就会记在原文上。',
      threadHintSub: '回答会自动记录，不需要时点「取消记录」。',
      generating: '生成中…',
      presetExplain: '解释这段',
      presetExplainQ: '解释这段',
      presetTranslate: '翻译',
      presetTranslateQ: '把这段翻译成英文',
      presetCritique: '找问题',
      presetCritiqueQ: '这段里有没有错误或风险？',
      presetExample: '举个例子',
      presetExampleQ: '举个例子',
    }
    const en = {
      ask: 'Ask about this',
      title: 'Clipchat',
      close: 'Close',
      placeholder: 'Ask, or pick a quick question',
      placeholderWithFiles: 'Attached — add a question, or send as is',
      inputHint: 'Enter to send, Shift+Enter for a new line',
      attach: 'Add images or files',
      attachTooMany: 'At most {max} attachments',
      attachTooLarge: '{name} is over {max} and was skipped',
      attachTotalTooLarge: 'Total attachments exceed {max}; skipped',
      attachReadFailed: 'Could not read the attachment. Try again.',
      dropHint: 'Drop to attach',
      snippetTitle: 'Pasted text',
      snippetMeta: '{lines} lines · {chars} chars',
      snippetTruncated: 'truncated',
      snippetTooMany: 'At most {max} pasted snippets',
      removeAttachment: 'Remove',
      jumpEnd: 'Jump to the end',
      jumpStart: 'Back to the question',
      jumpPick: 'Jump to a round',
      jumpTurn: 'Round {n}',
      jumpRounds: '{n} rounds',
      dragHint: 'Drag the title bar to move the card. Arrow keys move, Alt+arrows resize, Home resets',
      resizeHint: 'Drag to resize the card',
      empty: '(no selected text)',
      send: 'Send',
      thinking: 'Answering…',
      tokensIn: 'in',
      tokensOut: 'out',
      noTokens: 'token —',
      failed: 'Request failed. Try again.',
      emptyAnswer: 'The model returned no text (its output may have gone to reasoning). Try again or pick another model.',
      network: 'Network error. Try again.',
      aborted: 'Stopped. You can send again.',
      stop: 'Stop',
      noModel: 'No model is available right now',
      noContext: 'Could not read this message. Select the text again.',
      selectionTooLong: 'The selection is too long. Keep it under 2000 characters.',
      contextTooLong: 'Context is too long. Shorten the question.',
      llmUnavailable: 'The model service is unavailable. Try again later.',
      forbidden: 'Not allowed, or the session expired. Refresh the page.',
      highlight: 'Highlight',
      highlighted: 'Highlighted',
      unhighlight: 'Remove highlight',
      unavailable: 'This conversation is read-only or a subagent, so clipchat is unavailable.',
      model: 'Model',
      followModel: 'Follow main session',
      invalidModel: 'That model is not available. Pick another.',
      record: 'Keep',
      unrecord: 'Un-keep',
      unrecordHint: 'Kept. Click to remove.',
      records: 'Records',
      backToMain: 'Send to main',
      inserted: 'Inserted',
      insertFailed: 'Could not insert. Copy manually.',
      currentSelection: 'This passage',
      deleteRecord: 'Delete',
      noRecords: 'No records yet',
      recordsSession: 'This session',
      recordsAll: 'All sessions',
      searchPlaceholder: 'Search all records…',
      searchEmpty: 'No matching kept answers',
      searchLoading: 'Searching…',
      searchFailed: 'Search failed. Try again.',
      searchTruncated: 'More matches than shown; only the newest are listed',
      copy: 'Copy',
      copied: 'Copied',
      insertToMain: 'Insert into main',
      expandAnswer: 'Expand',
      locate: 'Show in reply',
      locateFailed: 'That passage is no longer on screen',
      locateHint: 'Click to expand and jump to the passage',
      detail: 'Detail',
      detailHint: 'Inject the whole session history',
      detailOff: 'last 3 turns',
      detailOn: 'all {turns} turns',
      detailDegraded: 'degraded · last 3 turns',
      detailLoading: 'reading history…',
      detailFailed: 'History unavailable, fell back to nearby turns',
      detailMore: 'details',
      detailHead: 'injected now',
      detailAdded: 'added by detailed mode',
      detailRows: 'Injected',
      detailTotal: '{chars} · {tokens}',
      detailNoteOff: 'Nearby context only; no tool calls, no earlier turns',
      detailNoteOn: 'Whole session: from turn {first}, plus a summary of earlier turns',
      detailNoteDegraded: 'History unavailable; fell back to nearby turns. The answer is unaffected.',
      ctxSelection: 'selection',
      ctxMessage: 'whole message',
      ctxNeighbors: 'nearby steps',
      ctxRecent: 'last 3 turns',
      ctxTurns: 'history turns',
      ctxTools: 'tool calls',
      ctxSummary: 'summary',
      collapseAnswer: 'Collapse',
      threadHint: 'Ask once and the passage stays marked in the reply.',
      threadHintSub: 'Answers are recorded automatically; use 取消记录 to drop one.',
      generating: 'Generating…',
      presetExplain: 'Explain',
      presetExplainQ: 'Explain this passage',
      presetTranslate: 'Translate',
      presetTranslateQ: 'Translate this passage into English',
      presetCritique: 'Find issues',
      presetCritiqueQ: 'Does this passage have any errors or risks?',
      presetExample: 'Example',
      presetExampleQ: 'Give an example',
    }

    /* Styles. */
    const css = `
.clipchat-menu{display:flex;align-items:center;gap:6px}
.clipchat-menu__ask{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);cursor:pointer;border-radius:999px;padding:5px 10px}
.clipchat-menu__ask:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card{position:relative;z-index:40;width:min(600px,calc(100vw - 32px));max-height:min(520px,64vh);box-sizing:border-box;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:14px;display:flex;flex-direction:column;
/* Frosted glass: a translucent fill, the page blurred behind it, and a
   brighter top edge so the panel reads as a raised sheet rather than a box. */
background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 78%,transparent);
-webkit-backdrop-filter:blur(24px) saturate(180%);
backdrop-filter:blur(24px) saturate(180%);
box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.06),0 12px 28px -8px rgba(0,0,0,.18),0 32px 64px -24px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.5)}
.clipchat-card::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.22),transparent 42%)}
@media (prefers-color-scheme:dark){.clipchat-card{background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#1c1c1e) 82%,transparent);box-shadow:0 0 0 .5px rgba(255,255,255,.08),0 1px 2px rgba(0,0,0,.4),0 12px 28px -8px rgba(0,0,0,.5),0 32px 64px -24px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.09)}
.clipchat-card::before{background:linear-gradient(180deg,rgba(255,255,255,.07),transparent 42%)}}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.clipchat-card{background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill))}}
@keyframes clipchat-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
/* The opening animation belongs to the moment the card appears, so it is
   scoped to a class the card carries only while that moment lasts. Leaving it
   on the base rule made every gesture replay it: gestures turn animation off,
   so ending one turned it back on — and a fresh CSS animation starts at its
   first keyframe. The card faded out, snapped back to its anchor (the
   keyframes' transform beats the inline one) and slid in again on every
   release. The class is dropped once the animation has played, and a gesture
   that starts first drops it too, so it can only ever run once. */
.clipchat-card.is-entering{animation:clipchat-pop .16s ease-out}
@media (prefers-reduced-motion:reduce){.clipchat-card.is-entering{animation:none}}
.clipchat-card__bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary,#666);border-radius:14px 14px 0 0;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 45%,transparent)}
/* The title bar is the move handle: no text selection, no native drag, no scroll. */
.clipchat-card__bar{cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-user-drag:none}
.clipchat-card__bar:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6fed);outline-offset:-2px}
.clipchat-card.is-dragging .clipchat-card__bar{cursor:grabbing}
.clipchat-card__mark{flex:none;font-size:12px;line-height:1;color:var(--dsw-alias-brand-primary,#2f6fed)}
.clipchat-card__bar-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:1.5}
.clipchat-card__close{flex:none;border:none;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:4px 6px;border-radius:7px;transition:background .12s ease,color .12s ease}
.clipchat-card__close:hover{background:var(--dsw-alias-button-floating-hover);color:var(--dsw-alias-label-primary)}
/* Drag and resize. A live gesture drops the blur (a 24px backdrop filter re-runs
   every frame) and any entry animation (its keyframes carry their own
   transform, which would fight the inline one). Dropping the blur alone would
   leave the card's 78% translucent fill bare — see-through mid-gesture — so the
   gesture also swaps in the opaque surface colour: same solid sheet, cheaper
   frame. */
.clipchat-card.is-dragging,.clipchat-card.is-resizing{z-index:60;animation:none;will-change:transform;-webkit-user-select:none;user-select:none;-webkit-backdrop-filter:none;backdrop-filter:none;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill))}
.clipchat-card.is-settling{transition:width .28s ease,height .28s ease,transform .28s ease}
@media (prefers-reduced-motion:reduce){.clipchat-card.is-settling{transition:none}}
/* Hot areas sit inside the rounded corner so the card itself can clip nothing.
   The top-right corner has none: the close button owns it. */
.clipchat-card__grip{position:absolute;z-index:3;margin:0;padding:0;border:0;background:transparent;touch-action:none}
.clipchat-card__grip--e{top:24px;bottom:24px;right:0;width:10px;cursor:ew-resize}
.clipchat-card__grip--s{left:24px;right:24px;bottom:0;height:10px;cursor:ns-resize}
.clipchat-card__grip--nw{top:0;left:0;width:16px;height:16px;cursor:nwse-resize}
.clipchat-card__grip--sw{left:0;bottom:0;width:16px;height:16px;cursor:nesw-resize}
.clipchat-card__grip--se{right:0;bottom:0;width:16px;height:16px;cursor:nwse-resize;display:flex;align-items:flex-end;justify-content:flex-end;color:var(--dsw-alias-label-secondary,#666)}
/* The only visible one: three diagonal lines in the bottom-right corner. */
.clipchat-card__grip--se::after{content:'';width:12px;height:12px;margin:3px;border-radius:1px;background:repeating-linear-gradient(135deg,transparent 0 2px,currentColor 2px 3px);opacity:.35}
.clipchat-card__grip--se:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#2f6fed);outline-offset:-2px}
.clipchat-card__presets{display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px 4px}
.clipchat-card__preset{border:1px solid var(--dsw-alias-border-l3);background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 68%,transparent);color:var(--dsw-alias-label-secondary,#666);border-radius:999px;padding:4px 11px;font:var(--dsw-font-xs-13);line-height:1.4;cursor:pointer;box-shadow:0 1px 1.5px rgba(0,0,0,.04);transition:background .12s ease,border-color .12s ease,color .12s ease,transform .12s ease,box-shadow .12s ease}
.clipchat-card__preset:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));background:var(--dsw-alias-button-floating-hover);transform:translateY(-1px)}
.clipchat-card__preset:disabled{opacity:.5;cursor:default}
/* The east resize rail owns the card's right-hand 10px, and the answer's
   scrollbar sits at the thread's right edge — underneath the rail, where a
   press meant for the scrollbar resized the card instead. Insetting the thread
   by the rail's width puts the scrollbar to the left of it. The 10px taken off
   the right padding gives the inset back, so the text keeps its 16px gap to the
   card's edge — the same gap the records panel has when it replaces the thread. */
.clipchat-card__threadwrap{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
.clipchat-card__thread{flex:1;min-height:96px;overflow:auto;overscroll-behavior:contain;overflow-anchor:none;padding:12px 6px 12px 16px;margin-right:10px}
/* A card whose height the user pinned gives space to the footer first: the
   thread keeps at least a line, then scrolls, instead of pushing the footer out. */
.clipchat-card.is-sized .clipchat-card__thread{min-height:0}
.clipchat-card__empty{display:flex;gap:10px;padding:18px 2px 10px}
.clipchat-card__empty-mark{flex:none;font-size:26px;line-height:1;color:var(--dsw-alias-brand-primary,#2f6fed);opacity:.35}
.clipchat-card__empty-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.clipchat-card__empty-title{font-size:13px;line-height:1.6}
.clipchat-card__empty-sub{font-size:12px;line-height:1.5;opacity:.55}
.clipchat-card__turn{padding:2px 0 18px}
.clipchat-card__turn+.clipchat-card__turn{border-top:1px solid var(--dsw-alias-border-l3);padding-top:16px}
.clipchat-card__q{position:relative;display:block;font-size:12.5px;font-weight:600;line-height:1.55;margin-bottom:10px;padding:7px 10px 7px 27px;border-radius:9px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary)}
.clipchat-card__q::before{content:'问';position:absolute;left:9px;top:7px;font-size:10.5px;font-weight:500;line-height:1.9;opacity:.45}
.clipchat-card__qtext{white-space:pre-wrap;overflow-wrap:anywhere}
.clipchat-card__q .clipchat-card__tray{margin-top:7px;font-weight:400}
.clipchat-card__q .clipchat-card__fchip,.clipchat-card__q .clipchat-card__thumb{height:36px}
.clipchat-card__q .clipchat-card__thumb,.clipchat-card__q .clipchat-card__thumb-img{width:36px}
.clipchat-card__qsnippets{display:flex;flex-direction:column;gap:6px;margin-top:7px;font-weight:400}
.clipchat-card__a{position:relative;line-height:1.75;font-size:13.5px;word-break:break-word;padding-left:14px;border-left:2px solid color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 30%, transparent)}
.clipchat-card__a>.clipchat-card__p{margin:0;white-space:pre-wrap}
.clipchat-card__a>.clipchat-card__p+.clipchat-card__p{margin-top:9px}
.clipchat-card__h{margin:14px 0 6px;font-size:13.5px;font-weight:600;line-height:1.5;color:var(--dsw-alias-label-primary)}
.clipchat-card__a>:first-child.clipchat-card__h{margin-top:0}
.clipchat-card__list{margin:6px 0 0;padding-left:18px}
.clipchat-card__list li{margin:2px 0;white-space:pre-wrap}
.clipchat-card__list li::marker{color:var(--dsw-alias-label-secondary,#666)}
.clipchat-card__quote{margin:8px 0 0;padding:2px 0 2px 10px;border-left:2px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary,#666);white-space:pre-wrap}
.clipchat-card__a code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12.5px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.12));border-radius:4px;padding:1px 4px}
/* A fenced block: one literal text node, scrolling sideways instead of
   wrapping, because a wrapped code line lies about its own shape. */
.clipchat-card__code{margin:9px 0 0;border:1px solid var(--dsw-alias-border-l3);border-radius:9px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));overflow:hidden}
.clipchat-card__pre{margin:0;padding:2px 11px 9px;overflow-x:auto;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12.5px;line-height:1.6;tab-size:2;white-space:pre}
/* The language sits above the code instead of over it: an absolutely placed
   badge would cover the end of the first line, which is usually the longest. */
.clipchat-card__lang{display:block;padding:5px 11px 0;text-align:right;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;line-height:1.3;color:var(--dsw-alias-label-secondary,#666);opacity:.65}
.clipchat-card__code>:first-child.clipchat-card__pre{padding-top:9px}
.clipchat-card__a .clipchat-card__pre code{background:none;padding:0;border-radius:0;font-size:12.5px;line-height:inherit}
/* A table scrolls inside its own box: a wide grid must not widen the card.
   A header never wraps, so its own text is part of the table's minimum width:
   eight columns overflow the box and scroll, instead of being squeezed until
   each header reads one character per line. Body cells still wrap, so a two-
   or three-column table keeps filling the card and a long cell reads as prose
   rather than one unbroken line. The compromise is deliberate: a header long
   enough to matter makes its column that wide and the box scrolls. */
.clipchat-card__tablewrap{margin:9px 0 0;overflow-x:auto;border:1px solid var(--dsw-alias-border-l3);border-radius:9px}
.clipchat-card__table{border-collapse:collapse;width:100%;table-layout:auto;font-size:12.5px;line-height:1.6}
.clipchat-card__table th,.clipchat-card__table td{border-bottom:1px solid var(--dsw-alias-border-l3);border-right:1px solid var(--dsw-alias-border-l3);padding:5px 9px;text-align:left;vertical-align:top;white-space:pre-wrap;min-width:4.5em}
.clipchat-card__table th{white-space:nowrap}
.clipchat-card__table tr>:last-child{border-right:none}
.clipchat-card__table tbody tr:last-child>*{border-bottom:none}
.clipchat-card__th{font-weight:600;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08))}
.clipchat-card__hr{margin:12px 0 0;border:none;border-top:1px solid var(--dsw-alias-border-l2,var(--dsw-alias-border-l3))}
.clipchat-card__img{display:block;max-width:100%;height:auto;margin:8px 0 0;border-radius:8px;border:1px solid var(--dsw-alias-border-l3)}
.clipchat-card__check{display:inline-block;color:var(--dsw-alias-label-secondary,#666)}
.clipchat-card__a a{color:var(--dsw-alias-brand-primary,#2f6fed);text-decoration:none}
.clipchat-card__a a:hover{text-decoration:underline}
.clipchat-card__a>:first-child{margin-top:0}
.clipchat-card__turn-actions{display:flex;gap:6px;margin-top:6px;justify-content:flex-end}
.clipchat-card__copy{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:11px;line-height:1.4;cursor:pointer;border-radius:999px;padding:1px 8px;transition:background .12s ease,color .12s ease}
.clipchat-card__copy:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-hover)}
.clipchat-card:focus{outline:none}
.clipchat-card__drop{position:absolute;inset:6px;z-index:9;display:grid;place-items:center;border:1.5px dashed var(--dsw-alias-state-success-primary,#1f9d63);border-radius:11px;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 86%,var(--dsw-alias-state-success-primary,#1f9d63) 6%);color:var(--dsw-alias-label-primary);font-size:12.5px;pointer-events:none}
.clipchat-card__lightbox{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:24px;border-radius:14px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#000) 66%,transparent);cursor:zoom-out}
.clipchat-card__lightbox img{max-width:100%;max-height:100%;border-radius:10px}
.clipchat-card__cursor{display:inline-block;margin-left:1px;animation:clipchat-blink 1s step-end infinite}
@keyframes clipchat-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.clipchat-card__cursor{animation:none}}
/* One surface: attachments and pasted text sit above, the field below, and the
   plus is a quiet control inside the field's left gutter. */
.clipchat-card__composer{display:flex;flex-direction:column;gap:6px;padding:8px 16px 10px;border-top:1px solid var(--dsw-alias-border-l3)}
.clipchat-card__ctx{display:flex;flex-direction:column;gap:6px}
.clipchat-card__row{display:flex;align-items:flex-end;gap:8px}
.clipchat-card__field{position:relative;flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 72%,transparent);transition:border-color .14s ease,box-shadow .14s ease,background .14s ease}
.clipchat-card__field:hover{border-color:color-mix(in srgb,var(--dsw-alias-label-secondary,#666) 30%,var(--dsw-alias-border-l3))}
.clipchat-card__field:focus-within{border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary,#1f9d63) 44%,var(--dsw-alias-border-l3));box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-state-success-primary,#1f9d63) 9%,transparent);background:var(--dsw-alias-bg-elevated,#fff)}
.clipchat-card__attach{position:absolute;left:9px;top:50%;transform:translateY(-50%);z-index:2;width:26px;height:26px;display:grid;place-items:center;padding:0;border:1px solid transparent;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.clipchat-card__attach:hover{background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}
.clipchat-card__attach:active{transform:translateY(-50%) scale(.94)}
.clipchat-card__attach svg{display:block}
.clipchat-card__ta-wrap{position:relative;padding:10px 14px 10px 46px}
/* Capped at three rows: the text above is still there, so the top edge fades
   instead of ending on a hard cut. */
.clipchat-card__ta-wrap:has(.clipchat-card__ta.is-capped)::before{content:'';position:absolute;left:46px;right:14px;top:10px;height:12px;pointer-events:none;background:linear-gradient(var(--dsw-alias-bg-elevated,#fff),transparent)}
.clipchat-card__ta{display:block;width:100%;height:20px;min-height:20px;max-height:60px;padding:0;box-sizing:border-box;resize:none;border:0;background:transparent;color:inherit;font:inherit;font-size:13.5px;line-height:20px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;scrollbar-color:transparent transparent;transition:scrollbar-color .14s ease}
.clipchat-card__field:hover .clipchat-card__ta{scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-secondary,#666) 34%,transparent) transparent}
.clipchat-card__ta::placeholder{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#999))}
.clipchat-card__ta:focus{outline:none}
.clipchat-card__ta::-webkit-scrollbar{width:8px}
.clipchat-card__ta::-webkit-scrollbar-track{background:transparent}
.clipchat-card__ta::-webkit-scrollbar-thumb{background:transparent;border-radius:999px;border:2px solid transparent;background-clip:content-box}
.clipchat-card__field:hover .clipchat-card__ta::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-secondary,#666) 34%,transparent);background-clip:content-box}
.clipchat-card__send{flex:none;width:34px;height:34px;margin-bottom:3px;display:grid;place-items:center;border:1px solid transparent;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));font:inherit;font-size:15px;cursor:pointer;border-radius:50%;padding:0;transition:opacity .12s ease,transform .12s ease,background .12s ease}
.clipchat-card__send:hover:not(:disabled){transform:translateY(-1px)}
.clipchat-card__send:disabled{background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.12));color:var(--dsw-alias-label-secondary,#666);opacity:1;cursor:default}
.clipchat-card__tray{display:flex;flex-wrap:wrap;gap:6px}
.clipchat-card__thumb{position:relative;width:40px;height:40px;flex:none}
.clipchat-card__thumb-img{width:40px;height:40px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));cursor:zoom-in}
.clipchat-card__thumb-img img{display:block;width:100%;height:100%;object-fit:cover}
.clipchat-card__thumb-x{position:absolute;top:-5px;right:-5px;width:16px;height:16px;display:grid;place-items:center;border:1px solid var(--dsw-alias-border-l3);border-radius:50%;background:var(--dsw-alias-bg-elevated,#fff);color:var(--dsw-alias-label-secondary,#666);font-size:10px;line-height:1;cursor:pointer;padding:0;opacity:0;transition:opacity .12s ease,color .12s ease}
.clipchat-card__thumb:hover .clipchat-card__thumb-x,.clipchat-card__thumb-x:focus-visible{opacity:1}
.clipchat-card__thumb-x:hover{color:var(--dsw-alias-state-error-primary,#d33)}
.clipchat-card__fchip{display:flex;align-items:center;gap:6px;max-width:220px;height:40px;padding:0 6px 0 5px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-elevated,#fff)}
.clipchat-card__fext{flex:none;width:24px;height:26px;display:grid;place-items:center;border-radius:5px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1));color:var(--dsw-alias-label-secondary,#666);font:600 8px/1 inherit;letter-spacing:.02em;text-transform:uppercase}
.clipchat-card__fmeta{min-width:0;display:flex;flex-direction:column;line-height:1.35}
.clipchat-card__fname{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-primary)}
.clipchat-card__fsize{font-size:10px;color:var(--dsw-alias-label-secondary,#888);font-variant-numeric:tabular-nums}
.clipchat-card__fx{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#888);cursor:pointer;font-size:13px;padding:2px 3px;border-radius:5px}
.clipchat-card__fx:hover{background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1));color:var(--dsw-alias-label-primary)}
.clipchat-card__snippet{border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:var(--dsw-alias-bg-elevated,#fff);overflow:hidden}
.clipchat-card__snippet-head{display:flex;align-items:center;gap:7px;padding:5px 9px;border-bottom:1px solid var(--dsw-alias-border-l3)}
.clipchat-card__snippet-mark{flex:none;width:18px;height:18px;display:grid;place-items:center;border-radius:5px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1));color:var(--dsw-alias-label-secondary,#666);font-size:9.5px;font-weight:600}
.clipchat-card__snippet-title{font-size:11.5px;font-weight:500;color:var(--dsw-alias-label-primary)}
.clipchat-card__snippet-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary,#888);font-variant-numeric:tabular-nums}
.clipchat-card__snippet-spacer{flex:1}
.clipchat-card__snippet-actions{display:flex;align-items:center;gap:2px}
.clipchat-card__snippet-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:10.5px;cursor:pointer;padding:2px 4px;border-radius:4px}
.clipchat-card__snippet-btn:hover{background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1))}
.clipchat-card__snippet-body{position:relative;max-height:38px;overflow:hidden}
.clipchat-card__snippet-body pre{margin:0;padding:7px 10px 8px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:11.5px;line-height:1.65;color:var(--dsw-alias-label-secondary,#666)}
.clipchat-card__snippet.is-open .clipchat-card__snippet-body{max-height:190px;overflow:auto}
.clipchat-card__snippet--view>summary{list-style:none;cursor:pointer}
.clipchat-card__snippet--view>summary::-webkit-details-marker{display:none}
.clipchat-card__snippet--view>summary .clipchat-card__snippet-btn{pointer-events:none}
.clipchat-card__snippet--view .clipchat-card__snippet-body{display:none}
.clipchat-card__snippet--view[open] .clipchat-card__snippet-body{display:block;max-height:190px;overflow:auto}
.clipchat-card__snippet--view .clipchat-card__snippet-btn::after{content:' ▾'}
.clipchat-card__snippet--view[open] .clipchat-card__snippet-btn::after{content:' ▴'}
/* The jump control lives in its own row under the thread: it never covers a
   line of the answer, and the row only exists while there is somewhere to go. */
.clipchat-card__jumpbar{flex:none;position:relative;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 14px 4px;min-height:24px}
.clipchat-card__jumphint{margin-right:auto;font-size:10.5px;line-height:1.4;color:var(--dsw-alias-label-secondary,#888);opacity:.75;font-variant-numeric:tabular-nums}
.clipchat-card__jumpsplit{display:flex;align-items:stretch;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 70%,transparent)}
.clipchat-card__jump{border:0;border-radius:0;padding:2px 9px;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:11px;line-height:1.6;cursor:pointer}
.clipchat-card__jumpcaret{border:0;border-left:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);padding:0 7px;font-size:9px;line-height:1;cursor:pointer}
.clipchat-card__jumpsplit:hover .clipchat-card__jump,.clipchat-card__jumpsplit:hover .clipchat-card__jumpcaret{color:var(--dsw-alias-label-primary)}
.clipchat-card__jump:hover{color:var(--dsw-alias-label-primary)}
.clipchat-card__jumpmenu{position:absolute;right:14px;bottom:calc(100% + 4px);z-index:4;width:252px;max-height:246px;overflow:auto;display:flex;flex-direction:column;gap:1px;padding:5px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 88%,transparent);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 10px 26px -8px rgba(0,0,0,.22),0 24px 48px -20px rgba(0,0,0,.3)}
.clipchat-card__jumphead{padding:4px 7px 5px;font-size:10px;color:var(--dsw-alias-label-secondary,#888)}
.clipchat-card__jumpitem{display:flex;align-items:baseline;gap:8px;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding:6px 7px;border-radius:6px;font:inherit;font-size:11.5px;cursor:pointer}
.clipchat-card__jumpitem:hover{background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1))}
.clipchat-card__jumpitem.is-end{margin-top:3px;border-top:1px solid var(--dsw-alias-border-l3);border-radius:0 0 6px 6px;padding-top:8px}
.clipchat-card__jumpindex{flex:none;color:var(--dsw-alias-label-secondary,#888);font-variant-numeric:tabular-nums}
.clipchat-card__jumptext{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.clipchat-strip{position:relative;display:flex;align-items:center;box-sizing:border-box;margin:0 16px 2px;padding:0 7px 0 9px;height:30px;min-height:30px;line-height:1;border:1px solid transparent;border-radius:8px;transition:background .16s ease,border-color .16s ease}
.clipchat-strip__title{display:flex;align-items:center;gap:6px;flex:none;cursor:pointer;border-radius:5px;outline-offset:1px}
.clipchat-strip:hover{border-color:var(--dsw-alias-border-l3)}
.clipchat-strip.is-on{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 7%, transparent);border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 26%, transparent)}
.clipchat-strip.is-degraded{background:color-mix(in srgb, #b0741c 7%, transparent);border-color:color-mix(in srgb, #b0741c 28%, transparent)}
.clipchat-strip__switch{position:relative;flex:none;width:26px;height:15px;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));cursor:pointer;padding:0;transition:background .16s ease,border-color .16s ease}
.clipchat-strip__switch::after{content:'';position:absolute;top:1px;left:1px;width:11px;height:11px;border-radius:50%;background:var(--dsw-alias-label-secondary,#666);transition:transform .16s ease,background .16s ease}
.clipchat-strip__switch[aria-checked="true"]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 12%, transparent);border-color:var(--dsw-alias-state-success-primary,#1f9d63)}
.clipchat-strip__switch[aria-checked="true"]::after{transform:translateX(11px);background:var(--dsw-alias-state-success-primary,#1f9d63)}
.clipchat-strip__switch:focus-visible{outline:2px solid var(--dsw-alias-state-success-primary,#1f9d63);outline-offset:2px}
.clipchat-strip__label{font-size:11.5px;font-weight:500;letter-spacing:.01em;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;cursor:pointer}
.clipchat-strip.is-on .clipchat-strip__label{color:var(--dsw-alias-state-success-primary,#1f9d63);font-weight:600}
.clipchat-strip.is-degraded .clipchat-strip__label{color:#b0741c;font-weight:600}
/* A rule, not punctuation: it separates the control from the value it sets. */
.clipchat-strip__sep{flex:none;width:1px;height:11px;margin:0 8px;border-radius:1px;background:var(--dsw-alias-border-l3)}
.clipchat-strip__readout{flex:0 1 auto;min-width:0;font-size:11.5px;font-weight:500;line-height:1.3;font-variant-numeric:tabular-nums;letter-spacing:.01em;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clipchat-strip.is-on .clipchat-strip__readout{color:var(--dsw-alias-state-success-primary,#1f9d63);font-weight:600}
.clipchat-strip.is-degraded .clipchat-strip__readout{color:#b0741c;font-weight:600}
.clipchat-strip__more{display:inline-flex;align-items:center;gap:3px;flex:none;margin-left:auto;border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:10px;line-height:1;padding:3px 5px;border-radius:5px;cursor:pointer;opacity:.6;transition:opacity .12s ease,background .12s ease}
.clipchat-strip__more::after{content:'';width:0;height:0;border-left:3px solid currentColor;border-top:3px solid transparent;border-bottom:3px solid transparent;transform:rotate(90deg);transition:transform .16s ease}
.clipchat-strip__more[aria-expanded="true"]{opacity:1;background:var(--dsw-alias-button-floating-hover)}
.clipchat-strip__more[aria-expanded="true"]::after{transform:rotate(-90deg)}
.clipchat-strip__label,.clipchat-strip__readout{line-height:1}
.clipchat-strip__more:hover{opacity:1;background:var(--dsw-alias-button-floating-hover)}
.clipchat-strip__detail{position:absolute;left:0;bottom:calc(100% + 6px);z-index:4;width:268px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 80%,transparent);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 8px 24px -6px rgba(0,0,0,.18),0 20px 44px -16px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.45);opacity:0;transform:translateY(4px) scale(.99);transform-origin:bottom left;pointer-events:none;transition:opacity .14s ease,transform .14s ease}
.clipchat-strip:hover .clipchat-strip__detail,.clipchat-strip:focus-within .clipchat-strip__detail,.clipchat-strip__detail.is-pinned{opacity:1;transform:none;pointer-events:auto}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.clipchat-strip__detail,.clipchat-card__modelmenu{background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill))}}
.clipchat-strip__head{font-size:9.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--dsw-alias-label-secondary,#666);opacity:.7;margin-bottom:5px}
.clipchat-strip__group+.clipchat-strip__group{margin-top:7px;padding-top:7px;border-top:1px dashed var(--dsw-alias-border-l3)}
.clipchat-strip__grouptag{font-size:9.5px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-state-success-primary,#1f9d63);margin-bottom:3px}
.clipchat-strip__row{display:flex;align-items:baseline;gap:6px;padding:1px 0;font-size:10.5px;line-height:1.45}
.clipchat-strip__k{color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.clipchat-strip__k::before{content:'·';margin-right:5px;opacity:.5}
.clipchat-strip__dots{flex:1;min-width:6px;border-bottom:1px dotted var(--dsw-alias-border-l3);transform:translateY(-3px)}
.clipchat-strip__v{font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap}
.clipchat-strip__row.is-new .clipchat-strip__k,.clipchat-strip__row.is-new .clipchat-strip__v{color:var(--dsw-alias-state-success-primary,#1f9d63);font-weight:600}
.clipchat-strip__row.is-off .clipchat-strip__k{text-decoration:line-through;text-decoration-thickness:1px;opacity:.55}
.clipchat-strip__foot{margin-top:5px;padding-top:5px;border-top:1px solid var(--dsw-alias-border-l3);font-size:10px;line-height:1.5;color:var(--dsw-alias-label-secondary,#666);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clipchat-strip__foot b{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.clipchat-strip.is-on .clipchat-strip__foot b{color:var(--dsw-alias-state-success-primary,#1f9d63)}
.clipchat-strip.is-degraded .clipchat-strip__foot b{color:#b0741c}
@media (prefers-reduced-motion:reduce){.clipchat-strip__detail{transition:none}}
.clipchat-card__footer{display:flex;align-items:center;gap:6px;flex-wrap:wrap;row-gap:6px;padding:7px 16px 12px;min-width:0;background:color-mix(in srgb,var(--dsw-alias-bg-sunken,rgba(127,127,127,.05)) 55%,transparent);border-radius:0 0 14px 14px}
.clipchat-card__footer>*{flex:none}
.clipchat-card__footer .clipchat-card__spacer{flex:1 1 0;min-width:4px}
.clipchat-card__modelwrap{position:relative;flex:0 1 auto;min-width:0;display:flex}
.clipchat-card__modelbtn{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:11.5px;cursor:pointer;border-radius:999px;padding:3px 9px;max-width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background .12s ease,color .12s ease}
.clipchat-card__modelbtn:hover{background:var(--dsw-alias-button-floating-hover);color:var(--dsw-alias-label-primary)}
.clipchat-card__modelmenu{position:absolute;left:0;bottom:calc(100% + 7px);z-index:3;min-width:208px;max-height:264px;overflow:auto;display:flex;flex-direction:column;gap:1px;padding:5px;border:1px solid var(--dsw-alias-border-l3);border-radius:11px;background:color-mix(in srgb,var(--dsw-alias-bg-elevated,#fff) 80%,transparent);-webkit-backdrop-filter:blur(20px) saturate(180%);backdrop-filter:blur(20px) saturate(180%);box-shadow:0 0 0 .5px rgba(0,0,0,.06),0 8px 24px -6px rgba(0,0,0,.18),0 20px 44px -16px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.45)}
.clipchat-card__modelitem{flex:none;border:none;background:transparent;color:inherit;font:var(--dsw-font-xs-13);text-align:left;padding:7px 9px;border-radius:7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s ease,color .12s ease}
.clipchat-card__modelitem:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__modelitem.on{color:var(--dsw-alias-brand-primary,#2f6fed);background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 10%, transparent);font-weight:600}
.clipchat-card__spacer{flex:1 1 auto;min-width:0}
.clipchat-card__tokens{flex:0 1 auto;min-width:0;font-size:11px;opacity:.55;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.clipchat-card__error{color:#d9544d;font-size:12px;white-space:pre-wrap}
.clipchat-card__hint{opacity:.6;font-size:12px;line-height:1.5}
.clipchat-card__notice{padding:10px 12px 12px;opacity:.7;font-size:12px}
.clipchat-card__note{padding:0 16px 10px}
.clipchat-actions__btn{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:11.5px;cursor:pointer;border-radius:999px;padding:3px 9px;white-space:nowrap;transition:background .12s ease,color .12s ease,border-color .12s ease}
.clipchat-actions__btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-hover)}
.clipchat-actions__btn[aria-pressed='true']{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.12))}
.clipchat-actions__btn:disabled{opacity:.5;cursor:default}
/* The records panel is the card's other scroll container, so it needs the same
   inset the answer area has: its scrollbar would otherwise sit under the east
   rail too. The 10px comes off the right padding, so a record keeps the 16px
   gap the answer text has. */
.clipchat-card__records{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l3);padding:10px 6px 14px 16px;margin:0 10px 0 0}
.clipchat-card.is-records .clipchat-card__presets,.clipchat-card.is-records .clipchat-card__thread{display:none}
.clipchat-card.is-records .clipchat-card__records{border-top:none}
.clipchat-card__record{flex:none;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.04));transition:border-color .12s ease,background .12s ease}
.clipchat-card__record:hover{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 35%, var(--dsw-alias-border-l3));background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__record-head{display:flex;align-items:center;gap:6px}
.clipchat-card__record-selection{flex:1;min-width:0;opacity:.75;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-card__tag{font-size:10px;border-radius:999px;padding:1px 6px;background:color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 18%, transparent);white-space:nowrap}
.clipchat-card__record-body{display:flex;flex-direction:column;gap:8px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer;width:100%}
.clipchat-card__record-turn{display:flex;flex-direction:column;gap:4px}
.clipchat-card__record-turn+.clipchat-card__record-turn{padding-top:8px;border-top:1px dashed var(--dsw-alias-border-l3)}
.clipchat-card__record-q{font-size:12.5px;font-weight:600;line-height:1.5;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.clipchat-card__record-a{font-size:12.5px;line-height:1.6;opacity:.75;white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3}
.clipchat-card__record.is-open .clipchat-card__record-q,.clipchat-card__record.is-open .clipchat-card__record-a{display:block;-webkit-line-clamp:unset;line-clamp:unset;overflow:visible}
.clipchat-card__record.is-open .clipchat-card__record-a{max-height:320px;overflow:auto}
.clipchat-card__record-foot{display:flex;align-items:center;gap:8px;justify-content:space-between}
.clipchat-card__record-meta{font-size:11px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.clipchat-card__record-locate{flex:none;border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:11px;cursor:pointer;border-radius:999px;padding:2px 9px;transition:background .12s ease,color .12s ease,border-color .12s ease}
.clipchat-card__record-locate:hover{color:var(--dsw-alias-label-primary);border-color:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 45%, var(--dsw-alias-border-l3));background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__record-del{flex:none;border:1px solid transparent;background:transparent;color:inherit;opacity:.55;font-size:11.5px;cursor:pointer;border-radius:999px;padding:1px 7px;transition:opacity .12s ease,background .12s ease}
.clipchat-card__record:hover .clipchat-card__record-del,.clipchat-card__record-del:focus-visible{opacity:1}
.clipchat-card__record-del:hover{opacity:1;background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__records-empty{opacity:.6;font-size:11px}
.clipchat-records__tabs{flex:none;display:flex;gap:6px;align-items:center;position:sticky;top:-10px;padding:4px 0 6px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));z-index:1}
.clipchat-records__tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:12px;cursor:pointer;border-radius:999px;padding:4px 10px;transition:background .12s ease,color .12s ease,border-color .12s ease}
.clipchat-records__tab:hover{color:var(--dsw-alias-label-primary)}
.clipchat-records__tab.on{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.1));border-color:var(--dsw-alias-border-l3)}
.clipchat-search{flex:none;display:flex;flex-direction:column;gap:8px;min-height:0}
.clipchat-search__input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l3);border-radius:9px;background:transparent;color:inherit;font:inherit;font-size:13px;padding:7px 10px}
.clipchat-search__input:focus{outline:none;border-color:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 50%, var(--dsw-alias-border-l3));box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 12%, transparent)}
.clipchat-search__row{display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px dashed var(--dsw-alias-border-l3)}
.clipchat-search__row:last-child{border-bottom:0}
.clipchat-search__selection{font-size:11.5px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-search__q{font-size:12.5px;font-weight:600;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-search__a{font-size:12.5px;line-height:1.6;white-space:pre-wrap;opacity:.8;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
.clipchat-search__a.is-open{display:block;-webkit-line-clamp:unset;line-clamp:unset;max-height:200px;overflow:auto;opacity:.92}
.clipchat-search__meta{font-size:11px;opacity:.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-search__actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}
.clipchat-search__actions button{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:11.5px;cursor:pointer;border-radius:999px;padding:3px 9px;transition:background .12s ease,color .12s ease}
.clipchat-search__actions button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-hover)}
.clipchat-layer{position:absolute;inset:0;pointer-events:none;z-index:5}
.clipchat-layer__line{position:absolute;box-sizing:border-box;background:transparent;border-bottom:2px solid var(--dsw-alias-state-success-primary,#1f9d63);border-radius:0 0 2px 2px;pointer-events:auto;cursor:pointer;transition:background .12s ease,border-bottom-color .12s ease}
.clipchat-layer__line:hover{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 9%, transparent)}
.clipchat-layer__line.is-flash{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 22%, transparent);border-bottom-width:3px}
@media (prefers-reduced-motion:no-preference){.clipchat-layer__line.is-flash{animation:clipchat-flash 1.6s ease-out}}
@keyframes clipchat-flash{0%{background:color-mix(in srgb, var(--dsw-alias-state-success-primary,#1f9d63) 34%, transparent)}100%{background:transparent}}
`
    let styleTag

    function ensureStyle() {
      if (typeof document === 'undefined' || styleTag) return
      styleTag = document.createElement('style')
      styleTag.dataset.plugin = 'dsh-clipchat'
      styleTag.textContent = css
      document.head.appendChild(styleTag)
    }

    /* Pure helpers. */

    /** Stable chat node key of the live selection's source, when available. */
    function nodeKeyOfSelection() {
      if (typeof document === 'undefined' || typeof document.getSelection !== 'function') return null
      const selection = document.getSelection()
      if (selection === null || selection.rangeCount === 0) return null
      let node = selection.getRangeAt(0).startContainer
      if (node !== null && node.nodeType !== 1) node = node.parentElement
      const holder = node !== null && typeof node.closest === 'function'
        ? node.closest('[data-chat-node-key]')
        : null
      return holder === null ? null : holder.getAttribute('data-chat-node-key')
    }

    /** Assistant message keys look like `14:assistant-step11:3`; user keys do not. */
    function isAssistantNodeKey(key) {
      return typeof key === 'string' && /(?:^|:)assistant-step/u.test(key)
    }

    /** Session id of the conversation currently on screen, when the host marks it. */
    function currentSessionIdOf() {
      if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null
      const scoped = document.querySelector('[data-conversation-scroll] [data-conversation-session]')
      const holder = scoped ?? document.querySelector('[data-conversation-session]')
      if (holder === null || holder === undefined || typeof holder.getAttribute !== 'function') return null
      return holder.getAttribute('data-conversation-session')
    }

    const BLOCK_TAGS = new Set([
      'P', 'LI', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'FIGCAPTION', 'DD', 'DT',
    ])

    const BLOCK_SELECTOR = [...BLOCK_TAGS].join(',')

    /** Leaf text blocks of one text-interaction source (nested lists resolve to li). */
    function blocksOf(source) {
      const blocks = [...source.querySelectorAll(BLOCK_SELECTOR)]
        .filter((element) => element.querySelector(BLOCK_SELECTOR) === null)
      return blocks.length > 0 ? blocks : [source]
    }

    /** Character offset of a DOM boundary inside one block's text. */
    function offsetWithin(block, container, offset) {
      if (block === container) return 0
      if (!block.contains(container)) return 0
      try {
        const range = document.createRange()
        range.selectNodeContents(block)
        range.setEnd(container, offset)
        return range.toString().length
      } catch {
        return 0
      }
    }

    /**
     * Capture the live selection as a highlight anchor.
     * @returns {{ nodeKey: string, sourceIndex: number, spans: Array<{ blockIndex: number, start: number, end: number }>, text: string } | null} anchor.
     */
    function anchorFromSelection() {
      if (typeof document === 'undefined' || typeof document.getSelection !== 'function') return null
      const selection = document.getSelection()
      if (selection === null || selection.rangeCount === 0) return null
      const range = selection.getRangeAt(0)
      if (range.collapsed === true) return null
      const startElement = range.startContainer.nodeType === 1
        ? range.startContainer
        : range.startContainer.parentElement
      if (startElement === null) return null
      const source = startElement.closest('[data-text-interaction-source]')
      const nodeElement = startElement.closest('[data-chat-node-key]')
      if (source === null || nodeElement === null) return null
      const sources = [...nodeElement.querySelectorAll('[data-text-interaction-source]')]
      const sourceIndex = sources.indexOf(source)
      if (sourceIndex < 0) return null
      const blocks = blocksOf(source)
      const startBlock = blocks.findIndex((block) => block === range.startContainer || block.contains(range.startContainer))
      const endBlock = blocks.findIndex((block) => block === range.endContainer || block.contains(range.endContainer))
      if (startBlock < 0 || endBlock < 0 || endBlock < startBlock) return null
      const spans = []
      for (let index = startBlock; index <= endBlock; index += 1) {
        const start = index === startBlock ? offsetWithin(blocks[index], range.startContainer, range.startOffset) : 0
        const end = index === endBlock ? offsetWithin(blocks[index], range.endContainer, range.endOffset) : blocks[index].textContent.length
        if (end > start) spans.push({ blockIndex: index, start, end })
      }
      const text = selection.toString().trim()
      if (text.length === 0 || spans.length === 0) return null
      return { nodeKey: nodeElement.getAttribute('data-chat-node-key'), sourceIndex, spans, text }
    }

    /**
     * Split one span across a flat list of text-node lengths.
     * @param {number[]} lengths - text-node lengths in order.
     * @param {number} start - span start offset.
     * @param {number} end - span end offset.
     * @returns {Array<{ index: number, from: number, to: number }>} per-node slices.
     */
    function segmentsForSpan(lengths, start, end) {
      const segments = []
      let offset = 0
      for (let index = 0; index < lengths.length; index += 1) {
        const length = lengths[index]
        const from = Math.max(start - offset, 0)
        const to = Math.min(end - offset, length)
        if (to > from) segments.push({ index, from, to })
        offset += length
        if (offset >= end) break
      }
      return segments
    }

    /**
     * Card geometry: `w`/`h` are the size the user chose (null = the CSS size),
     * `dx`/`dy` the offset from wherever the host anchored the card.
     * @typedef {{ w: number|null, h: number|null, dx: number, dy: number }} CardBox
     */

    /** Last card size each session ended at; memory only, never persisted. */
    const cardSizes = new Map()

    /** The remembered size for one session, or the CSS defaults. */
    function rememberedBox(sessionId) {
      const stored = typeof sessionId === 'string' ? cardSizes.get(sessionId) : undefined
      if (stored === undefined) return CARD_BOX_DEFAULT
      return { w: stored.w, h: stored.h, dx: 0, dy: 0 }
    }

    /** Remember the size (never the place: a place belongs to one passage). */
    function rememberBox(sessionId, box) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
      cardSizes.set(sessionId, { w: box.w, h: box.h })
    }

    /** Window size, from the layout viewport rather than `100vw` (no scrollbar). */
    function viewportOf() {
      const root = typeof document === 'undefined' ? null : document.documentElement
      const width = (root === null ? 0 : root.clientWidth) || (typeof window === 'undefined' ? 0 : window.innerWidth) || 0
      const height = (root === null ? 0 : root.clientHeight) || (typeof window === 'undefined' ? 0 : window.innerHeight) || 0
      return { width, height }
    }

    /** Keep `value` inside [min, max]; a container smaller than the card pins to min. */
    function clampNumber(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max))
    }

    /** The first ancestor that clips its children, or null when none does. */
    function clipRectOf(element) {
      if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return null
      let node = element?.parentElement ?? null
      while (node !== null && node !== undefined && node !== document.documentElement && node !== document.body) {
        const style = window.getComputedStyle(node)
        if (style !== null && style !== undefined && (style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
          const rect = node.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0) {
            return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
          }
        }
        node = node.parentElement
      }
      return null
    }

    /**
     * The conversation column: the box the host lays its message nodes out in.
     *
     * The chrome a card must not sit under lives in the gutter beside this
     * column (the turn-outline rail), so the column's right edge is the line the
     * card's right edge has to stay left of. Measured from the message nodes
     * themselves — the host's column is centred and its width is its own
     * business, while a window-edge guess is what put the close button under
     * the rail in the first place. Reading the nodes also keeps this
     * deterministic: a sampled hit test answers differently depending on where
     * the rail's marks happen to be.
     *
     * @param {Element|null|undefined} card - the card being measured, skipped when met.
     * @returns {{ left: number, right: number }|null} column edges, or null when no message is on the page.
     */
    function columnRectOf(card) {
      if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null
      let left = Infinity
      let right = -Infinity
      for (const node of document.querySelectorAll('[data-chat-node-key], [data-chat-turn]')) {
        if (card !== null && card !== undefined && typeof node.contains === 'function' && node.contains(card)) continue
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue
        left = Math.min(left, rect.left)
        right = Math.max(right, rect.right)
      }
      return right > left ? { left, right } : null
    }

    /**
     * The top of the chrome pinned over the bottom of the page: the composer.
     *
     * It is an ancestor of nothing the card owns, so no clipping search finds
     * it, and a title bar dragged under it can never be grabbed back. Found from
     * the page's own text input: the first box in its ancestry that reaches the
     * bottom edge of the window is the pinned bar. A hit test cannot do this
     * job — where the card is, the topmost thing at the bottom of the page is
     * the card being moved.
     *
     * @param {Element|null|undefined} card - the card being measured; its own input is skipped.
     * @returns {number|null} the bar's top edge, in client coordinates.
     */
    function pinnedTopOf(card) {
      if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null
      const view = viewportOf()
      if (!(view.height > 0)) return null
      for (const input of document.querySelectorAll('textarea, [contenteditable="true"]')) {
        if (card !== null && card !== undefined && typeof card.contains === 'function' && card.contains(input)) continue
        for (let node = input; node !== null && node !== undefined && node !== document.body && node !== document.documentElement; node = node.parentElement) {
          const rect = node.getBoundingClientRect()
          if (rect.height > 0 && rect.width > 0 && rect.bottom >= view.height - 24 && rect.height <= view.height * 0.5) return rect.top
        }
      }
      return null
    }

    /**
     * The room the host leaves a card: inside the conversation column, above the
     * composer. An edge the page does not show stays null, and a null edge caps
     * nothing — a page without messages or without a composer behaves as before.
     *
     * @param {Element|null|undefined} card - the card being measured.
     * @returns {{ right: number|null, bottom: number|null }|null} the edges to stop before.
     */
    function cardRoomOf(card) {
      const column = columnRectOf(card)
      const bottom = pinnedTopOf(card)
      if (column === null && bottom === null) return null
      return { right: column === null ? null : column.right, bottom }
    }

    /**
     * Where a card may be and how big it may get: the window, narrowed by the
     * container that clips it (the host's centre column does).
     * @param {{ width: number, height: number }} viewport - window size.
     * @param {{ left: number, top: number, right: number, bottom: number }|null} container - clipping rect.
     * @param {{ right?: number|null, bottom?: number|null }} [room] - the conversation column and the composer, over the page.
     * @returns {{ left: number, top: number, right: number, bottom: number, minW: number, minH: number, maxW: number, maxH: number }} limits.
     */
    function cardLimits(viewport, container, room) {
      const viewLeft = 0
      const viewTop = 0
      const viewRight = viewport?.width > 0 ? viewport.width : Infinity
      const viewBottom = viewport?.height > 0 ? viewport.height : Infinity
      const left = container === null || container === undefined ? viewLeft : Math.max(viewLeft, container.left)
      const top = container === null || container === undefined ? viewTop : Math.max(viewTop, container.top)
      // The composer and the rail beside the conversation are not clipping
      // containers, but the card must stop before them: a control under the
      // rail cannot be clicked and a title bar under the composer cannot be
      // grabbed back. The clip rect alone misses both — it is the scrolled
      // content box, so its bottom edge travels with the conversation.
      const columnRight = typeof room?.right === 'number' && room.right > 0 ? room.right : Infinity
      const composerTop = typeof room?.bottom === 'number' && room.bottom > 0 ? room.bottom : Infinity
      const right = Math.min(container === null || container === undefined ? viewRight : Math.min(viewRight, container.right), columnRight)
      const bottom = Math.min(container === null || container === undefined ? viewBottom : Math.min(viewBottom, container.bottom), composerTop)
      const usableW = Math.max(right - left - CARD_EDGE * 2, 1)
      const usableH = Math.max(bottom - top - CARD_EDGE * 2, 1)
      // Both axes also respect the window itself: a container that reaches past
      // the viewport edge (the host's column starts at x=0 while its overlay is
      // inset) must not hand the card a width that pokes out of the screen.
      const widthRoom = viewport?.width > 0 ? Math.max(viewport.width - CARD_EDGE * 2, 1) : Infinity
      const windowRoom = viewport?.height > 0 ? Math.max(viewport.height - CARD_VIEWPORT_SLACK, 1) : Infinity
      const maxW = Math.min(usableW, widthRoom)
      const maxH = Math.max(Math.min(usableH, windowRoom), 1)
      return {
        left: left + CARD_EDGE,
        top: top + CARD_EDGE,
        right: right - CARD_EDGE,
        bottom: bottom - CARD_EDGE,
        minW: Math.min(CARD_MIN_W, maxW),
        minH: Math.min(CARD_MIN_H, maxH),
        maxW,
        maxH,
      }
    }

    /** The card's rect with the current offset taken back out, so maths starts from base. */
    function cardFrameOf(rect, box) {
      return {
        left: (rect?.left ?? 0) - (box?.dx ?? 0),
        top: (rect?.top ?? 0) - (box?.dy ?? 0),
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      }
    }

    /**
     * Move the card by a pointer travel, stopped so `CARD_KEEP_W/H` stays reachable.
     * @param {CardBox} box - geometry at gesture start.
     * @param {{ x: number, y: number }} delta - travel since the gesture started.
     * @param {{ left: number, top: number, width: number, height: number }} rect - base rect.
     * @param {object} limits - from `cardLimits()`.
     * @returns {CardBox} the moved box.
     */
    function dragBox(box, delta, rect, limits) {
      const width = box.w ?? rect.width
      const height = box.h ?? rect.height
      const left = clampNumber(
        rect.left + box.dx + delta.x,
        limits.left - width + CARD_KEEP_W,
        limits.right - CARD_KEEP_W,
      )
      // Vertically the card may hang off the bottom, but its top edge never
      // leaves the container: the title bar is the only way to grab it back, so
      // a card whose bar is off screen could never be recovered.
      const top = clampNumber(
        rect.top + box.dy + delta.y,
        limits.top,
        limits.bottom - CARD_KEEP_H,
      )
      return { ...box, dx: Math.round(left - rect.left), dy: Math.round(top - rect.top) }
    }

    /**
     * Stretch the card from one edge or corner; the opposite edge stays put.
     * @param {CardBox} box - geometry at gesture start.
     * @param {string} dir - edge letters, e.g. `e`, `sw`, `ne`.
     * @param {{ x: number, y: number }} delta - travel since the gesture started.
     * @param {{ left: number, top: number, width: number, height: number }} rect - base rect.
     * @param {object} limits - from `cardLimits()`.
     * @returns {CardBox} the resized box.
     */
    function resizeBox(box, dir, delta, rect, limits) {
      let left = rect.left + box.dx
      let top = rect.top + box.dy
      let right = left + (box.w ?? rect.width)
      let bottom = top + (box.h ?? rect.height)
      if (dir.includes('e')) right = clampNumber(right + delta.x, left + limits.minW, Math.min(limits.right, left + limits.maxW))
      if (dir.includes('w')) left = clampNumber(left + delta.x, Math.max(limits.left, right - limits.maxW), right - limits.minW)
      if (dir.includes('s')) bottom = clampNumber(bottom + delta.y, top + limits.minH, Math.min(limits.bottom, top + limits.maxH))
      if (dir.includes('n')) top = clampNumber(top + delta.y, Math.max(limits.top, bottom - limits.maxH), bottom - limits.minH)
      // Only pin the axis this edge actually controls; the other one keeps
      // following the content the way it did before the gesture.
      const movesW = dir.includes('e') || dir.includes('w')
      const movesH = dir.includes('n') || dir.includes('s')
      return {
        w: movesW || box.w !== null ? Math.round(right - left) : null,
        h: movesH || box.h !== null ? Math.round(bottom - top) : null,
        dx: Math.round(left - rect.left),
        dy: Math.round(top - rect.top),
      }
    }

    /** Shrink and move a card back inside the limits, e.g. after the window shrank. */
    function fitBox(box, rect, limits) {
      // A size the user chose is clamped; a card still at its CSS size keeps
      // that size (the stylesheet already fits it to the viewport).
      const width = box.w === null || box.w === undefined ? rect.width : clampNumber(box.w, limits.minW, limits.maxW)
      const height = box.h === null || box.h === undefined ? rect.height : clampNumber(box.h, limits.minH, limits.maxH)
      // A shrunken window should show the whole card, not the 96px a drag leaves.
      const left = clampNumber(rect.left + box.dx, limits.left, Math.max(limits.left, limits.right - width))
      const top = clampNumber(rect.top + box.dy, limits.top, Math.max(limits.top, limits.bottom - height))
      return {
        w: box.w === null || box.w === undefined ? null : Math.round(width),
        h: box.h === null || box.h === undefined ? null : Math.round(height),
        dx: Math.round(left - rect.left),
        dy: Math.round(top - rect.top),
      }
    }

    /**
     * Push a card down while the host's own chrome covers its title bar.
     *
     * The bar is the only move handle, so a bar behind a sticky header would
     * strand the card: the numbers alone cannot see the header, a hit test can.
     * It repeats, because the chrome at the top is often more than one layer.
     */
    function revealTitleBar(card, box, rect, limits) {
      if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') return box
      const bar = typeof card?.querySelector === 'function' ? card.querySelector('.clipchat-card__bar') : null
      if (bar === null || bar === undefined || typeof bar.getBoundingClientRect !== 'function') return box
      let next = box
      for (let attempt = 0; attempt < CARD_REVEAL_ATTEMPTS; attempt += 1) {
        const barRect = bar.getBoundingClientRect()
        if (barRect.width <= 0 || barRect.height <= 0) return next
        // Sample the part of the bar that is inside the visible area: a card
        // dragged half off the left edge has its centre off screen, and a hit
        // test out there answers null instead of "the header covers it".
        const sampleLeft = Math.max(barRect.left, limits.left)
        const sampleRight = Math.min(barRect.right, limits.right)
        const sampleTop = Math.max(barRect.top, limits.top)
        if (sampleRight - sampleLeft < 4 || sampleTop > limits.bottom) return next
        const hit = document.elementFromPoint((sampleLeft + sampleRight) / 2, sampleTop + barRect.height / 2)
        if (hit === null || hit === undefined || typeof hit.closest !== 'function' || hit.closest('.clipchat-card') !== null) return next
        const cover = typeof hit.getBoundingClientRect === 'function' ? hit.getBoundingClientRect() : null
        if (cover === null || cover.height <= 0) return next
        const shift = cover.bottom - barRect.top + CARD_EDGE
        if (shift <= 0) return next
        const shifted = dragBox(next, { x: 0, y: shift }, rect, limits)
        if (shifted.dy === next.dy) return next
        next = shifted
        // Paint the intermediate place: the next hit test has to see it.
        card.style.transform = boxStyleOf(next)?.transform ?? ''
      }
      return next
    }

    /** Inline style for a card box; nothing until the user has moved or resized it. */
    function boxStyleOf(box) {
      const style = {}
      if (typeof box?.w === 'number') style.width = `${box.w}px`
      if (typeof box?.h === 'number') {
        style.height = `${box.h}px`
        // Only a height the user chose lifts the stylesheet's cap. A card whose
        // width alone was pinned still grows with its answer, and it has to stop
        // at the same `min(520px, 64vh)` a fresh card does: clearing the cap for
        // a width-only card let a long answer run it off the bottom of the
        // window (measured 1595px tall on a 900px viewport).
        style.maxHeight = 'none'
      }
      if (box?.dx !== 0 || box?.dy !== 0) style.transform = `translate3d(${box.dx}px, ${box.dy}px, 0)`
      return Object.keys(style).length === 0 ? undefined : style
    }

    /** The cursor a live gesture holds, so it does not flicker as the pointer travels. */
    function cursorOfGesture(kind, dir) {
      if (kind === 'move') return 'grabbing'
      if (dir === 'n' || dir === 's') return 'ns-resize'
      if (dir === 'e' || dir === 'w') return 'ew-resize'
      if (dir === 'ne' || dir === 'sw') return 'nesw-resize'
      return 'nwse-resize'
    }

    /**
     * Whether a press belongs to a control rather than to the card's geometry.
     *
     * The resize hot areas are invisible overlays above the card's own content,
     * so one that reached a button would take the press before the button ever
     * saw it — which is exactly how the top-right corner used to swallow the
     * close click. No hot area sits over a button any more; this is the runtime
     * guard for the rest: a press on a control starts no gesture and keeps its
     * click, wherever it came from.
     *
     * @param {EventTarget|null|undefined} target - the element under the pointer.
     * @returns {boolean} whether the press is the control's, not the card's.
     */
    function pressOwnedByControl(target) {
      return target instanceof Element && target.closest('button, a, input, textarea, select') !== null
    }

    /** Stored highlights keyed by id: `{ id, anchor, createdAt }`. */
    const highlights = new Map()
    let pendingHighlightId = null
    /** Until when the eased scroll owns the column's `scrollTop`. */
    let scrollBusyUntil = 0
    /** Highlight whose underline should flash on the next render. */
    let pendingFlashId = null
    let nextHighlightId = 1

    /** Stored records of the loaded session, keyed by id. */
    const records = new Map()
    let nextRecordId = 1
    let nextComposerId = 1
    let loadedSessionId = null
    let loadToken = 0
    let sessionTimer
    let applying = false
    let observer = null
    let observerTimer
    let observerOptions = { childList: true, subtree: true, characterData: true }

    /**
     * Whether two spans of one node cover any of the same characters.
     *
     * Two selections of "the same passage" are rarely identical: a drag can end
     * one character early, and re-selecting after a reload lands on slightly
     * different offsets. Treating only exact text as the same passage created a
     * second highlight — and a second record — for what the reader sees as one.
     *
     * @param {object} left - one anchor.
     * @param {object} right - another anchor.
     * @returns {boolean} whether they overlap.
     */
    function anchorsOverlap(left, right) {
      if (left?.nodeKey !== right?.nodeKey) return false
      const leftSpans = Array.isArray(left?.spans) ? left.spans : []
      const rightSpans = Array.isArray(right?.spans) ? right.spans : []
      for (const a of leftSpans) {
        for (const b of rightSpans) {
          if (a.blockIndex !== b.blockIndex) continue
          if (a.start < b.end && b.start < a.end) return true
        }
      }
      return false
    }

    /** @returns {string | null} id of the highlight covering this exact passage. */
    function highlightIdOf(nodeKey, text) {
      for (const [id, entry] of highlights) {
        const anchor = entry?.anchor
        if (anchor?.nodeKey === nodeKey && anchor.text === text) return id
      }
      return null
    }

    /**
     * Highlight covering this passage, by exact text first and then by overlap.
     *
     * @param {string} nodeKey - chat node key.
     * @param {string} text - selected text.
     * @param {object | null} [anchor] - the live selection's anchor, when known.
     * @returns {string | null} the highlight id, or null.
     */
    function highlightIdFor(nodeKey, text, anchor = null) {
      const exact = highlightIdOf(nodeKey, text)
      if (exact !== null) return exact
      if (anchor === null || anchor === undefined) return null
      for (const [id, entry] of highlights) {
        if (anchorsOverlap(entry?.anchor, anchor)) return id
      }
      return null
    }

    /** @returns {boolean} whether this passage already has a highlight. */
    function hasHighlight(nodeKey, text, anchor = null) {
      return highlightIdFor(nodeKey, text, anchor) !== null
    }

    /**
     * Copy one complete model route, or null when the shape is incomplete.
     * @param {unknown} value - route from the catalog, a stored highlight or state.
     * @returns {{ provider: string, model: string, reasoningEffort?: string } | null} route.
     */
    function normalizeModelRoute(value) {
      if (value === null || typeof value !== 'object') return null
      if (typeof value.provider !== 'string' || value.provider.length === 0) return null
      if (typeof value.model !== 'string' || value.model.length === 0) return null
      return typeof value.reasoningEffort === 'string' && value.reasoningEffort.length > 0
        ? { provider: value.provider, model: value.model, reasoningEffort: value.reasoningEffort }
        : { provider: value.provider, model: value.model }
    }

    /**
     * Stable select value of one route; the follow choice uses its own key.
     * @param {unknown} value - route, or null for follow.
     * @returns {string} option value.
     */
    function modelKeyOf(value) {
      const route = normalizeModelRoute(value)
      return route === null ? FOLLOW_MODEL : `${route.provider}\u0000${route.model}`
    }

    /**
     * Menu entries: follow first, then the catalog, then the active selection
     * when the catalog does not advertise it (listing failed or went stale).
     * @param {unknown} models - `/models` entries.
     * @param {unknown} selected - the card's current route, or null for follow.
     * @returns {Array<{ key: string, provider: string | null, model: string | null, name: string | null }>} choices.
     */
    function modelChoicesOf(models, selected) {
      const choices = [{ key: FOLLOW_MODEL, provider: null, model: null, name: null }]
      const seen = new Set([FOLLOW_MODEL])
      const add = (entry) => {
        const route = normalizeModelRoute(entry)
        if (route === null) return
        const key = modelKeyOf(route)
        if (seen.has(key)) return
        seen.add(key)
        const name = entry !== null && typeof entry === 'object'
          && typeof entry.name === 'string' && entry.name.trim().length > 0
          ? entry.name
          : route.model
        choices.push({ key, provider: route.provider, model: route.model, name })
      }
      for (const entry of Array.isArray(models) ? models : []) add(entry)
      add(selected)
      return choices
    }

    /**
     * Model saved on the highlight covering this exact passage, if any.
     * @param {string} nodeKey - chat node key.
     * @param {string} text - selected passage text.
     * @returns {{ provider: string, model: string, reasoningEffort?: string } | null} stored route.
     */
    function storedModelOf(nodeKey, text) {
      const id = highlightIdOf(nodeKey, text)
      if (id === null) return null
      return normalizeModelRoute(highlights.get(id)?.model)
    }

    /** A client-generated id; the host stores it verbatim. */
    function newHighlightId() {
      return `h${Date.now().toString(36)}${(nextHighlightId++).toString(36)}`
    }

    /** Session id for a write: the visible conversation, then the card's own. */
    function writeSessionId(fallback) {
      const live = currentSessionIdOf()
      if (typeof live === 'string' && live.length > 0) return live
      return typeof fallback === 'string' && fallback.length > 0 ? fallback : null
    }

    /**
     * Persist one add/remove; a failed write keeps the local highlight visible.
     * @param {'add' | 'remove'} op - store operation.
     * @param {object} payload - the highlight entry, or `{ id }` for removals.
     * @param {string} [fallbackSessionId] - card session id when the DOM has none.
     */
    async function persistHighlight(op, payload, fallbackSessionId) {
      const sessionId = writeSessionId(fallbackSessionId)
      if (sessionId === null || typeof fetch !== 'function') return
      try {
        const response = await fetch(HIGHLIGHT_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, op, highlight: payload }),
        })
        if (response.ok !== true) throw new Error(`status ${response.status}`)
      } catch (error) {
        console.warn('dsh-clipchat: highlight was not saved', error)
      }
    }

    /** A client-generated record id; the host stores it verbatim. */
    function newRecordId() {
      return `r${Date.now().toString(36)}${(nextRecordId++).toString(36)}`
    }

    /**
     * A short id for one composer item (a folded paste or an attachment).
     * @param {string} prefix - one letter naming the kind of item.
     * @returns {string} an id unique within this page.
     */
    function newComposerId(prefix) {
      return `${prefix}${Date.now().toString(36)}${(nextComposerId++).toString(36)}`
    }

    function isRecordText(value) {
      return typeof value === 'string' && value.trim().length > 0
    }

    /**
     * Normalize one usage pair from an SSE frame or the card's token state.
     * @param {unknown} value - `{ input, output }` or `{ inputTokens, outputTokens }`.
     * @returns {{ input: number, output: number } | null} usage, or null when unusable.
     */
    function normalizeUsage(value) {
      if (value === null || typeof value !== 'object') return null
      const pick = (primary, fallback) => Number.isFinite(primary)
        ? primary
        : Number.isFinite(fallback) ? fallback : null
      const input = pick(value.input, value.inputTokens)
      const output = pick(value.output, value.outputTokens)
      if (input === null || output === null || input < 0 || output < 0) return null
      return { input, output }
    }

    /**
     * Add two usage pairs; null on either side counts as zero.
     * @param {{ input: number, output: number } | null} a - first usage.
     * @param {{ input: number, output: number } | null} b - second usage.
     * @returns {{ input: number, output: number } | null} sum, or null when both are missing.
     */
    function addUsage(a, b) {
      if (a === null && b === null) return null
      return {
        input: (a?.input ?? 0) + (b?.input ?? 0),
        output: (a?.output ?? 0) + (b?.output ?? 0),
      }
    }

    /**
     * Usage shown on a card opened from a stored record: the sum of every round
     * in it, not just the newest one.
     * @param {{ turns?: Array<{ usage?: unknown }> } | null} record - recalled record.
     * @returns {{ input: number, output: number } | null} total usage or null.
     */
    function initialTokensOf(record) {
      const turns = Array.isArray(record?.turns) ? record.turns : []
      let total = null
      for (const turn of turns) total = addUsage(total, normalizeUsage(turn?.usage))
      return total
    }

    /** Validate one stored turn, keeping only the fields worth persisting. */
    function normalizeTurn(input) {
      if (input === null || typeof input !== 'object') return null
      if (!isRecordText(input.question) || input.question.length > 20000) return null
      if (!isRecordText(input.answer) || input.answer.length > 512 * 1024) return null
      if (!isRecordText(input.provider) || !isRecordText(input.model)) return null
      // A present but non-numeric timestamp is a caller mistake, not a default.
      if (input.createdAt !== undefined && !Number.isFinite(input.createdAt)) return null
      const usage = input.usage === undefined ? null : normalizeUsage(input.usage)
      if (input.usage !== undefined && usage === null) return null
      const turn = {
        question: input.question,
        answer: input.answer,
        provider: input.provider,
        model: input.model,
        createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
      }
      if (usage !== null) turn.usage = usage
      return turn
    }

    /**
     * Build one persisted record, or null when the shape is unusable.
     *
     * A record belongs to one highlight and holds every question asked about
     * it, so `turns` is the canonical field. A legacy entry that still carries
     * a top-level question/answer is folded into a single turn.
     *
     * @param {object} input - stored entry or freshly assembled record.
     * @returns {object | null} the record, or null when it cannot be stored.
     */
    function buildRecord(input) {
      if (input === null || typeof input !== 'object') return null
      if (!isRecordText(input.selection) || input.selection.length > 4000) return null

      const source = Array.isArray(input.turns) ? input.turns : [input]
      const turns = []
      for (const raw of source) {
        const turn = normalizeTurn(raw)
        if (turn === null) return null
        turns.push(turn)
      }
      if (turns.length === 0) return null

      const first = turns[0].createdAt
      const last = turns.reduce((newest, turn) => Math.max(newest, turn.createdAt), first)
      const entry = {
        id: isRecordText(input.id) ? input.id : newRecordId(),
        selection: input.selection,
        turns,
        createdAt: first,
        updatedAt: last,
      }
      if (isRecordText(input.highlightId)) entry.highlightId = input.highlightId
      return entry
    }

    /**
     * Append one turn to a record, or start a new one.
     *
     * The record is keyed by its highlight, so asking twice about the same
     * passage updates one record instead of adding a second.
     *
     * @param {object | null} existing - the record already stored for this highlight.
     * @param {object} turn - validated turn.
     * @param {string} selection - the passage text.
     * @param {string} [highlightId] - the highlight this record belongs to.
     * @returns {object | null} the record to persist.
     */
    function recordWithTurn(existing, turn, selection, highlightId) {
      const turns = Array.isArray(existing?.turns) ? [...existing.turns, turn] : [turn]
      return buildRecord({
        id: existing?.id,
        highlightId: highlightId ?? existing?.highlightId,
        selection,
        turns,
      })
    }

    /**
     * Drop the newest turn of a record.
     *
     * Cancelling 记录 removes the answer just kept, not every answer ever asked
     * about that passage, so the record survives while it still has turns.
     *
     * @param {object | null} record - stored record.
     * @returns {object | null} the record without its newest turn, or null when it would be empty.
     */
    function recordWithoutLastTurn(record) {
      const turns = Array.isArray(record?.turns) ? record.turns.slice(0, -1) : []
      if (turns.length === 0) return null
      return buildRecord({ ...record, turns })
    }

    /** @returns {number} how many records the loaded session has. */
    function recordCount() {
      return records.size
    }

    /** @returns {Array<object>} the loaded session's records, oldest first. */
    function recordList() {
      return [...records.values()].sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
    }

    /**
     * Whether a record belongs to the card's current selection (the 当前选段 tag).
     * @param {unknown} record - one stored record.
     * @param {unknown} selection - the card's selection text.
     * @returns {boolean} whether the tag applies.
     */
    function isCurrentSelection(record, selection) {
      if (record === null || typeof record !== 'object') return false
      if (typeof selection !== 'string' || selection.length === 0) return false
      return typeof record.selection === 'string' && record.selection === selection
    }

    /**
     * Persist one record add/remove; a failed write keeps the local record.
     * @param {'add' | 'remove'} op - store operation.
     * @param {object} payload - the record entry, or `{ id }` for removals.
     * @param {string} [fallbackSessionId] - card session id when the DOM has none.
     */
    async function persistRecord(op, payload, fallbackSessionId) {
      const sessionId = writeSessionId(fallbackSessionId)
      if (sessionId === null || typeof fetch !== 'function') return
      try {
        const response = await fetch(RECORD_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, op, record: payload }),
        })
        if (response.ok !== true) throw new Error(`status ${response.status}`)
      } catch (error) {
        console.warn('dsh-clipchat: record was not saved', error)
      }
    }

    /**
     * Store one record in memory, then persist it.
     * @param {object} entry - record built by {@link buildRecord}.
     * @param {string} [fallbackSessionId] - card session id when the DOM has none.
     * @returns {string | null} record id, or null when the entry is unusable.
     */
    function addRecord(entry, fallbackSessionId) {
      if (entry === null || typeof entry !== 'object') return null
      if (!isRecordText(entry.id)) return null
      records.set(entry.id, entry)
      void persistRecord('add', entry, fallbackSessionId)
      return entry.id
    }

    /**
     * Drop one record from memory and persist the removal.
     * @param {string} id - record id.
     * @param {string} [fallbackSessionId] - card session id when the DOM has none.
     * @returns {boolean} whether it existed.
     */
    function removeRecord(id, fallbackSessionId) {
      const removed = records.delete(id)
      if (removed) void persistRecord('remove', { id }, fallbackSessionId)
      return removed
    }

    /**
     * Store one highlight locally, then persist it.
     * @param {ReturnType<typeof anchorFromSelection>} anchor - captured anchor.
     * @param {unknown} [model] - model route to save with the highlight.
     * @returns {string | null} highlight id.
     */
    function addHighlight(anchor, model = null) {
      if (anchor === null) return null
      if (hasHighlight(anchor.nodeKey, anchor.text, anchor)) return null
      const entry = {
        id: newHighlightId(),
        anchor: Object.assign({}, anchor),
        createdAt: Date.now(),
      }
      const route = normalizeModelRoute(model)
      if (route !== null) entry.model = route
      highlights.set(entry.id, entry)
      scheduleRender()
      void persistHighlight('add', entry)
      return entry.id
    }

    /**
     * Drop one highlight from memory and redraw.
     * @param {string} id - highlight id.
     * @returns {boolean} whether it existed.
     */
    function removeHighlight(id) {
      const removed = highlights.delete(id)
      if (removed) renderAll()
      return removed
    }

    /**
     * Replace the in-memory store with the visible session's persisted state.
     * The old overlay is cleared before the request so a switch never flashes
     * the previous conversation's marks.
     * @param {string | null} sessionId - conversation to load.
     */
    async function loadSession(sessionId) {
      const token = ++loadToken
      const switched = loadedSessionId !== (sessionId ?? null)
      loadedSessionId = sessionId ?? null
      // A different session must not keep the old underlines on screen, but the
      // same session must not lose them while its state is being re-read: the
      // overlay would blink empty on every refresh. Only a real switch clears.
      if (switched) {
        highlights.clear()
        records.clear()
        renderAll()
      }
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        highlights.clear()
        records.clear()
        renderAll()
        return
      }
      if (typeof fetch !== 'function') return
      try {
        const response = await fetch(`${SESSION_PATH}?sessionId=${encodeURIComponent(sessionId)}`)
        if (token !== loadToken) return
        if (response.ok !== true) throw new Error(`status ${response.status}`)
        const payload = await response.json()
        if (token !== loadToken) return
        highlights.clear()
        records.clear()
        for (const entry of Array.isArray(payload?.records) ? payload.records : []) {
          if (entry === null || typeof entry !== 'object') continue
          if (typeof entry.id !== 'string' || entry.id.length === 0) continue
          const stored = buildRecord(entry)
          if (stored !== null) records.set(stored.id, stored)
        }
        for (const entry of Array.isArray(payload?.highlights) ? payload.highlights : []) {
          if (entry === null || typeof entry !== 'object') continue
          if (typeof entry.id !== 'string' || entry.anchor === null || typeof entry.anchor !== 'object') continue
          const stored = {
            id: entry.id,
            anchor: entry.anchor,
            createdAt: entry.createdAt,
          }
          const model = normalizeModelRoute(entry.model)
          if (model !== null) stored.model = model
          highlights.set(entry.id, stored)
        }
        renderAll()
      } catch (error) {
        if (token !== loadToken) return
        console.warn('dsh-clipchat: session highlights were not loaded', error)
      }
    }

    /** Load the visible session's highlights when the conversation changes. */
    function maybeLoadSession() {
      const sessionId = currentSessionIdOf()
      if (sessionId === loadedSessionId) return undefined
      return loadSession(sessionId)
    }

    /** Debounced session-switch detection driven by the chat observer. */
    function scheduleSessionCheck() {
      if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return
      if (sessionTimer !== undefined) return
      sessionTimer = window.setTimeout(() => {
        sessionTimer = undefined
        void maybeLoadSession()
      }, 100)
    }

    /** Ensure the overlay layer inside one chat column. */
    function layerFor(column) {
      let layer = column.querySelector(':scope > .clipchat-layer')
      if (layer === null) {
        layer = document.createElement('div')
        layer.className = 'clipchat-layer'
        column.appendChild(layer)
      }
      return layer
    }

    /** Build a DOM range for one block-local span. */
    function rangeForSpan(block, start, end) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      const nodes = []
      let total = 0
      while (walker.nextNode()) {
        const node = walker.currentNode
        nodes.push({ node, start: total, length: node.data.length })
        total += node.data.length
      }
      if (nodes.length === 0) return null
      const pointAt = (offset) => {
        for (const entry of nodes) {
          if (offset <= entry.start + entry.length) {
            return { node: entry.node, offset: Math.max(0, offset - entry.start) }
          }
        }
        const last = nodes[nodes.length - 1]
        return { node: last.node, offset: last.length }
      }
      const from = pointAt(start)
      const to = pointAt(end)
      try {
        const range = document.createRange()
        range.setStart(from.node, from.offset)
        range.setEnd(to.node, to.offset)
        return range
      } catch {
        return null
      }
    }

    /** Every rendered element carrying one chat node key, safely. */
    function nodesFor(nodeKey) {
      try {
        return document.querySelectorAll(`[data-chat-node-key="${nodeKey.replace(/["\\]/g, '\\$&')}"]`)
      } catch {
        return []
      }
    }

    /** Re-anchor one span when the block text changed; returns null when it cannot. */
    function resolvedSpanAt(blockText, span, text) {
      if (blockText.slice(span.start, span.end) === text) return span
      let index = blockText.indexOf(text)
      if (index < 0) index = blockText.indexOf(text.slice(0, 24))
      if (index < 0) return null
      return { blockIndex: span.blockIndex, start: index, end: index + text.length }
    }

    /** Newest record for one highlight, falling back to the same selected text. */
    function recordForHighlight(highlightId, text) {
      const entries = [...records.values()]
        .filter((entry) => entry.highlightId === highlightId || entry.selection === text)
        .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0))
      return entries.length === 0 ? null : entries[entries.length - 1]
    }

    /**
     * Highlight covering the passage a record was kept from, if it still exists.
     * Newer records carry the id; older ones only match by their selection text.
     * @param {{ highlightId?: string, selection?: string } | null} record - stored record.
     * @returns {string | null} highlight id.
     */
    function highlightIdOfRecord(record) {
      if (record === null || record === undefined || typeof record !== 'object') return null
      if (typeof record.highlightId === 'string' && highlights.has(record.highlightId)) return record.highlightId
      if (typeof record.selection !== 'string' || record.selection.length === 0) return null
      for (const [id, entry] of highlights) {
        if (entry?.anchor?.text === record.selection) return id
      }
      return null
    }

    /**
     * Turn number encoded in a chat node key.
     *
     * `14:assistant-step22:51` belongs to turn 22, not 14: the leading segment
     * is a sequence and the `assistant-stepN` segment is the turn. Parsing the
     * step number works even when the node is not mounted, which the DOM lookup
     * cannot do, so this is the fallback that makes old highlights locatable.
     *
     * @param {unknown} nodeKey - chat node key.
     * @returns {number | null} the turn, or null when the key has no turn.
     */
    function turnOfNodeKey(nodeKey) {
      if (typeof nodeKey !== 'string') return null
      const step = /assistant-step(\d+)/u.exec(nodeKey)
      const raw = step === null ? nodeKey.slice(0, nodeKey.indexOf(':')) : step[1]
      const turn = Number.parseInt(raw, 10)
      return Number.isInteger(turn) && turn > 0 ? turn : null
    }

    /**
     * Turn number a mounted chat node belongs to.
     *
     * The host stamps `data-chat-turn` on the wrapper around a step, which is
     * the only reliable source: the node key prefix is a sequence and the
     * `assistant-stepN` segment is the step, not the turn.
     *
     * @param {string} nodeKey - chat node key.
     * @returns {number | null} the turn, or null when the node is not mounted.
     */
    function turnOfNode(nodeKey) {
      if (typeof document === 'undefined' || typeof nodeKey !== 'string') return null
      for (const node of nodesFor(nodeKey)) {
        const owner = node.closest('[data-chat-turn]')
        const turn = Number.parseInt(owner?.getAttribute('data-chat-turn') ?? '', 10)
        if (Number.isInteger(turn) && turn > 0) return turn
      }
      return null
    }

    /**
     * Turn number of the first mounted assistant passage that contains `text`.
     *
     * Anchors survive a reload by key, but a rebuilt chat can hand the same
     * passage a different key. Matching the text is the last resort before
     * giving up, and it keeps old highlights locatable.
     *
     * @param {string} text - passage text.
     * @returns {number | null} the turn, or null when no mounted node matches.
     */
    function turnOfText(text) {
      if (typeof document === 'undefined' || typeof text !== 'string' || text.length === 0) return null
      const needle = text.slice(0, 32)
      for (const node of document.querySelectorAll('[data-chat-node-key]')) {
        if (!/assistant-step/u.test(node.getAttribute('data-chat-node-key') ?? '')) continue
        const source = node.querySelector('[data-text-interaction-source]')
        if (source === null || !(source.textContent ?? '').includes(needle)) continue
        const turn = Number.parseInt(node.closest('[data-chat-turn]')?.getAttribute('data-chat-turn') ?? '', 10)
        if (Number.isInteger(turn) && turn > 0) return turn
      }
      return null
    }

    /**
     * Ask the host to bring one turn into view.
     *
     * The chat list is virtualised: assigning `scrollTop` is reverted by the
     * virtualizer on its next frame, so the only stable way to move the
     * viewport is the host's own turn navigation, which also loads a turn that
     * is not mounted yet. "加载并跳转" is the unloaded-turn variant of the same
     * control and is only used when the plain one is absent.
     *
     * @param {number} turn - turn number.
     * @returns {'jump' | 'load' | null} which control was used.
     */
    function navigateToTurn(turn) {
      if (typeof document === 'undefined' || !Number.isInteger(turn)) return null
      const wanted = `第 ${turn} 轮`
      let fallback = null
      for (const button of document.querySelectorAll('button')) {
        const label = button.getAttribute('aria-label') ?? button.getAttribute('title') ?? ''
        if (!label.includes(wanted)) continue
        if (label === `跳转到${wanted}`) {
          button.click()
          return 'jump'
        }
        if (fallback === null && label.includes('加载并跳转')) fallback = button
      }
      if (fallback === null) return null
      fallback.click()
      return 'load'
    }

    /**
     * Scroll the turn rail so the mark for `turn` is rendered.
     *
     * The rail virtualises its own marks: a turn far from the rail's current
     * offset has no button in the DOM at all, so `navigateToTurn` cannot see
     * the control it is supposed to click. Walking upwards to the rail's
     * scroll container and deriving the fixed pitch from one rendered mark
     * keeps this independent of the host's generated class names.
     *
     * @param {number} turn - turn whose mark should be rendered.
     * @returns {boolean} whether the rail was scrolled or the mark already exists.
     */
    function scrollRailToTurn(turn) {
      if (typeof document === 'undefined' || !Number.isInteger(turn) || turn < 1) return false
      const marks = [...document.querySelectorAll('button[data-index][aria-label*="轮"]')]
      if (marks.length === 0) return false
      const wanted = `第 ${turn} 轮`
      if (marks.some((mark) => (mark.getAttribute('aria-label') ?? '').includes(wanted))) return true
      const anchor = marks[0]
      let scroller = anchor.parentElement
      while (scroller !== null) {
        const style = getComputedStyle(scroller)
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll')
          && scroller.scrollHeight > scroller.clientHeight) break
        scroller = scroller.parentElement
      }
      if (scroller === null) return false
      const index = Number.parseInt(anchor.getAttribute('data-index') ?? '', 10)
      const offset = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      const pitch = Number.isInteger(index) && index > 0 && offset > 0 ? offset / index : 10
      scroller.scrollTop = Math.max(0, (turn - 1) * pitch - scroller.clientHeight / 2)
      return true
    }

    /**
     * How far to scroll so one line sits in the middle of the column.
     * @param {Element} line - the underline.
     * @param {Element} scroller - the conversation column.
     * @returns {number | null} pixels to add to `scrollTop`, or null when unmeasurable.
     */
    function centreDeltaOf(line, scroller) {
      const box = line.getBoundingClientRect()
      const view = scroller.getBoundingClientRect()
      if (box.height <= 0) return null
      const delta = box.top - view.top - (scroller.clientHeight - box.height) / 2
      return Number.isFinite(delta) ? delta : null
    }

    /**
     * Ease a scroller by `delta` pixels, with a slight overshoot and settle.
     *
     * A plain `scrollTop += delta` reads as a jump cut. Two things make it feel
     * physical: the motion eases out instead of stopping dead, and it travels a
     * few percent past the target before easing back, the way a heavy sheet
     * settles. The overshoot is capped so a long jump does not fling the view.
     *
     * @param {Element} scroller - the conversation column.
     * @param {number} delta - pixels to travel; positive scrolls down.
     * @param {{ duration?: number, overshoot?: number }} [options] - tuning.
     * @returns {void}
     */
    function animateScroll(scroller, delta, options = {}) {
      if (typeof requestAnimationFrame !== 'function' || Math.abs(delta) < 1) {
        if (Math.abs(delta) >= 1) scroller.scrollTop += delta
        return
      }
      const duration = options.duration ?? 520
      // Claim the column for the duration: the virtualiser and the hold loop
      // both write `scrollTop`, and a write mid-animation shows up as a jump.
      scrollBusyUntil = performance.now() + duration
      // The overshoot is a finish, not a lurch: a small fixed budget that a long
      // jump does not amplify. The settle below is what reads as weight.
      const overshoot = Math.min(options.overshoot ?? 14, Math.abs(delta) * 0.02)
      const start = scroller.scrollTop
      const peak = delta + Math.sign(delta) * overshoot
      const begin = performance.now()

      // Ease-out-quint for the approach, then a short damped return from the
      // overshoot. Splitting the two is what gives the settle its weight.
      const approach = 0.72
      const step = (now) => {
        const elapsed = (now - begin) / duration
        if (elapsed >= 1) {
          scroller.scrollTop = start + delta
          scrollBusyUntil = 0
          return
        }
        let travelled
        if (elapsed < approach) {
          const t = elapsed / approach
          travelled = peak * (1 - (1 - t) ** 5)
        } else {
          const t = (elapsed - approach) / (1 - approach)
          // Back out of the overshoot with a decelerating curve.
          const from = peak
          const settle = 1 - (1 - t) ** 3
          travelled = from + (delta - from) * settle
        }
        scroller.scrollTop = start + travelled
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }

    /**
     * Centre a highlight line in the conversation column.
     *
     * The host centres the whole turn, which can leave a short passage near an
     * edge; this is a small corrective scroll on the column only, and it runs
     * after the host's jump settles so it never fights the virtualizer.
     *
     * @param {Element[]} lines - underline elements of the target highlight.
     * @returns {void}
     */
    function centreInColumn(lines) {
      if (typeof document === 'undefined' || !Array.isArray(lines) || lines.length === 0) return
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (scroller === null || scroller === undefined) return
      const delta = centreDeltaOf(lines[0], scroller)
      if (delta === null) return
      animateScroll(scroller, delta)
    }

    /**
     * Keep a highlight centred for a short while.
     *
     * The chat list is virtualised and re-runs its own scroll correction for a
     * few frames after a jump, so a single `scrollTop` write can be reverted.
     * Re-applying the correction until it sticks is what makes the jump feel
     * reliable; the loop stops as soon as the target is already centred.
     *
     * @param {() => Element[]} linesOf - current underline elements.
     * @param {number} until - timestamp to stop at.
     * @returns {void}
     */
    function holdCentred(linesOf, until) {
      const scroller = document.querySelector('[data-conversation-scroll]')
      if (scroller === null || scroller === undefined) return
      // The virtualiser re-applies its own correction for a few frames after a
      // jump. Instead of snapping back each time, take a fraction of the
      // remaining distance per frame: the two corrections converge instead of
      // fighting, and the view drifts into place rather than twitching.
      const ease = 0.28
      const step = () => {
        // An eased move in flight owns the column; wait for it to land.
        if (performance.now() < scrollBusyUntil) {
          if (Date.now() < until) requestAnimationFrame(step)
          return
        }
        const lines = linesOf()
        const line = lines[0]
        if (line !== undefined) {
          const delta = centreDeltaOf(line, scroller)
          if (delta !== null && Math.abs(delta) > 0.5) {
            scroller.scrollTop += delta * ease
          }
        }
        if (Date.now() < until) requestAnimationFrame(step)
      }
      step()
    }

    /**
     * Bring one stored highlight into view and flash its underline.
     *
     * Order matters: jump first (the host mounts the turn on demand), wait for
     * the underline to exist and have height, centre it, then flash. Flashing
     * before the jump settles leaves the highlight off screen.
     *
     * @param {string} highlightId - stored highlight id.
     * @param {number | null} [turn] - turn from the chat snapshot, when known.
     * @param {(() => void) | null} [onFail] - called when the passage never lays out.
     * @returns {boolean} whether navigation could be started.
     */
    function revealHighlight(highlightId, turn = null, onFail = null) {
      if (typeof document === 'undefined' || typeof highlightId !== 'string') return false
      const anchor = highlights.get(highlightId)?.anchor
      if (anchor === null || anchor === undefined) return false
      const linesOf = () => [...document.querySelectorAll('.clipchat-layer__line')]
        .filter((line) => line.getAttribute('data-clipchat-id') === highlightId)
      const flash = () => {
        pendingFlashId = highlightId
        for (const line of linesOf()) {
          line.classList.remove('is-flash')
          // Restart the animation even when the class was already applied.
          void line.offsetWidth
          line.classList.add('is-flash')
        }
        setTimeout(() => {
          if (pendingFlashId === highlightId) pendingFlashId = null
          for (const line of linesOf()) line.classList.remove('is-flash')
        }, 1600)
      }

      // Order: the mounted DOM (authoritative), the key itself (works while the
      // turn is unmounted), the chat snapshot, then a text match for a node that
      // a rebuilt chat re-keyed.
      const target = turnOfNode(anchor.nodeKey)
        ?? turnOfNodeKey(anchor.nodeKey)
        ?? (Number.isInteger(turn) ? turn : null)
        ?? turnOfText(anchor.text)
      const used = navigateToTurn(target)
      // No jump control means the rail's own virtualisation hid the mark; rolling
      // the rail first is the only way to get one, so only fall back to a plain
      // DOM scroll when there is no rail to roll.
      if (used === null && !scrollRailToTurn(target)) {
        const node = nodesFor(anchor.nodeKey)[0]
        if (node === undefined || typeof node.scrollIntoView !== 'function') return false
        node.scrollIntoView({ block: 'center' })
      }

      // The host scrolls (and may mount the turn) asynchronously; wait for the
      // underline to be laid out before centring and flashing it. An unmounted
      // turn needs the rail rolled and its "load and jump" mark clicked first,
      // so that path gets the longer deadline.
      const deadline = Date.now() + (used === 'jump' ? 3000 : 6000)
      let railClicked = false
      const tick = () => {
        const lines = linesOf()
        const laid = lines.some((line) => line.getBoundingClientRect().height > 0)
        if (!laid && Date.now() < deadline) {
          if (used === null && !railClicked && scrollRailToTurn(target)) {
            // One click only: the mark leaves the DOM once the host starts
            // loading, and clicking every tick would cancel that load.
            if (navigateToTurn(target) !== null) railClicked = true
          }
          setTimeout(tick, 100)
          return
        }
        if (!laid) {
          if (typeof onFail === 'function') onFail()
          return
        }
        holdCentred(linesOf, Date.now() + 900)
        setTimeout(flash, 260)
      }
      setTimeout(tick, 100)
      return true
    }

    /** Select one stored highlight and ask the host surface to open on it. */
    function openHighlight(highlight) {
      const anchor = highlight?.anchor
      if (anchor === null || anchor === undefined) return false
      for (const node of nodesFor(anchor.nodeKey)) {
        const source = node.querySelectorAll('[data-text-interaction-source]')[anchor.sourceIndex ?? 0]
        if (source === undefined) continue
        const blocks = blocksOf(source)
        const span = Array.isArray(anchor.spans) ? anchor.spans[0] : undefined
        const block = span === undefined ? undefined : blocks[span.blockIndex]
        if (block === undefined) continue
        const range = rangeForSpan(block, span.start, span.end)
        if (range === null) continue
        const selection = document.getSelection()
        if (selection === null) return false
        selection.removeAllRanges()
        selection.addRange(range)
        pendingHighlightId = highlight.id
        document.dispatchEvent(new Event('selectionchange'))
        return true
      }
      return false
    }

    /**
     * One band per visual row of a span.
     *
     * `getClientRects()` nests an inline element's border box around the text it
     * holds, so one row of prose with two code pills reports six rects whose
     * bottoms disagree by a few pixels. Underlining every rect drew two green
     * lines on one row, staggered wherever a pill sat. Rects are grouped by the
     * row their centre falls in and folded into one band per row, whose bottom is
     * the lowest edge so the line never crosses a pill's background.
     *
     * @param {DOMRect[]} rects - client rects of one span, in viewport space.
     * @returns {Array<{ left: number, top: number, width: number, height: number }>} one band per row.
     */
    function rowsOfRects(rects) {
      const rows = []
      const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
      for (const rect of sorted) {
        const middle = (rect.top + rect.bottom) / 2
        const row = rows.find((band) => middle > band.bandTop && middle < band.bandBottom)
        if (row === undefined) {
          rows.push({
            bandTop: rect.top,
            bandBottom: rect.bottom,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          })
          continue
        }
        row.left = Math.min(row.left, rect.left)
        row.right = Math.max(row.right, rect.right)
        row.top = Math.min(row.top, rect.top)
        row.bottom = Math.max(row.bottom, rect.bottom)
      }
      return rows.map((band) => ({
        left: band.left,
        top: band.top,
        width: band.right - band.left,
        height: band.bottom - band.top,
      }))
    }

    /** Redraw every highlight as absolutely positioned rects over the chat. */
    function renderAll() {
      if (typeof document === 'undefined' || document.body === null || document.body === undefined
        || typeof document.querySelector !== 'function') return
      const column = document.querySelector('[data-chat-flow]')
      if (column === null) return
      applying = true
      if (observer !== null) observer.disconnect()
      const layer = layerFor(column)
      layer.textContent = ''
      const columnRect = column.getBoundingClientRect()
      const scaleX = column.offsetWidth === 0 ? 1 : columnRect.width / column.offsetWidth
      const scaleY = column.offsetHeight === 0 ? 1 : columnRect.height / column.offsetHeight
      for (const [id, entry] of highlights) {
        const anchor = entry?.anchor
        if (anchor === null || anchor === undefined || typeof anchor.nodeKey !== 'string') continue
        const spans = Array.isArray(anchor.spans) ? anchor.spans : []
        const sourceIndex = Number.isInteger(anchor.sourceIndex) ? anchor.sourceIndex : 0
        const candidates = nodesFor(anchor.nodeKey)
        for (const node of candidates) {
          const source = node.querySelectorAll('[data-text-interaction-source]')[sourceIndex]
          if (source === undefined) continue
          const blocks = blocksOf(source)
          for (const originalSpan of spans) {
            const block = blocks[originalSpan.blockIndex]
            if (block === undefined) continue
            const span = spans.length === 1
              ? resolvedSpanAt(block.textContent, originalSpan, anchor.text)
              : originalSpan
            if (span === null) continue
            const range = rangeForSpan(block, span.start, span.end)
            if (range === null) continue
            const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
            for (const band of rowsOfRects(rects)) {
              const mark = document.createElement('div')
              mark.className = id === pendingFlashId
                ? 'clipchat-layer__line is-flash'
                : 'clipchat-layer__line'
              mark.setAttribute('data-clipchat-id', id)
              mark.style.left = `${(band.left - columnRect.left) / scaleX - column.clientLeft + column.scrollLeft}px`
              mark.style.top = `${(band.top - columnRect.top) / scaleY - column.clientTop + column.scrollTop}px`
              mark.style.width = `${band.width / scaleX}px`
              mark.style.height = `${band.height / scaleY}px`
              layer.appendChild(mark)
            }
          }
          break
        }
      }
      if (observer !== null) observer.observe(document.body, observerOptions)
      applying = false
    }

    /** Debounced, observer-driven re-render. */
    function scheduleRender() {
      if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return
      if (observerTimer !== undefined) return
      observerTimer = window.setTimeout(() => {
        observerTimer = undefined
        renderAll()
      }, 80)
    }

    /** Start observing chat mutations; safe in non-browser harnesses. */
    function ensureObserver() {
      if (typeof MutationObserver !== 'function' || typeof document === 'undefined'
        || document.body === null || document.body === undefined) return
      if (observer !== null) return
      observer = new MutationObserver((records) => {
        if (applying) return
        if (records.every((record) => record.target.nodeType === 1
          && record.target.closest('.clipchat-layer') !== null)) return
        scheduleSessionCheck()
        scheduleRender()
      })
      observer.observe(document.body, observerOptions)
    }

    /** Visible plain text of one assistant node (text blocks only). */
    function assistantTextOf(node) {
      const blocks = node?.data?.blocks
      if (!Array.isArray(blocks)) return ''
      return blocks
        .filter((block) => block !== null && typeof block === 'object'
          && block.kind === 'text' && typeof block.text === 'string' && block.text.trim().length > 0)
        .map((block) => block.text)
        .join('\n\n')
    }

    /** Visible plain text of one user/steering node (text blocks only). */
    function userTextOf(node) {
      const content = node?.content ?? node?.data?.content
      if (!Array.isArray(content)) return ''
      return content
        .filter((block) => block !== null && typeof block === 'object'
          && block.type === 'text' && typeof block.text === 'string' && block.text.trim().length > 0)
        .map((block) => block.text)
        .join('\n\n')
    }

    /**
     * Context around the selected step, for prompts that need the thread of the
     * reply: the turn's user message and up to `radius` settled steps on each
     * side of the selected one.
     * @param {{ nodes: Map<string, object>, locations: { getTurn: Function } } | undefined | null} chat - snapshot slices.
     * @param {string} nodeKey - the selected assistant step.
     * @param {number} [radius] - steps kept on each side.
     * @returns {{ user: string, before: string, after: string }} neighbour text.
     */
    function neighborContextOf(chat, nodeKey, radius = NEIGHBOR_LIMIT) {
      const empty = { user: '', before: '', after: '' }
      if (chat === undefined || chat === null) return empty
      if (typeof chat.nodes?.get !== 'function' || typeof chat.locations?.getTurn !== 'function') return empty
      const target = chat.nodes.get(nodeKey)
      if (target === undefined || target === null) return empty
      const turn = nodeTurn(target)
      const keys = typeof turn === 'number' ? chat.locations.getTurn(turn) : undefined
      if (!Array.isArray(keys)) return empty

      let user = ''
      const steps = []
      for (const key of keys) {
        const node = chat.nodes.get(key)
        if (node === undefined || node === null || node.visibility === 'hidden') continue
        if (node.kind === 'user' || node.kind === 'steering') {
          const text = userTextOf(node)
          if (text.length > 0) user = user.length > 0 ? `${user}\n\n${text}` : text
          continue
        }
        if (node.kind === 'assistant-step' && node.data?.status !== 'running') {
          steps.push({ key, text: assistantTextOf(node) })
        }
      }

      const index = steps.findIndex((step) => step.key === nodeKey)
      if (index < 0) return { user, before: '', after: '' }
      const join = (entries) => entries
        .map((entry) => entry.text)
        .filter((text) => text.length > 0)
        .join('\n\n')
      return {
        user,
        before: join(steps.slice(Math.max(0, index - radius), index)),
        after: join(steps.slice(index + 1, index + 1 + radius)),
      }
    }

    /** Owning turn of a chat node, from either its location or its assistant data. */
    function nodeTurn(node) {
      const fromLocation = node?.location?.turn?.turn
      if (typeof fromLocation === 'number') return fromLocation
      const fromData = node?.data?.turn
      return typeof fromData === 'number' ? fromData : undefined
    }

    /**
     * Collect the last completed turns before the selected node.
     * @param {{ nodes?: { get: Function }, timeline?: { turnOrder?: number[], turns?: Map }, locations?: { getTurn: Function } }} chat - ChatSnapshot slices.
     * @param {string | null} nodeKey - selected node key.
     * @param {number} limit - maximum turns to collect.
     * @returns {Array<{ turn: number, user: string, assistant: string }>} turns, oldest first.
     */
    function recentTurnsOf(chat, nodeKey, limit = RECENT_LIMIT) {
      if (chat === undefined || chat === null) return []
      if (typeof chat.nodes?.get !== 'function' || typeof chat.locations?.getTurn !== 'function') return []
      const target = chat.nodes.get(nodeKey)
      if (target === undefined || target === null) return []
      const targetTurn = nodeTurn(target)
      const turnOrder = Array.isArray(chat.timeline?.turnOrder) ? chat.timeline.turnOrder : []
      const before = typeof targetTurn === 'number'
        ? (turnOrder.indexOf(targetTurn) >= 0
          ? turnOrder.slice(0, turnOrder.indexOf(targetTurn))
          : turnOrder.filter((turn) => turn < targetTurn))
        : turnOrder.slice(0, -1)
      const completed = before.filter((turn) => {
        const location = typeof chat.timeline?.turns?.get === 'function'
          ? chat.timeline.turns.get(turn)
          : undefined
        return location?.status !== 'open'
      })
      const turns = []
      for (const turn of completed.slice(-limit)) {
        const keys = chat.locations.getTurn(turn)
        let user = ''
        let assistant = ''
        for (const key of Array.isArray(keys) ? keys : []) {
          const node = chat.nodes.get(key)
          if (node === undefined || node === null || node.visibility === 'hidden') continue
          if (node.kind === 'assistant-step' && node.data?.status !== 'running') {
            const text = assistantTextOf(node)
            if (text.length > 0) assistant = assistant.length > 0 ? `${assistant}\n\n${text}` : text
          } else if (node.kind === 'user' || node.kind === 'steering') {
            const text = userTextOf(node)
            if (text.length > 0) user = user.length > 0 ? `${user}\n\n${text}` : text
          }
        }
        if (user.length > 0 || assistant.length > 0) turns.push({ turn, user, assistant })
      }
      return turns
    }

    /** Incremental parser for the host's `data: {...}` SSE frames. */
    function createSseDecoder() {
      let buffer = ''
      return {
        /**
         * Feed one decoded chunk.
         * @param {string} chunk - text from the stream.
         * @returns {Array<Record<string, unknown>>} complete frames.
         */
        push(chunk) {
          buffer = `${buffer}${chunk}`.replace(/\r\n/g, '\n')
          const frames = []
          for (;;) {
            const boundary = buffer.indexOf('\n\n')
            if (boundary < 0) break
            const block = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = block
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).replace(/^ /, ''))
              .join('\n')
            if (data.length === 0) continue
            try {
              frames.push(JSON.parse(data))
            } catch {
              /* A malformed frame is dropped; the stream stays usable. */
            }
          }
          return frames
        },
      }
    }

    /** Localized message for one route-level error payload. */
    function errorMessageOf(payload, translate) {
      switch (payload?.error) {
        case 'no-model': return translate('noModel')
        case 'selection-too-long': return translate('selectionTooLong')
        case 'context-too-long': return translate('contextTooLong')
        case 'empty-selection': return translate('noContext')
        case 'llm-unavailable':
        case 'llm-helper-unavailable': return translate('llmUnavailable')
        case 'unauthorized':
        case 'forbidden': return translate('forbidden')
        case 'body-too-large': return translate('contextTooLong')
        case 'invalid-model': return translate('invalidModel')
        case 'empty-answer': return translate('emptyAnswer')
        case 'attachment-too-many':
        case 'attachment-too-large':
        case 'attachment-unreadable': return translate('attachReadFailed')
        default: return typeof payload?.message === 'string' && payload.message.length > 0
          ? payload.message
          : translate('failed')
      }
    }

    /**
     * Rows the toggle's detail popup lists, from the pieces actually sent.
     *
     * The numbers come from the same values the request carries, so the readout
     * never claims something the request does not do. `digest` rows are appended
     * only when detailed mode has a digest to inject.
     *
     * @param {object} input - context pieces.
     * @param {string} input.selection - selected passage.
     * @param {string} input.message - visible text of the selected message.
     * @param {{ user: string, before: string, after: string }} input.neighbors - neighbouring steps.
     * @param {Array<{ user: string, assistant: string }>} input.recent - recent turns.
     * @param {{ turns: number, tools: number, summaryChars: number, chars: number, tokens: number } | null} [input.stats] - digest stats.
     * @returns {{ rows: Array<{ id: string, value: string, isNew?: boolean, isOff?: boolean }>, chars: number, tokens: number }} rows and totals.
     */
    function contextRowsOf({ selection, message, neighbors, recent, stats }) {
      const text = (value) => (typeof value === 'string' ? value.length : 0)
      const recentChars = (Array.isArray(recent) ? recent : [])
        .reduce((total, turn) => total + text(turn?.user) + text(turn?.assistant), 0)
      const neighborChars = text(neighbors?.user) + text(neighbors?.before) + text(neighbors?.after)

      const rows = [
        { id: 'selection', value: text(selection) },
        { id: 'message', value: text(message) },
        { id: 'neighbors', value: neighborChars },
        { id: 'recent', value: recentChars },
      ]
      let chars = rows.reduce((total, row) => total + row.value, 0)
      let tokens = Math.round(chars / CHARS_PER_TOKEN)

      if (stats !== null && stats !== undefined) {
        // Detailed mode replaces the recent turns with the digest.
        for (const row of rows) {
          if (row.id === 'recent') row.isOff = true
        }
        rows.push({ id: 'turns', value: stats.turns, isNew: true, unit: 'turns' })
        rows.push({ id: 'tools', value: stats.tools, isNew: true, unit: 'times' })
        rows.push({ id: 'summary', value: stats.summaryChars, isNew: true })
        chars += stats.chars
        tokens = Math.round(chars / CHARS_PER_TOKEN)
      }

      return { rows, chars, tokens }
    }

    /**
     * Fill `{name}` placeholders in one localized string.
     * @param {string} template - localized text.
     * @param {Record<string, string | number>} values - replacements.
     * @returns {string} filled text.
     */
    function fillTemplate(template, values) {
      if (typeof template !== 'string') return ''
      return template.replace(/\{(\w+)\}/gu, (whole, key) => (
        Object.hasOwn(values ?? {}, key) ? String(values[key]) : whole
      ))
    }

    /** Shorten one text for a compact list row. */
    function snippetOf(text, limit) {
      if (typeof text !== 'string') return ''
      return text.length <= limit ? text : `${text.slice(0, limit)}…`
    }

    /**
     * ASCII punctuation a backslash may escape, per CommonMark.
     *
     * Everything else keeps its backslash: a model writing `C:\Users\me` or a
     * regex like `\d+` means those characters, and dropping the `\` would
     * silently rewrite the answer.
     */
    const ESCAPABLE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

    /**
     * Whether the character at `index` is preceded by an odd run of backslashes,
     * which is what makes it escaped rather than a delimiter after a literal `\`.
     *
     * @param {string} text - the line being read.
     * @param {number} index - position of the character in question.
     * @returns {boolean} true when the character is escaped.
     */
    function isEscapedAt(text, index) {
      let run = 0
      while (index - run - 1 >= 0 && text[index - run - 1] === '\\') run += 1
      return run % 2 === 1
    }

    /**
     * Split one Markdown table row into its cells.
     *
     * A row is `a | b | c`: the outer pipes are optional and an escaped `\|`
     * belongs to its cell. Only `\|` is resolved here, because a pipe decides
     * where a cell ends; every other escape is left for the inline pass, which
     * knows the same CommonMark rule and unescapes it in the cell's text.
     *
     * @param {string} line - one table row.
     * @returns {string[]} the cells, outer pipes and padding removed.
     */
    function tableCells(line) {
      let body = line.trim()
      if (body.startsWith('|')) body = body.slice(1)
      if (body.endsWith('|') && !isEscapedAt(body, body.length - 1)) body = body.slice(0, -1)
      const cells = []
      let cell = ''
      for (let index = 0; index < body.length; index += 1) {
        const char = body[index]
        if (char === '\\' && index + 1 < body.length) {
          const next = body[index + 1]
          if (next === '|') {
            cell += '|'
            index += 1
            continue
          }
          if (ESCAPABLE.includes(next)) {
            // Keep the pair for inlineParts, which unescapes it in the cell.
            cell += char + next
            index += 1
            continue
          }
          // `C:\Users`: the backslash belongs to the text, not to an escape.
          cell += char
          continue
        }
        if (char === '|') {
          cells.push(cell.trim())
          cell = ''
          continue
        }
        cell += char
      }
      cells.push(cell.trim())
      return cells
    }

    /**
     * The alignment one `|---|:--:|` cell asks for, or null for no preference.
     * @param {string} cell - one delimiter cell.
     * @returns {'left' | 'center' | 'right' | null} the alignment.
     */
    function alignmentOf(cell) {
      const leading = cell.startsWith(':')
      const trailing = cell.endsWith(':')
      if (leading && trailing) return 'center'
      if (trailing) return 'right'
      if (leading) return 'left'
      return null
    }

    /**
     * Read a GFM table that starts at `index`, or null when those lines are not
     * one.
     *
     * The delimiter row is what makes a block a table: a line may hold a pipe
     * as ordinary text, and only `|---|:--:|` underneath says the reader meant
     * a grid. Recognition therefore needs one line of lookahead, which is also
     * what stops a streaming answer from printing the pipes as text for long.
     *
     * @param {string[]} lines - the answer, split.
     * @param {number} index - line the header would be on.
     * @returns {{ block: object, next: number } | null} the table and the first line after it.
     */
    function tableAt(lines, index) {
      const delimiter = lines[index + 1]
      // A table at the very end of the answer has no delimiter row yet, which
      // is exactly what a streaming answer looks like one line in.
      if (delimiter === undefined) return null
      const header = lines[index]
      if (!header.includes('|') || !delimiter.includes('|')) return null
      const head = tableCells(header)
      const markers = tableCells(delimiter)
      if (markers.length !== head.length) return null
      if (!markers.every((cell) => /^:?-+:?$/u.test(cell))) return null
      const align = markers.map(alignmentOf)
      const rows = []
      let cursor = index + 2
      while (cursor < lines.length) {
        const row = lines[cursor]
        // A row keeps the grid going; anything without a pipe is prose again.
        if (row.trim().length === 0 || !row.includes('|')) break
        const cells = tableCells(row)
        // GFM drops extra cells and pads missing ones, so every row is a full
        // row and the renderer never has to guard its column count.
        rows.push(head.map((_, column) => cells[column] ?? ''))
        cursor += 1
      }
      return { block: { kind: 'table', head, align, rows }, next: cursor }
    }

    /**
     * The opening line of a fenced code block.
     * @param {string} trimmed - line without indentation.
     * @returns {{ char: string, size: number, lang: string } | null} fence character, run length and language.
     */
    function fenceOpening(trimmed) {
      const match = /^(`{3,}|~{3,})(.*)$/u.exec(trimmed)
      if (match === null) return null
      return { char: match[1][0], size: match[1].length, lang: match[2].trim().split(/\s+/u)[0] }
    }

    /**
     * Whether a line closes the fence it follows.
     * @param {string} trimmed - line without indentation.
     * @param {{ char: string, size: number }} fence - the opening fence.
     * @returns {boolean} true when the line is a closing fence.
     */
    function isFenceClose(trimmed, fence) {
      let run = 0
      while (run < trimmed.length && trimmed[run] === fence.char) run += 1
      return run >= fence.size && trimmed.slice(run).trim().length === 0
    }

    /**
     * A horizontal rule: three or more `-`, `*` or `_`, spaces between allowed.
     * @param {string} trimmed - line without indentation.
     * @returns {boolean} true when the line is a rule.
     */
    function isRule(trimmed) {
      return /^(?:-{3,}|\*{3,}|_{3,})$/u.test(trimmed.replace(/\s+/gu, ''))
    }

    /**
     * One list marker line.
     * @param {string} trimmed - line without indentation.
     * @returns {{ ordered: boolean, start: number, text: string } | null} the item, or null when the line is not one.
     */
    function listMarkerOf(trimmed) {
      const bullet = /^[-*+]\s+(.*)$/u.exec(trimmed)
      if (bullet !== null) return { ordered: false, start: 1, text: bullet[1] }
      const numbered = /^(\d{1,9})[.)]\s+(.*)$/u.exec(trimmed)
      if (numbered !== null) return { ordered: true, start: Number.parseInt(numbered[1], 10), text: numbered[2] }
      return null
    }

    /**
     * Deepest list level kept as nesting.
     *
     * `listView` and `plainList` recurse once per level, and a model can emit an
     * answer whose indentation grows on every line; without a cap a few thousand
     * levels throw `RangeError` out of render and the whole answer disappears.
     * Four levels is already deeper than a card can show, and matches the
     * heading cap.
     */
    const MAX_LIST_DEPTH = 4

    /**
     * Add one list item to the list its indentation belongs to.
     *
     * Indentation decides the level — a deeper line opens a child list under the
     * item above it and a shallower one closes levels until it fits. A level that
     * changes marker type starts a sibling list, because a bullet under a number
     * is a different list, not a relabelled one. Nesting deeper than
     * `MAX_LIST_DEPTH` keeps its text on the deepest open item instead of
     * opening another level.
     *
     * @param {{ blocks: object[], lists: object[] }} state - the answer being built; `lists` is the open-level stack.
     * @param {{ ordered: boolean, start: number, indent: number, text: string }} item - one marker line.
     */
    function pushListItem(state, item) {
      const { lists, blocks } = state
      while (lists.length > 0 && item.indent < lists[lists.length - 1].indent) lists.pop()
      const open = (container) => {
        const block = item.ordered
          ? { kind: 'ol', ordered: true, start: item.start, items: [] }
          : { kind: 'ul', ordered: false, items: [] }
        container.push(block)
        const level = { indent: item.indent, ordered: item.ordered, items: block.items, container }
        lists.push(level)
        return level
      }
      const host = lists[lists.length - 1]
      let level = host
      if (host === undefined) {
        level = open(blocks)
      } else if (item.indent > host.indent) {
        if (lists.length >= MAX_LIST_DEPTH) {
          const deepest = host.items[host.items.length - 1]
          deepest.text = `${deepest.text}\n${item.text}`
          return
        }
        level = open(host.items[host.items.length - 1].children)
      } else if (host.ordered !== item.ordered) {
        lists.pop()
        level = open(host.container)
      }
      level.items.push({ text: item.text, children: [] })
    }

    /**
     * Split an answer into display blocks.
     *
     * Answers arrive as Markdown and the card used to print the raw text, so
     * `### 标题`, `- 要点` and a table's pipes all showed up as literal
     * characters. The shapes an answer actually uses are recognised here —
     * fenced code, tables, headings, nested lists, quotes, rules — and anything
     * else stays a paragraph. Nothing is parsed as HTML, and nothing inside a
     * code block is read as markup.
     *
     * @param {unknown} text - answer text.
     * @returns {Array<object>} blocks in display order.
     */
    function answerBlocks(text) {
      if (typeof text !== 'string' || text.length === 0) return []
      const lines = text.replace(/\r\n/gu, '\n').split('\n')
      const blocks = []
      const lists = []
      let paragraph = []
      const flushParagraph = () => {
        if (paragraph.length === 0) return
        blocks.push({ kind: 'p', text: paragraph.join('\n') })
        paragraph = []
      }
      // A list stays open across a blank line (that is a loose list, not two
      // lists) and is closed by the first line that is not part of it.
      const closeLists = () => {
        lists.length = 0
      }
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          flushParagraph()
          continue
        }

        const indent = line.length - line.trimStart().length

        const fence = fenceOpening(trimmed)
        if (fence !== null) {
          flushParagraph()
          // A fence that is itself indented is a continuation of the block it is
          // in, so its content loses that much indentation and keeps the rest.
          const dedent = (text) => {
            let cut = 0
            while (cut < indent && text[cut] === ' ') cut += 1
            return text.slice(cut)
          }
          const body = []
          index += 1
          while (index < lines.length && !isFenceClose(lines[index].trim(), fence)) {
            body.push(dedent(lines[index]))
            index += 1
          }
          // An unclosed fence still renders as code: that is what a streaming
          // answer looks like between the opening and closing ticks.
          const block = { kind: 'code', lang: fence.lang, text: body.join('\n') }
          // A fence indented under a list item is part of that item. Closing the
          // list here would split one list into two and renumber the second half.
          const openList = lists[lists.length - 1]
          if (openList !== undefined && indent > openList.indent) {
            openList.items[openList.items.length - 1].children.push(block)
          } else {
            closeLists()
            blocks.push(block)
          }
          continue
        }

        const heading = /^(#{1,6})\s+(.*)$/u.exec(trimmed)
        if (heading !== null) {
          flushParagraph()
          closeLists()
          blocks.push({ kind: 'h', level: Math.min(heading[1].length, 4), text: heading[2] })
          continue
        }

        // A paragraph underlined with `===` or `---` is a setext heading
        // (GFM): models write `标题` and then `===` instead of `# 标题`, and the
        // reader used to see the underline as a rule and the text as prose.
        const underline = paragraph.length > 0 ? /^(=+|-{2,})\s*$/u.exec(trimmed) : null
        if (underline !== null) {
          const text = paragraph.join(' ')
          paragraph = []
          closeLists()
          blocks.push({ kind: 'h', level: underline[1][0] === '=' ? 1 : 2, text })
          continue
        }

        const table = tableAt(lines, index)
        if (table !== null) {
          flushParagraph()
          closeLists()
          blocks.push(table.block)
          index = table.next - 1
          continue
        }

        if (isRule(trimmed)) {
          flushParagraph()
          closeLists()
          blocks.push({ kind: 'hr' })
          continue
        }

        const marker = listMarkerOf(trimmed)
        if (marker !== null) {
          flushParagraph()
          pushListItem({ blocks, lists }, { ordered: marker.ordered, start: marker.start, indent, text: marker.text })
          continue
        }

        // A deeper, unmarked line continues the item above it. A `>` there is a
        // lazy quote continuation, not the literal text `a > q`.
        const list = lists[lists.length - 1]
        if (list !== undefined && indent > list.indent) {
          const item = list.items[list.items.length - 1]
          item.text = `${item.text}\n${trimmed.replace(/^>\s?/u, '')}`
          continue
        }

        const quote = /^(?:>\s?)+(.*)$/u.exec(trimmed)
        if (quote !== null) {
          flushParagraph()
          closeLists()
          // Consecutive quote lines are one quotation, not one box each. A `>>`
          // nested quote stays one quotation: the card has one quote style, and
          // leaving the inner `>` in the text made the reader see a raw marker.
          const quoted = [quote[1]]
          while (index + 1 < lines.length && /^>\s?/u.test(lines[index + 1].trim())) {
            index += 1
            quoted.push(lines[index].trim().replace(/^(?:>\s?)+/u, ''))
          }
          blocks.push({ kind: 'quote', text: quoted.join('\n') })
          continue
        }

        closeLists()
        paragraph.push(line)
      }
      flushParagraph()
      return blocks
    }

    /**
     * One list as plain text, nesting kept as indentation so a flattened
     * clipboard line still reads in the right order.
     * @param {object} block - a `ul` or `ol` block.
     * @param {number} depth - nesting level, 0 for the outermost list.
     * @returns {string} the list, one item or child per line.
     */
    function plainList(block, depth) {
      const pad = '  '.repeat(depth)
      const start = block.ordered === true ? (block.start ?? 1) : 1
      const lines = []
      block.items.forEach((item, index) => {
        const task = taskOf(item.text)
        const body = task === null
          ? plainInline(item.text)
          : `${task.checked ? '☑' : '☐'} ${plainInline(task.text)}`
        lines.push(`${pad}${block.ordered === true ? `${start + index}. ` : '- '}${body}`)
        for (const child of item.children) {
          // A fenced block inside an item is copied verbatim, indented under it.
          if (child.kind === 'code') lines.push(...child.text.split('\n').map((line) => `${pad}  ${line}`))
          else lines.push(plainList(child, depth + 1))
        }
      })
      return lines.join('\n')
    }

    /**
     * Plain text of an answer for the clipboard: block markers dropped, the way
     * the reader sees them.
     * @param {unknown} text - answer text.
     * @returns {string} plain text.
     */
    function answerPlain(text) {
      return answerBlocks(text).map((block) => {
        // A code block is copied verbatim: its markers are not markup.
        if (block.kind === 'code') return block.text
        if (block.kind === 'h') return plainInline(block.text)
        if (block.kind === 'hr') return '---'
        if (block.kind === 'quote') return `“${plainInline(block.text)}”`
        if (block.kind === 'table') {
          return [block.head, ...block.rows]
            .map((row) => row.map((cell) => plainInline(cell)).join('\t'))
            .join('\n')
        }
        if (block.kind === 'ul' || block.kind === 'ol') return plainList(block, 0)
        return plainInline(block.text)
      }).join('\n\n')
    }

    /** Ceiling for one "back to main" insertion; keeps a runaway answer bounded. */
    const INSERT_MAX_CHARS = 20000

    /**
     * Payload for inserting a passage quote plus the complete Q&A into the main
     * composer.
     *
     * The whole answer is inserted: the old 200-character summary silently
     * dropped everything past the first sentence, which was the bug. Newlines
     * and list markers are preserved so the inserted text keeps the shape the
     * reader saw. Only an answer past `INSERT_MAX_CHARS` is cut, and then it
     * says so.
     *
     * @param {string} passage - quoted text.
     * @param {string} question - the question that produced the answer.
     * @param {string} answer - the full answer text.
     * @returns {{ text: string, plain: string } | null} payload, or null when empty.
     */
    function insertPayloadOf(passage, question, answer) {
      const q = typeof question === 'string' ? question.trim() : ''
      const a = typeof answer === 'string' ? answer.trim() : ''
      if (a.length === 0) return null
      const body = [q.length > 0 ? `问：${q}` : '', `答：${a}`].filter((part) => part.length > 0).join('\n\n')
      const text = body.length > INSERT_MAX_CHARS
        ? `〔滑词〕\n${body.slice(0, INSERT_MAX_CHARS)}\n…（已截断，完整回答请在卡片里复制）`
        : `〔滑词〕\n${body}`
      return {
        text: text.trim(),
        plain: `> ${passage}\n\n${text}`.trim(),
      }
    }

    /** Rows a pasted block may occupy before it becomes a text snippet. */
    const PASTE_MAX_LINES = 3
    /** Characters that fold a single-line paste even when it would not wrap much. */
    const PASTE_MAX_CHARS = 240
    /** Hard cap for one snippet, so a huge paste cannot lock the card. */
    const SNIPPET_MAX_CHARS = 20000
    /** Snippets one question may carry, so the composer list stays bounded. */
    const SNIPPET_MAX_COUNT = 6
    /** Attachments one question may carry. Mirrors `ATTACH_LIMITS` in lib/attachments.js. */
    const ATTACH_MAX_FILES = 6
    /** Bytes per attachment, before base64 expansion. Mirrors the host cap. */
    const ATTACH_MAX_BYTES = 4 * 1024 * 1024
    /** Combined bytes across one question. Mirrors `ATTACH_LIMITS.maxTotalBytes`. */
    const ATTACH_MAX_TOTAL_BYTES = 6 * 1024 * 1024
    /** Raster types the host stores as images. Mirrors `IMAGE_TYPES` there. */
    const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

    /**
     * Count the visual rows a paste occupies at the composer's width.
     *
     * Wrapping is a layout fact, so this measures a detached probe with the same
     * font, width and `pre-wrap` behaviour as the textarea. Without a layout
     * engine (unit tests) it degrades to counting source line breaks.
     *
     * @param {string} text - text to measure.
     * @param {number} [widthPx] - available text width; 0 falls back to line breaks.
     * @param {number} [lineHeightPx] - line height used by the composer.
     * @param {string | null} [font] - the composer's computed `font` shorthand; the
     *   probe must measure with the font the textarea actually uses, or a host
     *   with its own typeface mis-judges how many rows a paste takes.
     * @returns {number} row count, at least 1 for non-empty text.
     */
    function visualLineCount(text, widthPx, lineHeightPx = 20, font = null) {
      const value = typeof text === 'string' ? text : ''
      if (value.length === 0) return 0
      const byBreaks = value.split(/\r?\n/u).length
      if (!Number.isFinite(widthPx) || widthPx <= 0
        || typeof document === 'undefined' || typeof document.createElement !== 'function' || !document.body) {
        return byBreaks
      }
      const probe = document.createElement('div')
      probe.setAttribute('aria-hidden', 'true')
      const shorthand = typeof font === 'string' && font.length > 0
        ? font
        : `400 13.5px/${lineHeightPx}px sans-serif`
      probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;'
        + `width:${Math.round(widthPx)}px;white-space:pre-wrap;word-break:break-word;`
        + `font:${shorthand}`
      probe.textContent = value
      document.body.appendChild(probe)
      const height = probe.scrollHeight
      probe.remove()
      if (!Number.isFinite(height) || height <= 0) return byBreaks
      return Math.max(1, Math.round(height / lineHeightPx))
    }

    /**
     * Whether a paste should become a text snippet instead of filling the box.
     *
     * Two separate triggers, because either one alone reads badly: more than
     * three visual rows makes the box jump, and a single 300-character line is
     * just as unreadable even though it only occupies one row.
     *
     * @param {string} text - pasted text.
     * @param {number} [widthPx] - composer text width; omitted counts source lines.
     * @param {string | null} [font] - the composer's computed `font` shorthand.
     * @returns {boolean} true when the text should be folded.
     */
    function shouldFoldPaste(text, widthPx, font = null) {
      const value = typeof text === 'string' ? text : ''
      if (value.trim().length === 0) return false
      if (value.length > PASTE_MAX_CHARS) return true
      return visualLineCount(value, widthPx, 20, font) > PASTE_MAX_LINES
    }

    /**
     * Whether one drag event carries files (not a text selection or a link).
     * @param {object} event - drag event or React synthetic event.
     * @returns {boolean} true when files are being dragged.
     */
    function hasFilePayload(event) {
      const types = event?.dataTransfer?.types
      if (types === null || types === undefined) return false
      if (typeof types.includes === 'function') return types.includes('Files')
      return Array.from(types).includes('Files')
    }

    /** Uppercase extension label for a file chip. */
    function fileExtOf(name) {
      const match = /^(.*)\.([A-Za-z0-9]{1,8})$/u.exec(typeof name === 'string' ? name : '')
      return match === null ? 'FILE' : match[2].toUpperCase()
    }

    /** Human byte size. */
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) return '—'
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`
    }

    /** Media type a file will be sent as; browsers leave some files blank. */
    function mediaTypeOf(file) {
      if (typeof file?.type === 'string' && file.type.length > 0) return file.type
      const ext = fileExtOf(file?.name).toLowerCase()
      if (ext === 'png') return 'image/png'
      if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
      if (ext === 'gif') return 'image/gif'
      if (ext === 'webp') return 'image/webp'
      return 'application/octet-stream'
    }

    /** Whether one file is a raster image the composer can preview. */
    function isImageFile(file) {
      return IMAGE_MEDIA_TYPES.includes(mediaTypeOf(file))
    }

    /**
     * Read one file as canonical base64, without the data-URL prefix.
     *
     * Bytes first, when the blob can give them: `readAsDataURL` builds the whole
     * base64 string once as a data URL and then builds a second copy to strip the
     * prefix, and at a 4 MB attachment that is a few megabytes of extra heap for
     * nothing. `FileReader` stays as the fallback for runtimes whose blobs have
     * no `arrayBuffer`.
     *
     * @param {File|Blob} file - picked or dropped file.
     * @returns {Promise<string>} base64 payload.
     */
    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        if (typeof file?.arrayBuffer === 'function') {
          file.arrayBuffer().then((buffer) => resolve(base64OfBytes(new Uint8Array(buffer))), reject)
          return
        }
        if (typeof FileReader === 'function') {
          const reader = new FileReader()
          reader.onerror = () => reject(reader.error ?? new Error('read-failed'))
          reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            const comma = result.indexOf(',')
            resolve(comma >= 0 ? result.slice(comma + 1) : result)
          }
          reader.readAsDataURL(file)
          return
        }
        reject(new Error('no-file-reader'))
      })
    }

    /** Base64 for bytes when no FileReader exists (tests, older runtimes). */
    function base64OfBytes(bytes) {
      if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
      if (typeof btoa !== 'function') throw new Error('no-base64')
      // Encode in 3-byte-aligned windows: each `btoa` then adds no padding, so
      // the pieces concatenate into one valid string, and `fromCharCode` is
      // called once per window instead of once per byte.
      const windowSize = 8190
      let encoded = ''
      for (let start = 0; start < bytes.length; start += windowSize) {
        const slice = bytes.subarray(start, Math.min(start + windowSize, bytes.length))
        encoded += btoa(String.fromCharCode.apply(null, slice))
      }
      return encoded
    }

    /** Build one visible thread turn from its parts. */
    function turnOf(question, answer, options = {}) {
      return {
        question,
        answer: typeof answer === 'string' ? answer : '',
        streaming: options.streaming === true,
        error: typeof options.error === 'string' ? options.error : '',
        attachments: Array.isArray(options.attachments) ? options.attachments : [],
        snippets: Array.isArray(options.snippets) ? options.snippets : [],
        usage: normalizeUsage(options.usage),
      }
    }

    /**
     * Records that belong to one highlight: the ones saved against its id, plus
     * any record whose selection is this exact passage (older records predate
     * the id link). Dropping a highlight drops these too; the reverse is not
     * true, so cancelling a single record keeps the highlight.
     * @param {Array<{ id: string, highlightId?: string, selection?: string }>} entries - stored records.
     * @param {string} highlightId - the highlight being removed.
     * @param {string} selection - the passage text.
     * @returns {string[]} record ids to remove.
     */
    function recordIdsOfHighlight(entries, highlightId, selection) {
      const ids = []
      for (const entry of Array.isArray(entries) ? entries : []) {
        if (entry === null || typeof entry !== 'object') continue
        if (typeof entry.id !== 'string' || entry.id.length === 0) continue
        const byId = typeof highlightId === 'string' && entry.highlightId === highlightId
        const bySelection = typeof selection === 'string' && selection.length > 0
          && entry.selection === selection
        if (byId || bySelection) ids.push(entry.id)
      }
      return ids
    }

    /**
     * Label for the record toggle: an unsaved answer offers 记录, a saved one
     * offers 取消记录 so the automatic save can be undone.
     * @param {string | null} savedRecordId - id of the record saved for this answer.
     * @param {(key: string) => string} translate - locale binder.
     * @returns {string} button label.
     */
    function recordToggleLabel(savedRecordId, translate) {
      return savedRecordId === null ? translate('record') : translate('unrecord')
    }

    /** Quick asks are inert while streaming or when no passage was read. */
    function presetDisabled(streaming, selection) {
      return streaming === true || typeof selection !== 'string' || selection.trim().length === 0
    }

    /** Fetch and decode one JSON response; non-OK statuses throw. */
    async function fetchJson(url, signal) {
      const response = await fetch(url, signal === undefined ? undefined : { signal })
      if (response.ok !== true) throw new Error(`status ${response.status}`)
      return response.json()
    }

    /** Commit the passage highlight on the first ask; null when it is not needed. */
    function askHighlightId({ highlighted, anchor, model, add }) {
      if (highlighted === true) return null
      if (anchor === null || anchor === undefined) return null
      return add(anchor, model ?? null)
    }

    /* Card thread and preset helpers. */

    /** The fixed one-click questions shown above the card's composer. */
    const PRESETS = [
      { id: 'explain', label: 'presetExplain', question: 'presetExplainQ' },
      { id: 'translate', label: 'presetTranslate', question: 'presetTranslateQ' },
      { id: 'critique', label: 'presetCritique', question: 'presetCritiqueQ' },
      { id: 'example', label: 'presetExample', question: 'presetExampleQ' },
    ]

    /**
     * Localized preset entries for one card.
     * @param {(key: string) => string} translate - locale binder.
     * @returns {Array<{ id: string, label: string, question: string }>} presets.
     */
    function presetList(translate) {
      return PRESETS.map((preset) => ({
        id: preset.id,
        label: translate(preset.label),
        question: translate(preset.question),
      }))
    }

    /**
     * One run of inline Markdown, as a single alternation of named groups.
     *
     * The shapes an answer actually uses: backslash escapes, bold (`**`/`__`),
     * bold-italic (`***`), italic (`*`/`_`), code spans (one or two backticks so
     * ``a`b`` keeps its tick), images, links (http(s) only, optional title),
     * autolinks and strikethrough. Anything unrecognised stays literal text.
     *
     * Every run is bounded and no branch may start on the delimiter it just
     * consumed, so a line of 100k unmatched `*` or `[` stays linear: the scan
     * cannot walk to the end of the line from each position and back.
     */
    const INLINE_PATTERN = /\\(?<esc>[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|(?<!\*)\*\*\*(?!\*)(?<bolditalic>[^*\n]{1,512}?)\*\*\*(?!\*)|(?<!\*)\*\*(?!\*)(?<strong>[^*\n][\s\S]{0,4095}?)\*\*(?!\*)|(?<![\w_])__(?![\s_])(?<strongunderscore>[^_\n]{1,512}?)(?<=\S)__(?![\w_])|(?<!\*)\*(?=\S)(?<italic>(?:[^*\n]|\*\*[^*\n]{1,256}\*\*){1,512}?)(?<=\S)\*(?!\*)|(?<![\w_])_(?![\s_])(?<underscore>[^_\n]{1,512}?)(?<=\S)_(?![\w_])|!\[(?<alt>[^[\]\n]{0,512})\]\((?<imgsrc>https?:\/\/(?:[^()\s]|\([^()\s]*\)){0,2048})(?:\s+"[^"\n]{0,256}")?\)|``(?<codeblock>[^`\n]{0,512}(?:`[^`\n]{1,512})*?)``|(?<!`)`(?<code>[^`\n]{1,2048})`(?!`)|(?<!!)\[(?<label>[^[\]\n]{1,1024})\]\((?<href>https?:\/\/(?:[^()\s]|\([^()\s]*\)){0,2048})(?:\s+"[^"\n]{0,256}")?\)|(?<!!)\[(?<plain>[^[\]\n]{1,1024})\]\([^()\s]{0,2048}\)|<(?<auto>https?:\/\/[^<>\s]{1,2048})>|~~(?<strike>[^~\n]{1,2048})~~/giu

    /**
     * Flatten one line into text, bold, italic, code, link, image and strike parts.
     *
     * Each part carries the plain text the reader and the clipboard both see,
     * plus the flags the renderer needs (`strong`, `em`, `code`, `href`,
     * `strike`, `image`). A link is only a link when its target is http(s): any
     * other scheme keeps its label as plain text, so a model cannot smuggle
     * `javascript:` into the page and the reader never sees the raw brackets of
     * a relative path either. An image is only an image when its source is
     * http(s); a local path keeps its raw text.
     *
     * @param {string} text - answer text.
     * @param {number} [depth] - nesting level; a bold or italic run re-parses its contents once.
     * @returns {Array<{ text: string, strong?: boolean, em?: boolean, code?: boolean, href?: string, strike?: boolean, image?: boolean }>} parts.
     */
    function inlineParts(text, depth = 0) {
      if (typeof text !== 'string' || text.length === 0) return []
      const parts = []
      const nest = (inner, flags) => {
        // `**`[文档](https://…)`**`, `**`y`**` and `*带 **粗** 的字*` are runs
        // with markup inside them. One extra pass keeps the wrapper and lets the
        // inner link, code span or bold become the node the reader expects; the
        // inner runs ride along as `children` so one wrapper stays one element.
        parts.push({
          children: depth > 0 ? [{ text: inner }] : inlineParts(inner, depth + 1),
          ...flags,
        })
      }
      let last = 0
      for (const match of text.matchAll(INLINE_PATTERN)) {
        if (match.index > last) parts.push({ text: text.slice(last, match.index) })
        const groups = match.groups ?? {}
        if (groups.esc !== undefined) parts.push({ text: groups.esc })
        else if (groups.bolditalic !== undefined) nest(groups.bolditalic, { strong: true, em: true })
        else if (groups.strong !== undefined) nest(groups.strong, { strong: true })
        else if (groups.strongunderscore !== undefined) nest(groups.strongunderscore, { strong: true })
        else if (groups.italic !== undefined) nest(groups.italic, { em: true })
        else if (groups.underscore !== undefined) nest(groups.underscore, { em: true })
        else if (groups.code !== undefined || groups.codeblock !== undefined) {
          parts.push({ text: groups.code ?? groups.codeblock, code: true })
        } else if (groups.alt !== undefined) parts.push({ text: groups.alt, href: groups.imgsrc, image: true })
        else if (groups.label !== undefined) parts.push({ text: groups.label, href: groups.href })
        else if (groups.plain !== undefined) parts.push({ text: groups.plain })
        else if (groups.auto !== undefined) parts.push({ text: groups.auto, href: groups.auto })
        else if (groups.strike !== undefined) parts.push({ text: groups.strike, strike: true })
        else parts.push({ text: match[0] })
        last = match.index + match[0].length
      }
      if (last < text.length) parts.push({ text: text.slice(last) })
      return parts
    }

    /**
     * The text a part shows, wrapper or not.
     * @param {{ text?: string, children?: Array<object> }} part - one inline part.
     * @returns {string} its text.
     */
    function partText(part) {
      if (part.children === undefined) return part.text
      return part.children.map(partText).join('')
    }

    /**
     * One line of answer text as the reader sees it: inline markers dropped.
     * @param {string} text - answer text.
     * @returns {string} plain text.
     */
    function plainInline(text) {
      return inlineParts(text).map(partText).join('')
    }

    /**
     * One line of answer text as inline nodes.
     *
     * A bold or italic run may hold a link, an image or a code span; the inner
     * node carries the markup and the wrappers stay on the outside. Emphasis is
     * a real `<em>` so the browser's own italic face and a screen reader's
     * emphasis both apply, and an image is a real `<img>`: `loading="lazy"` and
     * `max-width` keep a tall screenshot from pushing the card's controls away.
     *
     * @param {string} text - answer text.
     * @param {string} prefix - key prefix of the block that holds it.
     * @returns {Array<object|string>} nodes.
     */
    function inlineView(text, prefix) {
      return viewParts(inlineParts(text), prefix)
    }

    /**
     * Inline parts as nodes, one wrapper per part.
     * @param {Array<object>} parts - parsed inline parts.
     * @param {string} prefix - key prefix of the block that holds them.
     * @returns {Array<object|string>} nodes.
     */
    function viewParts(parts, prefix) {
      return parts.map((part, index) => {
        const key = `${prefix}:${index}`
        let node = null
        if (part.code === true) node = h('code', { key }, partText(part))
        else if (part.image === true) {
          node = h('img', {
            key,
            className: 'clipchat-card__img',
            src: part.href,
            alt: partText(part),
            loading: 'lazy',
            decoding: 'async',
          })
        } else if (part.href !== undefined) {
          node = h('a', { key, href: part.href, target: '_blank', rel: 'noopener noreferrer' }, partText(part))
        } else if (part.strike === true) node = h('del', { key }, partText(part))
        if (node === null) node = part.children === undefined ? part.text : viewParts(part.children, key)
        const wrappers = []
        if (part.strong === true) wrappers.push('strong')
        if (part.em === true) wrappers.push('em')
        for (const tag of wrappers.reverse()) node = h(tag, { key }, ...(Array.isArray(node) ? node : [node]))
        return node
      })
    }

    /**
     * One fenced code block as nodes.
     *
     * A code block is a single text node on purpose: its content is literal, so
     * no `**` inside it becomes bold and no long line is re-wrapped.
     *
     * @param {object} block - a `code` block.
     * @param {string} key - key prefix.
     * @returns {object} the code node.
     */
    function codeView(block, key) {
      return h('div', { key, className: 'clipchat-card__code' },
        block.lang.length > 0 ? h('span', { className: 'clipchat-card__lang' }, block.lang) : null,
        h('pre', { className: 'clipchat-card__pre' }, h('code', null, block.text)))
    }

    /**
     * A task-list marker at the start of a list item.
     *
     * `- [ ] 待办` and `- [x] 已办` are GitHub task lists: the reader gets a
     * checkbox glyph and the marker stays out of the sentence.
     *
     * @param {string} text - one item's text.
     * @returns {{ checked: boolean, text: string } | null} the marker, or null when the item is not a task.
     */
    function taskOf(text) {
      const match = /^\[([ xX])\](?:\s+|$)([\s\S]*)$/u.exec(text)
      if (match === null) return null
      return { checked: match[1] !== ' ', text: match[2] }
    }

    /**
     * One list and its nested lists as nodes.
     *
     * An ordered list carries its first number so `3.` starts at three instead
     * of being renumbered from one. A fenced block that belonged to an item is
     * rendered inside its `li`, not as a sibling of the list.
     *
     * @param {object} block - a `ul` or `ol` block.
     * @param {string} key - key prefix.
     * @returns {object} a list node.
     */
    function listView(block, key) {
      const props = { key, className: 'clipchat-card__list' }
      if (block.ordered === true && block.start !== 1) props.start = block.start
      return h(block.ordered === true ? 'ol' : 'ul', props,
        block.items.map((item, index) => {
          const task = taskOf(item.text)
          return h('li', { key: `${key}:${index}` },
            task === null
              ? null
              : h('span', { key: `${key}:${index}:check`, className: 'clipchat-card__check' }, task.checked ? '☑ ' : '☐ '),
            inlineView(task === null ? item.text : task.text, `${key}:${index}`),
            item.children.map((child, childIndex) => (child.kind === 'code'
              ? codeView(child, `${key}:${index}:${childIndex}`)
              : listView(child, `${key}:${index}:${childIndex}`))))
        }))
    }

    /** Node trees of completed answers, keyed by their text; a bounded set. */
    const answerNodeCache = new Map()
    /** How many answer trees stay cached. */
    const ANSWER_CACHE_LIMIT = 8

    /**
     * Render one parsed answer as nodes.
     *
     * A table gets a scroll container, because a grid wider than the card must
     * not widen the card itself. The whole body is guarded: a throw here happens
     * inside React's render and would take the answer area with it, so the raw
     * text is a better failure than a blank card.
     *
     * The card re-renders for every token of a stream and every keystroke in the
     * composer, but a finished answer never changes. Building its tree once and
     * reusing the same element objects lets React bail out of those subtrees
     * instead of re-parsing the whole thread on each frame. A custom parser (only
     * tests pass one) is never cached, so the fallback stays observable.
     *
     * @param {unknown} text - answer text.
     * @param {(text: unknown) => Array<object>} [parse] - block parser; a test points it
     *   at a throwing parser to exercise the fallback, which no real input reaches.
     * @returns {Array<object>} nodes.
     */
    function answerView(text, parse = answerBlocks) {
      const cacheable = parse === answerBlocks
      const key = typeof text === 'string' ? text : ''
      if (cacheable) {
        const hit = answerNodeCache.get(key)
        if (hit !== undefined) {
          // Refresh the entry so a long thread keeps the answers it shows.
          answerNodeCache.delete(key)
          answerNodeCache.set(key, hit)
          return hit
        }
      }
      let nodes
      try {
        nodes = parse(text).map((block, index) => {
          const key = `${index}:${block.kind}`
          if (block.kind === 'h') {
            return h(`h${block.level + 2}`, { key, className: 'clipchat-card__h' }, inlineView(block.text, key))
          }
          if (block.kind === 'code') return codeView(block, key)
          if (block.kind === 'table') {
            const cellOf = (tag, text, column, rowKey) => h(tag, {
              key: `${rowKey}:${column}`,
              className: tag === 'th' ? 'clipchat-card__th' : 'clipchat-card__td',
              style: block.align[column] === null ? undefined : { textAlign: block.align[column] },
            }, inlineView(text, `${rowKey}:${column}`))
            return h('div', { key, className: 'clipchat-card__tablewrap' },
              h('table', { className: 'clipchat-card__table' },
                h('thead', null, h('tr', null,
                  block.head.map((text, column) => cellOf('th', text, column, `${key}:head`)))),
                h('tbody', null, block.rows.map((row, rowIndex) => h('tr', { key: rowIndex },
                  row.map((text, column) => cellOf('td', text, column, `${key}:${rowIndex}`)))))))
          }
          if (block.kind === 'hr') return h('hr', { key, className: 'clipchat-card__hr' })
          if (block.kind === 'quote') {
            return h('blockquote', { key, className: 'clipchat-card__quote' }, inlineView(block.text, key))
          }
          if (block.kind === 'ul' || block.kind === 'ol') return listView(block, key)
          return h('p', { key, className: 'clipchat-card__p' }, inlineView(block.text, key))
        })
      } catch {
        // Last resort: the answer stays readable even when the renderer cannot
        // parse it, which is what 0.1.2 did for every answer.
        nodes = [h('pre', { className: 'clipchat-card__pre' }, typeof text === 'string' ? text : '')]
      }
      if (cacheable) {
        if (answerNodeCache.size >= ANSWER_CACHE_LIMIT) answerNodeCache.delete(answerNodeCache.keys().next().value)
        answerNodeCache.set(key, nodes)
      }
      return nodes
    }

    /**
     * Visible Q&A turns: the recalled record first, then completed pairs, then
     * the in-flight or failed question.
     * @param {Array<{ role: string, text: string }>} history - completed pairs.
     * @param {{ question: string, answer: string, streaming?: boolean, error?: string } | null} current - in-flight turn.
     * @param {{ turns?: Array<{ question: string, answer: string }> } | null} [loadedRecord] - record opened from a highlight; every turn of it is shown.
     * @returns {Array<object>} turns in display order.
     */
    function threadTurns(history, current, loadedRecord = null) {
      const turns = []
      const stored = Array.isArray(loadedRecord?.turns) ? loadedRecord.turns : []
      for (const turn of stored) {
        if (typeof turn?.question !== 'string') continue
        turns.push(turnOf(turn.question, typeof turn.answer === 'string' ? turn.answer : ''))
      }
      const entries = Array.isArray(history) ? history : []
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        if (entry === null || entry === undefined || entry.role !== 'user') continue
        const next = entries[index + 1]
        const hasAnswer = next !== undefined && next !== null && next.role === 'assistant'
        turns.push(turnOf(entry.text, hasAnswer ? next.text : '', {
          attachments: entry.attachments,
          snippets: entry.snippets,
          usage: hasAnswer ? next.usage : undefined,
        }))
        if (hasAnswer) index += 1
      }
      if (current !== null && current !== undefined && typeof current.question === 'string' && current.question.length > 0) {
        turns.push(turnOf(current.question, current.answer, {
          streaming: current.streaming,
          error: current.error,
        }))
      }
      return turns
    }

    /* Cross-session search: pure helpers and the card hook. */

    /** Stable key for one cross-session search row. */
    function searchKeyOf(item) {
      return `${item.sessionId}:${item.recordId}`
    }

    /** Local date for a result row; `—` when the timestamp is unusable. */
    function dateTextOf(value) {
      if (!Number.isFinite(value) || value <= 0) return '—'
      try {
        return new Date(value).toLocaleDateString()
      } catch {
        return '—'
      }
    }

    /**
     * Cross-session search state for one card: debounced query, results and the
     * expand/copy affordances. Fetches only while the "all sessions" tab is open.
     * @param {boolean} active - whether the all-sessions view is visible.
     * @returns {object} search state and actions.
     */
    function useCrossSessionSearch(active) {
      const [query, setQuery] = React.useState('')
      const [results, setResults] = React.useState([])
      const [total, setTotal] = React.useState(0)
      const [truncated, setTruncated] = React.useState(false)
      const [state, setState] = React.useState('idle')
      const [expandedKey, setExpandedKey] = React.useState(null)
      const [copiedKey, setCopiedKey] = React.useState(null)

      React.useEffect(() => {
        if (!active || typeof fetch !== 'function') return undefined
        let alive = true
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        setState('loading')
        const timer = setTimeout(() => {
          fetchJson(
            `${SEARCH_PATH}?q=${encodeURIComponent(query.trim())}&limit=${SEARCH_LIMIT}`,
            controller === null ? undefined : controller.signal,
          )
            .then((payload) => {
              if (!alive) return
              setResults(Array.isArray(payload?.items) ? payload.items : [])
              setTotal(Number.isFinite(payload?.total) ? payload.total : 0)
              setTruncated(payload?.truncated === true)
              setState('idle')
            })
            .catch((error) => {
              if (!alive || error?.name === 'AbortError') return
              setState('error')
            })
        }, 200)
        return () => {
          alive = false
          clearTimeout(timer)
          controller?.abort()
        }
      }, [active, query])

      React.useEffect(() => {
        if (copiedKey === null) return undefined
        const timer = setTimeout(() => setCopiedKey(null), 1500)
        return () => clearTimeout(timer)
      }, [copiedKey])

      /** Copy one result's Q&A; clipboard access is best-effort. */
      const copy = async (item) => {
        try {
          if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return
          await navigator.clipboard.writeText(`${item.question}\n\n${item.answer}`)
          setCopiedKey(searchKeyOf(item))
        } catch {
          /* A denied clipboard must not break the card. */
        }
      }

      return { query, setQuery, results, total, truncated, state, expandedKey, setExpandedKey, copiedKey, copy }
    }

    /* Components. */

    /** Shown when the host has no writable quote surface (read-only / subagent). */
    function ClipNotice(props) {
      const { dismiss, t } = props
      return h('div', { className: 'clipchat-card' },
        h('div', { className: 'clipchat-card__bar' },
          h('span', { className: 'clipchat-card__mark' }, '✦'),
          h('span', { className: 'clipchat-card__bar-text' }, t('title')),
          h('button', {
            type: 'button',
            className: 'clipchat-card__close',
            'aria-label': t('close'),
            title: t('close'),
            onClick: () => dismiss(),
          }, '×')),
        h('div', { className: 'clipchat-card__notice' }, t('unavailable')),
      )
    }

    function ClipMenu(props) {
      const { Original, dismiss, readText, translate } = props
      const [requestedHighlight] = React.useState(() => { const id = pendingHighlightId; pendingHighlightId = null; return id })
      const [expanded, setExpanded] = React.useState(requestedHighlight !== null)
      const [nodeKey] = React.useState(nodeKeyOfSelection)
      const [anchor] = React.useState(anchorFromSelection)
      const [selection] = React.useState(() => {
        try {
          return readText() ?? ''
        } catch {
          return ''
        }
      })

      if (!isAssistantNodeKey(nodeKey)) return h(Original, props)

      if (!expanded) {
        return h('div', { className: 'clipchat-menu' },
          h(Original, props),
          h('button', {
            type: 'button',
            className: 'clipchat-menu__ask',
            onMouseDown: (event) => event.preventDefault(),
            onClick: (event) => { event.preventDefault(); setExpanded(true) },
          }, translate('ask')),
        )
      }

      return h(ClipCard, Object.assign({}, props, { selection, nodeKey, anchor, dismiss, translate, initialHighlightId: requestedHighlight }))
    }

    function ClipCard(props) {
      const { selection, nodeKey, anchor, dismiss, translate, sessionId, useChat, inputActions, initialHighlightId } = props
      const textareaRef = React.useRef(null)
      const threadRef = React.useRef(null)
      const cardRef = React.useRef(null)
      const controllerRef = React.useRef(null)
      const requestIdRef = React.useRef(0)
      const aliveRef = React.useRef(true)
      const [loadedRecord] = React.useState(() => initialHighlightId === null || initialHighlightId === undefined
        ? null
        : recordForHighlight(initialHighlightId, selection))
      // The composer always starts empty: a recalled record is already shown as
      // a turn by `threadTurns`, so seeding the draft repeated the old question
      // in the input box as if it were still unsent.
      const [draft, setDraft] = React.useState('')
      const [answer, setAnswer] = React.useState('')
      // A recalled record already carries the usage of its newest turn; seeding
      // the footer from it is what stops a reopened card from saying "token —".
      // `tokens` is the running total of every completed round in this card;
      // `liveTokens` is the one still streaming, added in for display only.
      const [tokens, setTokens] = React.useState(() => initialTokensOf(loadedRecord))
      const [liveTokens, setLiveTokens] = React.useState(null)
      // The usage of the round that just finished, so re-keeping the answer
      // stores that round's numbers instead of the card's running total.
      const [answeredUsage, setAnsweredUsage] = React.useState(null)
      const [error, setError] = React.useState('')
      const [streaming, setStreaming] = React.useState(false)
      const [asked, setAsked] = React.useState(null)
      const [askedFiles, setAskedFiles] = React.useState([])
      const [askedSnippets, setAskedSnippets] = React.useState([])
      const [history, setHistory] = React.useState([])
      /** Latest committed history, so an append can tell which turn fell off. */
      const historyRef = React.useRef([])
      const [highlighted, setHighlighted] = React.useState(() => anchor !== null && anchor !== undefined && hasHighlight(nodeKey, selection, anchor))
      const [model, setModel] = React.useState(() => storedModelOf(nodeKey, selection))
      const [modelList, setModelList] = React.useState([])
      const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
      const [recordsView, setRecordsView] = React.useState('session')
      const search = useCrossSessionSearch(recordsView === 'all')
      const [meta, setMeta] = React.useState(null)
      const [answered, setAnswered] = React.useState(() => {
        const stored = Array.isArray(loadedRecord?.turns) ? loadedRecord.turns : []
        const newest = stored.length > 0 ? stored[stored.length - 1] : null
        return newest === null ? null : { question: newest.question, answer: newest.answer }
      })
      const [recordsOpen, setRecordsOpen] = React.useState(false)
      const [insertState, setInsertState] = React.useState('idle')
      const [copiedTurn, setCopiedTurn] = React.useState(null)
      // The record kept for the current answer; an answer is kept by default.
      const [savedRecordId, setSavedRecordId] = React.useState(() => loadedRecord?.id ?? null)
      const [openRecordId, setOpenRecordId] = React.useState(null)
      const [locateFailed, setLocateFailed] = React.useState(false)
      // Detailed mode: off by default, and its digest is fetched on demand.
      const [detail, setDetail] = React.useState(false)
      const [detailDigest, setDetailDigest] = React.useState(null)
      const [detailState, setDetailState] = React.useState('idle')
      const [detailOpen, setDetailOpen] = React.useState(false)
      // Composer extras: folded pastes and files travel with the next question.
      const [snippets, setSnippets] = React.useState([])
      const [files, setFiles] = React.useState([])
      /** Mirror of `files`, so adding or removing never has to guess the list. */
      const filesRef = React.useRef([])
      const [dragOver, setDragOver] = React.useState(false)
      const [attachError, setAttachError] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const attachInputRef = React.useRef(null)
      const createdUrlsRef = React.useRef(new Set())
      const sendingRef = React.useRef(false)
      const lastTurnRef = React.useRef(null)
      /** Pending frame that measures the jump control, so a fling measures once. */
      const jumpRafRef = React.useRef(null)
      const [jumpMode, setJumpMode] = React.useState(null)
      const [jumpOpen, setJumpOpen] = React.useState(false)
      const [, bumpRecords] = React.useState(0)

      // Card geometry. A gesture paints the live box straight onto the DOM and
      // React only hears about it once the gesture ends: a setState per pointer
      // move would re-render the card — and re-parse the Markdown answer — on
      // every frame of a drag.
      const [box, setBox] = React.useState(() => rememberedBox(sessionId))
      const boxRef = React.useRef(box)
      /**
       * The size the user chose, which a viewport fit must never overwrite: a
       * clamp the window imposed lasts as long as the window does, and widening
       * it again gives the card its own size back.
       */
      const chosenRef = React.useRef({ w: box.w, h: box.h })
      /** Bumped on every window change and on unmount, so a stale fit loop stops. */
      const fitLoopRef = React.useRef(0)
      const gestureRef = React.useRef(null)
      const [gestureKind, setGestureKind] = React.useState(null)
      const [settling, setSettling] = React.useState(false)
      const [entering, setEntering] = React.useState(true)
      const [maxWidth, setMaxWidth] = React.useState(CARD_DEFAULT_W)
      const barRef = React.useRef(null)
      const settleTimerRef = React.useRef(null)
      const bodyStyleRef = React.useRef(null)

      /** Measure the card and the limits it must respect right now. */
      /** The card's rect with the current offset taken back out, without measuring limits. */
      const rectOf = () => {
        const card = cardRef.current
        if (card === null || card === undefined || typeof card.getBoundingClientRect !== 'function') return null
        const rect = card.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return null
        return cardFrameOf(rect, boxRef.current)
      }

      const frameOf = () => {
        const card = cardRef.current
        const rect = rectOf()
        if (rect === null) return null
        return { rect, limits: cardLimits(viewportOf(), clipRectOf(card), cardRoomOf(card)) }
      }

      /** Paint one box onto the card without a React render. */
      const paintBox = (next) => {
        boxRef.current = next
        const card = cardRef.current
        if (card === null || card === undefined) return
        const style = boxStyleOf(next) ?? {}
        card.style.width = style.width ?? ''
        card.style.height = style.height ?? ''
        card.style.maxHeight = style.maxHeight ?? ''
        card.style.transform = style.transform ?? ''
        // The pinned-height rule belongs to the size on screen, not to the last
        // committed one: a height being dragged must give the footer its room on
        // the same frame, or the footer snaps inside when the drag ends.
        card.classList.toggle('is-sized', typeof next.h === 'number')
      }

      /** Paint one box and hand it back to React. */
      /**
       * Paint a box, and record the size the user asked for as theirs.
       * @param {object} next - what goes on screen, possibly clamped by the window.
       * @param {object} [chosen] - what the user asked for. A gesture that does not
       *   change the size passes the size already held, so a width the window
       *   clamped is never mistaken for a choice; a resize or Home passes its own.
       */
      const commitBox = (next, chosen = next) => {
        chosenRef.current = { w: chosen.w, h: chosen.h }
        paintBox(next)
        rememberBox(sessionId, { w: chosen.w, h: chosen.h })
        setBox(next)
      }

      /** Body-level side effects of a gesture; every ending restores them. */
      const lockBody = (cursor) => {
        if (typeof document === 'undefined' || document.body === null || document.body === undefined) return
        if (bodyStyleRef.current === null) {
          bodyStyleRef.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect }
        }
        document.body.style.cursor = cursor
        document.body.style.userSelect = 'none'
      }

      const unlockBody = () => {
        if (typeof document === 'undefined' || document.body === null || document.body === undefined) return
        const saved = bodyStyleRef.current
        bodyStyleRef.current = null
        if (saved === null) return
        document.body.style.cursor = saved.cursor
        document.body.style.userSelect = saved.userSelect
      }

      /**
       * Fit the card to the room the window leaves, keeping the size the user
       * chose: the fit decides what is on screen and where, not what the card's
       * size is. Painting a clamp instead of committing one is what lets the card
       * come back when the window widens again.
       * @param {boolean} place - also bring the offset back inside (needs a placed card).
       * @param {boolean} [trusted] - false bounds the fit by the window and the composer,
       *   for the pass that answers a resize before the host has finished re-laying
       *   its column out: a column caught mid-layout can read narrower than the
       *   window, and that reading must not reach the screen even for a frame.
       * @param {object|null} [measured] - a frame the caller already measured.
       */
      const applyFit = (place, trusted = true, measured = null) => {
        // A live gesture owns the geometry: a fit landing mid-drag would yank the
        // card out from under the pointer.
        if (gestureRef.current !== null) return
        // An untrusted pass needs the card's place but not its limits: measuring
        // the column costs a scan of every message node, and the result is the
        // one thing that pass must not use. The composer's top is still honoured,
        // so the answering frame cannot sit under the pinned bar.
        const frame = measured ?? (trusted ? frameOf() : null)
        const rect = frame === null ? rectOf() : frame.rect
        const limits = !trusted
          ? cardLimits(viewportOf(), null, { bottom: pinnedTopOf(cardRef.current) })
          : (frame === null ? cardLimits(viewportOf(), clipRectOf(cardRef.current), cardRoomOf(cardRef.current)) : frame.limits)
        setMaxWidth(Math.round(limits.maxW))
        const chosen = chosenRef.current
        const current = boxRef.current
        const sized = {
          ...current,
          w: chosen.w === null || chosen.w === undefined ? null : Math.min(chosen.w, Math.round(limits.maxW)),
          h: chosen.h === null || chosen.h === undefined ? null : Math.min(chosen.h, Math.round(limits.maxH)),
        }
        // A rect still at the origin has not been placed by the host yet; its
        // numbers say nothing about where the card will end up.
        const placed = rect !== null && (rect.left !== 0 || rect.top !== 0)
        const next = place && placed ? fitBox(sized, rect, limits) : sized
        if (next.w === current.w && next.h === current.h && next.dx === current.dx && next.dy === current.dy) return
        paintBox(next)
        setBox(next)
        // The remembered size stays the user's, so reopening in a narrow window
        // does not turn a clamp into the card's own size.
        rememberBox(sessionId, { w: chosen.w, h: chosen.h })
      }

      /**
       * The window changed size: keep fitting the card into the room it leaves
       * until the card holds still. One pass is not enough — the host re-lays
       * its column out and re-anchors the card a beat after the window, so the
       * last word has to be a fitting pass, not a re-anchor that left the card
       * half off the screen.
       */
      const fitAfterLayoutChange = () => {
        // Answer at once, bounded by the window only: the card must not hang off
        // the edge for a frame, and a column caught mid-layout must not decide
        // the card's size.
        applyFit(true, false)
        const raf = typeof window === 'undefined' ? null : window.requestAnimationFrame?.bind(window) ?? null
        if (raf === null) return
        fitLoopRef.current += 1
        const generation = fitLoopRef.current
        let previous = null
        let still = 0
        let frames = 0
        const step = () => {
          if (fitLoopRef.current !== generation) return
          const frame = frameOf()
          // Where the card actually sits and how much room it has: both move
          // while the host is re-laying out, and both decide what "settled" is.
          const signature = frame === null
            ? null
            : `${Math.round(frame.rect.left)}:${Math.round(frame.rect.top)}:${Math.round(frame.limits.maxW)}`
          if (signature !== null && signature === previous) still += 1
          else still = 0
          previous = signature
          applyFit(true, true, frame)
          frames += 1
          if (still >= CARD_FIT_STABLE_FRAMES || frames >= CARD_FIT_MAX_FRAMES) return
          raf(step)
        }
        raf(step)
      }

      /** Start a move (`kind` = 'move') or a resize along `dir`. */
      const beginGesture = (kind, dir) => (event) => {
        if (event === null || event === undefined) return
        if (event.button !== undefined && event.button !== 0) return
        if (gestureRef.current !== null) return
        // A press on the close button (or any control) is the control's: the
        // gesture must not cancel it, or the card could not be dismissed.
        if (pressOwnedByControl(event.target)) return
        const frame = frameOf()
        if (frame === null) return
        // Cancelling the press keeps the text selection alive: an ordinary
        // mousedown inside the card clears it, and the host anchors the whole
        // surface to that selection.
        event.preventDefault?.()
        // The host closes the surface when focus leaves it, so take focus here
        // rather than wait for a mousedown that may never arrive.
        cardRef.current?.focus?.()
        gestureRef.current = {
          kind,
          dir,
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startedAt: Date.now(),
          box: boxRef.current,
          rect: frame.rect,
          limits: frame.limits,
          moved: false,
        }
        lockBody(cursorOfGesture(kind, dir))
        setGestureKind(kind)
        // The opening moment ends at the first press: even if the animation
        // finished a moment ago, the class must not be around when this gesture
        // ends, or the gesture rule turning it back on would replay it.
        setEntering(false)
        const card = cardRef.current
        if (typeof card.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            card.setPointerCapture(event.pointerId)
          } catch {
            /* capture keeps the pointer bound to the card; the window listeners work regardless */
          }
        }
      }

      /** Follow a live gesture. */
      const onGestureMove = (event) => {
        const gesture = gestureRef.current
        if (gesture === null) return
        if (gesture.pointerId !== undefined && event.pointerId !== undefined && gesture.pointerId !== event.pointerId) return
        const delta = { x: event.clientX - gesture.x, y: event.clientY - gesture.y }
        if (!gesture.moved
          && Math.abs(delta.x) < CARD_CLICK_DISTANCE
          && Math.abs(delta.y) < CARD_CLICK_DISTANCE) return
        gesture.moved = true
        paintBox(gesture.kind === 'move'
          ? dragBox(gesture.box, delta, gesture.rect, gesture.limits)
          : resizeBox(gesture.box, gesture.dir, delta, gesture.rect, gesture.limits))
      }

      /** End a gesture; a press that never travelled leaves the geometry alone. */
      const endGesture = () => {
        const gesture = gestureRef.current
        if (gesture === null) return
        gestureRef.current = null
        unlockBody()
        const card = cardRef.current
        if (card !== null && card !== undefined && typeof card.releasePointerCapture === 'function' && gesture.pointerId !== undefined) {
          try {
            card.releasePointerCapture(gesture.pointerId)
          } catch {
            /* the capture is already gone */
          }
        }
        const travelled = gesture.moved === true
        const now = Date.now()
        const clicked = !travelled && now - gesture.startedAt < CARD_CLICK_MS
        setGestureKind(null)
        if (clicked) {
          paintBox(gesture.box)
          return
        }
        // A move leaves the size alone: the width on screen may be one the
        // window clamped, and recording it would throw the user's own size away.
        if (gesture.kind === 'move') commitBox(boxRef.current, chosenRef.current)
        else commitBox(boxRef.current)
        const frame = frameOf()
        if (frame === null) return
        const uncovered = revealTitleBar(cardRef.current, boxRef.current, frame.rect, frame.limits)
        if (uncovered.dy !== boxRef.current.dy) commitBox(uncovered, chosenRef.current)
      }

      /** Home: back to the default size at the anchor. */
      const resetBox = () => {
        const frame = frameOf()
        const limits = frame === null ? cardLimits(viewportOf(), null, cardRoomOf(cardRef.current)) : frame.limits
        const home = { w: Math.round(clampNumber(CARD_DEFAULT_W, limits.minW, limits.maxW)), h: null, dx: 0, dy: 0 }
        // Home means "back to the default size at the anchor", but a narrow
        // window can leave the host's anchor too close to an edge: fit the card
        // back inside rather than let its right edge leave the screen.
        // Home asks for the default size even when the window cannot show it: the
        // painted width is fitted, but the wish is the default.
        commitBox(frame === null ? home : fitBox(home, frame.rect, limits), { w: CARD_DEFAULT_W, h: null })
        setSettling(true)
        if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null
          setSettling(false)
        }, 280)
      }

      /**
       * Where a card shortcut may fire: the card itself, its title bar, and the
       * resize grip. The grip is a tab stop that advertises `aria-valuenow`, so
       * landing on it must not lose the keys the title bar answers. A field or a
       * button still keeps its own keys.
       */
      const onCardHandle = (target) => target === cardRef.current
        || target === barRef.current
        || (target instanceof Element && target.closest('.clipchat-card__grip') !== null)

      /** Arrow keys move (8/40px), Alt+arrows resize (8/32px), Home resets. */
      const onCardKeyDown = (event) => {
        if (!onCardHandle(event.target)) return
        if (event.key === 'Home') {
          event.preventDefault?.()
          resetBox()
          return
        }
        const direction = CARD_KEY_VECTORS[event.key]
        if (direction === undefined) return
        const frame = frameOf()
        if (frame === null) return
        event.preventDefault?.()
        if (event.altKey === true) {
          // The arrow names the edge that moves and the size is always positive:
          // right/down grow, left/up pull the opposite edge in.
          const size = event.shiftKey === true ? CARD_KEY_RESIZE_LARGE : CARD_KEY_RESIZE
          const dir = direction.x !== 0 ? (direction.x > 0 ? 'e' : 'w') : (direction.y > 0 ? 's' : 'n')
          commitBox(resizeBox(boxRef.current, dir, { x: size, y: size }, frame.rect, frame.limits))
          return
        }
        const size = event.shiftKey === true ? CARD_KEY_MOVE_LARGE : CARD_KEY_MOVE
        commitBox(dragBox(boxRef.current, { x: direction.x * size, y: direction.y * size }, frame.rect, frame.limits), chosenRef.current)
      }

      // The opening animation runs once, as the card appears. Its class is
      // dropped once it has played, so no later state change (a gesture ending,
      // for one) can turn the animation back on and replay it.
      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return undefined
        const timer = window.setTimeout(() => setEntering(false), CARD_POP_MS)
        return () => window.clearTimeout(timer)
      }, [])

      // A live gesture is watched on the window: the card can be dragged out
      // from under the pointer, and every ending — release, cancel, lost
      // capture, window blur — must put the page back the way it was.
      React.useEffect(() => {
        if (gestureKind === null || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        const onEnd = () => endGesture()
        window.addEventListener('pointermove', onGestureMove)
        window.addEventListener('pointerup', onEnd)
        window.addEventListener('pointercancel', onEnd)
        window.addEventListener('lostpointercapture', onEnd)
        window.addEventListener('blur', onEnd)
        return () => {
          window.removeEventListener('pointermove', onGestureMove)
          window.removeEventListener('pointerup', onEnd)
          window.removeEventListener('pointercancel', onEnd)
          window.removeEventListener('lostpointercapture', onEnd)
          window.removeEventListener('blur', onEnd)
        }
      }, [gestureKind])

      // The window changed size: pull the card back inside what is left of its
      // container instead of letting it hang off the edge — without letting a
      // half-laid-out measurement decide the card's size for good.
      React.useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
        window.addEventListener('resize', fitAfterLayoutChange)
        return () => {
          window.removeEventListener('resize', fitAfterLayoutChange)
          fitLoopRef.current += 1
        }
      }, [])

      // Fit the card into this window on mount, and once more on the next
      // frame: the host anchors the card after our first render, and a card
      // reopened in a narrow window would otherwise sit at an anchor its right
      // edge cannot reach. The first pass places nothing: before the host has
      // put the card anywhere, its rect is not a place worth correcting.
      React.useEffect(() => {
        if (cardRef.current === null || cardRef.current === undefined) return
        applyFit(false)
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(() => applyFit(true))
      }, [])

      // One unconditional hook per snapshot slice; the fallback keeps the call
      // shape stable for harnesses without `useChat`.
      const useChatSlice = typeof useChat === 'function' ? useChat : () => undefined
      const nodes = useChatSlice((snapshot) => snapshot?.nodes)
      const timeline = useChatSlice((snapshot) => snapshot?.timeline)
      const locations = useChatSlice((snapshot) => snapshot?.locations)

      React.useEffect(() => {
        if (initialHighlightId === null || initialHighlightId === undefined) textareaRef.current?.focus()
      }, [])

      // One catalog read per card open; a failed read leaves follow plus the
      // stored choice, so the menu never blocks asking.
      React.useEffect(() => {
        let alive = true
        if (typeof fetch !== 'function') return () => { alive = false }
        const session = writeSessionId(sessionId)
        const query = session === null ? '' : `?sessionId=${encodeURIComponent(session)}`
        fetchJson(`${MODELS_PATH}${query}`)
          .then((payload) => {
            if (!alive || !Array.isArray(payload?.models)) return
            setModelList(payload.models)
          })
          .catch((error) => {
            if (alive) console.warn('dsh-clipchat: model list was not loaded', error)
          })
        return () => { alive = false }
      }, [])

      React.useEffect(() => () => {
        aliveRef.current = false
        controllerRef.current?.abort()
        controllerRef.current = null
        // A card that is dismissed mid-gesture must not leave the whole page
        // un-selectable or wearing a resize cursor.
        unlockBody()
        if (settleTimerRef.current !== null) clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
        fitLoopRef.current += 1
      }, [])

      // Clear the per-turn “copied” label after a moment.
      React.useEffect(() => {
        if (copiedTurn === null) return undefined
        const timer = setTimeout(() => setCopiedTurn(null), 1500)
        return () => clearTimeout(timer)
      }, [copiedTurn])

      // Detailed mode reads the session digest on demand: turning the toggle on
      // fetches it, turning it off forgets it so the next ask is cheap again.
      React.useEffect(() => {
        if (!detail || typeof fetch !== 'function') {
          setDetailDigest(null)
          setDetailState('idle')
          return undefined
        }
        if (typeof sessionId !== 'string' || sessionId.length === 0) {
          setDetailState('failed')
          return undefined
        }
        let alive = true
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        setDetailState('loading')
        fetchJson(
          `${CONTEXT_PATH}?sessionId=${encodeURIComponent(sessionId)}`,
          controller === null ? undefined : controller.signal,
        )
          .then((payload) => {
            if (!alive) return
            if (payload?.available !== true || typeof payload.digest !== 'string' || payload.digest.length === 0) {
              setDetailDigest(null)
              setDetailState('failed')
              return
            }
            setDetailDigest(payload)
            setDetailState('ready')
          })
          .catch((error) => {
            if (!alive || error?.name === 'AbortError') return
            setDetailDigest(null)
            setDetailState('failed')
          })
        return () => {
          alive = false
          controller?.abort()
        }
      }, [detail, sessionId])

      // The box shows one to three rows and grows with the draft, never past
      // three: past that the text scrolls inside the box instead of the card
      // growing without bound.
      React.useEffect(() => {
        const ta = textareaRef.current
        if (ta === null || ta === undefined) return
        ta.style.height = 'auto'
        const natural = Math.max(20, ta.scrollHeight || 20)
        const capped = natural > 60
        ta.style.height = `${Math.min(natural, 60)}px`
        ta.classList.toggle('is-capped', capped)
        if (capped && ta.selectionStart === ta.value.length) ta.scrollTop = ta.scrollHeight
      }, [draft])

      // A new question anchors to the top of the thread. A fresh turn is shorter
      // than the viewport, so reserve the missing height for the duration of the
      // answer: the question stays put while the answer grows into that space.
      React.useEffect(() => {
        if (asked === null) return
        const thread = threadRef.current
        const last = lastTurnRef.current
        if (thread === null || thread === undefined || last === null || last === undefined) return
        const reserve = Math.max(0, thread.clientHeight - last.offsetHeight + 24)
        thread.style.paddingBottom = reserve > 0 ? `${reserve}px` : ''
        thread.scrollTop = Math.max(0, last.offsetTop - 2)
      }, [asked])

      // Releasing the reserved tail when the answer settles shows a short answer
      // in full and leaves a long one exactly where the reader left it. No
      // scroll write here: that is the whole point of the change.
      React.useEffect(() => {
        const thread = threadRef.current
        if (thread === null || thread === undefined) return
        if (streaming) return
        thread.style.paddingBottom = ''
        // Every surface that mounts the card (browser, jsdom) has rAF; the frame
        // makes the measurement happen after the answer's layout has settled.
        requestAnimationFrame(refreshJump)
      }, [streaming, answer, history])

      // Preview URLs are owned by this card; release them when it closes.
      React.useEffect(() => () => {
        if (jumpRafRef.current !== null && typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(jumpRafRef.current)
        }
        jumpRafRef.current = null
        if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
        for (const url of createdUrlsRef.current) URL.revokeObjectURL(url)
        createdUrlsRef.current.clear()
      }, [])

      // Close the model menu on outside click; Esc closes the menu, not the card.
      React.useEffect(() => {
        if (!modelMenuOpen || typeof document === 'undefined') return undefined
        const closeOnOutside = (event) => {
          const target = event.target
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('.clipchat-card__modelwrap') !== null) return
          setModelMenuOpen(false)
        }
        const closeOnEscape = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setModelMenuOpen(false)
        }
        document.addEventListener('pointerdown', closeOnOutside, true)
        document.addEventListener('keydown', closeOnEscape, true)
        return () => {
          document.removeEventListener('pointerdown', closeOnOutside, true)
          document.removeEventListener('keydown', closeOnEscape, true)
        }
      }, [modelMenuOpen])

      // Close the round picker on an outside press.
      React.useEffect(() => {
        if (!jumpOpen || typeof document === 'undefined') return undefined
        const close = (event) => {
          const target = event.target
          if (target instanceof Element && target.closest('.clipchat-card__jumpmenu, .clipchat-card__jumpbar') !== null) return
          setJumpOpen(false)
        }
        document.addEventListener('pointerdown', close, true)
        return () => document.removeEventListener('pointerdown', close, true)
      }, [jumpOpen])

      /**
       * Ask one question and render the streamed answer.
       * @param {object} request - assembled request.
       * @param {number} requestId - monotonic id guarding stale updates.
       */
      const ask = async (request, requestId, signal, display = { question: '', files: [], snippets: [] }) => {
        const current = () => aliveRef.current && requestIdRef.current === requestId
        try {
          const response = await fetch(ASK_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(request),
            signal,
          })

          if (response.ok !== true) {
            let payload = {}
            try {
              payload = await response.json()
            } catch {
              /* A non-JSON rejection still has a status to report. */
            }
            if (current()) {
              setError(errorMessageOf(payload, translate))
              setStreaming(false)
            }
            return
          }

          const reader = response.body?.getReader?.()
          if (reader === undefined) {
            if (current()) {
              setError(translate('failed'))
              setStreaming(false)
            }
            return
          }

          const decoder = createSseDecoder()
          const textDecoder = new TextDecoder()
          let text = ''
          let failed = false
          let usage = null
          let route = null
          for (;;) {
            const { value, done } = await reader.read()
            if (done === true) break
            for (const frame of decoder.push(textDecoder.decode(value, { stream: true }))) {
              if (frame.type === 'meta') {
                const seen = normalizeModelRoute({ provider: frame.provider, model: frame.model })
                if (seen !== null) route = seen
                if (current() && seen !== null) setMeta(seen)
              } else if (frame.type === 'delta' && typeof frame.text === 'string') {
                text += frame.text
                if (current()) setAnswer(text)
              } else if (frame.type === 'usage') {
                const seen = frame.usage ?? frame
                usage = {
                  input: seen.inputTokens ?? seen.input ?? 0,
                  output: seen.outputTokens ?? seen.output ?? 0,
                }
                if (current()) setLiveTokens(usage)
              } else if (frame.type === 'error') {
                failed = true
                // The code, not the host's wording, decides what the card says:
                // a known code gets the card's own language, an unknown one
                // keeps the message the host sent.
                if (current()) {
                  setError(errorMessageOf({ error: frame.code, message: frame.message }, translate))
                }
              }
            }
          }

          if (current()) setStreaming(false)
          if (current() && !failed && text.length === 0) setError(translate('failed'))
          if (current() && !failed && text.length > 0) {
            setDraft('')
            setAsked(null)
            setAnswered({ question: request.question, answer: text })
            // Keeping the answer is the default; the 记录 button turns into its
            // cancel affordance so a throwaway question can still be dropped.
            setSavedRecordId(keepAnswer(request.question, text, usage, route))
            setTokens((previous) => addUsage(previous, normalizeUsage(usage)))
            setLiveTokens(null)
            setAnsweredUsage(normalizeUsage(usage))
            const nextHistory = [
              ...historyRef.current,
              { role: 'user', text: display.question, attachments: display.files, snippets: display.snippets },
              { role: 'assistant', text, usage },
            ]
            const trimmed = nextHistory.slice(-HISTORY_LIMIT)
            revokeDroppedUrls(historyRef.current, trimmed)
            historyRef.current = trimmed
            setHistory(trimmed)
          }
        } catch (thrown) {
          if (requestIdRef.current !== requestId) return
          if (thrown?.name === 'AbortError') {
            if (current()) {
              setStreaming(false)
              setError(translate('aborted'))
            }
            return
          }
          if (current()) {
            setError(translate('network'))
            setStreaming(false)
          }
        } finally {
          if (requestIdRef.current === requestId) controllerRef.current = null
        }
      }

      /**
       * Ask one question, carrying this turn's files and folded pastes.
       * @param {string} question - typed question (may be empty when extras exist).
       * @param {Array<{ kind: string, name: string, mediaType: string, data: string }>} attachments - wire attachments.
       * @param {Array<object>} displayFiles - files as the question bubble should show them.
       * @param {Array<object>} snippetList - folded pastes as the bubble should show them.
       */
      const submit = (question, attachments = [], displayFiles = [], snippetList = []) => {
        if (streaming) return
        if (question.length === 0 && attachments.length === 0 && snippetList.length === 0) return

        const chat = { nodes, timeline, locations }
        const node = typeof nodes?.get === 'function' ? nodes.get(nodeKey) : undefined
        const message = assistantTextOf(node)
        if (message.length === 0) {
          setError(translate('noContext'))
          return
        }
        const recent = recentTurnsOf(chat, nodeKey, RECENT_LIMIT)
        const neighbors = neighborContextOf(chat, nodeKey)
        const turn = nodeTurn(node)

        // Asking is the commit signal: the passage is highlighted on first ask.
        const highlightId = askHighlightId({ highlighted, anchor, model, add: addHighlight })
        if (highlightId !== null) setHighlighted(true)

        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        const requestId = ++requestIdRef.current

        // Snippets travel to the model as text; the bubble shows them as
        // separate blocks so a long paste never masquerades as the question.
        const composedQuestion = [
          question,
          ...snippetList.map((snippet) => `【附加文本】\n${snippet.text}`),
        ].filter((part) => typeof part === 'string' && part.length > 0).join('\n\n')

        setAsked(question)
        setAskedFiles(displayFiles)
        setAskedSnippets(snippetList)
        setDraft('')
        commitFiles([])
        setSnippets([])
        setAttachError('')
        setStreaming(true)
        setAnswer('')
        setError('')
        setLiveTokens(null)
        setAnsweredUsage(null)
        setInsertState('idle')
        setAnswered(null)

        const request = {
          sessionId,
          selection,
          message,
          turn,
          recent,
          neighbors,
          history,
          question: composedQuestion,
        }
        if (attachments.length > 0) request.attachments = attachments
        if (model !== null) request.model = model
        // Detailed mode only changes the request when the digest actually
        // arrived; a failed read falls back to the normal context.
        if (detail && detailState === 'ready' && typeof detailDigest?.digest === 'string') {
          request.detail = true
          request.digest = detailDigest.digest
        }
        void ask(request, requestId, controller.signal, { question, files: displayFiles, snippets: snippetList })
      }

      /**
       * Encode this turn's files and hand everything to `submit`.
       *
       * Encoding is asynchronous (base64), so a second click while it runs is
       * dropped by the `sending` flag rather than starting a second ask.
       */
      const send = async (questionOverride) => {
        if (streaming || sendingRef.current) return
        const question = (typeof questionOverride === 'string' ? questionOverride : draft).trim()
        if (question.length === 0 && files.length === 0 && snippets.length === 0) return
        sendingRef.current = true
        try {
          const wire = []
          for (const item of files) {
            wire.push({
              kind: item.url === null ? 'file' : 'image',
              name: item.file.name,
              mediaType: mediaTypeOf(item.file),
              data: await readFileAsBase64(item.file),
            })
          }
          const displayFiles = files.map((item) => ({
            id: item.id,
            name: item.file.name,
            bytes: item.file.size,
            url: item.url,
            image: item.url !== null,
          }))
          const snippetList = snippets.map((item) => ({
            id: item.id,
            text: item.text,
            lines: item.text.split('\n').length,
            chars: item.text.length,
            truncated: item.truncated === true,
          }))
          submit(question, wire, displayFiles, snippetList)
        } catch (error) {
          console.warn('dsh-clipchat: attachment could not be read', error)
          setError(translate('attachReadFailed'))
        } finally {
          sendingRef.current = false
        }
      }

      /** Release one preview URL this card created, if it is still alive. */
      const revokeOwnedUrl = (url) => {
        if (typeof url !== 'string' || url.length === 0) return
        if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
        createdUrlsRef.current.delete(url)
      }

      /** Commit the attachment list to the ref and to React in one step. */
      const commitFiles = (next) => {
        filesRef.current = next
        setFiles(next)
      }

      /**
       * Release the preview URLs of turns that just fell out of the thread.
       *
       * Attachments are shown as object URLs owned by this card. Trimming the
       * history drops the turn but not its blob, so without this the card keeps
       * every image it was ever sent alive until it closes.
       *
       * @param {Array<object>} previous - history before the append.
       * @param {Array<object>} next - history after trimming.
       */
      const revokeDroppedUrls = (previous, next) => {
        const kept = new Set(next)
        for (const entry of previous) {
          if (kept.has(entry)) continue
          const items = Array.isArray(entry?.attachments) ? entry.attachments : []
          for (const item of items) revokeOwnedUrl(item?.url)
        }
      }

      /** Folded pastes: appended, capped, removable. */
      const addSnippet = (raw) => {
        const value = String(raw ?? '').replace(/\r\n/gu, '\n').trim()
        if (value.length === 0) return
        if (snippets.length >= SNIPPET_MAX_COUNT) {
          setAttachError(fillTemplate(translate('snippetTooMany'), { max: SNIPPET_MAX_COUNT }))
          return
        }
        const truncated = value.length > SNIPPET_MAX_CHARS
        const stored = truncated ? value.slice(0, SNIPPET_MAX_CHARS) : value
        // Line count and length are measured once, here: the snippet header
        // re-renders with every keystroke in the composer.
        const snippet = {
          id: newComposerId('s'),
          text: stored,
          truncated,
          lines: stored.split('\n').length,
          chars: stored.length,
        }
        setSnippets((list) => (list.length >= SNIPPET_MAX_COUNT ? list : [...list, snippet]))
      }

      /** Add files from a picker, a drop, or a paste; refuse what cannot be sent. */
      const addFiles = (incoming) => {
        const list = Array.from(incoming ?? [])
        if (list.length === 0) return
        // The list is computed here rather than inside the state updater: the
        // updater must stay pure, and a refusal has to report a message.
        const next = [...filesRef.current]
        let message = ''
        for (const file of list) {
          if (next.length >= ATTACH_MAX_FILES) {
            message = fillTemplate(translate('attachTooMany'), { max: ATTACH_MAX_FILES })
            break
          }
          if (Number.isFinite(file.size) && file.size > ATTACH_MAX_BYTES) {
            message = fillTemplate(translate('attachTooLarge'), {
              name: file.name,
              max: formatBytes(ATTACH_MAX_BYTES),
            })
            continue
          }
          if (next.some((entry) => entry.file.name === file.name && entry.file.size === file.size)) continue
          const totalAfter = next.reduce((sum, entry) => sum + (Number.isFinite(entry.file.size) ? entry.file.size : 0), 0)
            + (Number.isFinite(file.size) ? file.size : 0)
          if (totalAfter > ATTACH_MAX_TOTAL_BYTES) {
            message = fillTemplate(translate('attachTotalTooLarge'), { max: formatBytes(ATTACH_MAX_TOTAL_BYTES) })
            continue
          }
          const url = isImageFile(file)
            && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
            ? URL.createObjectURL(file)
            : null
          if (url !== null) createdUrlsRef.current.add(url)
          next.push({
            id: newComposerId('f'),
            file,
            url,
          })
        }
        commitFiles(next)
        setAttachError(message)
      }

      /** Remove one attachment; only a preview URL owned here is revoked. */
      const removeFile = (id) => {
        const item = filesRef.current.find((entry) => entry.id === id)
        if (item !== undefined) revokeOwnedUrl(item.url)
        commitFiles(filesRef.current.filter((entry) => entry.id !== id))
      }

      /** Select one menu entry and persist it on the covering highlight. */
      const chooseModel = (key) => {
        const choice = modelChoicesOf(modelList, model).find((entry) => entry.key === key)
        const next = choice !== undefined && choice.model !== null ? normalizeModelRoute(choice) : null
        setModel(next)

        const id = highlightIdFor(nodeKey, selection, anchor)
        if (id === null) return
        const entry = highlights.get(id)
        if (entry === undefined) return
        const updated = { id: entry.id, anchor: entry.anchor, createdAt: entry.createdAt }
        if (next !== null) updated.model = next
        highlights.set(id, updated)
        void persistHighlight('add', updated, sessionId)
      }

      /**
       * Append one answer to the record of its passage.
       * @param {string} question - the question that produced it.
       * @param {string} answer - the answer text.
       * @param {{ input: number, output: number } | null} usage - token usage, when reported.
       * @param {{ provider: string, model: string } | null} route - the route that answered.
       * @returns {string | null} the stored record id.
       */
      const keepAnswer = (question, answer, usage, route) => {
        const highlightId = highlightIdFor(nodeKey, selection, anchor)
        // One record per highlight: a second question about the same passage
        // appends a turn instead of creating a second record.
        const existing = highlightId === null ? null : recordForHighlight(highlightId, selection)
        const turn = normalizeTurn({
          question,
          answer,
          provider: route?.provider ?? meta?.provider ?? model?.provider,
          model: route?.model ?? meta?.model ?? model?.model,
          usage: usage ?? undefined,
        })
        if (turn === null) return null
        const entry = recordWithTurn(existing, turn, selection, highlightId ?? undefined)
        if (entry === null) return null
        addRecord(entry, sessionId)
        bumpRecords((value) => value + 1)
        return entry.id
      }

      /**
       * Keep the current answer, or drop just the answer it was kept as.
       *
       * The footer disables this button when there is neither a saved record nor
       * an answer, so the handler always has one of the two to act on.
       */
      const toggleRecord = () => {
        if (savedRecordId !== null) {
          const entry = records.get(savedRecordId)
          const trimmed = recordWithoutLastTurn(entry)
          if (trimmed === null) {
            if (removeRecord(savedRecordId, sessionId)) {
              setSavedRecordId(null)
              bumpRecords((value) => value + 1)
            }
            return
          }
          // The passage keeps its earlier answers; only the newest one goes.
          addRecord(trimmed, sessionId)
          bumpRecords((value) => value + 1)
          return
        }
        setSavedRecordId(keepAnswer(answered.question, answered.answer, answeredUsage, meta))
      }

      /**
       * Insert one passage quote plus its Q&A summary into the main composer.
       * Shared by the card's own answer and by cross-session search results.
       * @param {string} passage - quoted text.
       * @param {string} question - the question to summarise.
       * @param {string} answer - the answer to summarise.
       */
      const insertIntoMain = (passage, question, answer) => {
        const payload = insertPayloadOf(passage, question, answer)
        if (payload === null) return
        const { text, plain } = payload
        try {
          let ok = false
          if (typeof inputActions?.insertQuote === 'function'
            && typeof inputActions?.captureInsertion === 'function'
            && typeof inputActions?.insertText === 'function') {
            const accepted = inputActions.insertQuote(passage)
            const span = inputActions.captureInsertion()
            ok = inputActions.insertText(accepted ? text : plain, span)
          }
          setInsertState(ok ? 'inserted' : 'failed')
        } catch {
          setInsertState('failed')
        }
      }

      /** Insert this card's last answer into the main composer. */
      const backToMain = () => {
        if (answered === null) return
        insertIntoMain(selection, answered.question, answered.answer)
      }

      /** Delete one record from memory and from the store. */
      const deleteRecord = (id) => {
        if (!removeRecord(id, sessionId)) return
        bumpRecords((value) => value + 1)
      }

      /** One compact record list row. */
      /** Jump to the passage a record came from, and open the card on it. */
      const locateRecord = (entry) => {
        const highlightId = highlightIdOfRecord(entry)
        if (highlightId === null) {
          setLocateFailed(true)
          return
        }
        setLocateFailed(false)
        const anchor = highlights.get(highlightId)?.anchor
        const node = anchor === undefined ? undefined : nodes?.get?.(anchor.nodeKey)
        // Close first: the card is anchored to the selection, so leaving it open
        // would re-anchor it onto the passage we are about to reveal and hide it.
        dismiss()
        if (!revealHighlight(highlightId, nodeTurn(node) ?? null, () => setLocateFailed(true))) setLocateFailed(true)
      }

      const recordRow = (entry) => {
        const expanded = openRecordId === entry.id
        const turns = Array.isArray(entry.turns) ? entry.turns : []
        const newest = turns.length > 0 ? turns[turns.length - 1] : null
        // Collapsed: the newest turn only. Expanded: every turn, oldest first.
        const shown = expanded ? turns : (newest === null ? [] : [newest])
        const route = newest?.provider && newest?.model
          ? `${newest.provider}/${newest.model}`
          : newest?.model
        return h('div', {
          key: entry.id,
          className: `clipchat-card__record${expanded ? ' is-open' : ''}`,
        },
          h('div', { className: 'clipchat-card__record-head' },
            h('span', {
              className: 'clipchat-card__record-selection',
              title: entry.selection,
            }, snippetOf(entry.selection, 60)),
            turns.length > 1
              ? h('span', { className: 'clipchat-card__tag' }, `${turns.length} 问`)
              : null,
            isCurrentSelection(entry, selection)
              ? h('span', { className: 'clipchat-card__tag' }, translate('currentSelection'))
              : null,
            h('button', {
              type: 'button',
              className: 'clipchat-card__record-del',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => deleteRecord(entry.id),
            }, translate('deleteRecord'))),
          h('button', {
            type: 'button',
            className: 'clipchat-card__record-body',
            title: translate('locateHint'),
            'aria-expanded': expanded,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setOpenRecordId(expanded ? null : entry.id),
          },
            shown.map((turn, index) => h('div', {
              key: `${entry.id}:${index}`,
              className: 'clipchat-card__record-turn',
            },
              h('div', { className: 'clipchat-card__record-q' }, snippetOf(turn.question, 200)),
              h('div', { className: 'clipchat-card__record-a' },
                expanded ? turn.answer : snippetOf(turn.answer, 400))))),
          h('div', { className: 'clipchat-card__record-foot' },
            h('div', { className: 'clipchat-card__record-meta' },
              [route, dateTextOf(entry.updatedAt ?? entry.createdAt)].filter(Boolean).join(' · ')),
            h('button', {
              type: 'button',
              className: 'clipchat-card__record-locate',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => locateRecord(entry),
            }, translate('locate'))),
        )
      }

      const onKeyDown = (event) => {
        // Enter sends, except while an IME composition is confirming.
        if (event.isComposing === true || event.nativeEvent?.isComposing === true) return
        if (event.key === 'Enter' && event.shiftKey !== true) {
          event.preventDefault()
          send()
        }
      }

      const totalTokens = addUsage(tokens, liveTokens)
      const tokenLine = totalTokens === null
        ? null
        : `${translate('tokensIn')} ${totalTokens.input} / ${translate('tokensOut')} ${totalTokens.output}`
      const modelChoices = modelChoicesOf(modelList, model)
      const currentModelKey = modelKeyOf(model)
      const currentChoice = modelChoices.find((choice) => choice.key === currentModelKey)
      const modelLabel = currentModelKey === FOLLOW_MODEL
        ? translate('followModel')
        : currentChoice?.name ?? model?.model ?? currentModelKey
      const recordEntries = recordList()
      const currentTurn = asked === null ? null : turnOf(asked, answer, {
        streaming,
        error,
        attachments: askedFiles,
        snippets: askedSnippets,
      })
      const turns = threadTurns(history, currentTurn, loadedRecord)
      const presetEntries = presetList(translate)

      /* Detailed mode: one 30px strip, with the injected rows in a hover popup. */
      const detailStats = detailState === 'ready' && detailDigest?.stats !== undefined
        ? detailDigest.stats
        : null
      const detailUsable = detail && detailStats !== null
      const stripState = !detail ? 'off' : (detailUsable ? 'on' : (detailState === 'loading' ? 'loading' : 'degraded'))
      const stripRows = contextRowsOf({
        selection,
        message: assistantTextOf(typeof nodes?.get === 'function' ? nodes.get(nodeKey) : undefined),
        neighbors: neighborContextOf({ nodes, timeline, locations }, nodeKey),
        recent: recentTurnsOf({ nodes, timeline, locations }, nodeKey, RECENT_LIMIT),
        stats: detailUsable ? detailStats : null,
      })
      const stripReadout = stripState === 'off'
        ? translate('detailOff')
        : stripState === 'loading'
          ? translate('detailLoading')
          : stripState === 'degraded'
            ? translate('detailDegraded')
            : fillTemplate(translate('detailOn'), { turns: detailStats?.turns ?? 0 })
      const stripNote = stripState === 'off'
        ? translate('detailNoteOff')
        : stripState === 'degraded' || stripState === 'loading'
          ? translate('detailNoteDegraded')
          : fillTemplate(translate('detailNoteOn'), { first: detailStats?.firstTurn ?? '—' })

      /** One row of the popup: label, dotted leader, value. */
      const stripRow = (id, label, value, flags = {}) => h('div', {
        key: id,
        className: `clipchat-strip__row${flags.isNew === true ? ' is-new' : ''}${flags.isOff === true ? ' is-off' : ''}`,
      },
        h('span', { className: 'clipchat-strip__k' }, label),
        h('span', { className: 'clipchat-strip__dots' }),
        h('span', { className: 'clipchat-strip__v' }, value))

      const stripLabelOf = {
        selection: translate('ctxSelection'),
        message: translate('ctxMessage'),
        neighbors: translate('ctxNeighbors'),
        recent: translate('ctxRecent'),
        turns: translate('ctxTurns'),
        tools: translate('ctxTools'),
        summary: translate('ctxSummary'),
      }

      /** One popup row, with its unit spelled out. */
      const stripRowOf = (row) => stripRow(
        row.id,
        stripLabelOf[row.id] ?? row.id,
        row.unit === 'turns' ? `${row.value} 轮`
          : row.unit === 'times' ? `${row.value} 次`
            : `${row.value.toLocaleString()} 字`,
        row,
      )

      const detailStrip = h('div', {
        className: `clipchat-strip${stripState === 'on' ? ' is-on' : ''}${stripState === 'degraded' || stripState === 'loading' ? ' is-degraded' : ''}`,
        title: stripNote,
      },
        // The switch and its label are one control: clicking either flips it,
        // and the rule after them separates the control from its value.
        h('span', { className: 'clipchat-strip__title' },
          h('button', {
            type: 'button',
            className: 'clipchat-strip__switch',
            role: 'switch',
            'aria-checked': detail,
            'aria-label': translate('detailHint'),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setDetail((on) => !on),
          }),
          h('span', {
            className: 'clipchat-strip__label',
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setDetail((on) => !on),
          }, translate('detail'))),
        h('span', { className: 'clipchat-strip__sep', 'aria-hidden': 'true' }),
        h('span', { className: 'clipchat-strip__readout' }, stripReadout),
        h('button', {
          type: 'button',
          className: 'clipchat-strip__more',
          'aria-label': translate('detailMore'),
          'aria-expanded': detailOpen,
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => setDetailOpen((open) => !open),
        }, translate('detailMore')),
        h('div', {
          className: `clipchat-strip__detail${detailOpen ? ' is-pinned' : ''}`,
          role: 'tooltip',
        },
          h('div', { className: 'clipchat-strip__head' }, translate('detailHead')),
          // Rows the base context already carries, then the extra rows only
          // detailed mode adds. The split is what the switch is actually buying.
          h('div', { className: 'clipchat-strip__group' },
            stripRows.rows.filter((row) => row.isNew !== true).map((row) => stripRowOf(row))),
          stripRows.rows.some((row) => row.isNew === true)
            ? h('div', { className: 'clipchat-strip__group is-added' },
              h('div', { className: 'clipchat-strip__grouptag' }, translate('detailAdded')),
              stripRows.rows.filter((row) => row.isNew === true).map((row) => stripRowOf(row)))
            : null,
          h('div', { className: 'clipchat-strip__foot', title: stripNote },
            fillTemplate(translate('detailTotal'), {
              chars: `${stripRows.chars.toLocaleString()} 字`,
              tokens: `≈${(stripRows.tokens / 1000).toFixed(1)}k tok`,
            }))))

      /** Copy one turn's answer; a denied clipboard must not break the card. */
      const copyTurn = async (turn, index) => {
        if (turn.answer.length === 0) return
        try {
          if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return
          // Copy what the reader sees: `**bold**` and `` `code` `` lose their markers.
          const plain = answerPlain(turn.answer)
          await navigator.clipboard.writeText(plain)
          setCopiedTurn(index)
        } catch {
          /* Ignore: the answer stays selectable even when the clipboard is denied. */
        }
      }

      const turnView = (turn, index) => h('div', {
        key: `${index}:${turn.question.slice(0, 12)}`,
        className: 'clipchat-card__turn',
        ref: index === turns.length - 1 ? lastTurnRef : undefined,
      },
        h('div', { className: 'clipchat-card__q' },
          turn.question.length > 0 ? h('div', { className: 'clipchat-card__qtext' }, turn.question) : null,
          turn.attachments.length === 0 ? null : h('div', { className: 'clipchat-card__tray' },
            turn.attachments.map((item) => (item.image ? fileThumbView(item, 'q') : fileChipView(item, 'q')))),
          turn.snippets.length === 0 ? null : h('div', { className: 'clipchat-card__qsnippets' },
            turn.snippets.map((snippet) => snippetQuoteView(snippet, 'q')))),
        h('div', { className: 'clipchat-card__a' },
          turn.answer.length > 0
            ? answerView(turn.answer)
            : turn.streaming ? translate('thinking') : '',
          turn.streaming ? h('span', { className: 'clipchat-card__cursor' }, '▍') : null),
        turn.error.length > 0
          ? h('div', { className: 'clipchat-card__error', role: 'alert' }, turn.error)
          : null,
        turn.answer.length > 0 && turn.streaming !== true
          ? h('div', { className: 'clipchat-card__turn-actions' },
            h('button', {
              type: 'button',
              className: 'clipchat-card__copy',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => void copyTurn(turn, index),
            }, copiedTurn === index ? translate('copied') : translate('copy')))
          : null,
      )

      /** One cross-session search result. */
      const searchRow = (item) => {
        const key = searchKeyOf(item)
        const expanded = search.expandedKey === key
        return h('div', {
          key,
          className: 'clipchat-search__row',
          title: item.sessionId,
        },
          h('div', { className: 'clipchat-search__selection' }, snippetOf(item.selection, 90)),
          h('div', { className: 'clipchat-search__q' }, snippetOf(item.question, 140)),
          h('div', { className: `clipchat-search__a${expanded ? ' is-open' : ''}` },
            expanded ? item.answer : snippetOf(item.answer, 180)),
          h('div', { className: 'clipchat-search__meta' },
            `${item.provider}/${item.model} · ${dateTextOf(item.createdAt)} · ${String(item.sessionId).slice(-6)}`),
          h('div', { className: 'clipchat-search__actions' },
            h('button', {
              type: 'button',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => void search.copy(item),
            }, search.copiedKey === key ? translate('copied') : translate('copy')),
            h('button', {
              type: 'button',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => insertIntoMain(item.selection, item.question, item.answer),
            }, translate('insertToMain')),
            h('button', {
              type: 'button',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => search.setExpandedKey(expanded ? null : key),
            }, expanded ? translate('collapseAnswer') : translate('expandAnswer'))))
      }

      /* Composer extras: one set of small views shared by the tray and the question bubble. */
      const fileChipView = (item, keyPrefix) => h('div', { key: `${keyPrefix}${item.id}`, className: 'clipchat-card__fchip' },
        h('span', { className: 'clipchat-card__fext' }, fileExtOf(item.name)),
        h('span', { className: 'clipchat-card__fmeta' },
          h('span', { className: 'clipchat-card__fname', title: item.name }, item.name),
          h('span', { className: 'clipchat-card__fsize' }, formatBytes(item.bytes))),
        keyPrefix === 'q' ? null : h('button', {
          type: 'button',
          className: 'clipchat-card__fx',
          'aria-label': `${translate('removeAttachment')} ${item.name}`,
          onClick: () => removeFile(item.id),
        }, '×'))

      const fileThumbView = (item, keyPrefix) => h('div', { key: `${keyPrefix}${item.id}`, className: 'clipchat-card__thumb' },
        h('button', {
          type: 'button',
          className: 'clipchat-card__thumb-img',
          title: item.name,
          onClick: () => setPreview(item.url),
        }, h('img', { src: item.url, alt: item.name })),
        keyPrefix === 'q' ? null : h('button', {
          type: 'button',
          className: 'clipchat-card__thumb-x',
          'aria-label': `${translate('removeAttachment')} ${item.name}`,
          onClick: () => removeFile(item.id),
        }, '×'))

      /** Header shared by the editable chip and the read-only bubble card. */
      const snippetHead = (snippet, right, tag = 'div') => h(tag, { className: 'clipchat-card__snippet-head' },
        h('span', { className: 'clipchat-card__snippet-mark' }, '文'),
        h('span', { className: 'clipchat-card__snippet-title' }, translate('snippetTitle')),
        h('span', { className: 'clipchat-card__snippet-meta' },
          fillTemplate(translate('snippetMeta'), {
            lines: snippet.lines ?? snippet.text.split('\n').length,
            chars: snippet.chars ?? snippet.text.length,
          }),
          snippet.truncated === true ? ` · ${translate('snippetTruncated')}` : ''),
        h('span', { className: 'clipchat-card__snippet-spacer' }),
        right)

      /** A snippet inside a question bubble: readable, expandable, not removable. */
      const snippetQuoteView = (snippet, keyPrefix) => h('details', {
        key: `${keyPrefix}${snippet.id}`,
        className: 'clipchat-card__snippet clipchat-card__snippet--view',
      },
        snippetHead(snippet, h('span', { className: 'clipchat-card__snippet-btn' }, translate('expandAnswer')), 'summary'),
        h('div', { className: 'clipchat-card__snippet-body' }, h('pre', null, snippet.text)))

      const snippetView = (snippet, keyPrefix, interactive) => h('div', {
        key: `${keyPrefix}${snippet.id}`,
        className: `clipchat-card__snippet${interactive === true && snippet.open ? ' is-open' : ''}`,
      },
        interactive === true
          ? snippetHead(snippet, h('span', { className: 'clipchat-card__snippet-actions' },
            h('button', {
              type: 'button',
              className: 'clipchat-card__snippet-btn',
              onClick: () => toggleSnippet(snippet.id),
            }, snippet.open ? translate('collapseAnswer') : translate('expandAnswer')),
            h('button', {
              type: 'button',
              className: 'clipchat-card__snippet-btn',
              'aria-label': translate('removeAttachment'),
              onClick: () => discardSnippet(snippet.id),
            }, '×')))
          : snippetHead(snippet, null),
        h('div', { className: 'clipchat-card__snippet-body' }, h('pre', null, snippet.text)))

      /** The tray above the field: images, file chips and folded pastes. */
      const attachmentContextView = () => h('div', { className: 'clipchat-card__ctx' },
        files.length === 0 ? null : h('div', { className: 'clipchat-card__tray' },
          files.map((item) => {
            const view = { id: item.id, name: item.file.name, bytes: item.file.size, url: item.url }
            return item.url === null ? fileChipView(view, 't') : fileThumbView(view, 't')
          })),
        snippets.map((snippet) => snippetView(snippet, 't', true)))

      const toggleSnippet = (id) => {
        setSnippets((list) => list.map((item) => (item.id === id ? { ...item, open: item.open !== true } : item)))
      }

      const discardSnippet = (id) => {
        setSnippets((list) => list.filter((item) => item.id !== id))
      }

      /** Paste: images become attachments, a long or wide paste becomes a snippet. */
      const onPaste = (event) => {
        const data = event.clipboardData
        if (data === null || data === undefined) return
        const items = Array.from(data.items ?? [])
        const images = items
          .filter((item) => item.kind === 'file' && String(item.type).startsWith('image/'))
          .map((item) => item.getAsFile())
          .filter(Boolean)
        if (images.length > 0) {
          event.preventDefault()
          addFiles(images)
          return
        }
        const text = typeof data.getData === 'function' ? data.getData('text/plain') : ''
        if (typeof text !== 'string' || text.length === 0) return
        const field = textareaRef.current
        const width = field?.clientWidth ?? 0
        // Measure with the font the field is actually painted in: the probe below
        // must not guess a typeface the host never uses.
        const font = field !== null && field !== undefined && typeof getComputedStyle === 'function'
          ? getComputedStyle(field).font
          : null
        if (shouldFoldPaste(text, width, font)) {
          event.preventDefault()
          addSnippet(text)
        }
      }

      /* --- Jump control: which way to jump, and how to apply it. --- */
      /** Geometry of the newest turn decides which way the jump points. */
      const refreshJump = () => {
        const thread = threadRef.current
        const last = lastTurnRef.current
        if (thread === null || thread === undefined || last === null || last === undefined) {
          setJumpMode(null)
          return
        }
        // The turn markup always has both parts; falling back to the turn's own
        // box keeps the measurement total instead of guarding a shape that
        // cannot occur.
        const bounds = thread.getBoundingClientRect()
        const q = last.querySelector('.clipchat-card__q')?.getBoundingClientRect() ?? last.getBoundingClientRect()
        const a = last.querySelector('.clipchat-card__a')?.getBoundingClientRect() ?? last.getBoundingClientRect()
        if (a.bottom > bounds.bottom - 4) setJumpMode('end')
        else if (q.bottom < bounds.top + 2) setJumpMode('start')
        else setJumpMode(null)
      }

      const onThreadScroll = () => {
        setJumpOpen(false)
        // A wheel or a momentum fling fires this at frame rate, and each measure
        // reads three boxes — which forces layout while a stream is painting.
        // Measure once for the event, then once after the frame so a commit that
        // lands mid-scroll cannot leave the button stale. Everything in between
        // is dropped.
        if (jumpRafRef.current !== null) return
        refreshJump()
        if (typeof requestAnimationFrame !== 'function') return
        jumpRafRef.current = requestAnimationFrame(() => {
          jumpRafRef.current = null
          refreshJump()
        })
      }

      /**
       * Move the thread to a target, then apply it once more on the next frame.
       *
       * The second write matters: closing the picker re-renders the card, and a
       * re-render can let the browser's scroll anchoring nudge scrollTop back.
       * Writing after the DOM has settled is what makes the jump stick.
       *
       * @param {() => number} target - reads the desired scrollTop.
       */
      const applyScroll = (target) => {
        const thread = threadRef.current
        if (thread === null || thread === undefined) return
        // A reserved tail from an in-flight answer would be counted as content.
        thread.style.paddingBottom = ''
        thread.scrollTop = target()
        requestAnimationFrame(() => {
          if (thread.isConnected !== true) return
          thread.scrollTop = target()
          refreshJump()
        })
      }

      /** Scroll one turn's question to the top of the thread. */
      const jumpToTurn = (index) => {
        const thread = threadRef.current
        if (thread === null || thread === undefined) return
        applyScroll(() => {
          const turn = thread.querySelectorAll('.clipchat-card__turn')[index]
          return turn === null || turn === undefined ? thread.scrollTop : Math.max(0, turn.offsetTop - 2)
        })
        setJumpOpen(false)
      }

      const scrollToJump = (mode) => {
        const thread = threadRef.current
        const last = lastTurnRef.current
        if (thread === null || thread === undefined) return
        if (mode === 'start' && last !== null && last !== undefined) {
          applyScroll(() => Math.max(0, last.offsetTop - 2))
          return
        }
        applyScroll(() => thread.scrollHeight)
      }

      const gestureClass = gestureKind === 'move' ? ' is-dragging' : (gestureKind === 'resize' ? ' is-resizing' : '')
      const sizeClass = box.h === null ? '' : ' is-sized'
      return h('div', {
        ref: cardRef,
        className: `clipchat-card${entering ? ' is-entering' : ''}${recordsOpen ? ' is-records' : ''}${sizeClass}${gestureClass}${settling ? ' is-settling' : ''}${dragOver ? ' is-dragover' : ''}`,
        style: boxStyleOf(box),
        tabIndex: -1,
        onKeyDown: onCardKeyDown,
        // Files can be dropped anywhere on the card, not only on the field.
        onDragOver: (event) => {
          if (!hasFilePayload(event)) return
          event.preventDefault()
          if (event.dataTransfer !== null && event.dataTransfer !== undefined) event.dataTransfer.dropEffect = 'copy'
          if (!dragOver) setDragOver(true)
        },
        onDragLeave: (event) => {
          if (!hasFilePayload(event)) return
          const next = event.relatedTarget
          if (next !== null && next !== undefined && event.currentTarget?.contains?.(next)) return
          setDragOver(false)
        },
        onDrop: (event) => {
          if (!hasFilePayload(event)) return
          event.preventDefault()
          setDragOver(false)
          addFiles(event.dataTransfer?.files)
        },
        onMouseDown: (event) => {
          const target = event.target
          // A control keeps its own focus; anything else focuses the card so the
          // host surface (which dismisses when focus leaves it) stays open.
          if (target instanceof Element && target.closest('textarea, input, select, button') !== null) return
          cardRef.current?.focus?.()
        },
      },
        h('div', {
          ref: barRef,
          className: 'clipchat-card__bar',
          role: 'group',
          tabIndex: 0,
          draggable: false,
          title: translate('dragHint'),
          'aria-label': translate('dragHint'),
          onPointerDown: beginGesture('move', ''),
        },
          h('span', { className: 'clipchat-card__mark' }, '✦'),
          h('span', {
            className: 'clipchat-card__bar-text',
            title: selection,
          }, selection.length > 0 ? selection : translate('empty')),
          h('button', {
            type: 'button',
            className: 'clipchat-card__close',
            'aria-label': translate('close'),
            title: translate('close'),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => dismiss(),
          }, '×')),
        recordsOpen ? h('div', { className: 'clipchat-card__records' },
          h('div', { className: 'clipchat-records__tabs' },
            h('button', {
              type: 'button',
              className: `clipchat-records__tab${recordsView === 'session' ? ' on' : ''}`,
              'aria-pressed': recordsView === 'session',
              onClick: () => setRecordsView('session'),
            }, `${translate('recordsSession')} ${recordEntries.length}`),
            h('button', {
              type: 'button',
              className: `clipchat-records__tab${recordsView === 'all' ? ' on' : ''}`,
              'aria-pressed': recordsView === 'all',
              onClick: () => setRecordsView('all'),
            }, search.state === 'idle' && search.total > 0 ? `${translate('recordsAll')} ${search.total}` : translate('recordsAll'))),
          locateFailed
            ? h('div', { className: 'clipchat-card__hint' }, translate('locateFailed'))
            : null,
          recordsView === 'session'
            ? (recordEntries.length === 0
              ? h('div', { className: 'clipchat-card__records-empty' }, translate('noRecords'))
              : recordEntries.map(recordRow))
            : h('div', { className: 'clipchat-search' },
              h('input', {
                className: 'clipchat-search__input',
                type: 'search',
                value: search.query,
                placeholder: translate('searchPlaceholder'),
                'aria-label': translate('searchPlaceholder'),
                onChange: (event) => search.setQuery(event.target.value),
              }),
              search.state === 'loading'
                ? h('div', { className: 'clipchat-card__hint' }, translate('searchLoading'))
                : null,
              search.state === 'error'
                ? h('div', { className: 'clipchat-card__error', role: 'alert' }, translate('searchFailed'))
                : null,
              search.state === 'idle' && search.results.length === 0
                ? h('div', { className: 'clipchat-card__hint' }, translate('searchEmpty'))
                : null,
              search.state === 'idle' && search.results.length > 0 && search.truncated
                ? h('div', { className: 'clipchat-card__hint' }, translate('searchTruncated'))
                : null,
              search.results.map(searchRow)),
        ) : null,

        h('div', { className: 'clipchat-card__presets' },
          presetEntries.map((preset) => h('button', {
            key: preset.id,
            type: 'button',
            className: 'clipchat-card__preset',
            disabled: presetDisabled(streaming, selection),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => void send(preset.question),
          }, preset.label))),

        h('div', { className: 'clipchat-card__threadwrap' },
          h('div', { ref: threadRef, className: 'clipchat-card__thread', onScroll: onThreadScroll },
            turns.length === 0
              ? h('div', { className: 'clipchat-card__empty' },
                h('span', { className: 'clipchat-card__empty-mark' }, '“'),
                h('div', { className: 'clipchat-card__empty-text' },
                  h('div', { className: 'clipchat-card__empty-title' }, translate('threadHint')),
                  h('div', { className: 'clipchat-card__empty-sub' }, translate('threadHintSub'))))
              : turns.map(turnView),
            asked === null && error.length > 0
              ? h('div', { className: 'clipchat-card__error', role: 'alert' }, error)
              : null)),

        // The jump control sits in its own row under the thread, so it never
        // covers a line of the answer. It only exists while there is somewhere
        // to jump, so it costs no space the rest of the time.
        recordsOpen || (jumpMode === null && turns.length <= 1) ? null : h('div', { className: 'clipchat-card__jumpbar' },
          turns.length > 1
            ? h('span', { className: 'clipchat-card__jumphint' }, fillTemplate(translate('jumpRounds'), { n: turns.length }))
            : null,
          h('div', { className: 'clipchat-card__jumpsplit' },
            jumpMode === null ? null : h('button', {
              type: 'button',
              className: 'clipchat-card__jump',
              onClick: () => scrollToJump(jumpMode),
            }, jumpMode === 'end' ? `↓ ${translate('jumpEnd')}` : `↑ ${translate('jumpStart')}`),
            turns.length > 1 ? h('button', {
              type: 'button',
              className: 'clipchat-card__jumpcaret',
              'aria-label': translate('jumpPick'),
              title: translate('jumpPick'),
              'aria-haspopup': 'menu',
              'aria-expanded': jumpOpen,
              onClick: () => setJumpOpen((open) => !open),
            }, '▾') : null),
          jumpOpen && turns.length > 1 ? h('div', {
            className: 'clipchat-card__jumpmenu',
            role: 'menu',
          },
            h('div', { className: 'clipchat-card__jumphead' }, translate('jumpPick')),
            turns.map((turn, index) => h('button', {
              key: `${index}:${turn.question.slice(0, 8)}`,
              type: 'button',
              role: 'menuitem',
              className: 'clipchat-card__jumpitem',
              onClick: () => jumpToTurn(index),
            },
              h('span', { className: 'clipchat-card__jumpindex' }, fillTemplate(translate('jumpTurn'), { n: index + 1 })),
              h('span', { className: 'clipchat-card__jumptext' }, snippetOf(turn.question, 28) || '—'))),
            h('button', {
              type: 'button',
              role: 'menuitem',
              className: 'clipchat-card__jumpitem is-end',
              onClick: () => { setJumpOpen(false); scrollToJump('end') },
            }, `↓ ${translate('jumpEnd')}`)) : null),

        dragOver
          ? h('div', { className: 'clipchat-card__drop' }, translate('dropHint'))
          : null,

        preview === null ? null : h('div', {
          className: 'clipchat-card__lightbox',
          onClick: () => setPreview(null),
        }, h('img', { src: preview, alt: '' })),

        h('div', { className: 'clipchat-card__composer' },
          files.length === 0 && snippets.length === 0 ? null : attachmentContextView(),
          attachError.length > 0
            ? h('div', { className: 'clipchat-card__hint', role: 'status' }, attachError)
            : null,
          h('div', { className: 'clipchat-card__row' },
            h('div', { className: 'clipchat-card__field' },
              h('button', {
                type: 'button',
                className: 'clipchat-card__attach',
                'aria-label': translate('attach'),
                title: translate('attach'),
                onMouseDown: (event) => event.preventDefault(),
                onClick: () => attachInputRef.current?.click(),
              },
                h('svg', {
                  width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none',
                  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', 'aria-hidden': 'true',
                }, h('path', { d: 'M8 3.2v9.6M3.2 8h9.6' }))),
              h('div', { className: 'clipchat-card__ta-wrap' },
                h('textarea', {
                  ref: textareaRef,
                  className: 'clipchat-card__ta',
                  rows: 1,
                  value: draft,
                  placeholder: files.length > 0 || snippets.length > 0
                    ? translate('placeholderWithFiles')
                    : translate('placeholder'),
                  title: translate('inputHint'),
                  onChange: (event) => setDraft(event.target.value),
                  onKeyDown,
                  onPaste,
                }))),
            h('button', {
              type: 'button',
              className: 'clipchat-card__send',
              'aria-label': streaming ? translate('stop') : translate('send'),
              title: streaming ? translate('stop') : translate('send'),
              disabled: streaming ? false : (draft.trim().length === 0 && files.length === 0 && snippets.length === 0),
              onMouseDown: (event) => event.preventDefault(),
              onClick: streaming ? () => controllerRef.current?.abort() : () => void send(),
            }, streaming ? '■' : '↑')),
          h('input', {
            ref: attachInputRef,
            type: 'file',
            multiple: true,
            style: { display: 'none' },
            onChange: (event) => {
              addFiles(event.target.files)
              event.target.value = ''
              textareaRef.current?.focus?.()
            },
          })),

        detailStrip,

        h('div', { className: 'clipchat-card__footer' },
          h('div', { className: 'clipchat-card__modelwrap' },
            h('button', {
              type: 'button',
              className: 'clipchat-card__modelbtn',
              'aria-label': `${translate('model')}: ${modelLabel}`,
              'aria-haspopup': 'menu',
              'aria-expanded': modelMenuOpen,
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => setModelMenuOpen((open) => !open),
            }, `${modelLabel} ▾`),
            modelMenuOpen
              ? h('div', { className: 'clipchat-card__modelmenu', role: 'menu' },
                modelChoices.map((choice) => h('button', {
                  key: choice.key,
                  type: 'button',
                  role: 'menuitemradio',
                  'aria-checked': choice.key === currentModelKey,
                  className: `clipchat-card__modelitem${choice.key === currentModelKey ? ' on' : ''}`,
                  onMouseDown: (event) => event.preventDefault(),
                  onClick: () => {
                    chooseModel(choice.key)
                    setModelMenuOpen(false)
                  },
                }, choice.key === FOLLOW_MODEL ? translate('followModel') : choice.name)))
              : null),
          h('span', { className: 'clipchat-card__tokens' },
            streaming ? translate('generating') : tokenLine ?? translate('noTokens')),
          h('span', { className: 'clipchat-card__spacer' }),
          anchor === null || anchor === undefined ? null : h('button', {
            type: 'button',
            className: 'clipchat-actions__btn',
            'aria-pressed': highlighted,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              if (highlighted) {
                const id = highlightIdFor(nodeKey, selection, anchor)
                // Removing the highlight also removes the answers kept for this
                // passage: an unmarked passage should not keep a record behind.
                const dropped = recordIdsOfHighlight(recordList(), id, selection)
                for (const recordId of dropped) removeRecord(recordId, sessionId)
                if (dropped.length > 0) {
                  setSavedRecordId((current) => (current !== null && dropped.includes(current) ? null : current))
                  bumpRecords((value) => value + 1)
                }
                if (id === null) {
                  setHighlighted(false)
                  return
                }
                removeHighlight(id)
                setHighlighted(false)
                void persistHighlight('remove', { id }, sessionId)
                return
              }
              if (addHighlight(anchor, model) !== null) setHighlighted(true)
            },
          }, highlighted ? translate('unhighlight') : translate('highlight')),
          h('button', {
            type: 'button',
            className: 'clipchat-actions__btn',
            'aria-pressed': savedRecordId !== null,
            title: savedRecordId === null ? undefined : translate('unrecordHint'),
            disabled: streaming || (answered === null && savedRecordId === null),
            onMouseDown: (event) => event.preventDefault(),
            onClick: toggleRecord,
          }, recordToggleLabel(savedRecordId, translate)),
          h('button', {
            type: 'button',
            className: 'clipchat-actions__btn',
            disabled: streaming || answered === null || insertState === 'inserted',
            onMouseDown: (event) => event.preventDefault(),
            onClick: backToMain,
          }, insertState === 'inserted' ? translate('inserted') : translate('backToMain')),
          h('button', {
            type: 'button',
            className: 'clipchat-actions__btn',
            'aria-expanded': recordsOpen,
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => setRecordsOpen((open) => !open),
          }, `${translate('records')} ${recordEntries.length}`)),

        insertState === 'failed'
          ? h('div', { className: 'clipchat-card__error clipchat-card__note', role: 'alert' }, translate('insertFailed'))
          : insertState === 'inserted'
            ? h('div', { className: 'clipchat-card__hint clipchat-card__note' }, translate('inserted'))
            : null,

        // One visible grip in the bottom-right corner; every other hot area is
        // invisible. Only the visible one enters the tab order — the keyboard
        // equivalent for all of them is Alt+arrow.
        CARD_GRIPS.map((dir) => {
          const visible = dir === 'se'
          return h('div', {
            key: dir,
            className: `clipchat-card__grip clipchat-card__grip--${dir}`,
            role: visible ? 'separator' : undefined,
            tabIndex: visible ? 0 : -1,
            'aria-hidden': visible ? undefined : true,
            'aria-label': visible ? translate('resizeHint') : undefined,
            'aria-orientation': visible ? 'horizontal' : undefined,
            'aria-valuenow': visible ? (box.w ?? CARD_DEFAULT_W) : undefined,
            'aria-valuemin': visible ? CARD_MIN_W : undefined,
            'aria-valuemax': visible ? Math.max(maxWidth, CARD_MIN_W) : undefined,
            title: visible ? translate('resizeHint') : undefined,
            onPointerDown: beginGesture('resize', dir),
          })
        }),
      )
    }

    /* Plugin entry. */
    function apply(ctx) {
      ctx.effect(() => {
        ensureStyle()
        return () => { styleTag?.remove(); styleTag = undefined }
      }, 'clipchat: styles')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'clipchat: dictionaries')
      const translate = ctx.locale.bind(NS)
      if (ctx.uiConversation !== undefined && ctx.uiConversation?.interactions !== undefined) {
        ctx.effect(() => ctx.uiConversation.interactions.register({
          id: 'clipchat',
          onInteraction(request) {
            if (request.trigger !== 'selection') return
            if (request.readText() === null) return
            const registered = ctx.uiConversation.interactions?.getSnapshot?.() ?? []
            if (Array.isArray(registered) && registered.includes('quote')) return
            request.open()
          },
        }), 'clipchat: fallback interaction')
        ctx.effect(() => ctx.slots.inject('conversation.chat.text-interaction', () => ctx.slots.register({
          name: 'conversation.chat.text-interaction',
          key: 'clipchat',
          locale: NS,
        }, ClipNotice)), 'clipchat: fallback surface')
      }

      ctx.effect(() => {
        ensureObserver()
        renderAll()
        void maybeLoadSession()
        const onResize = () => scheduleRender()
        const onHighlightClick = (event) => {
          const target = event.target instanceof Element ? event.target.closest('.clipchat-layer__line') : null
          if (target === null) return
          const entry = highlights.get(target.getAttribute('data-clipchat-id'))
          if (entry === undefined) return
          event.preventDefault()
          event.stopPropagation()
          openHighlight(entry)
        }
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('resize', onResize)
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          document.addEventListener('click', onHighlightClick, true)
        }
        return () => {
          if (observer !== null) observer.disconnect()
          observer = null
          if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('resize', onResize)
          }
          if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
            document.removeEventListener('click', onHighlightClick, true)
          }
          if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
            for (const layer of document.querySelectorAll('.clipchat-layer')) layer.remove()
          }
        }
      }, 'clipchat: highlights')

      ctx.effect(() => ctx.slots.inject('conversation.chat.text-interaction', () => {
        const owned = new Set()
        const patch = () => {
          for (const entry of ctx.slots.entries('conversation.chat.text-interaction')) {
            if (entry.options?.key !== 'quote' || entry.__clipchatOriginal !== undefined) continue
            const Original = entry.component
            entry.__clipchatOriginal = Original
            entry.component = (props) => h(ClipMenu, Object.assign({}, props, { Original, translate }))
            owned.add(entry)
          }
        }
        patch()
        const unsubscribe = ctx.slots.subscribe('conversation.chat.text-interaction', patch)
        return () => {
          unsubscribe()
          for (const entry of owned) {
            if (entry.__clipchatOriginal === undefined) continue
            entry.component = entry.__clipchatOriginal
            delete entry.__clipchatOriginal
          }
          owned.clear()
        }
      }), 'clipchat: quote menu')
    }

    return {
      name: 'clipchat',
      inject: ['slots', 'locale', 'uiConversation'],
      apply,
      __test: {
        /** The two locale dictionaries, so a parity test can compare them. */
        dictionaries: { zh, en },
        isAssistantNodeKey,
        nodeKeyOfSelection,
        assistantTextOf,
        userTextOf,
        nodeTurn,
        recentTurnsOf,
        neighborContextOf,
        createSseDecoder,
        errorMessageOf,
        segmentsForSpan,
        anchorFromSelection,
        resolvedSpanAt,
        insertPayloadOf,
        initialTokensOf,
        addUsage,
        IMAGE_MEDIA_TYPES,
        shouldFoldPaste,
        visualLineCount,
        formatBytes,
        fileExtOf,
        mediaTypeOf,
        isImageFile,
        hasFilePayload,
        readFileAsBase64,
        base64OfBytes,
        presetList,
        inlineParts,
        answerBlocks,
        answerView,
        answerPlain,
        threadTurns,
        turnOf,
        presetDisabled,
        fillTemplate,
        contextRowsOf,
        askHighlightId,
        recordToggleLabel,
        recordIdsOfHighlight,
        searchKeyOf,
        dateTextOf,
        ClipNotice,
        ClipMenu,
        ClipCard,
        currentSessionIdOf,
        highlightIdOf,
        highlightIdFor,
        anchorsOverlap,
        highlightIdOfRecord,
        revealHighlight,
        openHighlight,
        centreInColumn,
        centreDeltaOf,
        animateScroll,
        turnOfNodeKey,
        turnOfNode,
        turnOfText,
        navigateToTurn,
        scrollRailToTurn,
        holdCentred,
        nodesFor,
        blocksOf,
        offsetWithin,
        layerFor,
        rangeForSpan,
        recordForHighlight,
        ensureStyle,
        renderAll,
        scheduleRender,
        loadSession,
        hasHighlight,
        storedModelOf,
        normalizeModelRoute,
        modelKeyOf,
        modelChoicesOf,
        addHighlight,
        removeHighlight,
        maybeLoadSession,
        scheduleSessionCheck,
        buildRecord,
        recordWithTurn,
        recordWithoutLastTurn,
        normalizeTurn,
        recordCount,
        recordList,
        isCurrentSelection,
        normalizeUsage,
        persistRecord,
        addRecord,
        removeRecord,
        cardLimits,
        cardRoomOf,
        columnRectOf,
        pinnedTopOf,
        clampNumber,
        viewportOf,
        clipRectOf,
        cardFrameOf,
        dragBox,
        resizeBox,
        fitBox,
        boxStyleOf,
        cursorOfGesture,
        pressOwnedByControl,
        revealTitleBar,
        rememberedBox,
        rememberBox,
        cardSizes,
      },
    }
  },
})
