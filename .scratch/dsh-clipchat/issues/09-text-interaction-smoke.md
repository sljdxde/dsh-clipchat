# 09 最小冒烟：text-interaction 浮窗端到端

Type: task
Status: resolved
Blocked by: 08

## Question

按 08 的 gate，做一个最小插件（host + client，本地链接安装或 `install_bundle`）验证：

1. 注册 `ctx.uiConversation.interactions` + 同 key 的 `conversation.chat.text-interaction` slot 后，assistant 正文选词能弹出浮窗。
2. 浮窗组件拿到的 props 里 `sessionId`、`useChat`、`inputActions` 可用；确认 `locale`/`t` 是否实际存在。
3. 用 `createAssistantMessage({content, source:{provider, model}})` 拼 assistant 历史，连续两问不崩。
4. 记录任何与 02 结论不符的点，以及是否触发 B 降级。

## 产物

`.scratch/dsh-clipchat/research/text-interaction-smoke.md`：怎么做、结果、证据（日志/截图）、结论。

## Answer

**通过，走 A，不切 B。** 最小插件（`.scratch/smoke-plugin/`）装进 web profile 后实测：

- 选词浮窗出现、位置由宿主夹紧；`sessionId/trigger/useChat/inputActions/t` 全部可用；自动聚焦生效；×、空白、Esc 都能关。
- 连续两问通过：第二轮把第一轮回答用 `createAssistantMessage({content, source})` 拼进历史，`done stop` 两次，无 TypeError。
- 差异：`t` 来自 slot 注册的 `locale`（没有 `locale` prop）；`useChat` 快照是 `{order, nodes: ChatNodeStore, locations, navigation, timeline, legacy}`，用 `nodes.values()`；聚焦会清空浏览器选区但浮窗不塌（校验的是克隆 Range）；linked 本地包要用 `createRequire(process.argv[1])` 加载 `@deepseek-ai/dsh-llm`；改 host 半后 disable/enable bundle 即可重载。
- 风险：卡片打开期间聊天区重渲染可能因克隆 Range 失效而 dismiss，未实测。

详见 [text-interaction-smoke.md](../research/text-interaction-smoke.md)。
