# DSH 0.2.2-rc.3 宿主 API 核验（dsh-clipchat M1）

核验对象：`/Users/yuzhou/.dsh/runtime/node_modules/@deepseek-ai/`，全部包版本 `0.2.2-rc.3`（`dsh/package.json` 读得）。
证据口径：优先读包内 `src/*.ts`（本机安装确实带 `src`，`dsh-client-ui-conversation/package.json` 的 `files` 含 `"src"`）；类型契约读 `lib/types/**/*.d.ts`；官方文档读 `dsh/docs/subsystems/*.md`。行号均为本次实读行号。

口径说明（影响可核验范围）：
- `@deepseek-ai/dsh-client-ui-slots`、`dsh-client-store`、`dsh-client-ui-primitives` **不在本机 runtime 安装里**（是各包的 devDependency），因此 `PropsRuntime` / `PropsLocale` / `SessionStandardProps` 的字段只能以 `dsh/docs/subsystems/slots.md` 与已构建产物为准，无法读其源码。
- client 侧实时 inspect 不可用：`cordis_inspect_query(platform=client, provider=Slots, method=listSubTree)` 超时（10s，无已连接的 Harness 页面），所以「当前槽树/占用者/props 快照」未取得实时证据，只做了源码级核验。

## 0. 三个会直接改 M1 设计的前提修正

1. **三个参考插件没有用 text-interaction 路径。** 它们都是「自建选区监听 + `shell.overlay` 浮层」：
   - `dsh-select-ask/client.js:1169-1185`：`conversation.input.dock`（桥）+ `shell.overlay`（工具条）+ sidebar tab；
   - `dsh-minichat/client.js:784-786`：`conversation.input.left` + `shell.overlay`；
   - `dsh-bubble-explain/src/client/index.ts:875-877`：`shell.overlay`。
   text-interaction 路径在 rc.3 源码里成立（见第 1 题），但**没有第三方实跑先例**，M1 属于第一个吃这条路的人。
2. **官方明确「DOM 选区位置不映射回源数据」。** `dsh-client-ui-conversation/README.md:66`：注册项给出的同步 handler 决定 keyed Slot 组件；`Chat` 只提供 DOM 选区和本地布局，**不从 DOM 位置推断原始源数据与 Markdown offsets**。所以「整条消息」必须走 `useChat` 的 ChatSnapshot（见第 2 题）。
3. **rc.3 自带 route 防护 API，不必自己手写 origin 判定。** `ctx.connection.requestRejection(req)` 给出 401/403 语义（见第 5 题），比参考插件的手写 fence 完整；但三个参考插件都没用它（它们写在自己包里）。

---

## 1. `uiConversation.interactions.register` 与 `conversation.chat.text-interaction` 的契约

### 结论

- 注册 API 是 `ctx.uiConversation.interactions.register({ id, onInteraction })`，返回 disposer；`id` 必须非空且在注册表内唯一，重复注册直接抛错。
- 注册的 `id` **同时就是 keyed slot 的 `key`**：`ChatView` 用 `renderSlot('conversation.chat.text-interaction', ownerProps, { entryKey: active.id })` 分派。
- 浮窗组件拿到的 props = **owner props（4 个）** + **session scope 标准 props** + 注册时声明 `locale` 才有的 `t`。官方文档里没记录单独的 `locale` prop（见「未验证 1」）。
  - owner props：`trigger: 'selection' | 'contextmenu'`、`readText(): string | null`、`dismiss(): void`、`clearSelection(): void`。
  - session 标准 props（`slots.md:109-118` 表逐行）：every scope 有 `useSessions`、`useSessionStatus`、`useSessionRetainInfo`、`useSessionAccess`、`useWorkspaces`、`useWorkspaceAccess`、`useRemoteAccess`、`usePanelInfo`；`session` 额外有 `sessionId`、`useSession`、`useProjection`、`useAccess`、`useConversation`、`useInput`、`inputActions`、`useChat`。
  - 若注册项声明了 `children` 才有 `renderSlot`；声明了 `store` 才有 `useStore`；声明了 `inject` 才有对应注入面（`slots.md:89-97`、`:124-132`）。
- `open()` 只在**同步 dispatch 期间**有效；handler 返回后调用无效。因此「是否弹窗」必须在 `onInteraction` 里同步决定。
- 渲染/销毁时机：`active !== null` 才挂载；`active` 由「第一个调用 `open()` 的注册项」决定；任一下述事件都会 `dismiss()` 并卸载组件（再次选区会重新挂载，组件内 state 丢失）。

### 证据

