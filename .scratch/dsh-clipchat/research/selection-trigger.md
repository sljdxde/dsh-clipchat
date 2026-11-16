# 划词浮窗的唤醒方式：选区自动，右键，还是左键小菜单

结论：**左键选区弹一个小菜单（保留宿主「引用文本」+ 增加「问这段」），点「问」再展开卡片。** 这是设计上最顺、也已实测可行的方案；不做「选区即弹全卡」，也不需要右键。

## 一、为什么不能「选区即弹全卡」

左键选区已经被宿主的 `message-quotes` 占用了。真实会话里选中 assistant 正文，出现的是「引用文本」胶囊。

代码层面这是必然的：

- `ConversationInteractionRegistry.dispatch` 按注册顺序遍历，**第一个调用 `open()` 的 interaction 获胜，后面的不再执行**。
- `message-quotes` 注册了 `id = 'quote'`，在可写会话里只要 `trigger === 'selection'` 且 `readText()` 非空就 `open()`。
- 因此第三方再注册一个 selection interaction，在正常会话里收不到手势；只有 quote 自己拒绝的场景（子会话、会话已移除）才会轮到我们。
- 想让选区直接弹我们的卡，只能覆盖 quote 的 slot（官方目录标为 `shadows-shipped-ui`），或者在 quote 胶囊之外再叠一个浮层（两个浮层）。

所以「选区自动」不是审美问题，是路径约束。

## 二、设计原则

