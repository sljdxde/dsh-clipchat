# 14 连续追问

**What to build:** 同一张卡片里问第二句时，模型能看到第一问的问题和回答，继续聊下去而不丢上下文。

**Blocked by:** 13（单问 + 默认上下文 + 流式）

**Status:** ready-for-agent

- [ ] 第一问完成后追问，第二轮流式正常，无 TypeError
- [ ] host 测试断言 assistant 历史由 `createAssistantMessage` 构造
- [ ] 第二问请求包含第一问的 user + assistant 文本
- [ ] 关闭卡片后追问历史丢弃；刷新不恢复（浮窗即弃）