- 契约类型：`@deepseek-ai/dsh-client-ui-conversation/src/client/contract/text-interaction.ts:8-14`（Gesture）、`:17-21`（Request，含 `sessionId`/`open`）、`:24-27`（Definition，注释写明 "ID also names its keyed Slot renderer"）、`:30-35`（Surface = 组件 owner props）。
- 注册/分派：`.../src/client/conversation/interaction-registry.ts:15-19`（`register`，空 id 抛错、重复抛错、返回 disposer）、`:27-41`（按注册顺序遍历，第一个 `open()` 者胜出；`open`/`preventDefault` 只在 `dispatching` 为 true 时生效）。
- 服务挂载：`.../src/client/conversation/assembly.ts:213`（`readonly interactions`）、`:222`（`super(ctx, 'uiConversation')`）、`:227`。
- slot 声明：`@deepseek-ai/dsh-client-ui-chat/src/client/contract/slots.ts:431`（`'conversation.chat.text-interaction': { kind: 'keyed'; scope: 'session'; owner: TextInteractionSurface }`）；运行时声明 `.../src/client/apply.ts:246`（作为 `conversation.view` 的 children）。
- 渲染点与 props：`.../src/client/chat/ChatView.tsx:286-292`（`data-text-interaction-surface` 容器；传 `trigger/readText/dismiss/clearSelection`；`entryKey: active.id`）。容器定位由框架完成：`.../src/client/chat/text-interaction.ts:110-151` 计算 `left/top/maxWidth/maxHeight` 并 `visibility` 切换。
- 标准 props 表：`@deepseek-ai/dsh/docs/subsystems/slots.md:103-120`（`session` 行：`sessionId/useSession/useProjection/useAccess`、`useConversation/useInput/inputActions`、`useChat`）；`:85-101`（组件输入来源：owner、`PropsRenderSlots`、`PropsStore`、`InjectFace`、`PropsLocale`；组件拿不到 `ctx`）。
- `useChat` 的类型归属：`@deepseek-ai/dsh-client-ui-chat/src/client/contract/slots.ts:403-405`（`SessionStandardProps` 合并 `useChat`）、`:38`（`UseChat = SnapshotSelectorHook<ChatSnapshot>`）。
- keyed 注册写法（`key` 是 keyed 主键，`id` 是诊断身份）：`@deepseek-ai/dsh-client-ui-chat/src/client/fence/register.ts:13-15`（`{ name, key: 'math', id: '...' }`）；`dsh/docs/subsystems/slots.md:62`（keyed：「owner dispatches an entryKey」）、`:99`（strict `session` 条目在 binding 代际变化时重挂载）。
- 销毁条件（全部在 `@deepseek-ai/dsh-client-ui-chat/src/client/chat/text-interaction.ts`）：
  - 选区变化：`:183-197`（`selectionchange`，非手势期）；
  - 容器外 pointerdown：`:199-211`；
  - pointercancel / Escape / window blur：`:212`、`:213-217`、`:255`；
  - 插件注册集合变化：`:96-101`（`useEffect(dismiss, [registeredIds, ...])`）；
  - 目标失效（源元素脱离、被隐藏、选区被改写）：`:38-50`（`available`）+ `:115`（`place` 中再次校验）。
- `readText()` 的语义：`:102-107`，只在目标仍 `available` 且**存在选区**时返回投影文本，否则 `null`；右键（`contextmenu`）无选区时 `text` 就是 `null`（`:237-244`）。投影算法：`.../src/client/chat/text-selection.ts:172-180`。
- `t` 的来源：注册项 `locale: NS`（`dsh/docs/subsystems/slots.md:95`、`:120`）+ `ctx.locale.register(ns, locale, dict)` / `bind(ns)`（`@deepseek-ai/dsh-client-locale/src/client/index.ts:403-404`、`:459-460`、`:588` `ctx.provide('locale', ...)`）。
- `inputActions.insertQuote(text, summary?)` 确实存在（若要「引用进输入框」）：`@deepseek-ai/dsh-client-ui-conversation/src/client/contract/input.ts:192`、`:271`；行为说明 `README.md:64`。

### 坑

- **`readText()` 只给选区文本，不给整条消息**；右键无选区时直接是 `null`。要「就近浮窗 + 整条消息上下文」，浮窗必须在手势那一刻自己记住锚点（见第 2 题）。
- 官方文档的槽树把该 slot 画成 `[list]`（`dsh/docs/subsystems/slots.md:158`），但 `SlotMap`（`ui-chat/.../slots.ts:431`）与运行时声明（`apply.ts:246`）都是 `keyed`；以 `keyed` 为准，文档该行是陈旧描述。
- 若只注册 interaction 而没注册同 key 的 slot 占用者，`renderSlot` 渲染空内容：浮窗不会出现（且没有报错）。

---

## 2. 浮窗怎样拿到「整条 assistant 消息」+「最近 2-3 轮」

### 结论

**推荐做法：DOM 只在手势瞬间用来定位「哪条消息」，正文全部从 `useChat` 的 ChatSnapshot 读。**
纯 DOM 投影不够（只给选区文本、且官方声明不映射源数据）；纯 snapshot 又缺「用户选的是哪条消息」的桥。二者结合是唯一稳定组合。

具体取法（伪代码级）：

1. 手势瞬间（`onInteraction` 内，同步、事件仍在派发）：`window.getSelection()` → `anchorNode` 向上 `closest('[data-chat-node-key]')` → 得到 `key`（同一包裹元素上还有 `data-chat-flow-kind`、`data-chat-turn`、`data-chat-group-part`）；把 `key` 存进插件状态，然后 `request.open()`。
2. 浮窗组件里 `const nodes = useChat(s => s.nodes)`：
   - 整条消息：`nodes.get(key)` → `node.kind === 'assistant-step'` 时，正文 = `node.data.blocks.filter(b => b.kind === 'text').map(b => b.text)`；思考 = `blocks.filter(b => b.kind === 'reasoning')`；工具 = `block.kind === 'tool-call'`。
   - 用户消息：`node.kind === 'user' | 'steering'` → `node.data.content`（`ContentBlock[]`）里 `type === 'text'` 的块。
   - `kind` 为 `context` / `turn-trigger` / `turn-process` / `turn-tail` / `tool-call` / `model-retry` 等一律跳过。
3. 最近 2-3 轮：`const timeline = useChat(s => s.timeline)`、`const locations = useChat(s => s.locations)`（都是稳定身份切片）——`timeline.turnOrder`（turn 号数组）取当前 turn 及之前最后 3 个，对每个 turn 用 `locations.getTurn(turn)` 拿有序 key 列表，再按第 2 步取 user/assistant 文本；`node.visibility === 'hidden'` 的可过滤。
4. 组装时按 `turn` 升序、同 turn 内按 `locations` 顺序拼；每段加轻量角色前缀（`[assistant]`/`[user]`）。

