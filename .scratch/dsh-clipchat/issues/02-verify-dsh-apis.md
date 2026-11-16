# 02 核验 DSH 宿主 API（0.2.2-rc.3）

Type: research
Status: resolved
Blocked by: —

## Question

M1 依赖的宿主事实，逐条核验并给出源码位置：

1. `ctx.uiConversation.interactions.register` 与 `conversation.chat.text-interaction` slot 的组件 props 确切字段（sessionId、inputActions、useSession、t、locale 等），以及 keyed slot 的渲染/销毁时机。
2. 浮窗如何拿到「所在整条 assistant 消息」与「主线最近 2-3 轮」文本：DOM 的 `[data-text-interaction-source]` 投影是否足够，`useChat`/ChatSnapshot 的节点是否更适合；有无稳定办法区分 assistant 正文、用户消息、思考区。
3. host 侧如何解析主会话当前模型（provider / model / reasoningEffort）：`ctx.sessions` 的 `requestHeader()`、profile 默认模型、session 相关 projection 的当前 API。
4. `ctx.llm.stream` 的 usage chunk 形状、首字时间、abort/cancel 语义（客户端断开、用户停止）、错误码。
5. `webServer.register` 的当前签名、SSE 写法、同源/令牌防护的推荐做法（以 rc.3 为准，不假设旧版）。
6. 第三方 bundle 的 host/client 双半结构：`package.json` 的 `dsh.bundle` / `dsh.client`、`cordis.patch.yml`、`inject` 需要的服务、开发时的构建与热更新路径。

## Answer

2026-11-16 由研究子代理按 research 技能完成；完整证据（包名/路径:行号）见 [research/dsh-api-findings.md](../research/dsh-api-findings.md)。

**6 个问题的结论**

1. 注册契约：`register({id,onInteraction})` 返回 disposer；`id` 即 keyed slot 的 key。组件 props = 4 个 owner props（trigger/readText/dismiss/clearSelection）+ session 标准 props（`sessionId`、`useSession`、`useChat`、`inputActions` 等）+ 声明 `locale` 后的 `t`。选区变化、容器外 pointerdown、Esc、blur、注册集合变化都会卸载组件，组件内 state 丢失。
2. 上下文取法：DOM 只在手势瞬间用于取 `[data-chat-node-key]` 锚点；整条消息与最近 2-3 轮从 `useChat` 的 ChatSnapshot 读（`assistant-step.data.blocks` 取 text；`timeline.turnOrder` + `locations.getTurn`）。判别依据是节点/块 `kind`，不是 DOM 属性。
3. 模型解析：`sessions.get(sessionId).requestHeader().config` → `agentDefaultModel.currentSelection()` → 捕获 `llm/stream` 最近一次调用；都无则 503。`sessions.get()` 只覆盖本进程 live session，`requestHeader()` 在首个请求前为 undefined。
4. usage/abort：`{type:'usage', usage:{inputTokens,outputTokens,totalTokens?,cacheReadTokens?,cacheWriteTokens?,reasoningTokens?}}`，在 finish 前但不保证存在；没有 TTFT 字段，需自测后塞进自己的 SSE 帧；abort 传 signal，中断折成终态 `finish{kind:'aborted'|'error'}` 而不 throw；HTTP 侧用 `res.on('close')` 触发 abort。
5. 路由：`webServer.register({kind,path,handler})` 返回 disposer，handler 自持响应、可长开 SSE，无内置鉴权；推荐 `ctx.connection.requestRejection(req)`（401/403，含 Host 反 rebinding 与 Origin/cookie 检查），代价是依赖页面 cookie（默认 30 天）。
6. 双半 bundle：`dsh.bundle.patch` + `dsh.client{platform,inject,immediately?}`，`exports['./client']` 必备；client 产物是 `window.__ModuleLoader__.load({id:包名,factory})`；本机没有 `pnpm run dev:web`，热更新靠 `dsh-client-hmr` 500ms stat 轮询。

**三条会改 M1 设计的前提修正**

- 三个参考插件都没走 text-interaction（自建选区 + `shell.overlay`）。该路径在 rc.3 源码成立，但无第三方实跑先例；因此新开 [08 浮窗技术路径](08-floating-surface-path.md) 决策票。
- `dsh-select-ask` 用裸对象拼 assistant 历史，rc.3 会读 `message.source.replayState` 并在缺失时 TypeError；assistant 历史必须用 `createAssistantMessage({content, source:{provider,model}})`（已复核 `dsh-llm/src/index.ts:1046`、`dsh-llm/src/message.ts:260`）。
- 路由防护优先用 rc.3 的 `ctx.connection.requestRejection`，不要照抄参考插件的手写 token；本机 Tailscale 域名已进 `trustedHosts`，可用。

**未验证项（影响 M1 的四条）**

- `locale` prop 是否存在（只有高置信推断，无源码）。
- text-interaction 端到端实跑（无已连接页面可 inspect）。
- `data-chat-node-key` 的长期稳定性（内部实现，无文档契约）。
- `locations.getTurn` 是否含 hidden 节点及分页边界语义。

其余 5 条（requestRejection 实跑、gzip/SSE、HMR 实跑、meta 读取优先级等）见研究文件末尾。
