# dsh-clipchat M1 实施方案

Status: ready-for-agent
Date: 2026-11-16

> 唤醒方式已定：左键选区 → 原生「引用文本」+「问这段」小菜单；点「问」展开卡片（[票据 11](.scratch/dsh-clipchat/issues/11-trigger-model.md)）。
Inputs: [需求文档 v1.0](dsh-clipchat-需求文档.md) · [wayfinder 地图](.scratch/dsh-clipchat/map.md) · [API 核验](.scratch/dsh-clipchat/research/dsh-api-findings.md) · [text-interaction 冒烟](.scratch/dsh-clipchat/research/text-interaction-smoke.md) · [v2 原型](.scratch/dsh-clipchat/prototype/session-highlights.html)

## Problem Statement

DSH 的回复经常很长。用户读到其中某一段想追问时，只能把文字复制到别处，或者另开一段对话；这样既打断阅读，也会让主线被支线问题污染。用户还需要知道每次提问花了多少 token，需要把重要的问答留在会话里，需要像公众号划线一样把选中的句子标在原文上，日后回来还能看到。

## Solution

在 DSH 对话里选中 assistant 正文的一段文字，先出现一个小菜单（引用 / 问）；点「问」就地展开浮窗卡片：

* 展开后卡片自动聚焦，首问默认带「选段 + 所在整条消息 + 最近 2-3 轮」，流式回答，可连续追问。
* 卡片内可切换模型（默认跟随主会话），每答显示输入/输出 token。
* 点「高亮这段」把选段标在原文上，随会话持久保留；点「留痕」把这次问答存进本会话列表。
* 「带回主线」把选段以引用形式插入输入框，并附一句问答摘要；不自动发送。
* 关闭卡片即丢弃未留痕的问答；高亮与留痕按会话存储，7 天无访问自动清理，归档不清理，永久删除会话后清理。

## User Stories

1. 作为正在读长回复的用户，我希望选中一段文字就出现「引用 / 问」小菜单，点「问」能展开浮窗，以便不用复制到别处再提问。
2. 作为用户，我希望点开「问」之后光标已经在输入框里，以便直接打字，不用再点一下。
3. 作为用户，我希望第一个问题自动带上选段和它所在的整条消息，以便模型理解上下文。
4. 作为用户，我希望上下文里还包含最近 2-3 轮对话，以便追问不脱离前文。
5. 作为用户，我希望回答流式显示，以便不用等整段生成完。
6. 作为用户，我希望在同一张卡片里连续追问，以便把一个问题聊透。
7. 作为用户，我希望在卡片里切换模型，以便同一段文字用不同模型比较。
8. 作为用户，我希望默认跟随主会话当前模型，以便不用每次选。
9. 作为用户，我希望每次回答后看到输入/输出 token，以便知道这次提问的成本。
10. 作为用户，我希望点击空白、按 Esc、点 × 都能关闭卡片，以便随时退出。
11. 作为用户，我希望关闭卡片后未留痕的问答不留下任何记录，以便随手提问不污染会话。
12. 作为用户，我希望点「高亮这段」把选段标在原文上，以便日后一眼看到重点。
13. 作为用户，我希望刷新页面或重新打开会话后高亮还在，以便长期保留。
14. 作为用户，我希望同一会话里可以有多段高亮，互不干扰。
15. 作为用户，我希望点击一条高亮能看到当时的问答，以便回顾。
16. 作为用户，我希望高亮在 7 天无访问后自动清理，以便不无限占空间。
17. 作为用户，我希望归档会话后高亮仍在、取消归档能恢复，以便归档只是收纳。
18. 作为用户，我希望永久删除会话后该会话的高亮与留痕被清理，以便不留下孤儿数据。
19. 作为用户，我希望点「留痕」才把这次问答存下来，以便只保留真正有用的。
20. 作为用户，我希望在卡片里看到本会话的留痕列表，以便快速找回。
21. 作为用户，我希望列表里当前选段的记录有标记，以便区分。
22. 作为用户，我希望把选段引用加一句摘要插回输入框，以便把结论带回主线。
23. 作为用户，我希望可以删除某条留痕，以便整理。
24. 作为用户，我希望只有 assistant 正文会出现「问这段」，以便用户消息和按钮不会误触。
25. 作为用户，我希望意外划词不产生高亮或留痕，以便不留下垃圾。
26. 作为用户，我希望在只读会话、子会话、无权限等场景看到明确提示，而不是坏掉。
27. 作为用户，我希望选段过长、没有可用模型、流式出错时有明确提示并能重试，以便知道怎么办。
28. 作为用户，我希望不同会话的高亮和留痕互不串，以便数据边界清楚。
29. 作为用户，我希望滑词提问不往主会话写消息、不调用工具，以便主线保持干净。
30. 作为用户，我希望卡片可以只用键盘操作（Tab、Esc、Enter），以便不依赖鼠标。
31. 作为用户，我希望界面跟随 DSH 的中英文语言，以便读得懂。
32. 作为用户，我希望分页未加载的消息滚到再标高亮，以便不丢历史。