### 为何 DOM-only 不可行（逐条）

- `readText()` 仅返回选区投影文本（第 1 题）；右键无选区时是 `null`。
- 一条 assistant 消息在 DOM 里被拆成**每个 text block 一个 markdown 容器**：`@deepseek-ai/dsh-client-ui-chat/src/client/chat/AssistantMarkdown.tsx:83-95`（`case 'text'` 每个 block 渲染一个 `MarkdownText`，`textInteractionSource` 逐块传）。所以 `closest('[data-text-interaction-source]')` 命中的是「块」，不是「整条消息」。
- 选区源元素上**没有**指向消息身份的公开契约：`data-text-interaction-source` 只是「可选区区域」标记；消息身份来自另一个包的内部属性 `data-chat-node-key`（`.../src/client/chat/ChatNodeSeat.tsx:153-165`，已确认打进构建产物 `dsh-client-ui-chat/lib/client.js`）。
- 官方 README 直接否定「DOM → 源数据」推断（`dsh-client-ui-conversation/README.md:66`）。

### assistant / user / reasoning 的稳定判别依据

- 契约级（稳定，推荐）：节点 `kind` + block `kind`。
  - `assistant-step`（`.../src/client/conversation-nodes/assistant.ts:16-20`；数据形状 `.../src/client/contract/chat-nodes.ts:38-46`：`status: 'running'|'settled'|'interrupted'`、`blocks`、`finalNode`、`usage`）。
  - `user` / `steering` / `context` / `turn-trigger`（`.../src/client/conversation-nodes/message.ts:33-43`）。
  - `AssistantBlock` 的 kind：`text | reasoning | image | tool-call | other`（`@deepseek-ai/dsh-client-ui-conversation/src/client/contract/records.ts:34-39`）。
  - 用户消息正文类型：`UserMessageNode.content: readonly ContentBlock[]`（`.../records.ts:42-51`）。
  - 整条消息的持久身份：`AssistantMessageNode.messageId`（`.../records.ts:64-87`；注释说明只有合成中断兜底才缺失）。
- DOM 级（可用但属内部实现，作兜底）：
  - 用户气泡：`data-message-bubble` + `data-text-interaction-source`（`.../src/client/chat/UserContent.tsx:47`）。
  - 思考区：根 div `data-variant="think"`（`.../src/client/chat/ReasoningRow.tsx:87-93`），其正文 `.thinkBody` 才是选区源（`:79`，class 为构建哈希，不可依赖）。
  - assistant 正文：选区源是 ui-primitives `MarkdownText` 根 div，带 `data-text-interaction-source`；`data-markdown-variant` 只在 compact 模式出现（前端构建产物 `dsh-web-frontend/dist/assets/index-Ciz7DZxv.js` 中 `"data-markdown-variant":l==="compact"?l:void 0`），**默认没有**可用于判别的属性。
  - 结论：DOM 能稳定区分「用户气泡」和「思考区」，**不能**稳定区分「assistant 正文」与其他 markdown；判别应回到节点/块 kind。

### 附加事实

- 只有「已 settled 且带 `messageId` 的 assistant」才是可选区源：`.../src/client/chat/AssistantNodeView.tsx:55`（`textInteractionSource={data.status === 'settled' && data.finalNode?.messageId !== undefined}`）；流式中与中断态不可选。
- 导航索引的 `prompt`/`response` 是**截断预览**，不能当上下文：`.../src/client/contract/snapshot.ts:58-66`（"Bounded prompt preview"）。
- ChatSnapshot 结构：`.../src/client/contract/snapshot.ts:111-118`（`order`/`nodes`/`locations`/`navigation`/`timeline`/`legacy`）；节点按 key 的读取面：`:33-55`。
- 只有已加载窗口的节点存在（分页加载），所以「最近 2-3 轮」可能不足 3 轮——这是数据边界，不是 bug。

---

## 3. host 侧解析主会话当前模型

### 结论（可复制步骤）

按顺序做，命中即返回：

1. 客户端把 `sessionId`（brand 字符串）随请求带给 host。
2. `const sessions = ctx.get('sessions'); const session = sessions?.get(sessionId)`（`@deepseek-ai/dsh-session/src/index.ts:1172` 服务名 `'sessions'`；`:1455-1457` `get(id)`）。
3. `const header = session?.requestHeader()` → `EpochHeader | undefined`（`.../src/index.ts:994-1017`，返回的是「下一次请求将要用的 header」，日志折叠得来、不可变）。
4. 读字段：`header.config` 是 `LlmCallConfig`（`@deepseek-ai/dsh-llm/src/call-config.ts:31-34`，extends `LlmCallControls`：`reasoningEffort? temperature? maxTokens? stop?`）→ `{ provider, model, reasoningEffort? }`。
5. reasoningEffort 的规范化（照抄 dsh 自己的投影逻辑）：若 `header.adapterDefaults?.reasoningEffort === true`，说明这个 effort 是**适配器默认值**而非用户选择，应省略；否则用 `header.config.reasoningEffort`。证据：`@deepseek-ai/dsh-agent/src/model-selection.ts:58-59`（`selectionOfHeader`）、`call-config.ts:54-57`（`LlmCallConfigAdapterDefaults`）。
6. 兜底 1：`ctx.get('agentDefaultModel')?.currentSelection()` → `{ provider, model, reasoningEffort? }`（`@deepseek-ai/dsh-agent-default-model/src/index.ts:48-73`，`super(..., 'agentDefaultModel')` 在 `:58`）。
7. 兜底 2：`ctx.on('llm/stream', (options, next) => { 记下 options.provider/model; return next() })` 捕获主循环最近一次真实调用（`dsh-bubble-explain/src/index.ts:187-192` 的做法）；只在插件激活后发生过的调用有效。
8. 取到后再校验/物化：`await ctx.llm.resolveModelInfo(provider, model)`（`@deepseek-ai/dsh-llm/src/index.ts:775`）；effort 需要 brand：`ReasoningEffortId(id)`（`@deepseek-ai/dsh-llm/src/brand.ts:74-76`）。
9. 都拿不到 → 返回 `503 { error: 'no-model' }`（`dsh-select-ask/host.js:194, 247-251` 的既有选择），不要瞎猜 `deepseek-chat`。

