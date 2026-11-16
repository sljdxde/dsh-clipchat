# 07 产出 M1 实施方案

Type: task
Status: resolved
Blocked by: -（03/04/05/06/09/10 均已解决）

## Question

把已定决策落成 `.scratch/dsh-clipchat/m1-spec.md`，包含：

- 架构与数据流（host 半 / client 半、webServer 路由、SSE、模型解析）。
- 包结构与文件清单；`cordis.patch.yml` 与 `dsh.client` 配置。
- 接口契约：路由请求/响应、SSE 帧、留痕记录、prompt 组装。
- 交互规格：引用 03 的原型结论；空/流式/错误/追问/留痕/带回主线。
- 边界与错误处理清单。
- 可测验收清单（替换原文验收 3 的口径）。
- M2/M3 路线（每项一句话）。
- 风险与降级路径。

## Answer

（2026-11-16）已产出 [dsh-clipchat M1 实施方案](../../../dsh-clipchat-M1-实施方案.md)，Status: ready-for-agent。

测试缝按「host `apply` + 纯模块」切：host 用假 ctx 驱动路由与 LLM，纯模块直测；client 只测注册与 dispose，UI 走浏览器验收清单。

之后进入 `/to-tickets` 拆实现票。
