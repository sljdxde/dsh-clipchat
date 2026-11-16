# 06 带回主线的插入契约

Type: grilling
Status: resolved
Blocked by: -（09 已通过）

## Question

上下文：先读 [research/dsh-api-findings.md](../research/dsh-api-findings.md) 第 1 题（`insertQuote(text, summary?)` 的位置与签名）。

「选段引用 + 问答摘要」如何插入输入框：

- 引用用宿主 quote capsule（`inputActions.insertQuote`）还是纯文本 `> ` blockquote；两者在发送后的呈现差异。
- 摘要格式：问题 + 答案要点，还是只答案；多长；是否带「来自 clipchat」标记。
- 插入后的光标位置与聚焦行为。
- 输入框只读、子会话、附件等不可插入场景如何提示。
- 一次插入失败时是否保留浮窗内容。

## Answer

（2026-11-16，推荐契约；`/to-spec` 前可改）

1. **引用**：`inputActions.insertQuote(selection)` 用宿主 quote capsule；随后 `insertText('\n\n〔滑词〕' + summary)`。
2. **摘要**：问题 + 答案要点，≤200 字，不带模型/token 细节。
3. **插入后**：聚焦输入框、光标移到末尾，不自动发送。
4. **失败**：`insertQuote` 返回 false（只读/子会话/附件等）→ 退化 `insertText`；仍失败 → 提示「无法插入」，卡片保留并提供复制。
5. 插入失败或用户取消时不关闭卡片，内容保留。