## Implementation Decisions

### 1. 交付形态

* 一个双半 bundle：host 半负责路由、模型调用、存储与清理；client 半负责选区菜单、浮窗、高亮渲染。
* 包名 `dsh-clipchat`；manifest 声明 bundle patch 与 `dsh.client`（web、`immediately`），client 依赖声明为 `dsh-client-ui-chat`、`dsh-client-ui-conversation`、`dsh-client-locale`。
* M1 手写单文件 client bundle，不引入构建步骤；host 半为普通 ESM 入口，导出 `apply(ctx)`。
* host 半声明 `webServer`、`connection`、`llm`、`sessions`、`agentDefaultModel`、`workspace` 依赖；所有资源在 `apply` 内用 `effect` 注册并返回清理函数。
* 安装走 Plugins 的本地目录安装；开发期用本地 link，改 client 走 HMR，改 host 用禁用/启用 bundle 重载。

### 1.1 模块划分

* host 入口：`apply`、路由注册、错误映射、启动清理。
* 模型解析器：优先级链、模型目录汇总。
* 上下文构建器：消息/选段/最近轮次拼装、预算与截断。
* 会话存储：schema、原子写、上限、TTL、孤儿清理。
* 锚点模块：偏移计算、重锚、文本回退。
* client 入口：包装 quote slot、菜单与卡片、locale 注册。
* 卡片组件：状态机、流式渲染、模型菜单、留痕列表。
* 高亮渲染器：TreeWalker 标记/清除、MutationObserver 补标。

### 2. 注册与插槽

* **不注册自己的 selection interaction，也不替换/隐藏原生 quote。** 用 `ctx.slots.entries('conversation.chat.text-interaction')` 找到 key 为 `quote` 的条目，包装它的组件：保留原生「引用文本」，并列加一个「问这段」按钮。
* 包装在 `ctx.effect` 的 cleanup 里还原；同时 `ctx.slots.subscribe` 监听 slot 变化，对新出现的 quote 条目重复包装（HMR、bundle 重载）。
* 「问」按钮用 `mousedown` + `preventDefault` 保住选区；点击后在同一宿主 surface 内展开卡片，输入框自动聚焦。
* 只对 assistant 正文显示「问这段」：从选区起点向上找最近的 `[data-chat-node-key]`，key 形如 `14:assistant-step11:3`；user 气泡与其它来源只显示原生引用。
* 浮窗位置、空白点击关闭、Esc 关闭、窗口 blur 关闭由宿主 owner 负责；卡片 × 调用 `dismiss()`。
* 包装组件拿到 quote 的 props（`trigger / dismiss / readText / clearSelection / sessionId / useChat / useSession / inputActions`）；原生按钮的 `t` 仍走 `messageQuotes`，我们的文案用自己的 locale 命名空间绑定后传入。
* 选段文本在菜单渲染时读出并保存；展开后不依赖 `document.getSelection()`。
* 兜底：`slots.entries` 包装失效时，退化为注册同名 key `quote` 接管（需复刻引用按钮）或自建 overlay；不默认走这条路。

### 3. 路由契约

所有路由先过 `connection.requestRejection(req)`，被拒时返回 401/403 JSON。请求体上限 512 KB。

* `GET /dsh-clipchat/status` → `{ ok, guard, model: { provider, model, reasoningEffort? } | null }`，用于开发自检。
* `GET /dsh-clipchat/models?sessionId=` → `{ models: [{ provider, model, name, isDefault }] }`；由 host 汇总 `llm.listProviders()` 与各 provider 的模型；失败时至少返回会话当前模型，前端只显示可用项。
* `POST /dsh-clipchat/ask` → SSE。请求体 `{ sessionId, selection, message, recent, history, question, model? }`；`model` 省略表示跟随主会话。
  * SSE 帧：`meta {provider, model}`、`delta {text}`、`usage {inputTokens, outputTokens}`、`done {reason, firstTokenMs}`、`error {message}`。
  * 客户端断开时 `res.on('close')` 触发 abort，取消上游调用。
