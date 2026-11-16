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
    const FOLLOW_MODEL = 'follow'
    const HISTORY_LIMIT = 12
    const RECENT_LIMIT = 3

    const zh = {
      ask: '问这段',
      title: '滑词对话',
      close: '关闭',
      placeholder: '就这段提问（Enter 发送，Shift+Enter 换行）',
      preview: '选段',
      empty: '（未读到选段）',
      send: '发送',
      sending: '回答中…',
      thinking: '正在回答…',
      tokensIn: '输入',
      tokensOut: '输出',
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
      recorded: '已留痕',
      records: '留痕',
      backToMain: '带回主线',
      previousQa: '此前问答',
      inserted: '已插入',
      insertFailed: '无法插入，请手动复制',
      currentSelection: '当前选段',
      deleteRecord: '删除',
      noRecords: '本会话暂无留痕',
    }
    const en = {
      ask: 'Ask about this',
      title: 'Clipchat',
      close: 'Close',
      placeholder: 'Ask about this passage (Enter to send, Shift+Enter for a new line)',
      preview: 'Selection',
      empty: '(no selected text)',
      send: 'Send',
      sending: 'Answering…',
      thinking: 'Answering…',
      tokensIn: 'in',
      tokensOut: 'out',
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
      recorded: 'Kept',
      records: 'Kept',
      backToMain: 'Send to main',
      previousQa: 'Earlier Q&A',
      inserted: 'Inserted',
      insertFailed: 'Could not insert. Copy manually.',
      currentSelection: 'This passage',
      deleteRecord: 'Delete',
      noRecords: 'No kept answers yet',
    }

    const css = `
.clipchat-menu{display:flex;align-items:center;gap:6px}
.clipchat-menu__ask{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);cursor:pointer;border-radius:999px;padding:5px 10px}
.clipchat-menu__ask:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card{width:min(360px,calc(100vw - 24px));box-sizing:border-box;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:var(--dsw-elevation-panel);padding:12px;display:flex;flex-direction:column;gap:8px}
.clipchat-card__head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:600}
.clipchat-card__close{border:none;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;border-radius:6px}
.clipchat-card__close:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__label{opacity:.6;font-size:11px}
.clipchat-card__selection{max-height:60px;overflow:auto;white-space:pre-wrap;border-radius:8px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));padding:6px 8px}
.clipchat-card__answer{max-height:180px;overflow:auto;white-space:pre-wrap;line-height:1.5;border-radius:8px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.06));padding:6px 8px}
.clipchat-card__answer:empty{display:none}
.clipchat-card__composer{display:flex;gap:6px;align-items:flex-end}
.clipchat-card__ta{flex:1;min-width:0;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;font:inherit;padding:6px 8px;overflow:hidden}
.clipchat-card__send{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer;border-radius:8px;padding:6px 10px;white-space:nowrap}
.clipchat-card__send:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchat-card__send:disabled{opacity:.5;cursor:default}
.clipchat-card__tokens{opacity:.6;font-size:11px}
.clipchat-card__modelrow{display:flex;align-items:center;gap:6px}
.clipchat-card__model{flex:1;min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:7px;background:transparent;color:inherit;font:var(--dsw-font-xs-13);padding:3px 6px}
.clipchat-card__error{color:#d9544d;font-size:12px;white-space:pre-wrap}
.clipchat-card__hint{opacity:.6;font-size:11px}
.clipchat-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.clipchat-actions__btn{border:1px solid var(--dsw-alias-border-l3);background:transparent;color:inherit;font:inherit;cursor:pointer;border-radius:8px;padding:5px 9px}
.clipchat-actions__btn:disabled{opacity:.55;cursor:default}
.clipchat-card__records{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto;border-top:1px solid var(--dsw-alias-border-l3);padding-top:6px}
.clipchat-card__record{border:1px solid var(--dsw-alias-border-l3);border-radius:8px;padding:6px;display:flex;flex-direction:column;gap:4px}
.clipchat-card__record-head{display:flex;align-items:center;gap:6px}
.clipchat-card__record-selection{flex:1;min-width:0;opacity:.7;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.clipchat-card__tag{font-size:10px;border-radius:999px;padding:1px 6px;background:color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 18%, transparent);white-space:nowrap}
.clipchat-card__record-q,.clipchat-card__record-a{white-space:pre-wrap;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;font-size:12px}
.clipchat-card__record-a{opacity:.75}
.clipchat-card__record-del{align-self:flex-end;border:none;background:transparent;color:inherit;opacity:.7;font:var(--dsw-font-xs-13);cursor:pointer;padding:0 2px}
.clipchat-card__record-del:hover{opacity:1}
.clipchat-card__records-empty{opacity:.6;font-size:11px}
.clipchat-layer{position:absolute;inset:0;pointer-events:none;z-index:5}
.clipchat-layer__rect{position:absolute;background:color-mix(in srgb, var(--dsw-alias-brand-primary, #2f6fed) 22%, transparent);border-radius:2px;pointer-events:auto;cursor:pointer}
`
    let styleTag

    function ensureStyle() {
      if (typeof document === 'undefined' || styleTag) return
      styleTag = document.createElement('style')
      styleTag.dataset.plugin = 'dsh-clipchat'
      styleTag.textContent = css
      document.head.appendChild(styleTag)
    }

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
              mark.className = 'clipchat-layer__rect'
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

    /** One-line summary of a Q&A for the main composer, capped at 200 chars. */
    function summarizeAnswer(question, answer, limit = 200) {
      const q = typeof question === 'string' ? question.trim() : ''
      const a = typeof answer === 'string' ? answer.trim() : ''
      if (a.length === 0) return ''
      const prefix = q.length > 0 ? `问题：${q}\n` : ''
      const full = `${prefix}回答：${a}`
      if (full.length <= limit) return full
      const room = Math.max(0, limit - prefix.length - '回答：'.length - 1)
      return `${prefix}回答：${a.slice(0, room)}…`
    }

    /** Shown when the host has no writable quote surface (read-only / subagent). */
    function ClipNotice(props) {
      const { dismiss, translate } = props
      return h('div', { className: 'clipchat-card' },
        h('div', { className: 'clipchat-card__head' },
          h('span', null, translate('title')),
          h('button', {
            type: 'button',
            className: 'clipchat-card__close',
            'aria-label': translate('close'),
            title: translate('close'),
            onClick: () => dismiss(),
          }, '×')),
        h('div', { className: 'clipchat-card__hint' }, translate('unavailable')),
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
      const controllerRef = React.useRef(null)
      const requestIdRef = React.useRef(0)
      const aliveRef = React.useRef(true)
      const [loadedRecord] = React.useState(() => initialHighlightId === null || initialHighlightId === undefined
        ? null
        : recordForHighlight(initialHighlightId, selection))
      const [draft, setDraft] = React.useState(() => loadedRecord?.question ?? '')
      const [answer, setAnswer] = React.useState(() => loadedRecord?.answer ?? '')
      const [tokens, setTokens] = React.useState(null)
      const [error, setError] = React.useState('')
      const [streaming, setStreaming] = React.useState(false)
      const [history, setHistory] = React.useState([])
      const [highlighted, setHighlighted] = React.useState(() => anchor !== null && anchor !== undefined && hasHighlight(nodeKey, selection))
      const [model, setModel] = React.useState(() => storedModelOf(nodeKey, selection))
      const [modelList, setModelList] = React.useState([])
      const [meta, setMeta] = React.useState(null)
      const [answered, setAnswered] = React.useState(null)
      const [recordsOpen, setRecordsOpen] = React.useState(false)
      const [insertState, setInsertState] = React.useState('idle')
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
        fetch(`${MODELS_PATH}${query}`)
          .then(async (response) => {
            if (response.ok !== true) throw new Error(`status ${response.status}`)
            const payload = await response.json()
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
          for (;;) {
            const { value, done } = await reader.read()
            if (done === true) break
            for (const frame of decoder.push(textDecoder.decode(value, { stream: true }))) {
              if (frame.type === 'meta') {
                const route = normalizeModelRoute({ provider: frame.provider, model: frame.model })
                if (current() && route !== null) setMeta(route)
              } else if (frame.type === 'delta' && typeof frame.text === 'string') {
                text += frame.text
                if (current()) setAnswer(text)
              } else if (frame.type === 'usage') {
                const usage = frame.usage ?? frame
                if (current()) {
                  setTokens({
                    input: usage.inputTokens ?? usage.input ?? 0,
                    output: usage.outputTokens ?? usage.output ?? 0,
                  })
                }
              } else if (frame.type === 'error') {
                failed = true
                if (current()) setError(typeof frame.message === 'string' ? frame.message : translate('failed'))
              }
            }
          }

          if (current()) setStreaming(false)
          if (current() && !failed && text.length > 0) {
            setDraft('')
            setAnswered({ question: request.question, answer: text })
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

      const send = () => {
        const question = draft.trim()
        if (streaming || question.length === 0) return

        const chat = { nodes, timeline, locations }
        const node = typeof nodes?.get === 'function' ? nodes.get(nodeKey) : undefined
        const message = assistantTextOf(node)
        if (message.length === 0) {
          setError(translate('noContext'))
          return
        }
        const recent = recentTurnsOf(chat, nodeKey, RECENT_LIMIT)
        const turn = nodeTurn(node)

        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        const requestId = ++requestIdRef.current

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
          history,
          question,
        }
        if (model !== null) request.model = model
        void ask(request, requestId, controller.signal)
      }

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

      /** Write this card's last successful answer as one 留痕 record. */
      const saveRecord = () => {
        if (answered === null) return
        const entry = buildRecord({
          highlightId: highlightIdOf(nodeKey, selection) ?? undefined,
          selection,
          question: answered.question,
          answer: answered.answer,
          provider: meta?.provider ?? model?.provider,
          model: meta?.model ?? model?.model,
          usage: tokens ?? undefined,
        })
        if (entry === null) return
        addRecord(entry, sessionId)
        bumpRecords((value) => value + 1)
      }

      /** Insert the selection quote plus a short Q&A summary into the main composer. */
      const backToMain = () => {
        if (answered === null) return
        const summary = summarizeAnswer(answered.question, answered.answer)
        if (summary.length === 0) return
        const text = `\n\n〔滑词〕${summary}`
        const plain = `> ${selection}${text}`
        try {
          let ok = false
          if (typeof inputActions?.insertQuote === 'function'
            && typeof inputActions?.captureInsertion === 'function'
            && typeof inputActions?.insertText === 'function') {
            const accepted = inputActions.insertQuote(selection)
            const span = inputActions.captureInsertion()
            ok = inputActions.insertText(accepted ? text : plain, span)
          }
          setInsertState(ok ? 'inserted' : 'failed')
        } catch {
          setInsertState('failed')
        }
      }

      /** Delete one record from memory and from the store. */
      const deleteRecord = (id) => {
        if (!removeRecord(id, sessionId)) return
        bumpRecords((value) => value + 1)
      }

      /** One compact 留痕 list row. */
      const recordRow = (entry) => h('div', {
        key: entry.id,
        className: 'clipchat-card__record',
      },
        h('div', { className: 'clipchat-card__record-head' },
          h('span', {
            className: 'clipchat-card__record-selection',
            title: entry.selection,
          }, snippetOf(entry.selection, 60)),
          isCurrentSelection(entry, selection)
            ? h('span', { className: 'clipchat-card__tag' }, translate('currentSelection'))
            : null),
        h('div', { className: 'clipchat-card__record-q', title: entry.question },
          snippetOf(entry.question, 160)),
        h('div', { className: 'clipchat-card__record-a', title: entry.answer },
          snippetOf(entry.answer, 220)),
        h('button', {
          type: 'button',
          className: 'clipchat-card__record-del',
          onMouseDown: (event) => event.preventDefault(),
          onClick: () => deleteRecord(entry.id),
        }, translate('deleteRecord')),
      )

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
      const recordEntries = recordList()
      const alreadyRecorded = answered !== null && recordEntries.some((entry) => (
        entry.selection === selection
        && entry.question === answered.question
        && entry.answer === answered.answer
      ))

      return h('div', { className: 'clipchat-card' },
        h('div', { className: 'clipchat-card__head' },
          h('span', null, translate('title')),
          h('button', {
            type: 'button',
            className: 'clipchat-card__close',
            'aria-label': translate('close'),
            title: translate('close'),
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => dismiss(),
          }, '×')),
        h('div', { className: 'clipchat-card__label' }, translate('preview')),
        h('div', { className: 'clipchat-card__selection' }, selection.length > 0 ? selection : translate('empty')),
        loadedRecord === null ? null : h('div', { className: 'clipchat-card__label' }, translate('previousQa')),
        loadedRecord === null ? null : h('div', { className: 'clipchat-card__record-q' }, loadedRecord.question),
        h('div', { className: 'clipchat-card__answer' },
          answer.length > 0 ? answer : streaming ? translate('thinking') : ''),
        tokenLine === null ? null : h('div', { className: 'clipchat-card__tokens' }, tokenLine),
        error.length > 0 ? h('div', { className: 'clipchat-card__error', role: 'alert' }, error) : null,
        h('div', { className: 'clipchat-card__composer' },
          h('textarea', {
            ref: textareaRef,
            className: 'clipchat-card__ta',
            rows: 2,
            value: draft,
            placeholder: translate('placeholder'),
            onChange: (event) => setDraft(event.target.value),
            onKeyDown,
          }),
          h('button', {
            type: 'button',
            className: 'clipchat-card__send',
            disabled: streaming ? false : draft.trim().length === 0,
            onClick: streaming ? () => controllerRef.current?.abort() : send,
          }, streaming ? translate('stop') : translate('send')),
        ),

        h('div', { className: 'clipchat-card__modelrow' },
          h('span', { className: 'clipchat-card__label' }, translate('model')),
          h('select', {
            className: 'clipchat-card__model',
            'aria-label': translate('model'),
            title: translate('model'),
            value: modelKeyOf(model),
            onChange: (event) => chooseModel(event.target.value),
          }, modelChoices.map((choice) => h('option', {
            key: choice.key,
            value: choice.key,
          }, choice.key === FOLLOW_MODEL ? translate('followModel') : choice.name)))),
        h('div', { className: 'clipchat-actions' },
          anchor === null || anchor === undefined ? null : h('button', {
            type: 'button',
            className: 'clipchat-actions__btn',
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => {
              if (highlighted) {
                const id = highlightIdOf(nodeKey, selection)
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
            disabled: streaming || answered === null || alreadyRecorded,
            onMouseDown: (event) => event.preventDefault(),
            onClick: saveRecord,
          }, alreadyRecorded ? translate('recorded') : translate('record')),
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
          }, `${translate('records')} ${recordEntries.length}`),
        ),
        insertState === 'failed'
          ? h('div', { className: 'clipchat-card__error', role: 'alert' }, translate('insertFailed'))
          : insertState === 'inserted'
            ? h('div', { className: 'clipchat-card__hint' }, translate('inserted'))
            : null,
        recordsOpen ? h('div', { className: 'clipchat-card__records' },
          recordEntries.length === 0
            ? h('div', { className: 'clipchat-card__records-empty' }, translate('noRecords'))
            : recordEntries.map(recordRow),
        ) : null,
      )
    }

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
          const target = event.target instanceof Element ? event.target.closest('.clipchat-layer__rect') : null
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
        createSseDecoder,
        errorMessageOf,
        segmentsForSpan,
        anchorFromSelection,
        resolvedSpanAt,
        summarizeAnswer,
        currentSessionIdOf,
        highlightIdOf,
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
