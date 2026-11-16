# text-interaction 冒烟（Ticket 09）

结论：**路径 A 通过**。宿主 `conversation.chat.text-interaction` 浮窗在 rc.3 真实页面里可用，M1 不需要切到自建 overlay（路径 B）。

## 怎么做的

- 最小插件：`.scratch/smoke-plugin/`（包名 `dsh-clipchat-smoke`，host + client 双半，一次性的调试 UI）。
- 安装：`plugin_manager install_bundle`（link 到 profile，未复制）；浏览器刷新后 boot 载荷里出现 `dsh-clipchat-smoke`。
- 路由：`GET /dsh-clipchat-smoke/status`、`POST /dsh-clipchat-smoke/ask`（SSE；一次请求跑两轮，第二轮的 assistant 历史由 `createAssistantMessage` 构造）。
- 验证页面：`http://127.0.0.1:3080/`（同一台机器上打开的是旧会话「开发划词侧边提问插件」）。给定的 Tailscale 域名在同一浏览器里返回 502，未用于验证。

## 实测结果

| 项目 | 结果 | 证据 |
|---|---|---|
| assistant 正文拖选后浮窗出现 | 通过 | 选区 20-40 字符，surface `visibility: visible`，卡片渲染 |
| 浮窗位置 | 宿主负责 | 卡片出现在选区正上方，越界时自动夹紧；选段滚出可视区时 surface 变 `hidden` |
| `sessionId` | 通过 | `session-c0eb3fee-...` |
| `trigger` | 通过 | `selection` |
| `useChat` | 通过 | 是函数；`useChat(s => s.nodes.values().length)` 返回 `136 nodes / 129 order` |
| `inputActions` | 通过 | 键：`insertQuote, captureInsertion, insertText, setDraft, persistDraft, addAttachments, removeAttachment, pruneAttachments, submit` |
| `t()` / locale | 通过 | 注册 slot 时带 `locale: NS`，组件拿到 `t`；没有 `locale` prop |
| 自动聚焦 | 通过 | 打开后约 150ms 内 `<textarea>` 获得焦点 |
| 关闭（×） | 通过 | 点 × 后卡片卸载 |
| 关闭（空白） | 通过 | 页面上 `pointerdown` 后卡片卸载 |
| 关闭（Esc） | 通过 | `Escape` 后卡片卸载 |
| 连续两问 | 通过 | 第 1 轮 `done stop 5308ms`、usage `in 144 / out 92`；第 2 轮带 assistant 历史 `done stop 3173ms`，`history=4`，无 TypeError |
| 路由守卫 | 通过 | 页面 fetch 200；本机 curl 无 cookie 401（`requestRejection`） |

## 与 02 结论的差异 / 新发现

1. **组件 props 的准确清单**：owner 传 `trigger / dismiss / readText / clearSelection`；slot 标准 props 提供 `sessionId / useChat / inputActions / useSession` 等；`t` 来自注册项的 `locale`，没有 `locale` prop。02 里“`sessionId`、`useChat`、`inputActions` 从浮窗 props 拿”成立。
2. **`useChat` 的形状**：快照是 `{ order, nodes: ChatNodeStore, locations, navigation, timeline, legacy }`；`nodes` 没有 `.size`，用 `.values()` / `.get(key)`。M1 取消息文本应走 `nodes.get(key)`。
3. **自动聚焦会清空浏览器选区**，但浮窗不塌：owner 的 `available()` 校验的是打开时克隆的 `Range`，不是当前 selection。实测卡片在聚焦后继续存在。风险：若聊天区在卡片打开期间重渲染（流式输出、翻页），克隆 Range 的节点可能被替换，`available()` 失败 → 自动 dismiss；本次两轮问答期间没有触发。
4. **linked 本地包的 host 半不能直接 `import '@deepseek-ai/dsh-llm'`**：link 的真实路径在 workspace，解析不到 profile/安装目录的包。可行做法：`createRequire(process.argv[1]).resolve('@deepseek-ai/dsh-llm')` 再动态 import；`process.env.DSH_INSTALL_DIR` 在服务进程里不可靠。
5. **改 host 半后 disable → enable bundle 会重新导入模块**（实测 500 → 200），不必重启 web server；client 半改文件走 HMR。
6. **定位与关闭都在 owner**：第三方组件不需要自建定位、空白点击、Esc。宿主的关闭规则：surface 外 `pointerdown`、Esc、窗口 blur。
7. **`requestRejection` 对页面 fetch 放行**：浏览器 cookie 通过，401 只出现在无 cookie 的本机 curl。
8. **选段滚出可视区时只隐藏不关闭**：`active` 仍在，滚回来会重新显示。

## 对实现的含义

- M1 只需要注册一个 interaction + 同 key 的 slot 组件；浮窗定位、关闭、选区可用性交给宿主。
- 选中文本在打开瞬间一次性读出并保存；之后不要依赖 `document.getSelection()`。
- 卡片打开时避免让聊天区重渲染（例如不要触发主会话的新消息）；否则有被 dismiss 的风险。若实测频繁触发，再考虑 B 或改宿主校验。
- host 半加载 `@deepseek-ai/dsh-llm` 用 `createRequire` 的安装目录锚点。

## 证据

- 截图：`research/smoke-card.jpg`（选段、props 自检、自动聚焦都在同一张图里）。
- 两轮日志：`✓ done stop 5308ms` → `history=2` → `✓ done stop 3173ms` → `history=4`。
- 卸载：`plugin_manager remove_bundle` 目标 `dsh-clipchat-smoke`；源码保留在 `.scratch/smoke-plugin/`。

## 未验证

- 卡片打开期间主会话流式更新是否必然 dismiss（只做了静态页面验证）。
- 分页加载后已选消息被替换时的重锚定。
- 窄屏、缩放、多显示器下的位置夹紧。