### 取不到时的降级与坑

- `sessions.get()` 只覆盖**本进程内的 live session**；会话已卸载/未打开 → `undefined` → 必须走兜底。
- `requestHeader()` 在首个 `request/header` 事件之前是 `undefined`（`dsh-session/src/index.ts:999-1006`）。
- `requestHeader()` 是「下一次请求将比对」的 header，用户刚切模型但还没发消息时它仍是旧值；「未消费的切换」在 `modelSelection` 投影的 `pending` 里：`@deepseek-ai/dsh-agent/src/model-selection.ts:72-90`。host 侧读法 `ctx.sessionProjections.stateOf(session, 'modelSelection')` 可用但**已废弃**（`@deepseek-ai/dsh-session-projection/README.md:90`），返回 `{ lastUsed, pending }`；要当前意图应 `pending ?? lastUsed`。不建议为了「刚切的模型」引入这条废弃路径——等用户发下一条消息后 `requestHeader` 自然更新。
- 路由元数据可另取 `session.requestContext()`（`dsh-session/src/index.ts:1028-1036`，`RequestContext = { provider, model, contextWindow?, systemPromptUpdate? }`，`types.ts:259-269`），但它不含 reasoningEffort。
- effort 可能与模型不匹配（切模型后残留）：调用 `resolveModelInfo` 后按模型声明的 efforts 收敛，失败就**省略 effort 重试**（`dsh-bubble-explain/src/index.ts:243-248`、`src/explain.ts:179-207`）。
- 参考实现的完整优先级链（select-ask）：`session.requestHeader().config` → `agentDefaultModel.currentSelection()` → `undefined`（`dsh-select-ask/host.js:173-195`）。

---

## 4. `ctx.llm.stream`：usage chunk、首字时间、abort、错误码

### 结论

- 签名：`stream(options: GenerateOptions): AsyncIterable<StreamChunk>`（`@deepseek-ai/dsh-llm/src/index.ts:1185-1198`，实现走 `llm/stream` waterfall；`GenerateOptions` 见 `src/types.ts:564-606`，含 `provider/model/reasoningEffort?/system?/messages/tools?/temperature?/maxTokens?/stop?/signal?/sessionId?/purpose?`）。
- chunk 形状（`src/types.ts:496-508`）：
  - `{ type:'block-start', index, blockType }`
  - `{ type:'text-delta', index, text }`
  - `{ type:'reasoning-delta', index, text }`
  - `{ type:'tool-call-delta', index, id, name?, argumentsDelta }`
  - `{ type:'block-end', index, block }`
  - `{ type:'usage', usage: TokenUsage }`
  - `{ type:'finish', reason: FinishReason, replayState? }`
- **usage 字段**（`TokenUsage`，`src/types.ts:182-196`）：`inputTokens`、`outputTokens`、`totalTokens?`、`cacheReadTokens?`、`cacheWriteTokens?`、`reasoningTokens?`；语义是**互斥计数**：`inputTokens` 只含未缓存输入，缓存命中单独在 `cacheReadTokens/cacheWriteTokens`（`types.ts:176-181` 注释）。
- **usage 位置**：作为独立 chunk 在 `finish` 之前发出（DeepSeek 适配器 `@deepseek-ai/dsh-llm-deepseek/src/translate.ts:160-161`；pi-ai `@deepseek-ai/dsh-llm-pi-ai/src/stream.ts:225-246` 的 `done`/`error` 两支都是先 `usage` 后 `finish`）。但字段可选、也不保证一定有 usage chunk → 按「可能缺」处理。
- **首字时间**：`StreamChunk` 里**没有任何时间戳字段**（`types.ts:496-508`）。要 TTFT 只能自己测：host 侧在 `for await` 里记录「第一个 `text-delta`（或 `reasoning-delta`）到达」的单调时钟差；客户端也可在收到首个 `delta` 帧时测。若要把 host 侧 TTFT 显示给用户，必须自己塞进 SSE 帧（例如 `done` 帧带 `firstTokenMs`）。
- **abort / cancel**：
  - 传 `signal: AbortSignal`（`GenerateOptions.signal`，`types.ts:594`）；适配器必须遵守（`adapter.ts` 契约注释 `src/index.ts:312-317`）。
  - 中断**不会以 throw 结束**：适配器抛出的 `ABORTED` 会被运行时转成终态 chunk `{ type:'finish', reason:{ kind:'aborted', failure } }`（`src/index.ts:1083-1172` 的 `adapterStream` + `:1203-1211` 的 `adapterFailureChunk`；判据 `options.signal?.aborted || failure.code === 'ABORTED'`）。
  - `llm.stream` 只在「中间件/消费者自身失败」时才抛（`src/index.ts:1174-1184` 注释），所以 consumer 端必须同时处理「终态 finish」与「抛错」两种结束。
  - HTTP 侧：客户端断开 → `res.on('close', () => controller.abort())`（`dsh-select-ask/host.js:258-262`）；用户停止 → 客户端 `AbortController.abort()` 关掉 fetch/SSE 读取，服务端同一个 `close` 事件触发中断。每条问题一个 POST/SSE 就已够，无需额外 stop 端点。
