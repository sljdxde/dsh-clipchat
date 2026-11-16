# dsh-clipchat M2 实施方案（草案）

Status: in progress — 范围与决策已确认（2026-11-16）；检索已完成，设置页待做
Date: 2026-11-16
Inputs: [M1 实施方案](dsh-clipchat-M1-实施方案.md) · [需求文档 v1.0](dsh-clipchat-需求文档.md) · [M1 分诊/实现记录](docs/M1-TRIAGE.md)

## Problem

M1 把高亮和留痕按会话隔离：离开当前会话就找不到之前的问答。同时，M1 的几项行为被写死（自动高亮、快问、历史上限），用户没有调整入口。

M2 只做两件事：**跨会话找到留痕**，以及**让少数关键行为可配置**。

## Scope

1. **跨会话留痕检索**：在当前卡片的「留痕」面板里切换到「全部会话」，按关键字搜索所有已保存问答。
2. **设置页**：默认意图（划词后菜单还是直接卡片）、浮窗行为（自动聚焦、显示快问）、历史条数上限。

需求文档 v1.0 里 M2 的「连续追问」「带回主线」「留痕面板刷新恢复」已在 M1 完成，本方案不重复。

## Non-goals

- M3：上下文档位 UI、第二选段拼入、文档/PDF 标注。
- 跨会话跳转（点击结果跳到另一个会话），M2 只在原地展示与复制。
- 语义检索 / 向量检索 / 全文索引；M2 用文件扫描 + 子串匹配。
- 移动端、npm 发布。

## Product decisions（已确认）

1. **检索入口**：卡片 footer 的「留痕 N」面板顶部加「本会话 / 全部会话」切换；全部会话模式下出现搜索框，结果就地展开，提供「复制问答」和「插入主输入框」。不新开全局面板。
2. **检索口径**：对 `selection` / `question` / `answer` 做大小写不敏感子串匹配；按 `createdAt` 倒序；空查询返回最近 20 条；上限 50 条。只读，不写回。
3. **设置承载**：DSH `settings.section`（已核到该 slot 存在）注册一个「滑词对话」页；设置存 `DSH_HOME/clipchat/settings.json`，host 暴露 `GET/POST /dsh-clipchat/settings`。若 section 接入成本高于预期，降级为卡片 footer 的齿轮弹层。
4. **设置项**：
   - `defaultIntent`: `menu`（默认，划词后先出小菜单）/ `card`（划词后直接展开卡片）；
   - `autoFocus`: 打开卡片后是否聚焦输入框（默认 `true`）；
   - `showPresets`: 是否显示 4 个快问（默认 `true`）；
   - `historyLimit`: `6` / `12` / `24`（默认 `12`）。
5. **边界**：浮窗位置、空白点击关闭、Esc 由宿主控制，不放进设置；改 `defaultIntent=card` 时仍保留原生「引用文本」入口。

## Technical design

### Host

- `GET /dsh-clipchat/search?q=<text>&limit=<1-50>`（过 `requestRejection`）
  - 扫描 `DSH_HOME/clipchat/*.json`，单个文件解析失败即跳过；
  - 扫描上限：400 个文件、8 MB 总量、50 条结果；超限标记 `truncated`；
  - 返回 `{ query, total, truncated, items: [{ sessionId, recordId, selection, question, answer, provider, model, createdAt }] }`；
  - `answer` 全量返回（不在搜索接口里截断），客户端展开即可看到完整问答；
  - 不返回 `usage` / `answerTruncated`；会话先显示 id 尾号，标题暂不提供（`SessionHeader` 无 title）；
  - `q` 超过 200 字返回 400 `query-too-long`；`limit` 缺省 20、上限 50。
- `GET /dsh-clipchat/settings` → `{ defaultIntent, autoFocus, showPresets, historyLimit }`
- `POST /dsh-clipchat/settings` → 只接受上述键，校验值域，原子写；非法值 400。
- 设置文件：`DSH_HOME/clipchat/settings.json`，目录 0700、文件 0600；与每会话 JSON 同一套原子写。
- 检索与设置都不写 session、不调模型。

