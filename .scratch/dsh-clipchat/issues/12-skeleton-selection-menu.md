# 12 骨架 + 选区菜单 + 空卡片

**What to build:** 安装 `dsh-clipchat` 后，选中 assistant 正文会出现「引用文本 + 问这段」小菜单；点「问这段」展开一张空卡片并自动聚焦；原生引用仍然可用；禁用/卸载后恢复原样。

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 安装后 Plugins 能看到 `dsh-clipchat`，中英文标题/描述与图标正常
- [x] 选中 assistant 正文 → 「引用文本」「问这段」并排出现；选中 user 消息只出现原生引用
- [x] 点「问这段」→ 卡片展开、输入框聚焦、选段预览正确；空白点击 / Esc / × 关闭后再次选中仍可用
- [x] 原生「引用文本」仍能把选段插入输入框
- [x] 禁用或卸载后原生引用恢复；重复 apply 不会重复包装（client 测试）