- **错误码**（`src/error.ts:17-70`，共 52 个，另有 `HTTP_<status>` 兜底）：`ABORTED`、`AUTH`、`QUOTA`、`RATE_LIMIT`、`CONTEXT_WINDOW_EXCEEDED`、`EMPTY_RESPONSE`、`MALFORMED_RESPONSE`、`NO_ADAPTER`、`UNKNOWN_MODEL`、`MODEL_UNSUPPORTED`、`TIMEOUT`、`TRANSPORT`、`SERVER`、`STREAM_CLOSED`、`INVALID_REQUEST`、`UNSUPPORTED_CONTENT`…（含 `retryChoice` 标注的才是重试候选，不代表默认重试）。
- `failure` 形状：`{ message, code, status?, providerRetryAfterMs?, requestId?, offloadImages? }`（`src/types.ts:48-66`）。`finish.reason.kind` 取值：`stop | tool-calls | max-tokens | aborted | error`（`types.ts:163-172`）。

### 对 M1 的直接含义

- 前端不要用 `EventSource`（发不了自定义 header、也发不了 POST）；用 `fetch` + `ReadableStream` 逐帧解析。
- 后端把 chunk 映射成自己的帧：`text-delta → delta`、`reasoning-delta → reasoning`（是否展示自定）、`usage → usage`、`finish(stop/max-tokens) → done`、`finish(error/aborted) → error`；`catch` 也要发 `error` 再 `end()`（`dsh-select-ask/host.js:269-296`、`dsh-bubble-explain/src/index.ts:225-280`）。
- 由于 `ctx.llm.stream` 把适配器失败折成终态 chunk，**不要**用「for await 结束」当作成功；必须看 `finish.reason.kind`。
- **手搓 messages 有硬约束（连续追问必踩）**：`GenerateOptions.messages` 的元素类型是 `Message | RequestUserInput`（`src/types.ts:530-539`）。
  - user 可以用一次性输入对象 `{ role:'user', content:[{type:'text',text}] }`（`RequestUserInput` 明确 `id?: never`、`source?: never`，`types.ts:531-536`），零依赖；或 `createUserMessage({ source:{ kind:'user' }, content })`（`src/message.ts:246-253`；参考用法 `dsh-bubble-explain/src/index.ts:253-266`）。
  - **assistant 历史不能土制**：运行时在派发前会遍历 messages 读 `message.source.replayState`（`src/index.ts:1042-1052`），缺 `source` 会直接 TypeError 并被折成 `finish{kind:'error'}`。必须 `createAssistantMessage({ content, source: { provider, model } })`（`src/message.ts:260-271`；`AssistantMessage.source` 是必填的 `ModelMessageSource`，`message.ts:167-170`）。
  - 参考实现 `dsh-select-ask/host.js:147-163` 用 `{role:'assistant', content:[{type:'text',text}]}` 拼历史，属于**会在有 assistant 历史的第二轮触发上述 TypeError** 的写法（据源码推断，未实跑复现）；M1 不要照抄这一处。

---

## 5. `webServer.register` 当前签名、SSE、同源/令牌防护（rc.3）

### 结论

- 签名（`@deepseek-ai/dsh-host-webserver/src/index.ts:51-58`、`:445-452`）：
  - `register({ kind: 'exact' | 'prefix', path, handler })` → `() => void`（disposer）。
  - `kind: 'exact'` 逐字匹配 pathname；`'prefix'` 匹配 `p` 与 `p/<anything>`（`:48-49`）。
  - `handler(req: IncomingMessage, res: ServerResponse)` **拥有完整响应生命周期**（注释明确「may hold the response open, e.g. SSE」）；重复 `(kind, path)` 抛错。
  - 另有 `{ kind, path, resource }` 形态（Fetch `Request → Response`，`:65-74`）与 `registerUpgrade`（`:460-466`）、`registerFallback`（`:477-483`，单占用）。
  - 匹配顺序：exact → 最长 prefix → fallback（`dsh/docs/subsystems/web-server.md:47`；实现 `src/index.ts:529-541`）。
