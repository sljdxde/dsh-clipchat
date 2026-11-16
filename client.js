window.__ModuleLoader__.load({
  id: 'dsh-clipchat',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'clipchat'

    const zh = {
      ask: '问这段',
      title: '滑词对话',
      close: '关闭',
      placeholder: '就这段提问',
      preview: '选段',
      empty: '（未读到选段）',
    }
    const en = {
      ask: 'Ask about this',
      title: 'Clipchat',
      close: 'Close',
      placeholder: 'Ask about this passage',
      preview: 'Selection',
      empty: '(no selected text)',
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
.clipchat-card__ta{width:100%;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;font:inherit;padding:6px 8px;overflow:hidden}
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
      const textareaRef = React.useRef(null)

      React.useEffect(() => {
        if (expanded && textareaRef.current !== null) textareaRef.current.focus()
      }, [expanded])

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
        h('textarea', {
          ref: textareaRef,
          className: 'clipchat-card__ta',
          rows: 2,
          placeholder: translate('placeholder'),
        }),
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
      __test: { isAssistantNodeKey, nodeKeyOfSelection },
    }
  },
})
