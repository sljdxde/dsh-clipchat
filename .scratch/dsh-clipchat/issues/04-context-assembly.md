# 04 上下文组装与截断契约

Type: grilling
Status: resolved
Blocked by: -（09 已通过）

## Question

上下文：先读 [research/dsh-api-findings.md](../research/dsh-api-findings.md) 第 2、4 题（整条消息/最近轮次取法；assistant 历史必须 `createAssistantMessage`）。

默认档位（选段 + 所在整条 assistant 消息 + 最近 2-3 轮）的精确组装规则，要细到能直接写 system prompt 模板：

- 消息文本取纯文本还是保留 Markdown；代码块/表格/列表选段如何标注。
- 选段在 prompt 里的标记方式（分隔符、是否引用行号）。
- 「最近 2-3 轮」的边界：按 turn、按 user/assistant 对，还是按消息条数；遇到超长轮如何裁剪。
- token 预算与截断顺序：先砍历史、再砍整条消息、最后拒绝？超限时给用户什么提示。
- 追问时是否重复携带上下文（考虑 KV cache 与答案一致性）。

## Answer

（2026-11-16，推荐契约；`/to-spec` 前可改）

1. **文本源**：assistant 消息的可见纯文本；代码块保留 ``` 围栏，表格按行拼接，公式保留 TeX 原文，剔除引用胶囊等 UI chrome。
2. **标记**：`<context>` 内依次 `<message turn="N">…</message>`、`<selection>…</selection>`、`<recent>…</recent>`；不用行号。
3. **最近轮次**：以选中消息所在 turn 为界，取之前最近 3 个已完成 turn；每轮 user+assistant 各截 1500 字符；跳过工具调用与推理。
4. **预算**：选段硬上限 2k 字符（超出提示缩短，不静默截断）；整条消息 8k 字符；最近 3 轮共 4.5k；输入总量约 15k 字符。回答 `maxTokens` 2048。
5. **截断顺序**：最旧轮次 → 整条消息头尾（保留选段前后各 2k）→ 仍超则拒绝并提示「上下文过长」；选段永不截断。
6. **追问**：上下文整体重发，顺序固定（system → context → 历史 Q&A → 新问题），前缀稳定以吃 KV cache。
7. **token**：SSE `usage` 累计，卡片显示输入/输出。