1. **选区是多义手势**：复制、搜索、引用、翻译、批注、提问都用同一个动作。自动弹带输入框的大卡，等于替用户解释意图。
2. **用户发起的浮层远好于系统自动弹**：NN/g 明确说用户发起的 overlay「远没有系统自动弹窗那样刺眼和烦人」([NN/g](https://www.nngroup.com/articles/pop-up-adaptive-help/))。
3. **渐进披露**：先给少数重要选项，重的界面按需展开，而且「怎么从第一层走到第二层」必须明显 ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/))。选区 → 小菜单 → 卡片，正好三层。
4. **就近原则**：操作贴着选区，符合费茨法则 ([Ant Design](https://5x-ant-design.antgroup.com/docs/spec/lightweight-cn))。
5. **右键菜单**是标准的显式入口，但默认隐藏、可发现性差 ([Apple HIG](https://developer.apple.com/design/human-interface-guidelines/context-menus))；有更顺的左键菜单时不必用右键。

## 三、同类产品

- **Medium**：选中出小工具条（高亮/评论/分享），不弹大面板 ([StackOverflow](https://stackoverflow.com/questions/23952220/how-can-i-recreate-the-medium-highlight-function))。
- **Google Docs**：选中出评论图标；右键/工具栏/快捷键是替代入口 ([Google 帮助社区](https://support.google.com/docs/thread/206151161/comment-bar-missing))。
- **dsh-sidenote**：选区内自己的工具栏（引用 / 添加到对话 / 侧边提问），并通过包装 quote slot **隐藏原生引用**，避免两个浮层 ([源码 selection.tsx](https://github.com/g-yixuan/dsh-sidenote))。
- **assistant-ui**：把「文本选区工具条」和「消息操作条」分开，工具条只放轻动作 ([文档](https://deepwiki.com/assistant-ui/assistant-ui/5.5-action-bars-and-navigation))。

共同点：选区最多唤出一个**轻量菜单**，重面板靠用户再点一次。

## 四、实测：保留「引用」，旁边加「问这段」

没有替换 quote，也没有隐藏它；用 `ctx.slots.entries()` 找到 key 为 `quote` 的 slot 条目，包装它的组件：

```text
原生引用按钮 + [问这段]  → 点「问」→ 卡片展开、自动聚焦
```

实测结果（真实会话，`dsh-clipchat-menu-smoke`）：

- 选中 assistant 正文后，浮层显示「引用文本」+「问这段」两个按钮，位置由宿主负责。
- 点「问这段」后卡片在同一浮层内展开，输入框自动聚焦，选段预览保留。
- 原有「引用文本」按钮功能不变。
- 关闭后再次选中，仍正常出现。

证据：[菜单截图](selection-menu.jpg) · [展开后卡片](selection-menu-card.jpg)。

实现要点：

- 不注册自己的 interaction；借用 quote 的 admission 和宿主 surface 的定位/关闭/聚焦。
- 用 `slots.entries` + `slots.subscribe` 包装 key 为 `quote` 的组件，并在 cleanup 里还原。
- 菜单里的「问」按钮 `mousedown` 要 `preventDefault`，保住选区；点开卡片后聚焦输入框会清掉浏览器选区，但宿主保存的克隆 Range 仍有效，卡片不会塌（09 已验证）。
- 只对 assistant 正文显示「问」：从选区起点向上找 `[data-chat-node-key]`，key 形如 `14:assistant-step11:3`；user 气泡则不显示「问」。

## 五、方案对比

| 方案 | 意图明确 | 打断 | 可发现性 | 与 quote 共存 | 实现成本 | 结论 |
|---|---|---|---|---|---|---|
| A. 选区即弹全卡 | 低 | 高 | 最高 | 冲突 | 低 | 不做 |
| B. 选区小菜单（引用 + 问） | 中高 | 低 | 高 | **保留引用，加一个按钮** | 低（包装 quote slot） | **推荐，已验证** |
| C. 右键选段弹卡 | 高 | 中 | 中低 | 完全共存 | 低 | 备选；有了 B 就不必 |
| D. 快捷键弹卡 | 高 | 低 | 低 | 共存 | 中高（自建 overlay） | M1.1 可选 |
| E. 修饰键拖选 | 中 | 低 | 很低 | 共存 | 中 | 不做 |

## 六、推荐交互

1. **左键拖选** assistant 正文 → 浮层出现「引用文本」「问这段」；选 user 消息时不显示「问这段」。
2. **点「问这段」** → 卡片在同一浮层展开，输入框自动聚焦；选段预览保留。
3. 卡片里保留：提问/连续追问、模型选择、token、高亮这段、留痕、带回主线；关闭仍是空白/Esc/×。
4. **不做右键**，不做选区直接弹卡。
5. 快捷键（⌘⇧K）留到 M1.1，作为熟练用户加速器。
6. 菜单文案走我们自己的 locale 命名空间；「引用文本」仍由原生组件负责。

## 七、风险与降级

- 依赖 `slots.entries` / `entry.component` 这个**未文档化的 slot 内部结构**；sidenote 在 0.2.2 也这么做，属于生态内既有做法，但上游一改就可能失效。降级顺序：包装失效 → 改为注册同名 key `quote` 接管（更重）→ 自建 overlay（最重）。
- 菜单只在 quote 会出现的会话里出现（主会话、可写）；子会话/已移除会话没有。M1 接受。
- 与 sidenote 同时安装时，sidenote 可能隐藏 quote；我们的菜单也随之隐藏。需要在兼容性说明里写清。
- 菜单里是否再加「高亮」：建议 M1 只放「引用 + 问」，高亮放卡片内，保持菜单轻。

## 八、对 spec 的影响

- 第 2 节：不注册 selection interaction；改为包装 `quote` slot，菜单状态在组件内维护。
- 第 8 节：卡片由菜单「问这段」展开；自动聚焦保留；关闭不变。
- 验收第 1 条：改为「选中 → 引用+问菜单；点问 → 卡片+聚焦」。
- 03 原型：由「划词只弹卡片」改为「划词弹小菜单，点问再弹卡」。
- 07 的测试缝不变：host `apply` + 纯模块；client 增加一个「slot 包装与还原」的注册测试。

## 九、待确认

- 菜单是「引用 + 问」两项，还是再加「高亮」。
- 快捷键是否 M1.1。
- 是否接受包装 slot 的内部依赖（备选：注册同名 key 接管）。