* `GET /dsh-clipchat/session?sessionId=` → `{ highlights, records }`。
* `POST /dsh-clipchat/highlight` → `{ sessionId, op: 'add' | 'remove', highlight }`，返回最新 `{ highlights }`。
* `POST /dsh-clipchat/record` → `{ sessionId, op: 'add' | 'remove', record }`，返回最新 `{ records }`。
* 所有非 SSE 响应为 JSON；错误统一 `{ error: string, message?: string }`。

### 4. 模型解析与调用

解析优先级：

1. 请求体显式 `model`（用户在高亮上选过且不是「跟随主会话」）。
2. 会话的 `requestHeader().config`（provider、model、reasoningEffort）。
3. `agentDefaultModel.currentSelection()`。
4. 都没有 → 503 `no-model`，前端提示「当前没有可用模型」。

调用 `llm.stream({ provider, model, reasoningEffort?, system, maxTokens, messages, signal })`，`maxTokens` 默认 2048。宿主包加载用 `createRequire(process.argv[1])` 锚定 dsh 安装目录解析 `@deepseek-ai/dsh-llm`，不在插件里复制消息构造函数。

### 5. 上下文拼装

固定顺序（前缀稳定，利于 KV cache）：

`system` → `<context>` → 历史问答（user/assistant 交替） → 本次问题。

`<context>` 内容与预算：

* `<message turn="N">`：选段所在 assistant 消息的可见纯文本。代码块保留围栏，表格按行拼接，公式保留 TeX 原文，剔除引用胶囊等 chrome。上限 8000 字符，超出时保留选段前后各 2000 字符，中间省略。
* `<selection>`：选段原文，上限 2000 字符；超限直接拒绝并提示「选段过长，请缩短到 2000 字以内」，不静默截断。
* `<recent>`：以选中消息所在 turn 为界，向前取最近 3 个已完成 turn 的 user + assistant 文本；每轮合计截 1500 字符；跳过工具调用与推理块。

历史问答由客户端随追问携带，最多 12 条；assistant 历史必须用 `createAssistantMessage({ content, source: { provider, model } })` 构造，user 历史用普通 user 消息。总输入约 15k 字符；超出预算时按「最旧轮次 → 整条消息头尾」顺序裁剪，选段永不裁剪。

### 6. 存储与生命周期

* 位置：`DSH_HOME/clipchat/<sessionId>.json`；目录 0700、文件 0600；原子写（临时文件 + rename）；同一 session 的写操作串行化。
* 结构（schema version 1）：

```ts
{
  version: 1,
  sessionId: string,
  updatedAt: number,
  highlights: Array<{
    id: string,
    anchor: { nodeKey: string, spans: Array<{ blockIndex: number, start: number, end: number }>, text: string },
    createdAt: number,
  }>,
  records: Array<{
    id: string,
    highlightId?: string,
    selection: string,
    question: string,
    answer: string,
    provider: string,
    model: string,
    usage?: { input: number, output: number },
    createdAt: number,
  }>,
}
```

* 上限：每会话 200 条高亮、500 条留痕，超出丢最旧；文件超过 1 MB 时先丢最旧留痕。
* 7 天**无访问** TTL：读取会话数据、新增高亮、提问、新增留痕都刷新 `updatedAt`；插件启动与每次读取时惰性删除过期文件。
* 归档：不清理；取消归档可恢复。
* 永久删除：孤儿清理。完整会话集合 = `sessions.list()` 的 id 并上 `workspace.archivedSessionIds`；文件对应的 session 不在集合内即删除。启动时跑一次，读取时顺带跑。
* 卸载插件不主动删数据，交给 TTL。

### 7. 高亮锚点与渲染

* 锚点 = `nodeKey`（chat node key）+ 若干 `span`（文本块序号 + 块内字符偏移）+ 选段文本（校验用）。M1 一次选区通常产生一个 span，schema 支持多 span。
* 渲染：在消息 DOM 内用 TreeWalker 定位文本节点，按偏移包 `<mark data-clipchat-id>`；重标前先 unwrap 旧 mark 并 `normalize()`，避免 mark 被反复切碎。
* 重锚定：先用 `useChat` 的 `nodes.get(key)` 取节点；块文本与锚点文本一致则按偏移标；不一致时用选段文本在该消息内做前缀搜索；仍失败则保留数据、暂不渲染，下次渲染再试。
* 未加载的分页消息不渲染；消息进入窗口后由渲染钩子补标。
* 用 `MutationObserver`（100ms 防抖）监听消息区变化并补标；忽略 mark 内部的变化，避免自触发。
* 高亮点击打开卡片并载入对应记录，不抢输入焦点；点击不改变浏览器选区。

