# 滑词对话冒烟（Ticket 09）

一次性验证插件，用来回答一个问题：**宿主 `conversation.chat.text-interaction` 浮窗在 rc.3 真实页面里能不能用**。

## 做什么

- 在 assistant 正文里拖选一段文字 → 浮窗出现（位置由宿主负责），输入框自动聚焦。
- 浮窗顶部列出 props 自检：`sessionId`、`trigger`、`useChat`、`inputActions`、`t()`、`readText()`。
- 「连续两问」先问第一问，拿到回答后把该回答作为 assistant 历史再问第二问，验证 `createAssistantMessage` 路径。
- 底部日志显示模型、首字耗时、usage 与错误。

## 不做

- 不写会话、不落盘、不做高亮、不做上下文全量组装。
- 路由只挂 `/dsh-clipchat-smoke/status` 与 `/dsh-clipchat-smoke/ask`。

## 卸载

在 Plugins 里移除 `dsh-clipchat-smoke`，或删掉 profile 补丁里的 `clipchat-smoke` 行。
