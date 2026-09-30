---
# gstack: design-md-format=spec
name: OpenVibe · 灵典
description: 墨松账本 · 书斋版 —— 账本纪律的版面秩序，印章式的信任时刻，中文排印是一等公民
colors:
  primary: "#C3402B"          # 朱砂 · 朱批主色，只用于「使生效」的权威动作（注入/应用/覆盖确认）
  on-primary: "#FFFFFF"
  surface: "#FAF9F6"          # 温纸白画布；面板用 #FFFFFF
  text: "#26241F"             # 浓墨
  text-muted: "#6E695C"       # 淡墨
  accent: "#2F6F4F"           # 松绿 · 品牌常色 / 流程 / 链接
  success: "#2F6F4F"          # 与松绿同源（绿管流程与成功两职）
  warning: "#8F640F"
  error: "#B3372A"            # 与朱砂互斥：error 永不复用 seal token
typography:
  display:
    fontFamily: '"Source Sans 3", "PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", sans-serif'
    fontWeight: 700
    fontSize: clamp(1.375rem, 1.2rem + 1vw, 2rem)
    letterSpacing: 0.01em
  body:
    fontFamily: '"Source Sans 3", "PingFang SC", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", sans-serif'
    fontSize: 1rem
    lineHeight: 1.7
  label:
    fontFamily: '"Source Sans 3", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 0.75rem
    letterSpacing: 0.04em
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontFeature: tnum
rounded:
  sm: 4px
  md: 6px
  lg: 10px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "#A03020"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    borderColor: "#CBC5B4"
    rounded: "{rounded.md}"
  input:
    borderColor: "#DED9CB"
    backgroundColor: "#FFFFFF"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "#FFFFFF"
    borderColor: "#ECE8DD"
    rounded: "{rounded.lg}"
  nav-link:
    textColor: "{colors.text-muted}"
    activeTextColor: "#25593F"
    activeBackgroundColor: "#E9F1EC"
  seal-badge:
    textColor: "{colors.primary}"
    borderColor: "{colors.primary}"
    backgroundColor: "#F8ECE8"
    rounded: "{rounded.sm}"
---

# OpenVibe · 灵典 —「墨松账本 · 书斋版」

## Overview

**Creative North Star:** 中文开发者的 native 工作台 —— 版面纪律取账本（hairline 网格、表数字、墨色层级），信任时刻取印章（朱砂只在核验生效的一刻出现），中文排印是第一公民而非翻译腔。

**Product context:** OpenVibe（灵典）是本地优先的 vibe coding 标准化工作台：把提示词/术语/Skill/流程/标准包变成可注入六类 AI 编码工具的工程标准。中文优先，起步服务个人开发者，架构预留小团队。UI 形态是 127.0.0.1:8787 的本地工具型 React SPA（Tailwind 4 + Radix 原语），非营销站。

**Mode per surface:**
- 操作面（项目/标准包/设置/CLI 状态）：**Operate** —— 工业账本，紧凑密度，秩序优先
- 内容面（术语库/提示词库/TERMS.md 预览）：**Read** —— 书斋编辑排印，头词大、行距松、注音可开关

**Key characteristics（前五秒印象）:**
- 竖排书脊侧栏 + 衬线「灵·典」wordmark：五秒内不像翻译工具
- 温纸白 + 墨阶 + 松绿：安静、可信、有纸感
- 朱砂极稀有：出现即意义（验印通过 / 朱批按钮）
- 台账表格全表数字，列对齐即可信
- 词条卡有 ruby 注音头词：中文排印的工艺细节

## Colors

**Strategy:** Restrained + 一枚稀有语义色 —— 墨阶中性族承载秩序，松绿是常色（品牌/流程/链接/成功），朱砂是权色（只在验印与朱批出现）。颜色稀有才有意义。

**Light or dark:** 亮色「温纸白」为设计默认（账本/纸面语义）。暗色「夜账本」作为完整对偶 token 组维护（墨底 #1C1B17 系，朱砂提亮为 #D9583F 保对比），亮暗同构、只换光照不换层级——开发者在暗环境编码是真实使用场景，两套都必须成立。