### 8. 卡片交互

* 状态：`closed → menu（选区后的小菜单） → card（点「问这段」） → asking（流式） → answered / failed`。高亮提交与留痕是独立动作，不阻塞提问。
* 卡片只在点「问这段」后展开，展开即聚焦输入框；输入框 Enter 发送、Shift+Enter 换行；Esc 先关模型菜单，再关卡片（后者由 owner 处理）。
* 顶部显示选段预览（可滚动，最多 3 行）；中间是问答区；底部是输入框、发送、模型菜单、高亮/留痕/带回主线操作。
* 模型菜单：默认「跟随主会话」，其余项来自 `/models`；选择随该高亮保存，下一次提问生效。
* 流式期间显示部分答案与停止按钮；停止或关闭卡片 abort 请求。
* 每次回答结束显示 `in X / out Y` token；不估算费用。
* 关闭时未点「留痕」的问答只存在于内存，直接丢弃；不弹确认。
* 「高亮这段」在首次提交时写入，重复点击提示已高亮。

### 9. 留痕与带回主线

* 留痕只在用户点「留痕」时写入；记录包含选段、问题、答案、provider/model、usage、时间、可选 `highlightId`。
* 卡片底部「留痕 N」展开本会话列表；当前选段的记录打「当前选段」标签；列表项可插入输入框、删除。
* 「带回主线」：`inputActions.insertQuote(selection)` 插入引用；随后 `insertText('\n\n〔滑词〕' + summary)`。摘要 = 问题 + 答案要点，≤200 字。插入后聚焦输入框、光标到末尾，不自动发送。
* `insertQuote` 返回 false（只读、子会话、附件等）时退化为纯文本 `insertText`；仍失败则提示「无法插入」，保留卡片并提供复制。

### 10. 错误、安全与边界

* 所有路由先过 `requestRejection`；不使用自建 token。
* 不写 session、不建隐藏会话、不调用工具；只调用 `llm.stream`。
* 「问这段」只对 assistant 正文显示；user 消息、按钮、代码复制按钮不出现问入口。原生引用仍按宿主规则工作。
* 无模型、无权限、上游错误、abort 都要在卡片内给出可读提示；流中断保留已生成内容，可重试。
* 选段超过 2000 字符、历史超过 12 条、请求体超过 512 KB 都明确拒绝，不静默截断。
* 不记录密钥；存储文件只含对话文本与元数据。

### 11. 兼容与降级

* 09 已验证宿主 surface 可用；M1 通过包装 quote surface 进入，不注册竞争 interaction。已知风险：卡片打开期间聊天区重渲染（主会话流式、翻页）可能让克隆 Range 失效并触发宿主 dismiss。M1 接受该风险，验收时专门验证一次；若真实使用中频繁出现，M1.1 再切自建 overlay（路径 B），产品形态不变。
* 包装依赖 `slots.entries` / `entry.component` 这个未文档化结构（sidenote 同做法）；上游变更时按「同名 key 接管 → 自建 overlay」降级。
* `data-chat-node-key` 是内部实现，不作为公开契约；取不到时回退到「最新已完成的 assistant 节点 + 选段文本前缀匹配」。
* client 组件拿不到 `ctx`；所有服务通过 props 或注册期闭包传递。

### 12. 文案与主题

* 中英文两套文案；slot 注册带 locale 命名空间；标题、按钮、错误提示全部走 `t`。
* 使用 DSH 主题变量（面板背景、边框、文字、阴影）；不引入独立配色；高亮用主题强调色的低透明度背景。
* 键盘可达：菜单与按钮可 Tab 聚焦，有可见 focus ring，Esc 行为一致。

## Testing Decisions

好的测试只断言外部行为：给定输入（选区、请求体、假模型 chunk、存储目录），断言输出（SSE 帧、文件、渲染标记、注册项）。不断言内部函数调用顺序、不写 CSS/结构快照、不 mock 被测模块自己的逻辑。

