# 05 留痕记录的数据模型与最简入口

Type: grilling
Status: resolved
Blocked by: 02

## Question

上下文：先读 [research/dsh-api-findings.md](../research/dsh-api-findings.md) 第 5、6 题（路由与双半 bundle；存储位置不影响表面路径）。

原型输入（03）：A 卡片内已有候选入口——selbar 的「留痕 N」→ 本会话列表（展开 / 插入输入框 / 删除）；B 的留痕 tab 是同一数据的侧栏形态。用它判断 M1 的最小入口，不要在 05 里从零发散。

「留痕」写什么、存哪里、M1 里怎么看到：

- 字段：选段、问题、答案、模型、token、时间、sessionId、消息定位（seq/messageId）。
- 存储：host 的 DSH_HOME JSON（参考 minichat）vs 浏览器 localStorage；刷新恢复的可靠性差异。
- 保留上限、清理策略、是否随会话删除。
- M1 是否需要一个最简浏览入口；若需要，放卡片内按钮、输入框 dock、还是右侧栏。没有入口则验收 3 无法验证。
- 什么算一条留痕：只有用户点「留痕」才算，还是快问自动记录；两者是否区分。

范围（2026-11-16 用户提出）：计数与列表是「本会话」还是「当前选段」？03 原型当前实现为**会话级**（关窗/换选段不清空），列表给当前选段的记录打「当前选段」标签；待用户在「会话级 + 标记」与「选段级」之间确认。

关系变化（2026-11-16）：划词高亮改为自动、随会话持久（票 10）；问答挂在某个高亮下，默认只在内存，点「留痕」才随高亮落盘。05 只管问答记录这一半，高亮的锚点/TTL/清理走 10。

## Answer

（2026-11-16 定稿）

- **存储**：host JSON，每会话一个文件（与 10 的高亮同文件）：`{ version, sessionId, updatedAt, highlights: [], records: [] }`。客户端通过路由读写。
- **字段**：
  - highlight：`id, anchor{ nodeKey, blockIndex, start, end, text }, createdAt`。
  - record：`id, highlightId, selection, question, answer, provider, model, usage{ input, output }, createdAt`。
- **保留上限**：每会话 200 条高亮、500 条留痕；超出丢最旧；文件超过 1 MB 时先丢最旧留痕。
- **清理**：7 天无访问清文件；归档不清理；永久删除会话走孤儿清理（见 10）。
- **入口**：卡片底部「留痕 N」展开本会话列表（当前选段打标签，可插入输入框 / 删除）；M1 不做右侧栏。
- **什么算一条留痕**：只有用户点「留痕」才写入；问答默认只在内存，关窗即弃。
- **范围**：计数与列表按会话聚合，换选段不清空。
