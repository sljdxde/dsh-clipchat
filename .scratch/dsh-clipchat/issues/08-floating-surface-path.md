# 08 浮窗技术路径：宿主 text-interaction 还是自建 overlay

Type: grilling
Status: resolved
Blocked by: 02

## Question

M1 的浮窗挂在哪条路径上？三条参考实现全部走 B，而需求文档假设的 A 在 rc.3 源码成立但无第三方实跑先例。

- **A：宿主 `conversation.chat.text-interaction`。** 宿主负责选段定位、视口/输入框钳位、点外/Esc/新划选关闭、可选区判定；插件只注册 interaction + 同 key 的 slot 组件。代价：无第三方实跑先例，`locale` prop 未 100% 证实，整条消息锚点依赖内部属性 `data-chat-node-key`。
- **B：自建选区监听 + `shell.overlay`**（select-ask / minichat / bubble-explain 都走这条）。有先例、控制力强；代价：自己实现定位、滚动跟随、关闭规则，DOM 依赖更重，且可能与宿主选区规则冲突。
- **C：先做 A 的最小冒烟，失败再切 B。**

请选择并说明：若选 A/C，冒烟的验收口径（选词后浮窗出现、组件拿到 `sessionId`/`useChat`/`inputActions`、连续两问不崩）是否足够？若选 B，如何处理滚动定位与「点外关闭」？

上下文：先读 [research/dsh-api-findings.md](../research/dsh-api-findings.md) 第 0、1、2 题。

## Answer

2026-11-16 确认：走 **A（宿主 text-interaction）**，以最小冒烟作为 gate；冒烟不过再切 B。

冒烟验收口径：

- 注册 interaction + 同 key 的 slot 组件后，assistant 正文选词能弹出浮窗；
- 浮窗组件能拿到 `sessionId`、`useChat`、`inputActions`；确认 `locale`/`t` 是否实际存在；
- 同一个浮窗内连续两问不崩（必须走 `createAssistantMessage({content, source:{provider,model}})` 拼 assistant 历史）。

触发降级 B 的条件：浮窗不出现；关键 props 缺失且无替代；或连续追问 TypeError 无法绕开。

冒烟拆为 [09](09-text-interaction-smoke.md) 单独执行；03/04/06 在 09 完成前不开工。
