# dsh-clipchat M1 路线图

## Destination

一份冻结的 M1 实施方案：划词 → 就近浮窗 → 流式回答 → 连续追问 → 划词高亮（随会话保留）→ 留痕 / 带回主线；含 host/client 分工、上下文组装契约、高亮锚点与生命周期、宿主 API 核验结论与可测验收。M2/M3 只留方向，据此可直接开工。

## Notes

- 领域：DSH 0.2.2-rc.3 的 host + client 双半 UI 插件；划词交互候选走 `ctx.uiConversation.interactions` + `conversation.chat.text-interaction` slot。
- 必读技能：dsh-doc（宿主事实）、grilling（决策）、research（事实核验）、prototype（形态）。
- 追踪器：local markdown（本目录）。仓库尚无 git，研究产物落在 `research/` 而非 throwaway 分支。
- 参考实现源码临时拉在 `/tmp/clipchat-refs`（select-ask / minichat / bubble-explain）；它们证明了「host 注册 webServer 路由 + `ctx.llm.stream` 直调」路线，但**都没有用** text-interaction 浮窗。
- 原始输入：[需求文档 v1.0](</Users/yuzhou/004个人代码仓库/dsh-clipchat /dsh-clipchat-需求文档.md>)。其中「一次性隐藏会话」「竞品空白位」「关窗即弃 vs 刷新恢复」已被本图推翻或改写。
- 本 effort 允许把「产出 M1 方案」作为 task 带入图中执行（见任务 07），不只停留在决策。
- 研究结论：[dsh-api-findings.md](research/dsh-api-findings.md)。
- 原型基线：`prototype/session-highlights.html`（v2，已确认）；`floating-card.html` 为 v1，仅对比。
- 2026-11-16 新需求：划词高亮随会话保留（类似公众号划线），归档/删除会话同步清理，后台存储默认 7 天 → 票 10；v2 原型见 `prototype/session-highlights.html`。
- 2026-11-16 新发现：选区已被 `message-quotes` 的「引用文本」占用（dispatch 首个 open 生效）→ 唤醒方式见 [11](issues/11-trigger-model.md)：已定为「左键菜单（引用+问）」，spec 第 2/8 节已更新。
- 2026-11-16 实现票 [12-22](issues/) 已发布（ready-for-agent），前沿为 12；下一步 `/implement` 逐张做。

## Decisions so far

- [冻结 M1 产品口径](issues/01-freeze-m1-product-decisions.md): M1 含连续追问；默认上下文=选段+整条消息+前 2-3 轮；仅 assistant 正文触发；浮窗即弃、留痕持久化；跟随主会话模型并显示 token；带回主线=引用+摘要。（2026-11-16 补充：划词高亮另行持久化，见 10；卡片内可选模型，默认跟随主会话。）
- [核验 DSH 宿主 API（0.2.2-rc.3）](issues/02-verify-dsh-apis.md): 注册/props/销毁、useChat 取数、模型解析链、usage/abort、路由防护、双半 bundle 全部核验；assistant 历史必须 `createAssistantMessage`；浮窗路径留待 08。
- [就近浮窗卡片的粗原型](issues/03-prototype-floating-card.md): v2 定为 M1 形态——划词只弹卡片+自动聚焦，显式提交才高亮，仅 assistant 正文，卡内可选模型；关闭=空白/Esc/×。技术承载仍待 09。
- [浮窗技术路径：宿主 text-interaction 还是自建 overlay](issues/08-floating-surface-path.md): 走 A（宿主 text-interaction），先做最小冒烟 gate（09）；不过再切 B（自建 overlay）。
- [最小冒烟：text-interaction 浮窗端到端](issues/09-text-interaction-smoke.md): **通过**，确认走 A、不切 B。浮窗/定位/关闭由宿主负责，props 齐全，连续两问（`createAssistantMessage`）不崩；`t` 来自 `locale`，`useChat` 用 `nodes.values()`，聚焦会清选区但不塌。风险：卡片打开期间聊天区重渲染可能 dismiss（未实测）。详见 [冒烟报告](research/text-interaction-smoke.md)。
- [留痕记录的数据模型与入口](issues/05-history-record-model.md): host JSON 每会话一个文件（高亮与留痕同文件）；字段与上限（200 高亮 / 500 留痕）；仅点「留痕」落盘；卡片内「留痕 N」+ 会话列表；会话级聚合 + 当前选段标签。
- [划词高亮的持久化与生命周期](issues/10-highlight-persistence.md): 7 天无访问清理；归档不清理、删除会话走孤儿清理；锚点=messageId+块序号+字符偏移+文本校验；显式提交才持久化。
- [上下文组装与截断契约](issues/04-context-assembly.md): 可见纯文本；`<message>/<selection>/<recent>` 标记；最近 3 个已完成 turn；选段 2k 硬上限、消息 8k、总输入约 15k；截断从最旧轮次到消息头尾，选段不截。
- [带回主线的插入契约](issues/06-back-to-main-contract.md): `insertQuote(selection)` + `insertText('〔滑词〕'+摘要)`；摘要 ≤200 字；插入后聚焦不自动发送；失败退化纯文本并保留卡片。
- [产出 M1 实施方案](issues/07-m1-implementation-spec.md): 已发布 [dsh-clipchat-M1-实施方案.md](../../dsh-clipchat-M1-实施方案.md)（Status: ready-for-agent）；测试缝=host `apply` + 纯模块；进入 `/to-tickets`。
- [唤醒方式：选区自动还是显式触发](issues/11-trigger-model.md): 左键选区 → 小菜单（原生「引用文本」+「问这段」），点「问」展开卡片；不做右键，快捷键留 M1.1；实现为包装 `quote` slot，不抢 selection。

## Not yet specified

- 窄屏/移动端降级形态（本 effort 只按桌面 Web 设计）。
- 「再划选第二段拼入」的替代交互（宿主会在 pointerdown dismiss 浮窗，需要重新设计）。
- 设置项：默认意图、浮窗行为、历史上限。
- 跨会话留痕检索。
- 与 dsh-sidenote / dsh-btw 的共存与差异定位（是否互相遮挡、是否合并入口）。

## Out of scope

- 工具调用 / 读工作区文件。
- fork 会话 / 快照 / 整会话继承。
- 独立批注系统、文档引用、PDF 页码（划词高亮已在 scope 内，见 10）。
- 常驻顶栏入口或全局按钮。
- M2/M3 的实现本身（本图只到 M1 方案 + 路线）。
- 移动端适配、npm 占位发布。
