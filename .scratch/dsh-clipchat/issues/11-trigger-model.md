# 11 唤醒方式：选区自动还是显式触发

Type: grilling
Status: resolved
Blocked by: -

## Question

划词浮窗的出现时机：

- A. 选区即弹全卡（v2 原型现状）。
- B. 选区弹小工具条（引用 / 问），再展开卡片。
- C. 选区内右键弹卡。
- D. 快捷键（⌘⇧K）弹卡。
- E. 选区 + 修饰键拖选。

约束（2026-11-16 实测）：宿主 `message-quotes` 的「引用文本」胶囊已经占用了 `selection` trigger；`dispatch` 只让第一个 `open()` 的 interaction 生效，所以在正常会话里，第三方 selection interaction 收不到手势。选 A/B 需要覆盖 quote 的 slot（`shadows-shipped-ui`）或自建 overlay（会出现两个浮层）。

## Answer

（2026-11-16 定稿）采用 **B：左键选区弹小菜单（保留原生「引用文本」+ 增加「问这段」），点「问」再展开卡片**。

- 菜单只放「引用文本 + 问这段」；高亮、留痕、模型、token 都在卡片内；不做右键；快捷键留 M1.1。
- 不注册竞争 interaction，不替换/隐藏 quote；用 `slots.entries` 包装 key 为 `quote` 的组件，cleanup 还原，并订阅 slot 变化以包装新条目。
- 实测：菜单并排正常；点「问」卡片展开、自动聚焦、选段预览保留；原生引用不受影响。
- 证据：[菜单截图](../research/selection-menu.jpg)、[卡片截图](../research/selection-menu-card.jpg)、[完整调研](../research/selection-trigger.md)。
- 风险：依赖未文档化的 slot 条目结构（sidenote 同做法）；降级顺序为「同名 key 接管 → 自建 overlay」。