- **没有内置鉴权**：`readResource` 注释直言「This method checks no cookie, Host, or Origin」（`:485-499`）；`dsh-host-frontend-static` 只对 **index/静态根部** 调 `ctx.connection.authorizeIndex`（`@deepseek-ai/dsh-host-frontend-static/src/index.ts:139-166`），非 index 资源与插件路由都是公开的（同文档 `web-server.md:47`「non-index assets remain public」）。
- **推荐防护（rc.3 一等公民）**：handler 第一行 `const rejection = ctx.connection.requestRejection(req)`，是 401/403 就直接回该状态码并返回。
  - 证据：`@deepseek-ai/dsh-client-connection/src/rpc.ts:206-240`（`HostConnectionHandle.requestRejection/admit`）、`src/rpc-host.ts:123-137`（`requestRejection` = `admit` 的 rejection 面；`admit`：`isTrusted` 失败 → 403；浏览器 cookie 未认证 → 401；cookie 有效 → 共享 `browserPeer`）。
  - 它包含的检查：Host 围栏（DNS rebinding：只接受 loopback、listener 的绑定 IP、或配置的 `trustedHosts` authority）+ `sec-fetch-site: cross-site` 直接拒 + 有 `Origin` 时必须与 Host 同 authority + 浏览器/API 凭据（`@deepseek-ai/dsh-client-connection/src/api-request-trust.ts:121-151`，Origin 比较在 `:160-176`）。
  - 页面自带凭据：`dsh web` 用 `authenticatedUrl()` 把 `?token=` 加到打印地址（`src/browser-auth.ts:244-248`），首次访问用 token 换 authority 绑定的 cookie（`:263-305`），之后同源 `fetch` 自动带 cookie → 浮窗请求天然通过；无 cookie 的本地 curl 会被 401 拒掉（对「浮窗专用」是好事；这一条按 `admit` 源码推得，未在插件路由上实跑。本机 `curl http://127.0.0.1:3080/` 实测 401，但那是 index fence 路径，不是同一条代码）。
  - 代价：浮窗从此依赖页面 cookie（默认 30 天，`cookieMaxAgeDays`）；cookie 过期后弹窗会 401，直到用户用打印的 tokenized URL 重开页面。若不能接受这个耦合，改用下面的「自有 token」方案。
  - 前置条件：插件 `inject` 里要有 `connection`；部署要让 Host 围栏认识你用的 authority。本机 profile 已经把 Tailscale 域名放进 `trustedHosts`（`~/.dsh/profiles/web/cordis.patch.yml:1550-1554`，`connection.config.trustedHosts: [yuzhoumac-mini.tail1b9935.ts.net, 100.64.251.32]`），所以经 Tailscale Serve 访问时该围栏可用（Serve 保留原 Host，同文件注释）。
- 备选防护（参考插件的做法，仍有效）：
  - 每次激活生成随机 token（`randomUUID()`），用 `webServer.tapIndex(html => ...)` 注入 `window.__PLUGIN_TOKEN__`，路由要求自定义 header 回传；无 token 时退化为 `Origin/Referer` 与 `Host` 同源判定（`dsh-select-ask/host.js:30-82`、`:299-319`）。
  - `tapIndex` 签名 `tapIndex(transform: (html) => string): () => void`（`dsh-host-webserver/src/index.ts:519-525`），只在 index 走 `renderIndex` 时执行（`:738-740`；`dsh-host-frontend-static/src/index.ts:163` 确实调用 `webServer.renderIndex`）。注意 select-ask 注释记录的坑：某些桌面壳的 index 不经过 `renderIndex`，token 会「未武装」，必须留同源退路（`host.js:52-63`）。
  - 更严格的 DNS-rebinding fence 也有现成抄本（`dsh-sidenote/src/trust-fence.ts:63-83`），但 rc.3 已有 `requestRejection`，没必要复制。
- **SSE 写法**（两份参考一致）：`res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })`，每帧 `res.write('data: ' + JSON.stringify(payload) + '\n\n')`，结束 `res.end()`（`dsh-select-ask/host.js:263-268, 279-296`；`dsh-bubble-explain/src/index.ts:225-232`）。
  - body 需自己读：`handler` 拿到的是裸 `IncomingMessage`，没有 JSON 解析，必须自行缓冲并设上限（`host.js:108-124`）。
  - 服务端自己不做 CORS（`dsh-host-webserver/src` 内 grep `access-control` 为空），也不自动应答 `OPTIONS`；因此「自定义 header + 无 CORS 头」本身就能挡住跨站简单请求以外的调用。
  - 若 `webServer` 配置了 `compression: 'gzip'`（默认 `'none'`，`src/index.ts:119-124`），gzip 中间件包住**所有**请求（`:547-561`），SSE 需依赖 `no-transform` 并实测是否缓冲；本机 profile 用默认 `none`，不受影响。

---

## 6. 第三方 bundle 的 host/client 双半结构

### 结论（最小清单）

- `package.json`：
  - `"type": "module"`；`exports["."]` 指 host 半；`exports["./client"]` 指 client 半（缺了 client-modules 会报 `MissingClientBundleError`，`dsh-client-modules/src/index.ts:103-119`）；`./locale/*.json`、`./icon` 供 Plugin Manager；`files` 必须包含运行时文件（本地链接安装不受 `files` 过滤，仍要写对以便发布）。
  - `"dsh": { "bundle": { "patch": "./cordis.patch.yml" }, "client": { "platform": "web", "inject": [...], "immediately": true } }`。
  - 字段定义：`@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts:29-39`（`dsh.bundle`/`dsh.profile`/`dsh.client`）、`:68-75`（`DshBundleManifest.patch: string | string[]`）、`:82-95`（`DshClientManifest`：`platform` 必填；`inject` 注释明确是「Informational package-name dependencies, not Cordis service injection」；`immediately` 是「Boot phase-one registration barrier; absent means the shared application batch」；`external` 是非 baseline 的模块请求）。
  - 原生模板：`@deepseek-ai/dsh-agent-preset/skills/dsh-doc/templates/decoration/package.json`（与上面同构，`dsh.client.inject: ["@deepseek-ai/dsh-client-ui-conversation"]`）。本插件至少要列 `@deepseek-ai/dsh-client-ui-conversation`（`uiConversation` 服务）与 `@deepseek-ai/dsh-client-ui-chat`（text-interaction 槽的声明者，`dsh-client-ui-chat/package.json` 的 `dsh.client.inject` 也列了 ui-conversation）。
  - `immediately` 不是必需：shipped 的 `dsh-client-ui-chat/package.json` 就没有它（走共享批次）；参考插件与模板则设为 `true`。