测试缝（已与用户确认，选 A）：

1. **host `apply`**：用假 ctx 驱动真实 `apply`，捕获 `webServer.register` 注册的 handler；假 `llm.stream` 按脚本吐 chunk；假 `sessions` / `connection` / `agentDefaultModel`；临时目录做存储。覆盖路由注册与清理、守卫、模型解析、消息拼装、SSE 帧、abort、存储读写与清理。
2. **纯模块**：锚点解析与重锚、上下文拼装与截断、存储 schema/上限/TTL/孤儿清理、摘要生成。直接单测，不经过 HTTP。
3. **client `apply`**：假 `slots` 注册表（带 `entries` / `subscribe`），断言 quote 条目被包装、cleanup 还原、重复 apply 不重复包装；不挂载 React。
4. **浏览器验收清单**：由 09 冒烟演化，人工或 CDP 执行。这一层不进入 CI。

验收清单（替换需求文档验收 3 的口径）：

1. 选中 assistant 正文 → 浮层出现「引用文本」「问这段」；user 消息不出现「问这段」；点「问这段」→ 卡片展开、输入框聚焦；空白点击、Esc、× 都能关闭。
2. 连续两问流式完成，显示 `in/out` token，第二问带第一问的 assistant 历史且不报错。
3. 点「高亮这段」→ 原文出现高亮；刷新页面后仍在；点击高亮能打开卡片。
4. 点「留痕」→ 卡片列表出现该条，带「当前选段」标签；「带回主线」插入引用 + 摘要。
5. 把存储文件的 `updatedAt` 改成 8 天前 → 再次读取时该会话被清理。
6. 归档会话后高亮仍可读；模拟删除（从会话集合移除）后孤儿文件被清理。
7. 显式选一个模型提问一次；再切回「跟随主会话」提问一次，两次 `meta` 帧的 provider/model 符合预期。
8. 只读/子会话/无模型三种场景都能看到可读提示，不白屏。
9. 卡片打开时让主会话产生一次流式更新，记录宿主是否 dismiss（已知风险验证）。

覆盖的模块：

* host 路由与 SSE（`ask`、`status`、`session`、`highlight`、`record`、`models`）。
* 上下文拼装与截断。
* 存储：schema、上限裁剪、TTL、孤儿清理、并发写。
* 锚点：偏移计算、重锚、文本变化回退。
* client 包装/还原与 disposal。

先例：

* `dsh-select-ask` 用 `node --test` 直接测纯函数（`test/trusted-request.test.mjs`），不启服务器。
* `dsh-message-quotes` 的 interaction + keyed slot 注册形态是本项目 client 半的直接参照。
* `dsh-better-sidebar` 的 sidechat 路由展示了 host 侧模型解析与 SSE 的组织方式。
* `dsh-sidenote` 用同样的 `slots.entries` 包装隐藏原生引用，证明这种与 quote 协调的方式在 0.2.2 可行。

## Out of Scope

* M2/M3：跨会话留痕检索、文档/PDF 级 UI、设置页（默认意图、浮窗行为、历史上限）。
* 工具调用、读工作区文件、fork 会话、整会话继承。
* 独立批注系统、多选合并成一条、AI 自动高亮。
* 移动端适配、窄屏专门布局。
* npm 发布、占位包、市场提交。
* 老数据迁移与备份（M1 之前无正式数据）。
* 与 dsh-sidenote / dsh-btw 的入口合并。

## Further Notes

* 归档语义以本 spec 为准：**归档不清理**，与需求文档 v1.0 的「归档同步清理」不同；用户已确认改为「仅删除会话才清理」。
* 需求文档里「一次性隐藏会话」的路线已被 09 冒烟推翻：M1 直接调 `llm.stream`，不建会话。
* 本仓库没有 git、也没有 issue tracker；本 spec 即交付物，wayfinder 的 07 票据此关闭。若要接入正式 tracker，先运行 `/setup-matt-pocock-skills`。
* 09 的冒烟插件源码留在 `.scratch/smoke-plugin/`，菜单验证的源码留在 `.scratch/menu-smoke/`，仅作参考，不进入正式包。
* 唤醒方式：左键选区 → 原生引用 +「问这段」，点问展开卡片；不抢 selection，不做右键，快捷键留 M1.1。
* M2 方向（一句话）：跨会话留痕检索、设置页（默认意图、浮窗行为、历史上限）。
* M3 方向（一句话）：文档/PDF 级划词与标注 UI。