Token 语义约定：
- `primary`（朱砂 #C3402B）= 使生效的权威动作：注入、应用、覆盖确认、验印徽标。**永不**用于链接、danger、普通主按钮。
- `accent`（松绿 #2F6F4F）= 品牌常色、激活态侧栏、流程与成功。现状 README/侧栏的绿资产平移，不推翻用户肌肉记忆。
- `error`（#B3372A）与朱砂**互斥**：两套 token，两套形制（error 用 alert 形制；朱砂用印章/实心按钮形制）。破坏性操作 = 灰底红字 outline + 二次确认，永远不穿朱砂。
- 朱砂 on 温纸白对比度 ≈ 4.9:1（AA 正文达标）；暗色用提亮档 #D9583F。
- 状态色沿用 oklch 状态族（danger/warn/success/info 各带 soft 容器与 solid 两形态），与主三色不混用。

## Typography

- **Latin + 数字：Source Sans 3**（Google Fonts，OFL —— 可再分发、可子集化，允许打进 CLI tarball）。选它的产品理由：与思源黑体同出 Adobe 体系，Latin/数字与中文系统字体的度量天然协调；tnum 表数字支撑「台账靠列对齐建立可信」。
- **中文：系统原生栈**（PingFang SC / HarmonyOS Sans SC / MiSans / Microsoft YaHei）。native 的正解不是伪造 CJK webfont（大、慢、过不了 bundle 闸门），而是把 Latin/数字给一张脸、中文交给各平台最好的系统渲染器。中文头词用系统字重映射到 Semibold/Bold。
- **代码/指纹/路径：JetBrains Mono**（OFL），`font-feature: tnum`。
- **Wordmark：「灵典」二字的衬线（思源宋体 / Noto Serif SC）**——生产环境只嵌这两字的可变子集（约 5KB）。衬线只给品牌与「验」印章字，不给正文标题。
- 加载策略：woff2 自托管随包分发（字体为 asset，不进 chunk 预算；诚实代价 ~60–90KB）；`font-display: swap`，系统栈兜底离线可用。
- 字号阶梯：正文 15px/1.7（中文行高必须 ≥1.7）；界面标签 12px/字距 0.04em（字距仅用于拉丁）；词条头词 19px semibold；区块题 20px；词注音 rt 10px 字距 0.08em。
- Overused-list 例外声明：无。未使用任何禁用面或过度使用面。

## Layout

- **书脊侧栏**（招牌结构）：竖排 `writing-mode: vertical-rl` 的「灵·典」衬线字标 + 单字汉字导航（库/词/技/流/项/包/设 + 小字标签），激活项松绿洗底 + 左侧朱砂书签点。宽 76px。移动端（<960px）退化为横向顶栏，字标转横排。
- 内容区 grid-disciplined：术语库/库类页面用「主列 + 预览列」双栏（1.25fr / 1fr，<960px 纵向堆叠）；台账表格占满全宽。
- 密度：操作面紧凑（间距 8/12/16），内容面松弛（16/24/32）。
- 有意的破格只在内容面：词条卡头词列固定 148px 与定义列形成不对称双栏；模拟屏的印章可带 -1.5°~ -2° 微旋，正文 UI 不旋转。
- 断点：960px 为主要折叠点；320px 起可用。

## Elevation & Depth

深度靠**线**不靠影：面板层级用 hairline（#ECE8DD）/ line（#DED9CB）/ line-strong（#CBC5B4）三档描边表达。投影只给真正浮起的东西（Popover/Dialog/Toaster）：offset 2px + 柔和 blur（0 4px 16px rgba(38,36,31,.08)）。禁止零偏移彩色光晕、禁止玻璃拟态默认化、禁止卡片套卡片。

## Shapes

圆角分级：sm 4px（输入/印章徽标/代码块）、md 6px（按钮/小容器）、lg 10px（面板/卡片/模拟屏）、full（筛选 chip）。刻意的**不均匀**是特征：章形元素（验印徽标）用近似方的 sm 圆角+实线描边，与周围的 lg 面板形成「印盖在纸上」的对比。嵌套内圆角 = 外圆角 − 间隙。

## Components