- `cordis.patch.yml`：`- insert: [ { id, name: '<package name>', config?: {...} } ]`（模板 `templates/decoration/cordis.patch.yml`；select-ask 同构 `cordis.patch.yml:1-9`）。`id` 是 Loader 条目 id，`name` 是包名；同一包只应有一行。
- host 半导出形态（`dsh-agent-preset/skills/dsh-doc/references/host-plugin.md:58-65`）：`export function apply(ctx, config)` + 可选 `export const inject = [...]` / `export const Config`；**或** default export 一个 service class；两种不要混。所有资源在 `apply` 内用 `ctx.effect`/`ctx.on` 注册并返回清理函数。
  - `inject` 的服务名要用具体名：本插件需要 `webServer`、`llm`，防护需要 `connection`。
  - 若要在 `apply` 之外（子 fiber）读服务，用 `ctx.inject(['webServer'], scope => { scope.webServer ... })`；Cordis 只在「声明过依赖的 fiber」里把注入服务暴露成普通属性——select-ask 为此留了注释（`host.js:322-325`）。
- client 半导出形态：`window.__ModuleLoader__.load({ id: '<package name>', factory: (require) => ({ inject, apply }) })`。
  - id 必须等于包名（「The browser artifact registers a lazy factory whose id equals the package name」，`dsh-agent-preset/skills/dsh-doc/references/ui-plugin.md:9`；模板 `templates/decoration/client.js:1-22`）。
  - 执行语义：加载只注册 factory，模块体副作用延迟到 materialization（`dsh-client-modules/README.md:77`）；`require('react')` 来自浏览器模块表，`require.asset(...)` 用于资源。
  - `apply` 内用 `ctx.slots.inject(key, () => ctx.slots.register({...}, Component))`；locale 用 `ctx.locale.register(NS, dicts)`；组件拿不到 `ctx`（`dsh/docs/subsystems/slots.md:101`）。
- 构建/热更新（本机可得的事实）：
  - 手写 `client.js`（三个参考插件都这样）+ 直接 `install_bundle`/本地链接目录，是最短路径；`dsh-bubble-explain` 还给了「TS 编译产物 → `window.__ModuleLoader__.load` 单文件」的合并脚本（`scripts/build-client.mjs:1-60`），可复用。
  - 热更新：shipped `dsh-client-hmr` 对**图里每个 client 行**做 500ms stat 轮询，比对 mtime/ctime/size，变了就 `clientModules.rebuilt(id)` 并让浏览器换新 bundle（`@deepseek-ai/dsh-client-hmr/src/index.ts:92-124`、`:143-156`；`README.md:32,42`）。因此本地链接目录里改 `client.js` 会触发热替换；语义是「重执行 bundle + 全新组件状态，数据层不动」（`README.md:36,116`）。
  - 官方开发链是 `pnpm run dev:web`（host + rebuild watcher 一起起；`--no-serve` 只挂 watcher），但本机 runtime 是 npm 安装（`/Users/yuzhou/.dsh/runtime/package.json` 只有一个 dependency），**没有**该脚本；共享 Client tsdown preset 也未作为独立可安装包出现在 runtime 里。所以本机现实是「手写/自建 esbuild → stat 轮询热替换」，不要承诺 `dev:web`。
  - 本机 profile 当前跑的是 `dsh web --patch <launcher patch> --no-open --port 3080`，监听 `127.0.0.1:3080`，经 Tailscale Serve 对外（`ps`/`lsof` 实读）。

---

## M1 调用骨架（伪代码，不是实现）

