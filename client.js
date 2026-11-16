window.__ModuleLoader__.load({
  id: 'dsh-clipchat',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'clipchat'
    const ASK_PATH = '/dsh-clipchat/ask'
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
      aborted: '已停止',
      noModel: '当前没有可用模型',
      noContext: '未能读取这条消息，请重新划选',
      selectionTooLong: '选段过长，请缩短到 2000 字以内',
      contextTooLong: '上下文过长，请缩短问题',
      llmUnavailable: '模型服务暂不可用，请稍后重试',
      forbidden: '没有权限或登录已失效，请刷新页面',
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
      aborted: 'Stopped',
      noModel: 'No model is available right now',
      noContext: 'Could not read this message. Select the text again.',
      selectionTooLong: 'The selection is too long. Keep it under 2000 characters.',
      contextTooLong: 'Context is too long. Shorten the question.',
      llmUnavailable: 'The model service is unavailable. Try again later.',
      forbidden: 'Not allowed, or the session expired. Refresh the page.',
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
.clipchat-card__error{color:#d9544d;font-size:12px;white-space:pre-wrap}
.clipchat-card__hint{opacity:.6;font-size:11px}
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
        default: return typeof payload?.message === 'string' && payload.message.length > 0
          ? payload.message
          : translate('failed')
      }
    }

    function ClipMenu(props) {
      const { Original, dismiss, readText, translate } = props
      const [expanded, setExpanded] = React.useState(false)
      const [nodeKey] = React.useState(nodeKeyOfSelection)
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

      return h(ClipCard, Object.assign({}, props, { selection, nodeKey, dismiss, translate }))
    }

    function ClipCard(props) {
      const { selection, nodeKey, dismiss, translate, sessionId, useChat } = props
      const textareaRef = React.useRef(null)
      const controllerRef = React.useRef(null)
      const requestIdRef = React.useRef(0)
      const aliveRef = React.useRef(true)
      const [draft, setDraft] = React.useState('')
      const [answer, setAnswer] = React.useState('')
      const [tokens, setTokens] = React.useState(null)
      const [error, setError] = React.useState('')
      const [streaming, setStreaming] = React.useState(false)
      const [history, setHistory] = React.useState([])

      // One unconditional hook per snapshot slice; the fallback keeps the call
      // shape stable for harnesses without `useChat`.
      const useChatSlice = typeof useChat === 'function' ? useChat : () => undefined
      const nodes = useChatSlice((snapshot) => snapshot?.nodes)
      const timeline = useChatSlice((snapshot) => snapshot?.timeline)
      const locations = useChatSlice((snapshot) => snapshot?.locations)

      React.useEffect(() => {
        if (textareaRef.current !== null) textareaRef.current.focus()
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

          if (current()) setDraft('')
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
              if (frame.type === 'delta' && typeof frame.text === 'string') {
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
            setHistory((previous) => [
              ...previous,
              { role: 'user', text: request.question },
              { role: 'assistant', text },
            ].slice(-HISTORY_LIMIT))
          }
        } catch (thrown) {
          if (thrown?.name === 'AbortError' || requestIdRef.current !== requestId) return
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

        void ask({
          sessionId,
          selection,
          message,
          turn,
          recent,
          history,
          question,
        }, requestId, controller.signal)
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
            disabled: streaming || draft.trim().length === 0,
            onClick: send,
          }, streaming ? translate('sending') : translate('send')),
        ),
      )
    }

    function apply(ctx) {
      ctx.effect(() => {
        ensureStyle()
        return () => { styleTag?.remove(); styleTag = undefined }
      }, 'clipchat: styles')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'clipchat: dictionaries')
      const translate = ctx.locale.bind(NS)

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
      inject: ['slots', 'locale'],
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
      },
    }
  },
})