- **button-primary（朱批）**：朱砂实心。hover #A03020；focus-visible 2px 松绿 outline + 1px offset；disabled 40% 透明度。文案动词必须是「使生效」类（注入/应用/确认）。
- **button-secondary**：纸面透明底 + line-strong 描边；hover 描边加深。
- **button-ghost**：松绿文字，hover 下划线（offset 3px）。
- **button-danger（隔离形制）**：透明底红字灰描边，点击后必须二次确认；**禁止**继承朱砂样式。
- **seal-badge（验印章）**：朱文印形制——sm 圆角 + 1.5px 朱砂描边 + 洗底 + 「验」方章字块 + 微旋。出现时机仅三处：lock 指纹校验通过、diff 一致、装包验证。永远配文字，不裸奔。
- **input**：panel 白底 + line 描边 + sm 圆角；focus-visible 松绿 2px outline；mono 变体用于指纹/路径。
- **ledger-table（台账表）**：表头 11px/字距 0.06em 淡墨 + line-strong 底线；行 hairline 分隔；数字列 tnum 右对齐；状态列用 6px 方点 + 文字（一致=松绿/漂移=琥珀/新增=蓝）。
- **term-card（词条卡）**：ruby 注音头词（头词 19px semibold，rt 10px）+ 英文副行 + 定义列（13.5px/1.65）+ 来源反链行（松绿链接）。ruby 注音可在设置关闭（关闭后回退为副行拼音）。
- **alert 四态**：wash 底 + 同色系细描边 + 加粗标题行；与朱砂形制无关。
- **冲突三选一（segmented）**：描边分段控件，选中段朱砂实心——这是朱批语义的第三个落点（处置决策 = 批）。默认选中项为「保留本地」（安全默认，产品行为以 dev-plan 裁定为准）。
- 每个组件必须同批设计空 / 加载 / 错误 / 超长内容四态。

## Do's and Don'ts

- Do：数字一律 tnum 等宽；装饰只用账本线（hairline 分隔、行线、区块细规）；朱砂只出现在验印/朱批/处置三处且永远配文字；中文头词用系统重字重；四态与主态同批交付。
- Don't：禁止图标圆圈 + 三栏特性卡 + 居中一切的 SaaS 套路；禁止渐变按钮、玻璃拟态、光晕边缘、装饰圆斑与波浪分隔；禁止卡片套卡片；禁止朱砂复用为 danger/链接色；禁止为中文引入 webfont 或用 system-ui 当展示字体；禁止 emoji 做设计元素。

## Motion

- **Approach:** minimal-functional —— 过渡只为解释状态变化，全站 ≤150ms；无弹跳、无过冲。
- **Easing:** enter ease-out / exit ease-in / move ease-in-out
- **Duration:** micro 50–100ms（hover/焦点）/ short 150–250ms（面板/抽屉）/ medium 250–400ms（Dialog）/ long 400–700ms（仅骨架屏渐隐）
- **The one authored moment:** **验印落章** —— 指纹校验通过的一刻，印章 200ms ease-out 从 1.08 落定到 1.0 并完成淡入（无回弹），像一次真实的盖章。全站唯一表演位。

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-29 | 设计系统「墨松账本 · 书斋版」立项（/design-consultation） | 记忆点裁定为「中文开发者的 native 工作台」；产品灵魂（lock/指纹/diff）映射为「账本 + 验印」母题 |
| 2026-09-29 | 拒绝 Fontshare 字体（Satoshi/General Sans），选 Source Sans 3 + JetBrains Mono | ITF Free Font License 禁止再分发字体文件，无法随 CLI tarball 打包；OFL 字体可再分发可子集化（license 实查于 fontshare.com） |
| 2026-09-29 | 中文走系统原生栈，不引 CJK webfont | native 感来自排印质量而非字体堆料；CJK webfont 数 MB 且会撞 bundle:check 闸门（入口 ≤300kB / chunk ≤500kB） |
| 2026-09-29 | 风险升级：书脊侧栏 / 注音头词 / 朱批主色（收窄为「使生效」动作） | owner 在 D6 明确选择「换更冒险的风险项」；D7 未答，按推荐项全收并内置朱批缓和（不含所有主按钮） |
| 2026-09-29 | 冲突处置默认「保留本地」出现在模拟屏与组件规范 | 设计建议，与「手改不被无声覆盖」的承诺对齐；产品默认值变更属行为裁定，归 dev-plan 队列，非本文档单方面生效 |