### Store / pure modules

- `lib/store.js` 的 `listSessionFiles()`、`readSessionFile()` 提供可复用读取，`readAllForSearch()` 由两者组合；搜索逻辑放 `lib/search.js`（纯函数，便于单测）。
- 设置读写放 `lib/settings.js`（默认值、校验、合并、原子写）。

### Client

- 留痕面板：`本会话 / 全部会话` 两个 tab；搜索框 200ms 防抖、`limit=20`；结果行显示选段、问题、答案摘录、模型、时间；展开全文，按钮「复制」与「插入主输入框」。
- 设置：DSH 设置页 section，四个控件；读 `/settings` 缓存到 apply 期，改动即时生效并回写。
- `defaultIntent=card` 时，`ClipMenu` 首次渲染直接展开；`showPresets=false` 时隐藏快问行；`historyLimit` 替换当前常量。

## Tickets（建议顺序）

| # | 内容 | 状态 | 验收 |
|---|------|------|------|
| M2-01 | 设置与检索的宿主 API 核验（settings.section、session 标题、schema 形态） | 已核：`settings.section` slot 存在；`SessionHeader` 无 title，标题需另取 | 结论写进本节 |
| M2-02 | 存储搜索纯模块 + `GET /search` + 单测 | 完成 | 临时目录多会话命中/不命中、排序、上限、坏文件跳过、不续期 TTL |
| M2-03 | 客户端「全部会话」tab 与搜索 UI | 完成（fixture 验证） | 输入关键字出现结果；展开/复制/插入可用；本会话数据不受影响 |
| M2-04 | 设置存储 + `GET/POST /settings` + 单测 | 待做 | 默认值、非法值 400、原子写、并发写不丢 |
| M2-05 | 设置页 section + 四项设置生效 | 待做 | 改 `historyLimit` 后追问请求条数变化；关快问后卡片不显示；`defaultIntent=card` 时划词直接出卡片 |
| M2-06 | 硬化与验收：路由守卫、上限、文档、验收清单 | 待做 | `npm run check` 全过；手动清单逐条通过 |

## Acceptance（M2 完成口径）

1. 在任意会话的卡片里搜一个只存在于另一个会话的留痕，能命中并看到完整问答。
2. 搜索空查询返回最近 20 条；无结果有明确空态；坏文件不影响其它结果。
3. 设置页四个控件可读写；刷新后保持；非法值被拒绝且有提示。
4. 关闭快问后卡片不显示快问；`defaultIntent=card` 时划词直接展开卡片且原生引用仍可用。
5. `npm run check` 全过，新增用例覆盖搜索与设置。

## Decisions confirmed（2026-11-16）

1. 「默认意图」= 划词后菜单 / 直接卡片；默认菜单。
2. 检索入口 = 卡片「留痕」面板内的「全部会话」tab。
3. 设置页 = DSH `settings.section`（slot 已核）；若接入成本超预期再降级为卡片内弹层。

## Progress

- 2026-11-16：M2-02、M2-03 完成。新增 `lib/search.js`、`store.readAllForSearch()`、`GET /dsh-clipchat/search`，客户端留痕面板加「本会话 / 全部会话」tab、搜索框、结果展开/复制/插入。`npm run check` 190 项通过。
- 检索为只读：扫描不刷新 `updatedAt`，不续期 TTL；跳过过期、损坏、超限文件，并在响应里用 `truncated` 标记。
- 注意：host 半改动需要重启 dsh（或禁用/启用 bundle）才对运行中的 GUI 生效。本次客户端 UI 用 fixture 响应验证；路由与存储由单测覆盖。
- 复审后修正（2026-11-16）：搜索答案不再 16k 截断；客户端 limit 统一 20；`readAllForSearch` 复用 `listSessionFiles`/`readSessionFile`；路由读操作统一走 `readRoute`；卡片新增「点快问发对应问题」「首问自动高亮」「空选段禁用快问」用例；`npm run check` 195 项通过。
- 待做：M2-04 设置存储与路由、M2-05 设置页与四项设置、M2-06 硬化与验收。