```
# ── client 半（browser bundle，id = 包名）────────────────────────────
plugin = {
  inject: ['slots', 'locale', 'uiConversation'],       # cordis 服务
  apply(ctx):
    ctx.effect(() => ctx.locale.register(NS, { zh: {...}, en: {...} }))

    # 1) 交互注册：id 同时是 keyed slot 的 key
    ctx.effect(() => ctx.uiConversation.interactions.register({
      id: 'clipchat',
      onInteraction(req):                                # 必须同步
        key = closestNodeKey(window.getSelection())      # [data-chat-node-key]
        state.anchorKey = key
        state.selected  = req.readText()                  # 可能为 null（右键无选区）
        state.pending   = { trigger: req.trigger }
        req.open()                                        # 同步调用才生效
    }))

    # 2) 浮窗组件注册（同 key）
    ctx.slots.inject('conversation.chat.text-interaction', () =>
      ctx.slots.register({ name: 'conversation.chat.text-interaction', key: 'clipchat', locale: NS },
                         Popover))

# Popover props: { useChat, sessionId, t, trigger, readText, dismiss, clearSelection }
Popover:
  nodes     = useChat(s => s.nodes)
  timeline  = useChat(s => s.timeline)
  locations = useChat(s => s.locations)
  onSend(question):
    node    = nodes.get(state.anchorKey)                  # assistant-step / user / steering
    message = node.kind === 'assistant-step'
                ? textOf(node.data.blocks)                # filter kind==='text'
                : node.kind === 'user' ? textOf(node.data.content) : ''
    recent  = lastTurns(timeline, locations, node, 3)     # turnOrder + locations.getTurn + 同法取文本
    POST /dsh-clipchat/ask                              # 方案 A 不用自定义 header
      headers: { 'content-type': 'application/json', 'x-dsh-clipchat': token }   # 仅 B 方案
      body:    { sessionId, selection: state.selected, message, recent, history: state.turns,
                 question }
    # 用 fetch + ReadableStream 解 SSE 帧：delta / reasoning / usage / done / error
    # 每次新问题复用同一个 AbortController；dismiss 时 abort()

# ── host 半（bundle 入口 index.js）──────────────────────────────────────
# 防护二选一：首选 A（requestRejection，见第 5 题）；B（tapIndex token）仅当
# 需要放行非浏览器本地调用、或桌面壳不走 renderIndex 时才用。不要两套都上。
apply(ctx):
  token = randomUUID()                                   # 仅 B 方案需要
  ctx.inject(['webServer', 'connection', 'llm'], scope =>
    scope.effect(() => scope.webServer.tapIndex(html => injectTokenScript(html, token)))   # 仅 B 方案
    scope.effect(() => scope.webServer.register({ kind: 'exact', path: '/dsh-clipchat/status', handler: status }))
    scope.effect(() => scope.webServer.register({ kind: 'exact', path: '/dsh-clipchat/ask',    handler: ask })))

  status(req, res):
    reject = ctx.connection.requestRejection(req)         # 401/403/undefined
    if reject: return send(reject, { error: 'unauthorized' })
    send(200, { ok: true, llm: typeof ctx.llm.stream === 'function', model: resolveModel(ctx) ?? null })

  ask(req, res):
    reject = ctx.connection.requestRejection(req)          # 先过官方围栏
    if reject: return send(reject, { error: 'unauthorized' })
    if req.method !== 'POST': return send(405, ...)
    body = readBodyWithCap(req, 512 * 1024)                # handler 拿到裸 IncomingMessage
    model = resolveModel(ctx, body.sessionId)              # requestHeader().config → agentDefaultModel
    if !model: return send(503, { error: 'no-model' })

    # user 段可以是 RequestUserInput；assistant 段必须 createAssistantMessage(content + source)
    messages = [ { role:'user', content:[{ type:'text', text: promptWithContext(body) }] } ]
             + body.history.map(m => m.role === 'assistant'
                 ? createAssistantMessage({ content:[{type:'text',text:m.text}],
                                            source:{ provider, model: model.model } })
                 : { role:'user', content:[{ type:'text', text: m.text }] })

    ctrl = new AbortController(); res.on('close', () => ctrl.abort())
    writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8',
                     'Cache-Control': 'no-cache, no-transform',
                     Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    try:
      t0 = monotonic()
      for await chunk of ctx.llm.stream({
        provider, model: model.model, reasoningEffort: ReasoningEffortId(model.effort)?,
        system: SYSTEM_PROMPT, maxTokens: 2048, messages, signal: ctrl.signal,
      }):
        switch chunk.type:
          'text-delta'      -> if !firstToken { firstToken = monotonic() - t0 }
                               frame({ type:'delta', text: chunk.text })
          'reasoning-delta' -> frame({ type:'reasoning', text: chunk.text })     # 可选
          'usage'           -> frame({ type:'usage', usage: chunk.usage })       # 字段见第 4 题
          'finish'          -> reason = chunk.reason
                               if reason.kind === 'error' || reason.kind === 'aborted'
                                 frame({ type:'error', code: reason.failure.code,
                                         message: reason.failure.message })
                               else frame({ type:'done', reason: reason.kind, firstTokenMs: firstToken })
    catch e:
      frame({ type:'error', message: String(e?.message ?? e) })                   # 中间件/消费者失败
    finally:
      res.end()                                                              # 不写 session、不建会话
```

---

## 未验证清单

1. **`locale` 这个 prop 是否存在**：`dsh-client-ui-slots` 未安装在本机 runtime，无法读 `PropsLocale` 定义；官方只写「localized `t` function」（`slots.md:95`），组件侧观察到的也只有 `t`。结论「只有 `t`、没有 `locale` prop」= 高置信推断，非源码证实。
2. **text-interaction 路径的端到端实跑**：源码成立（第 1 题），但 client 侧 inspect 超时（无已连接页面）、且三个参考插件都没走这条路；「第三方注册项确实能在 rc.3 页面里弹出并拿到 props」没有实跑证据。M1 第一步应先做一个最小可用的选词浮窗冒烟。
3. **`data-chat-node-key` 的长期稳定性**：它存在且已进构建产物（`ChatNodeSeat.tsx:153-165`、`lib/client.js`），但不在任何文档契约里，属内部实现；官方只承诺「选区源区域」这一层。若上游改动，需回退到「最新 settled assistant 节点 + 选区文本前缀匹配」。
4. **`locations.getTurn(turn)` 是否包含 hidden 节点**：文档只说「ordered Chat Node keys in the turn」，未写可见性过滤；实现未逐行读。取用时按 `node.visibility === 'visible'` 自过滤即可，但「这个 API 在分页窗口边界上的完整语义」未验证。
5. **实时槽树/props**：`cordis_inspect_query(client, Slots, listSubTree)` 10s 超时，未取得 rc.3 运行时槽树；`llm-*` 等同理未做实时调用验证。
6. **`ctx.connection.requestRejection` 未实跑**：本机没有已注册的插件 route 可用来验证 401/403 判定（只读了 `rpc-host.ts:123-137` 与 `api-request-trust.ts` 的实现）；「页面 fetch 带 cookie 通过」也因此是代码推断。
7. **`webServer` gzip 对 SSE 的实际影响**：只读了代码（`src/index.ts:547-561` 全请求过 gzip）与默认 `none`；没有在 `compression: 'gzip'` 下实测缓冲行为。
8. **HMR 对「本地链接目录」的实跑**：代码上按 graph 行的 `artifactBaseline.path` stat 轮询（`src/index.ts:92-124`），链接目录解析到真实 `client.js` 应该成立；未实际改文件观察浏览器热替换。
9. **`meta.title/description` 的读取优先级**：`host-plugin.md` 说读导出的 locale JSON，参考插件把 `meta` 写在 `package.json` 顶层（`dsh-select-ask/package.json:29-32`），而 manifest 类型里没有这个字段；两者谁生效未验证（不影响 M1 功能）。
