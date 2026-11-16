# 17 保留与清理（7 天 TTL + 孤儿）

**What to build:** 高亮与留痕在 7 天无访问后自动消失；归档会话不清理；永久删除会话后对应文件被清掉。

**Blocked by:** 16（高亮持久化 + 刷新恢复）

**Status:** ready-for-agent

- [ ] 读取/新增会刷新 `updatedAt`；把 `updatedAt` 改成 8 天前，再次读取时文件被删
- [ ] 归档会话（id 在 `workspace.archivedSessionIds`）时文件保留
- [ ] 文件对应会话不在 `sessions.list()` ∪ `archivedSessionIds` 时被清
- [ ] 插件启动与每次读取都触发清理；清理失败不影响主流程
- [ ] 测试覆盖 TTL、归档保留、孤儿清理
