# 18 模型选择（按高亮保存）

**What to build:** 卡片底部可以选「跟随主会话」或某个具体模型；选择随当前高亮保存，刷新后仍在，下一问生效。

**Blocked by:** 13（单问 + 默认上下文 + 流式）、16（高亮持久化 + 刷新恢复）

**Status:** resolved

- [x] 菜单列出可用模型与「跟随主会话」；选择后 SSE `meta` 的 provider/model 正确
- [x] 选择随高亮持久化，刷新后仍在，下一问生效
- [x] 未选时按 `requestHeader` → `agentDefaultModel` 链解析
- [x] 模型列表获取失败时只显示当前模型，不白屏
- [x] 显式选择的模型无效时给出可读错误，不发起调用

（2026-11-16 实测：菜单列出全部 provider 模型；选中 bangsun/deepseek-v4-flash 后 ask body 带 model；高亮保存 model，刷新后重开同一选段仍恢复该模型。）
