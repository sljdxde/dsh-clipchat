window.__ModuleLoader__.load({
  id: 'dsh-clipchat-menu-smoke',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const css = `
.ccMenu{display:flex;align-items:center;gap:6px}
.ccMenu__btn{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-button-floating-fill);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);cursor:pointer;border-radius:999px;padding:5px 10px}
.ccMenu__btn:hover{background:var(--dsw-alias-button-floating-hover)}
.ccCard{width:min(340px,calc(100vw - 24px));box-sizing:border-box;background:var(--dsw-alias-bg-elevated,var(--dsw-alias-button-floating-fill));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3);border-radius:12px;box-shadow:var(--dsw-elevation-panel);padding:12px;display:flex;flex-direction:column;gap:8px}
.ccCard__head{display:flex;justify-content:space-between;align-items:center;font-weight:600}
.ccCard__x{border:none;background:transparent;color:inherit;cursor:pointer;font-size:16px;padding:2px 4px}
.ccCard__sel{max-height:60px;overflow:auto;white-space:pre-wrap;background:var(--dsw-alias-bg-sunken,rgba(127,127,127,.08));border-radius:8px;padding:6px 8px;font-size:12px}
.ccCard__ta{width:100%;box-sizing:border-box;resize:none;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;font:inherit;padding:6px 8px;overflow:hidden}
.ccCard__hint{opacity:.65;font-size:11px}
`
    let styleTag

    function Menu(props) {
      const { Original, dismiss, readText } = props
      const [expanded, setExpanded] = React.useState(false)
      const [selection] = React.useState(() => readText() ?? '')
      const [text, setText] = React.useState('')
      const taRef = React.useRef(null)

      React.useEffect(() => {
        if (expanded && taRef.current) taRef.current.focus()
      }, [expanded])

      if (!expanded) {
        return h('div', { className: 'ccMenu' },
          h(Original, props),
          h('button', {
            type: 'button',
            className: 'ccMenu__btn',
            onMouseDown: (event) => event.preventDefault(),
            onClick: (event) => { event.preventDefault(); setExpanded(true) },
          }, '问这段'),
        )
      }

      return h('div', { className: 'ccCard' },
        h('div', { className: 'ccCard__head' },
          h('span', null, '滑词冒烟（菜单版）'),
          h('button', {
            type: 'button', className: 'ccCard__x', 'aria-label': '关闭',
            onMouseDown: (event) => event.preventDefault(),
            onClick: () => dismiss(),
          }, '×')),
        h('div', { className: 'ccCard__sel' }, selection || '（没有读到选段）'),
        h('textarea', {
          ref: taRef,
          className: 'ccCard__ta',
          rows: 2,
          value: text,
          placeholder: '就这段提问（冒烟：不发请求）',
          onChange: (event) => setText(event.target.value),
        }),
        h('div', { className: 'ccCard__hint' }, '这里只验证菜单与展开/聚焦；真实问答沿用上一版。'),
      )
    }

    return {
      name: 'clipchat-menu-smoke',
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          styleTag = document.createElement('style')
          styleTag.dataset.plugin = 'dsh-clipchat-menu-smoke'
          styleTag.textContent = css
          document.head.appendChild(styleTag)
          return () => { styleTag && styleTag.remove(); styleTag = undefined }
        }, 'clipchat-menu-smoke: styles')

        ctx.slots.inject('conversation.chat.text-interaction', () => {
          const patched = new Map()
          const patch = () => {
            for (const entry of ctx.slots.entries('conversation.chat.text-interaction')) {
              if (entry.options.key !== 'quote' || patched.has(entry)) continue
              const Original = entry.component
              entry.component = (props) => h(Menu, Object.assign({}, props, { Original }))
              patched.set(entry, Original)
            }
          }
          patch()
          const unsubscribe = ctx.slots.subscribe('conversation.chat.text-interaction', patch)
          return () => {
            unsubscribe()
            for (const [entry, original] of patched) entry.component = original
          }
        })
      },
    }
  },
})
