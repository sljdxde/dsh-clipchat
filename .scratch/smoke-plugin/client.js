window.__ModuleLoader__.load({
  id: 'dsh-clipchat-smoke',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'clipchatSmoke'

    const zh = {
      title: '滑词冒烟',
      subtitle: 'Ticket 09：验证浮窗 props 与两轮直连模型',
      close: '关闭',
      checks: 'props 自检',
      ask: '连续两问',
      asking: '提问中…',
      placeholder: '就这段文字提问',
      answer: '回答',
      tokens: 'tokens',
      clear: '清空',
      selectionEmpty: '（未读到选段）',
      firstQuestion: '用一句话说明这段文字在讲什么。',
      secondQuestion: '再用不超过十个字概括一次。',
    }
    const en = {
      title: 'Clipchat smoke',
      subtitle: 'Ticket 09: surface props and two direct model turns',
      close: 'Close',
      checks: 'Props check',
      ask: 'Ask twice',
      asking: 'Asking…',
      placeholder: 'Ask about this passage',
      answer: 'Answer',
      tokens: 'tokens',
      clear: 'Clear',
      selectionEmpty: '(no selected text)',
      firstQuestion: 'Summarize this passage in one sentence.',
      secondQuestion: 'Summarize it again in ten words or fewer.',
    }

    const css = `
.clipchatSmoke{width:min(380px,calc(100vw - 24px));box-sizing:border-box;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:var(--dsw-elevation-panel);padding:12px;font:var(--dsw-font-xs-13);display:flex;flex-direction:column;gap:8px}
.clipchatSmoke__head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.clipchatSmoke__title{font-weight:600}
.clipchatSmoke__subtitle{opacity:.7;font-size:12px;margin-top:2px}
.clipchatSmoke__x{border:none;background:transparent;color:inherit;cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;border-radius:6px}
.clipchatSmoke__x:hover{background:var(--dsw-alias-button-floating-hover)}
.clipchatSmoke__sel{max-height:48px;overflow:auto;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));white-space:pre-wrap}
.clipchatSmoke__mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.clipchatSmoke__row{display:flex;justify-content:space-between;gap:8px}
.clipchatSmoke__ok{color:var(--dsw-alias-status-success,#2e7d32)}
.clipchatSmoke__bad{color:var(--dsw-alias-status-danger,#c62828)}
.clipchatSmoke__ta{width:100%;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;font:inherit;padding:6px 8px;overflow:hidden}
.clipchatSmoke__actions{display:flex;gap:8px;align-items:center}
.clipchatSmoke__btn{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-floating-fill);color:inherit;border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit}
.clipchatSmoke__btn:disabled{opacity:.5;cursor:default}
.clipchatSmoke__answer{max-height:160px;overflow:auto;white-space:pre-wrap;line-height:1.5}
.clipchatSmoke__log{max-height:96px;overflow:auto;opacity:.75;white-space:pre-wrap;font-size:11px}
.clipchatSmoke__hint{opacity:.6;font-size:11px}
`
    let styleTag

    function ensureStyle() {
      if (typeof document === 'undefined' || styleTag) return
      styleTag = document.createElement('style')
      styleTag.dataset.plugin = 'dsh-clipchat-smoke'
      styleTag.textContent = css
      document.head.appendChild(styleTag)
    }

    function ChatProbe({ useChat }) {
      const info = useChat((snapshot) => {
        const nodes = snapshot && snapshot.nodes
        const values = nodes && typeof nodes.values === 'function' ? nodes.values() : []
        return `${values.length} nodes / ${snapshot.order.length} order`
      })
      return h('span', { className: 'clipchatSmoke__mono' }, info)
    }

    function Check({ label, ok, value }) {
      return h('div', { className: 'clipchatSmoke__row' },
        h('span', null, label),
        h('span', { className: `clipchatSmoke__mono ${ok ? 'clipchatSmoke__ok' : 'clipchatSmoke__bad'}` },
          ok ? `✓ ${value}` : `✗ ${value}`),
      )
    }

    function SmokeCard(props) {
      const { dismiss, readText, sessionId, useChat, inputActions, t, trigger } = props
      const [selection] = React.useState(() => readText() ?? '')
      const [question, setQuestion] = React.useState(t('firstQuestion'))
      const [answer, setAnswer] = React.useState('')
      const [usage, setUsage] = React.useState(null)
      const [log, setLog] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const textareaRef = React.useRef(null)
      const abortRef = React.useRef(null)
      const historyRef = React.useRef([])

      React.useEffect(() => {
        const el = textareaRef.current
        if (el) el.focus()
      }, [])

      React.useEffect(() => () => { abortRef.current?.abort() }, [])

      const append = (line) => setLog((prev) => [...prev.slice(-24), line])

      const ask = async (text) => {
        const controller = new AbortController()
        abortRef.current = controller
        setAnswer('')
        setUsage(null)
        append(`→ q:${text.slice(0, 18)}`)
        const res = await fetch('/dsh-clipchat-smoke/ask', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            selection,
            question: text,
            history: historyRef.current,
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          append(`✗ HTTP ${res.status}`)
          throw new Error(`HTTP ${res.status}`)
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let acc = ''
        let firstToken = 0
        const started = performance.now()
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const line = frame.trim()
            if (!line.startsWith('data:')) continue
            let payload
            try {
              payload = JSON.parse(line.slice(5).trim())
            } catch {
              continue
            }
            if (payload.type === 'delta') {
              if (firstToken === 0) firstToken = Math.round(performance.now() - started)
              acc += payload.text
              setAnswer(acc)
            } else if (payload.type === 'usage') {
              setUsage(payload.usage)
            } else if (payload.type === 'meta') {
              append(`meta ${payload.provider}/${payload.model}`)
            } else if (payload.type === 'done') {
              append(`✓ done ${payload.reason} ${firstToken}ms`)
            } else if (payload.type === 'error') {
              append(`✗ ${payload.message}`)
            }
          }
        }
        if (acc.length > 0) {
          historyRef.current.push({ role: 'user', text })
          historyRef.current.push({ role: 'assistant', text: acc })
        } else {
          append('✗ empty answer (history not advanced)')
        }
        return acc
      }

      const runTwo = async () => {
        if (busy) return
        setBusy(true)
        try {
          const first = await ask(question.trim() || t('firstQuestion'))
          if (first.length > 0) {
            append(`history=${historyRef.current.length}`)
            await ask(t('secondQuestion'))
            append(`history=${historyRef.current.length}`)
          }
        } catch (error) {
          if (error?.name !== 'AbortError') append(`✗ ${String(error?.message ?? error)}`)
        } finally {
          setBusy(false)
        }
      }

      const checks = [
        ['sessionId', typeof sessionId === 'string' && sessionId.length > 0, String(sessionId).slice(0, 16)],
        ['trigger', trigger === 'selection', String(trigger)],
        ['useChat', typeof useChat === 'function', typeof useChat],
        ['inputActions', inputActions !== undefined, Object.keys(inputActions ?? {}).join(',') || 'none'],
        ['t()', typeof t === 'function', typeof t === 'function' ? t('title') : 'missing'],
        ['readText', selection.length > 0, `${selection.length} chars`],
      ]

      return h('div', { className: 'clipchatSmoke' },
        h('div', { className: 'clipchatSmoke__head' },
          h('div', null,
            h('div', { className: 'clipchatSmoke__title' }, t('title')),
            h('div', { className: 'clipchatSmoke__subtitle' }, t('subtitle'))),
          h('button', {
            type: 'button', className: 'clipchatSmoke__x', title: t('close'),
            'aria-label': t('close'), onClick: () => dismiss(),
          }, '×')),
        h('div', { className: 'clipchatSmoke__sel' }, selection || t('selectionEmpty')),
        h('div', null,
          h('div', { className: 'clipchatSmoke__hint' }, t('checks')),
          checks.map(([label, ok, value]) => h(Check, { key: label, label, ok, value })),
          typeof useChat === 'function' ? h(ChatProbe, { useChat }) : null),
        h('textarea', {
          ref: textareaRef,
          className: 'clipchatSmoke__ta',
          rows: 2,
          value: question,
          placeholder: t('placeholder'),
          onChange: (event) => setQuestion(event.target.value),
        }),
        h('div', { className: 'clipchatSmoke__actions' },
          h('button', {
            type: 'button', className: 'clipchatSmoke__btn', disabled: busy, onClick: runTwo,
          }, busy ? t('asking') : t('ask')),
          h('button', {
            type: 'button', className: 'clipchatSmoke__btn', disabled: busy,
            onClick: () => { setAnswer(''); setUsage(null); setLog([]); historyRef.current = [] },
          }, t('clear'))),
        answer.length > 0 ? h('div', null,
          h('div', { className: 'clipchatSmoke__hint' }, t('answer')),
          h('div', { className: 'clipchatSmoke__answer' }, answer)) : null,
        usage ? h('div', { className: 'clipchatSmoke__mono' },
          `${t('tokens')}: in ${usage.inputTokens ?? usage.input_tokens ?? '?'} / out ${usage.outputTokens ?? usage.output_tokens ?? '?'}`) : null,
        log.length > 0 ? h('div', { className: 'clipchatSmoke__log' }, log.join('\n')) : null,
      )
    }

    return {
      name: 'clipchat-smoke',
      inject: ['slots', 'locale', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => {
          ensureStyle()
          return () => { styleTag?.remove(); styleTag = undefined }
        }, 'clipchat-smoke: styles')
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'clipchat-smoke: dictionaries')
        ctx.effect(() => ctx.uiConversation.interactions.register({
          id: 'clipchat-smoke',
          onInteraction(request) {
            if (request.trigger !== 'selection') return
            if (request.readText() === null) return
            request.open()
          },
        }), 'clipchat-smoke: selection interaction')
        ctx.slots.inject('conversation.chat.text-interaction', () => ctx.slots.register({
          name: 'conversation.chat.text-interaction',
          key: 'clipchat-smoke',
          locale: NS,
        }, SmokeCard))
      },
    }
  },
})
