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
    const FOLLOW_MODEL = 'follow'
    const HISTORY_LIMIT = 12
    const RECENT_LIMIT = 3
    const NEIGHBOR_LIMIT = 2
    const SEARCH_LIMIT = 20

    /* Constants and locale dictionaries. */
    const zh = {
      ask: '问这段',
      title: '滑词对话',
      close: '关闭',
      placeholder: '直接问，或选一个快问',
      inputHint: 'Enter 发送，Shift+Enter 换行',
      empty: '（未读到选段）',
      send: '发送',
      thinking: '正在回答…',
      tokensIn: '输入',
      tokensOut: '输出',
      noTokens: 'token —',
      failed: '请求失败，请重试',
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
      record: '留痕',
      unrecord: '取消留痕',
      unrecordHint: '已留痕，点击取消',
      records: '留痕',
      backToMain: '带回主线',
      inserted: '已插入',
      insertFailed: '无法插入，请手动复制',
      currentSelection: '当前选段',
      deleteRecord: '删除',
      noRecords: '本会话暂无留痕',
      recordsSession: '本会话',
      recordsAll: '全部会话',
      searchPlaceholder: '搜索全部留痕…',
      searchEmpty: '没有匹配的留痕',
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
      collapseAnswer: '收起',
      threadHint: '问一句，这段话就会留在原文上。',
      threadHintSub: '回答会自动留痕，不需要时点「取消留痕」。',
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
      inputHint: 'Enter to send, Shift+Enter for a new line',
      empty: '(no selected text)',
      send: 'Send',
      thinking: 'Answering…',
      tokensIn: 'in',
      tokensOut: 'out',
      noTokens: 'token —',
      failed: 'Request failed. Try again.',
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
      records: 'Kept',
      backToMain: 'Send to main',
      inserted: 'Inserted',
      insertFailed: 'Could not insert. Copy manually.',
      currentSelection: 'This passage',
      deleteRecord: 'Delete',
      noRecords: 'No kept answers yet',
      recordsSession: 'This session',
      recordsAll: 'All sessions',
      searchPlaceholder: 'Search all kept answers…',
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
      collapseAnswer: 'Collapse',
      threadHint: 'Ask once and the passage stays marked in the reply.',
      threadHintSub: 'Answers are kept automatically; use 取消留痕 to drop one.',
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
.clipchat-card{width:min(600px,calc(100vw - 32px));max-height:min(520px,64vh);box-sizing:border-box;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:14px;box-shadow:var(--dsw-elevation-panel,0 12px 40px -12px rgba(0,0,0,.3));display:flex;flex-direction:column;animation:clipchat-pop .16s ease-out}
@keyframes clipchat-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.clipchat-card{animation:none}}
.clipchat-card__bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary,#666)}
.clipchat-card__mark{flex:none;font-size:12px;line-height:1;color:var(--dsw-alias-brand-primary,#2f6fed)}
.clipchat-card__bar-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:1.5}
.clipchat-card__close{flex:none;border:none;background:transparent;color:inherit;cursor:pointer;font-size:15px;line-height:1;padding:4px 6px;border-radius:7px;transition:background .12s ease,color .12s ease}
.clipchat-card__close:hover{background:var(--dsw-alias-button-floating-hover);color:var(--dsw-alias-label-primary)}
.clipchat-card__presets{display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px 4px}
.clipchat-card__preset{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));color:var(--dsw-alias-label-secondary,#666);border-radius:999px;padding:4px 11px;font:var(--dsw-font-xs-13);line-height:1.4;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease,transform .12s ease}
.clipchat-card__preset:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));background:var(--dsw-alias-button-floating-hover);transform:translateY(-1px)}
.clipchat-card__preset:disabled{opacity:.5;cursor:default}
.clipchat-card__thread{flex:1;min-height:96px;overflow:auto;overscroll-behavior:contain;padding:12px 16px 12px}
.clipchat-card__empty{display:flex;gap:10px;padding:18px 2px 10px}
.clipchat-card__empty-mark{flex:none;font-size:26px;line-height:1;color:var(--dsw-alias-brand-primary,#2f6fed);opacity:.35}
.clipchat-card__empty-text{display:flex;flex-direction:column;gap:3px;min-width:0}
.clipchat-card__empty-title{font-size:13px;line-height:1.6}
.clipchat-card__empty-sub{font-size:12px;line-height:1.5;opacity:.55}
.clipchat-card__turn{padding:2px 0 18px}
.clipchat-card__turn+.clipchat-card__turn{border-top:1px solid var(--dsw-alias-border-l3);padding-top:16px}
.clipchat-card__q{display:flex;gap:7px;align-items:baseline;font-size:12.5px;font-weight:600;line-height:1.55;white-space:pre-wrap;margin-bottom:10px;padding:7px 10px;border-radius:9px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));color:var(--dsw-alias-label-primary)}
.clipchat-card__q::before{content:'问';flex:none;font-size:10.5px;font-weight:500;line-height:1.9;opacity:.45}
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
.clipchat-card__turn-actions{display:flex;gap:6px;margin-top:6px;justify-content:flex-end}
.clipchat-card__copy{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:11px;line-height:1.4;cursor:pointer;border-radius:999px;padding:1px 8px;transition:background .12s ease,color .12s ease}
.clipchat-card__copy:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-hover)}
.clipchat-card:focus{outline:none}
.clipchat-card__cursor{display:inline-block;margin-left:1px;animation:clipchat-blink 1s step-end infinite}
@keyframes clipchat-blink{50%{opacity:0}}
@media (prefers-reduced-motion:reduce){.clipchat-card__cursor{animation:none}}
.clipchat-card__composer{display:flex;gap:8px;align-items:flex-end;padding:8px 16px;border-top:1px solid var(--dsw-alias-border-l3)}
.clipchat-card__ta{flex:1;min-width:0;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:13.5px;line-height:1.5;padding:8px 10px;min-height:36px;max-height:140px;overflow:auto;transition:border-color .12s ease,box-shadow .12s ease}
.clipchat-card__ta:focus{outline:none;border-color:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 50%, var(--dsw-alias-border-l3));box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 12%, transparent)}
.clipchat-card__send{flex:none;width:38px;height:38px;display:grid;place-items:center;border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));font:inherit;font-size:15px;cursor:pointer;border-radius:10px;padding:0;transition:opacity .12s ease,transform .12s ease,background .12s ease}
.clipchat-card__send:hover:not(:disabled){transform:translateY(-1px)}
.clipchat-card__send:disabled{background:transparent;color:var(--dsw-alias-label-primary);opacity:.45;cursor:default}
.clipchat-card__footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:0 16px 12px}
.clipchat-card__modelwrap{position:relative}
.clipchat-card__modelbtn{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font-size:11.5px;cursor:pointer;border-radius:999px;padding:3px 9px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background .12s ease,color .12s ease}
.clipchat-card__modelbtn:hover{background:var(--dsw-alias-button-floating-hover);color:var(--dsw-alias-label-primary)}
.clipchat-card__modelmenu{position:absolute;left:0;bottom:calc(100% + 6px);z-index:3;min-width:200px;max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:2px;padding:5px;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));border:1px solid var(--dsw-alias-border-l3);border-radius:10px;box-shadow:var(--dsw-elevation-panel)}
.clipchat-card__modelitem{flex:none;border:none;background:transparent;color:inherit;font:var(--dsw-font-xs-13);text-align:left;padding:7px 9px;border-radius:7px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:background .12s ease,color .12s ease}
.clipchat-card__modelitem:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__modelitem.on{color:var(--dsw-alias-brand-primary,#2f6fed);background:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 10%, transparent);font-weight:600}
.clipchat-card__spacer{flex:1}
.clipchat-card__tokens{font-size:11.5px;opacity:.55;font-variant-numeric:tabular-nums;white-space:nowrap}
.clipchat-card__error{color:#d9544d;font-size:12px;white-space:pre-wrap}
.clipchat-card__hint{opacity:.6;font-size:12px;line-height:1.5}
.clipchat-card__notice{padding:10px 12px 12px;opacity:.7;font-size:12px}
.clipchat-card__note{padding:0 16px 10px}
.clipchat-actions__btn{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary,#666);font:inherit;font-size:12px;cursor:pointer;border-radius:999px;padding:4px 10px;transition:background .12s ease,color .12s ease,border-color .12s ease}
.clipchat-actions__btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-hover)}
.clipchat-actions__btn[aria-pressed='true']{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2,var(--dsw-alias-border-l3));background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.12))}
.clipchat-actions__btn:disabled{opacity:.5;cursor:default}
.clipchat-card__records{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l3);padding:10px 16px 14px;margin:0}
.clipchat-card.is-records .clipchat-card__presets,.clipchat-card.is-records .clipchat-card__thread{display:none}
.clipchat-card.is-records .clipchat-card__records{border-top:none}
.clipchat-card__record{flex:none;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.04));transition:border-color .12s ease,background .12s ease}
.clipchat-card__record:hover{border-color:color-mix(in srgb, var(--dsw-alias-brand-primary,#2f6fed) 35%, var(--dsw-alias-border-l3));background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__record-head{display:flex;align-items:center;gap:6px}
.clipchat-card__record-selection{flex:1;min-width:0;opacity:.75;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-card__tag{font-size:10px;border-radius:999px;padding:1px 6px;background:color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 18%, transparent);white-space:nowrap}
.clipchat-card__record-body{display:flex;flex-direction:column;gap:4px;border:none;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer;width:100%}
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

    /** Stored highlights keyed by id: `{ id, anchor, createdAt }`. */
    const highlights = new Map()
    let pendingHighlightId = null
    /** Highlight whose underline should flash on the next render. */
    let pendingFlashId = null
    let nextHighlightId = 1

    /** Stored 留痕 records of the loaded session, keyed by id. */
    const records = new Map()
    let nextRecordId = 1
    let loadedSessionId = null
    let loadToken = 0
    let sessionTimer
    let applying = false
    let observer = null
    let observerTimer
    let observerOptions = { childList: true, subtree: true, characterData: true }

    /** @returns {string | null} id of the highlight covering this exact passage. */
    function highlightIdOf(nodeKey, text) {
      for (const [id, entry] of highlights) {
        const anchor = entry?.anchor
        if (anchor?.nodeKey === nodeKey && anchor.text === text) return id
      }
      return null
    }

    /** @returns {boolean} whether this exact passage already has a highlight. */
    function hasHighlight(nodeKey, text) {
      return highlightIdOf(nodeKey, text) !== null
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
     * Build one persisted 留痕 record, or null when the answer is incomplete.
     *
     * A record is only written when a question, an answer and the answering
     * route are all known; `usage` and `highlightId` are optional.
     * @param {object} input - card state captured when the user clicks 留痕.
     * @returns {object | null} the record, or null when it cannot be stored.
     */
    function buildRecord(input) {
      if (input === null || typeof input !== 'object') return null
      if (!isRecordText(input.selection) || input.selection.length > 4000) return null
      if (!isRecordText(input.question) || input.question.length > 20000) return null
      if (!isRecordText(input.answer) || input.answer.length > 512 * 1024) return null
      if (!isRecordText(input.provider) || !isRecordText(input.model)) return null
      if (input.createdAt !== undefined && !Number.isFinite(input.createdAt)) return null
      const usage = input.usage === undefined ? null : normalizeUsage(input.usage)
      if (input.usage !== undefined && usage === null) return null
      const entry = {
        id: isRecordText(input.id) ? input.id : newRecordId(),
        selection: input.selection,
        question: input.question,
        answer: input.answer,
        provider: input.provider,
        model: input.model,
        createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
      }
      if (isRecordText(input.highlightId)) entry.highlightId = input.highlightId
      if (usage !== null) entry.usage = usage
      return entry
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
      if (hasHighlight(anchor.nodeKey, anchor.text)) return null
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
      highlights.clear()
      records.clear()
      loadedSessionId = sessionId ?? null
      renderAll()
      if (typeof sessionId !== 'string' || sessionId.length === 0) return
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
      const box = lines[0].getBoundingClientRect()
      const view = scroller.getBoundingClientRect()
      if (box.height <= 0) return
      const delta = box.top - view.top - (scroller.clientHeight - box.height) / 2
      if (Number.isFinite(delta) && Math.abs(delta) > 4) scroller.scrollTop += delta
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
      const step = () => {
        const lines = linesOf()
        const line = lines[0]
        if (line !== undefined) {
          const box = line.getBoundingClientRect()
          const view = scroller.getBoundingClientRect()
          if (box.height > 0) {
            const delta = box.top - view.top - (scroller.clientHeight - box.height) / 2
            if (Number.isFinite(delta) && Math.abs(delta) > 2) scroller.scrollTop += delta
          }
        }
        if (Date.now() < until) setTimeout(step, 100)
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
      if (used === null) {
        const node = nodesFor(anchor.nodeKey)[0]
        if (node === undefined || typeof node.scrollIntoView !== 'function') return false
        node.scrollIntoView({ block: 'center' })
      }

      // The host scrolls (and may mount the turn) asynchronously; wait for the
      // underline to be laid out before centring and flashing it.
      const deadline = Date.now() + (used === 'load' ? 6000 : 3000)
      const tick = () => {
        const lines = linesOf()
        const laid = lines.some((line) => line.getBoundingClientRect().height > 0)
        if (!laid && Date.now() < deadline) {
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
            for (const rect of range.getClientRects()) {
              if (rect.width <= 0 || rect.height <= 0) continue
              const mark = document.createElement('div')
              mark.className = id === pendingFlashId
                ? 'clipchat-layer__line is-flash'
                : 'clipchat-layer__line'
              mark.setAttribute('data-clipchat-id', id)
              mark.style.left = `${(rect.left - columnRect.left) / scaleX - column.clientLeft + column.scrollLeft}px`
              mark.style.top = `${(rect.top - columnRect.top) / scaleY - column.clientTop + column.scrollTop}px`
              mark.style.width = `${rect.width / scaleX}px`
              mark.style.height = `${rect.height / scaleY}px`
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
        default: return typeof payload?.message === 'string' && payload.message.length > 0
          ? payload.message
          : translate('failed')
      }
    }

    /** Shorten one text for a compact list row. */
    function snippetOf(text, limit) {
      if (typeof text !== 'string') return ''
      return text.length <= limit ? text : `${text.slice(0, limit)}…`
    }

    /**
     * Split an answer into display blocks: headings, lists, quotes, paragraphs.
     *
     * Answers arrive as Markdown and the card used to print the raw text, so
     * `### 标题` and `- 要点` showed up as literal characters. Only the shapes
     * that actually appear in answers are recognised; anything else stays a
     * paragraph, and nothing is ever parsed as HTML.
     *
     * @param {unknown} text - answer text.
     * @returns {Array<{ kind: string, level?: number, ordered?: boolean, text?: string, items?: string[] }>} blocks.
     */
    function answerBlocks(text) {
      if (typeof text !== 'string' || text.length === 0) return []
      const lines = text.replace(/\r\n/gu, '\n').split('\n')
      const blocks = []
      let paragraph = []
      let list = null
      const flushParagraph = () => {
        if (paragraph.length === 0) return
        blocks.push({ kind: 'p', text: paragraph.join('\n') })
        paragraph = []
      }
      const flushList = () => {
        if (list === null) return
        blocks.push(list)
        list = null
      }
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) {
          flushParagraph()
          flushList()
          continue
        }
        const heading = /^(#{1,6})\s+(.*)$/u.exec(trimmed)
        if (heading !== null) {
          flushParagraph()
          flushList()
          blocks.push({ kind: 'h', level: Math.min(heading[1].length, 4), text: heading[2] })
          continue
        }
        const bullet = /^[-*+]\s+(.*)$/u.exec(trimmed)
        if (bullet !== null) {
          flushParagraph()
          if (list === null || list.ordered === true) {
            flushList()
            list = { kind: 'ul', ordered: false, items: [] }
          }
          list.items.push(bullet[1])
          continue
        }
        const ordered = /^\d+[.)]\s+(.*)$/u.exec(trimmed)
        if (ordered !== null) {
          flushParagraph()
          if (list === null || list.ordered !== true) {
            flushList()
            list = { kind: 'ol', ordered: true, items: [] }
          }
          list.items.push(ordered[1])
          continue
        }
        const quote = /^>\s?(.*)$/u.exec(trimmed)
        if (quote !== null) {
          flushParagraph()
          flushList()
          blocks.push({ kind: 'quote', text: quote[1] })
          continue
        }
        flushList()
        paragraph.push(line)
      }
      flushParagraph()
      flushList()
      return blocks
    }

    /**
     * Plain text of an answer for the clipboard: block markers dropped, the way
     * the reader sees them.
     * @param {unknown} text - answer text.
     * @returns {string} plain text.
     */
    function answerPlain(text) {
      return answerBlocks(text).map((block) => {
        if (block.kind === 'h') return block.text
        if (block.kind === 'quote') return `“${block.text}”`
        if (block.kind === 'ul' || block.kind === 'ol') {
          return block.items
            .map((item, index) => `${block.ordered === true ? `${index + 1}. ` : '- '}${item}`)
            .join('\n')
        }
        return block.text
      }).join('\n\n')
    }

    /**
     * One-line summary of a Q&A for the main composer, capped at 200 chars.
     * Newlines are folded to spaces: the composer already separates blocks, and
     * an inserted line break reads as an accidental blank line.
     */
    function summarizeAnswer(question, answer, limit = 200) {
      const oneLine = (value) => value.replace(/\s*\n+\s*/gu, ' ').trim()
      const q = typeof question === 'string' ? oneLine(question) : ''
      const a = typeof answer === 'string' ? oneLine(answer) : ''
      if (a.length === 0) return ''
      const prefix = q.length > 0 ? `问题：${q} ` : ''
      const full = `${prefix}回答：${a}`
      if (full.length <= limit) return full
      const room = Math.max(0, limit - prefix.length - '回答：'.length - 1)
      return `${prefix}回答：${a.slice(0, room)}…`
    }

    /**
     * Payload for inserting a passage quote plus its Q&A summary into the main
     * composer. The text never starts or ends with a newline: the composer
     * already provides the separation, and a leading blank line reads as a bug.
     * @param {string} passage - quoted text.
     * @param {string} question - the question to summarise.
     * @param {string} answer - the answer to summarise.
     * @returns {{ text: string, plain: string } | null} payload, or null when empty.
     */
    function insertPayloadOf(passage, question, answer) {
      const summary = summarizeAnswer(question, answer)
      if (summary.length === 0) return null
      return {
        text: `〔滑词〕${summary}`.trim(),
        plain: `> ${passage}\n\n〔滑词〕${summary}`.trim(),
      }
    }

    /** Build one visible thread turn from its parts. */
    function turnOf(question, answer, options = {}) {
      return {
        question,
        answer: typeof answer === 'string' ? answer : '',
        streaming: options.streaming === true,
        error: typeof options.error === 'string' ? options.error : '',
      }
    }

    /**
     * Records that belong to one highlight: the ones saved against its id, plus
     * any record whose selection is this exact passage (older records predate
     * the id link). Dropping a highlight drops these too; the reverse is not
     * true, so cancelling a single 留痕 keeps the highlight.
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
     * Label for the 留痕 toggle: an unsaved answer offers 留痕, a saved one
     * offers 取消留痕 so the automatic save can be undone.
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
     * Flatten one answer into plain, bold and code parts. Only `**bold**` and
     * `` `code` `` are recognized; every other character stays literal text.
     * @param {string} text - answer text.
     * @returns {Array<{ text: string, strong?: boolean, code?: boolean }>} parts.
     */
    function inlineParts(text) {
      if (typeof text !== 'string' || text.length === 0) return []
      const parts = []
      const pattern = /\*\*([\s\S]+?)\*\*|`([^`\n]+)`/gu
      let last = 0
      for (const match of text.matchAll(pattern)) {
        if (match.index > last) parts.push({ text: text.slice(last, match.index) })
        if (match[1] !== undefined) parts.push({ text: match[1], strong: true })
        else parts.push({ text: match[2], code: true })
        last = match.index + match[0].length
      }
      if (last < text.length) parts.push({ text: text.slice(last) })
      return parts
    }

    /**
     * Visible Q&A turns: the recalled record first, then completed pairs, then
     * the in-flight or failed question.
     * @param {Array<{ role: string, text: string }>} history - completed pairs.
     * @param {{ question: string, answer: string, streaming?: boolean, error?: string } | null} current - in-flight turn.
     * @param {{ question: string, answer: string } | null} [loadedRecord] - record opened from a highlight.
     * @returns {Array<object>} turns in display order.
     */
    function threadTurns(history, current, loadedRecord = null) {
      const turns = []
      if (loadedRecord !== null && loadedRecord !== undefined) {
        turns.push(turnOf(loadedRecord.question, loadedRecord.answer))
      }
      const entries = Array.isArray(history) ? history : []
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        if (entry === null || entry === undefined || entry.role !== 'user') continue
        const next = entries[index + 1]
        const hasAnswer = next !== undefined && next !== null && next.role === 'assistant'
        turns.push(turnOf(entry.text, hasAnswer ? next.text : ''))
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
      const [tokens, setTokens] = React.useState(null)
      const [error, setError] = React.useState('')
      const [streaming, setStreaming] = React.useState(false)
      const [asked, setAsked] = React.useState(null)
      const [history, setHistory] = React.useState([])
      const [highlighted, setHighlighted] = React.useState(() => anchor !== null && anchor !== undefined && hasHighlight(nodeKey, selection))
      const [model, setModel] = React.useState(() => storedModelOf(nodeKey, selection))
      const [modelList, setModelList] = React.useState([])
      const [modelMenuOpen, setModelMenuOpen] = React.useState(false)
      const [recordsView, setRecordsView] = React.useState('session')
      const search = useCrossSessionSearch(recordsView === 'all')
      const [meta, setMeta] = React.useState(null)
      const [answered, setAnswered] = React.useState(() => loadedRecord === null
        ? null
        : { question: loadedRecord.question, answer: loadedRecord.answer })
      const [recordsOpen, setRecordsOpen] = React.useState(false)
      const [insertState, setInsertState] = React.useState('idle')
      const [copiedTurn, setCopiedTurn] = React.useState(null)
      // The record kept for the current answer; an answer is kept by default.
      const [savedRecordId, setSavedRecordId] = React.useState(() => loadedRecord?.id ?? null)
      const [openRecordId, setOpenRecordId] = React.useState(null)
      const [locateFailed, setLocateFailed] = React.useState(false)
      const [, bumpRecords] = React.useState(0)

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
      }, [])

      // Clear the per-turn “copied” label after a moment.
      React.useEffect(() => {
        if (copiedTurn === null) return undefined
        const timer = setTimeout(() => setCopiedTurn(null), 1500)
        return () => clearTimeout(timer)
      }, [copiedTurn])

      // Keep the newest turn in view while the answer grows.
      React.useEffect(() => {
        const thread = threadRef.current
        if (thread !== null && thread !== undefined) thread.scrollTop = thread.scrollHeight
      }, [answer, streaming, history])

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

      /**
       * Ask one question and render the streamed answer.
       * @param {object} request - assembled request.
       * @param {number} requestId - monotonic id guarding stale updates.
       */
      const ask = async (request, requestId, signal) => {
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
                if (current()) setTokens(usage)
              } else if (frame.type === 'error') {
                failed = true
                if (current()) setError(typeof frame.message === 'string' ? frame.message : translate('failed'))
              }
            }
          }

          if (current()) setStreaming(false)
          if (current() && !failed && text.length === 0) setError(translate('failed'))
          if (current() && !failed && text.length > 0) {
            setDraft('')
            setAsked(null)
            setAnswered({ question: request.question, answer: text })
            // Keeping the answer is the default; the 留痕 button turns into its
            // cancel affordance so a throwaway question can still be dropped.
            setSavedRecordId(keepAnswer(request.question, text, usage, route))
            setHistory((previous) => [
              ...previous,
              { role: 'user', text: request.question },
              { role: 'assistant', text },
            ].slice(-HISTORY_LIMIT))
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

      const submit = (question) => {
        if (streaming || question.length === 0) return

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

        setAsked(question)
        setDraft('')
        setStreaming(true)
        setAnswer('')
        setError('')
        setTokens(null)
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
          question,
        }
        if (model !== null) request.model = model
        void ask(request, requestId, controller.signal)
      }

      const send = () => submit(draft.trim())

      /** Select one menu entry and persist it on the covering highlight. */
      const chooseModel = (key) => {
        const choice = modelChoicesOf(modelList, model).find((entry) => entry.key === key)
        const next = choice !== undefined && choice.model !== null ? normalizeModelRoute(choice) : null
        setModel(next)

        const id = highlightIdOf(nodeKey, selection)
        if (id === null) return
        const entry = highlights.get(id)
        if (entry === undefined) return
        const updated = { id: entry.id, anchor: entry.anchor, createdAt: entry.createdAt }
        if (next !== null) updated.model = next
        highlights.set(id, updated)
        void persistHighlight('add', updated, sessionId)
      }

      /**
       * Store one answer as a 留痕 record.
       * @param {string} question - the question that produced it.
       * @param {string} answer - the answer text.
       * @param {{ input: number, output: number } | null} usage - token usage, when reported.
       * @param {{ provider: string, model: string } | null} route - the route that answered.
       * @returns {string | null} the stored record id.
       */
      const keepAnswer = (question, answer, usage, route) => {
        const entry = buildRecord({
          highlightId: highlightIdOf(nodeKey, selection) ?? undefined,
          selection,
          question,
          answer,
          provider: route?.provider ?? meta?.provider ?? model?.provider,
          model: route?.model ?? meta?.model ?? model?.model,
          usage: usage ?? tokens ?? undefined,
        })
        if (entry === null) return null
        addRecord(entry, sessionId)
        bumpRecords((value) => value + 1)
        return entry.id
      }

      /** Keep the current answer, or drop the record it was kept as. */
      const toggleRecord = () => {
        if (savedRecordId !== null) {
          if (removeRecord(savedRecordId, sessionId)) {
            setSavedRecordId(null)
            bumpRecords((value) => value + 1)
          }
          return
        }
        if (answered === null) return
        setSavedRecordId(keepAnswer(answered.question, answered.answer, tokens, meta))
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

      /** One compact 留痕 list row. */
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
        return h('div', {
          key: entry.id,
          className: `clipchat-card__record${expanded ? ' is-open' : ''}`,
        },
          h('div', { className: 'clipchat-card__record-head' },
            h('span', {
              className: 'clipchat-card__record-selection',
              title: entry.selection,
            }, snippetOf(entry.selection, 60)),
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
            h('div', { className: 'clipchat-card__record-q' }, snippetOf(entry.question, 200)),
            h('div', { className: 'clipchat-card__record-a' },
              expanded ? entry.answer : snippetOf(entry.answer, 400))),
          h('div', { className: 'clipchat-card__record-foot' },
            h('div', { className: 'clipchat-card__record-meta' },
              [
                entry.provider && entry.model ? `${entry.provider}/${entry.model}` : entry.model,
                dateTextOf(entry.createdAt),
              ].filter(Boolean).join(' · ')),
            h('button', {
              type: 'button',
              className: 'clipchat-card__record-locate',
              onMouseDown: (event) => event.preventDefault(),
              onClick: () => locateRecord(entry),
            }, translate('locate'))))
      }

      const onKeyDown = (event) => {
        // Enter sends, except while an IME composition is confirming.
        if (event.isComposing === true || event.nativeEvent?.isComposing === true) return
        if (event.key === 'Enter' && event.shiftKey !== true) {
          event.preventDefault()
          send()
        }
      }

      const tokenLine = tokens === null
        ? null
        : `${translate('tokensIn')} ${tokens.input} / ${translate('tokensOut')} ${tokens.output}`
      const modelChoices = modelChoicesOf(modelList, model)
      const currentModelKey = modelKeyOf(model)
      const currentChoice = modelChoices.find((choice) => choice.key === currentModelKey)
      const modelLabel = currentModelKey === FOLLOW_MODEL
        ? translate('followModel')
        : currentChoice?.name ?? model?.model ?? currentModelKey
      const recordEntries = recordList()
      const currentTurn = asked === null ? null : turnOf(asked, answer, { streaming, error })
      const turns = threadTurns(history, currentTurn, loadedRecord)
      const presetEntries = presetList(translate)

      /** Inline markup: only `**bold**` and `` `code` `` are styled. */
      const inlineView = (text, prefix) => inlineParts(text).map((part, index) => {
        if (part.code === true) return h('code', { key: `${prefix}:${index}` }, part.text)
        if (part.strong === true) return h('strong', { key: `${prefix}:${index}` }, part.text)
        return part.text
      })

      /** Render an answer as blocks instead of printing its Markdown. */
      const answerView = (text) => answerBlocks(text).map((block, index) => {
        const key = `${index}:${block.kind}`
        if (block.kind === 'h') {
          return h(`h${block.level + 2}`, { key, className: 'clipchat-card__h' }, inlineView(block.text, key))
        }
        if (block.kind === 'quote') {
          return h('blockquote', { key, className: 'clipchat-card__quote' }, inlineView(block.text, key))
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          return h(block.kind === 'ol' ? 'ol' : 'ul', { key, className: 'clipchat-card__list' },
            block.items.map((item, itemIndex) => h('li', { key: `${key}:${itemIndex}` }, inlineView(item, `${key}:${itemIndex}`))))
        }
        return h('p', { key, className: 'clipchat-card__p' }, inlineView(block.text, key))
      })

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
      },
        h('div', { className: 'clipchat-card__q' }, turn.question),
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

      return h('div', {
        ref: cardRef,
        className: `clipchat-card${recordsOpen ? ' is-records' : ''}`,
        tabIndex: -1,
        onMouseDown: (event) => {
          const target = event.target
          // A control keeps its own focus; anything else focuses the card so the
          // host surface (which dismisses when focus leaves it) stays open.
          if (target instanceof Element && target.closest('textarea, input, select, button') !== null) return
          cardRef.current?.focus?.()
        },
      },
        h('div', { className: 'clipchat-card__bar' },
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
            onClick: () => submit(preset.question),
          }, preset.label))),

        h('div', { ref: threadRef, className: 'clipchat-card__thread' },
          turns.length === 0
            ? h('div', { className: 'clipchat-card__empty' },
              h('span', { className: 'clipchat-card__empty-mark' }, '“'),
              h('div', { className: 'clipchat-card__empty-text' },
                h('div', { className: 'clipchat-card__empty-title' }, translate('threadHint')),
                h('div', { className: 'clipchat-card__empty-sub' }, translate('threadHintSub'))))
            : turns.map(turnView),
          asked === null && error.length > 0
            ? h('div', { className: 'clipchat-card__error', role: 'alert' }, error)
            : null),

        h('div', { className: 'clipchat-card__composer' },
          h('textarea', {
            ref: textareaRef,
            className: 'clipchat-card__ta',
            rows: 1,
            value: draft,
            placeholder: translate('placeholder'),
            title: translate('inputHint'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown,
          }),
          h('button', {
            type: 'button',
            className: 'clipchat-card__send',
            'aria-label': streaming ? translate('stop') : translate('send'),
            title: streaming ? translate('stop') : translate('send'),
            disabled: streaming ? false : draft.trim().length === 0,
            onMouseDown: (event) => event.preventDefault(),
            onClick: streaming ? () => controllerRef.current?.abort() : send,
          }, streaming ? '■' : '↑')),

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
                const id = highlightIdOf(nodeKey, selection)
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
        summarizeAnswer,
        insertPayloadOf,
        presetList,
        inlineParts,
        answerBlocks,
        answerPlain,
        threadTurns,
        turnOf,
        presetDisabled,
        askHighlightId,
        recordToggleLabel,
        recordIdsOfHighlight,
        searchKeyOf,
        dateTextOf,
        ClipNotice,
        ClipCard,
        currentSessionIdOf,
        highlightIdOf,
        highlightIdOfRecord,
        revealHighlight,
        turnOfNodeKey,
        turnOfNode,
        turnOfText,
        hasHighlight,
        storedModelOf,
        normalizeModelRoute,
        modelKeyOf,
        modelChoicesOf,
        addHighlight,
        loadSession,
        maybeLoadSession,
        buildRecord,
        recordCount,
        recordList,
        isCurrentSelection,
        normalizeUsage,
        persistRecord,
        addRecord,
        removeRecord,
      },
    }
  },
})
