---
# gstack: design-md-format=spec
name: OpenVibe · 灵典
description: 暖纸 · 可读性工作台（V2）—— 一张暖纸底 + 一枚强调色 + 四阶墨色，每个文字档在它能落到的每种底上都过 AA；信任靠读得清与列对齐，不靠印章
colors:
  accent: "#A8501C"           # 赭石 · 全站唯一强调色：主按钮 / 激活导航 / 链接 / 选中态 / 强调 chip
  accent-deep: "#7C3811"      # 赭石深 · 主按钮 hover、soft 容器上的文字
  accent-soft: "#F7E8D7"      # 强调洗底 · 激活项/选中 chip 的容器
  accent-line: "#E4C9AB"      # 强调描边 · 只在 accent-soft 容器上使用
  on-accent: "#FFFAF3"        # 强调实心上的文字（不是纯白）
  canvas: "#FAF5EC"           # 暖纸 · 应用画布
  panel: "#FFFDF9"            # 纸面 · 卡片/输入/浮层
  panel-2: "#F8F1E6"          # 悬浮/斑马/次级容器（fill 的替代）
  panel-sunk: "#F1E7D8"       # 下沉容器 · 代码块/pre（fill-soft 的替代）
  line-hair: "#EFE5D5"        # 行分隔（表格行、卡头下沿）
  line: "#E3D6C1"             # 常规描边
  line-strong: "#CDBCA2"      # 强描边 · 输入框、按钮、区块边界
  ink: "#2A2018"              # 浓墨 · 标题/强调（不是纯黑）
  ink-body: "#4A3B2D"         # 正文
  ink-muted: "#6A5846"        # 次要说明（可承载长文本）
  ink-faint: "#75634C"        # 元信息/标签，不承载长文本；对四种纸底最低 4.71:1
  scrim: "#2A2018"            # 遮罩与阴影的颜色通道源（调用点带 alpha，如 bg-scrim/40）
  ok: "#3D6B37"               # 松绿降为纯状态色（成功/一致/通过）
  ok-soft: "#ECF2E3"
  ok-line: "#C6DCBB"
  warn: "#92610E"             # 琥珀 · 漂移/需注意
  warn-soft: "#F9EFD7"
  warn-line: "#E6CF9D"
  danger: "#AB3527"           # 砖红 · 错误/破坏（V1 的朱砂语义已撤销）
  danger-soft: "#FBE7E2"
  danger-line: "#EEC2B8"
  info: "#2B5A74"             # 青蓝 · 中性提示/反链
  info-soft: "#E4EDF2"
  info-line: "#BDD3DF"
typography:
  display:
    fontFamily: '"Outfit", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", sans-serif'
    fontWeight: 600
    fontSize: 30px
    lineHeight: 1.25
    letterSpacing: -0.02em
  body:
    fontFamily: '"Outfit", "PingFang SC", "Hiragino Sans GB", "HarmonyOS Sans SC", "MiSans", "Microsoft YaHei", sans-serif'
    fontSize: 15px
    lineHeight: 1.72
    minWeight: 400
  label:
    fontFamily: '"Outfit", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 12.5px
    letterSpacing: 0
  mono:
    fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: 12.5px
    lineHeight: 1.7
    fontFeature: tnum
  scale:
    h1: 30px
    h2: 21px
    h3: 16px
    body: 15px
    sm: 13.5px
    xs: 12.5px
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
shadows:
  1: "0 1px 2px color-mix(in srgb, var(--color-scrim) 5%, transparent), 0 1px 1px color-mix(in srgb, var(--color-scrim) 4%, transparent)"
  2: "0 4px 16px -4px color-mix(in srgb, var(--color-scrim) 12%, transparent), 0 2px 4px color-mix(in srgb, var(--color-scrim) 5%, transparent)"
  3: "0 24px 48px -16px color-mix(in srgb, var(--color-scrim) 26%, transparent), 0 8px 16px -8px color-mix(in srgb, var(--color-scrim) 12%, transparent)"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-body}"
    borderColor: "{colors.line-strong}"
    rounded: "{rounded.sm}"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    borderColor: "{colors.danger-line}"
    rounded: "{rounded.sm}"
  input:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line-strong}"
    focusBorderColor: "{colors.accent}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.panel}"
    borderColor: "{colors.line}"
    rounded: "{rounded.md}"
  nav-link:
    textColor: "{colors.ink-muted}"
    activeTextColor: "{colors.accent-deep}"
    activeBackgroundColor: "{colors.accent-soft}"
  chip:
    textColor: "{colors.ink-muted}"
    backgroundColor: "{colors.panel-sunk}"
    borderColor: "{colors.line}"
    rounded: "{rounded.full}"
  tag:
    textColor: "{colors.ink-muted}"
    backgroundColor: "{colors.panel-2}"
    borderColor: "{colors.line-hair}"
    rounded: "{rounded.sm}"
  table-header:
    textColor: "{colors.ink-faint}"
    borderColor: "{colors.line}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.full}"
motion:
  duration: 160ms
  easing: "cubic-bezier(.2,.7,.3,1)"
  reducedMotion: "全部关闭"
---

# OpenVibe · 灵典 —「暖纸 · 可读性工作台（V2）」

## Overview

**Creative North Star:** 一台**读得清**的中文工作台 —— 暖纸底 + 暖墨四阶 + 单枚强调色，把「每一处文字都过 AA」当成可信性的来源；台账靠列对齐、产物靠指纹可见，而不是靠视觉音量。

**Product context:** OpenVibe（灵典）是本地优先的 vibe coding 标准化工作台：把提示词/术语/Skill/流程/标准包变成可注入六类 AI 编码工具的工程标准。中文优先，起步服务个人开发者，架构预留小团队。UI 形态是 127.0.0.1:8787 的本地工具型 React SPA（Tailwind 4 + Radix 原语，无组件库锁定），非营销站。

**Mode per surface:**
- 操作面（工作台/项目/标准包/设置/Skill）：**Operate** —— 台账密度，卡片 + 表格 + chip，秩序优先
- 内容面（术语库/提示词正文/TERMS.md 与包预览）：**Read** —— 15px/1.72 正文、68ch 行长闸门、`pre.code` 折行不裁切

**Key characteristics（前五秒印象）:**
- 暖纸白画布 + 暖墨字，**没有一处纯黑、没有一处冷灰**
- 顶栏 58px（品牌 tile + 版本 + 主题）+ 侧栏 216px（四组八项带计数），像工具不像官网
- 赭石只在四处：主按钮、激活导航、链接、选中态——其余全是墨阶与纸面
- 台账表格全表数字（tabular-nums），列对齐即信任
- 每个状态都是「图标 + 文字 + 颜色」三通道，从不只靠颜色

**与 V1 的关系：** V2 是对 2026-09-29 定稿的「墨松账本 · 书斋版」的**全盘替换**（owner 于 2026-10-01 裁定），不是叠加。被撤销的四个 V1 招牌结构（书脊竖排侧栏 / 朱砂朱批 / 验印章与落章动效 / ruby 注音头词）逐条登记在「Migration & Retirements」，历史决策行保留在 Decisions Log 不删。

## Colors

**Strategy:** 单强调色 + 四阶暖墨 + 五面纸色。V1 的策略是「稀有即有意义」（一枚权色朱砂只在验印出现）；V2 换成「**清晰即信任**」——强调色承担全部"重要"职责（accent 一处、其余全靠墨阶分层次），于是墨阶本身必须读得清。

**Light or dark:** 亮「暖纸」为默认，暗「暖夜」为同构对偶——**29 个颜色 token 两套各一份**，只换光照不换层级。暗态不反相、不转冷，保持暖相：赭石提为暖金 `#E9A63F`（赭石原值 `#A8501C` 落在暖夜画布 `#16120F` 上只有 **3.40:1**，够大字阈却不够正文 AA），文字墨阶整体转亮。

**Token 语义约定：**
- `accent`（赭石 #A8501C）= 唯一强调通道：主按钮实心、侧栏激活项、链接、`aria-pressed` 选中段、强调 chip。**不再**有第二种权威色。
- `on-accent`（#FFFAF3）而非纯白：暖底上的实心按钮字色也要带纸温。
- `danger`（砖红 #AB3527）接管 V1 朱砂的"红"位，但**只表示错误与破坏**——V1 那条「红 = 批准」的语义已撤销，破坏性动作一律 `.btn.danger` + 二次确认。
- `ok`（松绿 #3D6B37）= 纯状态色（一致 / 通过 / 成功）。V1 的品牌绿退场后不再承担链接与激活。
- `panel-2` = 悬浮/斑马/次级容器，`panel-sunk` = 下沉容器（代码块、pre），两者取代 V1 的 `fill-soft` / `fill`。
- `scrim` 是**遮罩与阴影的共同颜色通道**：调用点带 alpha（`bg-scrim/40`），阴影走 `color-mix(… var(--color-scrim) N% …)`，因此暗块只需覆盖 `--color-*` 一条不变量。

**可读性保证（可复算，WCAG 2.1 相对亮度 / sRGB / 正文阈 4.5、大字阈 3.0）：**

| 主题 | 文字 token | 最低配对 | 实测 |
|------|-----------|----------|------|
| 暖纸 | ink | on panel | **15.68** |
| 暖纸 | ink-body | on panel-2 | **9.58** |
| 暖纸 | ink-muted | on panel-2 | **6.04** |
| 暖纸 | ink-faint | on panel-sunk | **4.71** |
| 暖纸 | accent / accent-deep | on canvas / accent-soft | **4.89 / 7.19** |
| 暖纸 | ok · warn · danger · info | on 各自 -soft | **5.47 · 4.66 · 5.39 · 6.28** |
| 暖夜 | ink | on canvas | **16.22** |
| 暖夜 | ink-body | on panel-2 | **11.02** |
| 暖夜 | ink-muted | on accent-soft | **5.94** |
| 暖夜 | ink-faint | on panel-2 | **4.85** |
| 暖夜 | on-accent | on accent / accent-deep | **8.60 / 10.17** |
| 暖夜 | ok · warn · danger · info | on 各自 -soft | **6.84 · 7.52 · 5.74 · 6.74** |

复算命令与登记口径见 `docs/specs/theme.md` §7.4（同一条 node 表达式，双主题全配对）。

**唯一使用约束（写成矩阵而不是靠自觉）：** `ink-faint` 只允许落在 `canvas / panel / panel-2 / panel-sunk` 四种纸底上；五类 `-soft` 容器（accent/ok/warn/danger/info-soft）里的文字一律用 `ink` / `ink-body` / `ink-muted` 或该状态的 solid 文字色。原因只有一个：**暖夜的 `ink-faint` 落在 accent-soft / ok-soft 上是 4.29 / 4.41**，其余配对全部 ≥4.5。设置页「可读性自检」区按这张配对表实时算，出现 <4.5 即红牌。

## Typography

- **Latin + 数字：Outfit**（Google Fonts，SIL OFL —— 实测字体内嵌 license URL `https://scripts.sil.org/OFL`，可再分发、可子集化，允许打进 CLI tarball）。可变轴 `wght 100–900`，latin 子集 32,228 B。**tnum 实测存在于 GSUB**（`ccmp, frac, liga, pnum, rvrn, tnum`），所以「全表数字」这条能落地。
- **中文：系统原生栈**（PingFang SC / Hiragino Sans GB / HarmonyOS Sans SC / MiSans / Microsoft YaHei）。native 的正解不是伪造 CJK webfont（数 MB，撞 bundle 闸门），而是 Latin/数字给一张脸、中文交给各平台最好的系统渲染器。
- **代码/指纹/路径：JetBrains Mono**（OFL，可变 400–800），`.mono` 类同时给 `font-variant-numeric: tabular-nums`。
- **衬线退场**：V1 用思源宋体 900 两切片只服务「灵典」字标与「验」印字；V2 无衬线字标、无印章，故 **`--font-serif` 与两支 woff2（79,156 B）一并撤下**。品牌位改由 accent tile + `on-accent` 字承担。
- 加载策略：woff2 自托管随包分发（asset 通道，不进 chunk 预算），`font-display: swap`，系统栈兜底离线可用。V2 字体资产 = **2 支 / 63,568 B**（V1 为 4 支 / 139,288 B）。
- 字号阶梯：H1 30/600/1.25、H2 21/600/1.35、H3 16/600/1.4、正文 15/400/**1.72**、次要 13.5/400/1.6、元信息 12.5/400/1.5、mono 12.5/400/1.7。**正文最小字重 400**（细体在暖底上发虚）。
- 字距：负字距只给大字标题（≤ −0.01em，30px 上约 −0.3px，中文可读性无损）；**正文与标签不为中文加字距**，`label` 的 `letter-spacing` 归 0（V1 的 0.04em 是给拉丁标签的，V2 标签多为中文，取消）。
- Overused-list 例外声明：无。未使用 Inter / Roboto / system-ui 当展示字体。

## Layout

- **顶栏 58px（sticky，panel 底 + line 下沿）**：左品牌 tile（30×30，`accent → accent-deep` 同色相双色 + `on-accent` 字）+ 「OpenVibe 灵典」与副标题；右侧版本 chip、主题切换（暖纸↔暖夜，**全站唯一入口**）。
- **侧栏 216px（sticky，canvas 底 + line 右沿）**，四组八项：
  ```
  概览   工作台
  资产   提示词库 · 术语库 · Skill · 流程模板     ← 每项带 API total 计数
  工程   项目 · 标准包
  系统   设置
  页脚   ~/.openvibe/ · 127.0.0.1:8787
  ```
  激活项 `bg-accent-soft text-accent-deep` + 左侧 2px accent 指示条；计数用 `tabular-nums` 右对齐。
- **「工作台」是同名异物的高危位**：侧栏这一项指 V2 新增的 `/` 全局首页（lazy chunk），与**已入库**的项目级「项目工作台」不是同一个东西——后者是 `apps/web/src/components/projects/ProjectDashboard.tsx`（`/projects/:id` 内的健康摘要 + 注入状态只读桥接），文案在 `apps/web/src/i18n/zh.ts` 的 `projects: '项目工作台'` 与 `open: '打开工作台'`。代码轮**不得合并两者**：侧栏项走 `/`，项目内概览保留现名现路由。
- **内容区**：`main` 内边距 26px 30px（<md 收成 16px）；每屏 `.vh` 标题区 + 卡片网格。列表 + 预览用 `g-side`（`minmax(0,1fr) 340px`），统计条 `g4`，卡片 `g2/g3`。
- **断点：沿用 Tailwind v4 默认档，就近取原型三档**（`lg 1024`≈1080、`md 768`≈900、`sm 640`≈560），不新增 `--breakpoint-*`：仓内已有 38 处 `max-md:`/`md:` 变体，重写只为 5–8% 的像素差不值得。折叠语义照搬：`lg` 以下 `g-side` 转单列、`g4` 转两列；`md` 以下侧栏转横向滚动条、隐藏计数与页脚；`sm` 以下全单列、H1 30→25px。**断点内一律继续用 `minmax(0,1fr)`**，否则长指纹会撑破栅格。
- 密度：操作面 8/12/16，内容面 16/24/32；栅格 gap 14→16 归到 4 的网格上。
- 无竖排、无旋转、无固定 148px 头词列——V1 的「有意破格」全部随换肤撤销；破格改由**留白节奏**承担（`.vh` 与卡片之间 22→24）。

## Elevation & Depth

层级靠**线 + 极轻的暖影**双通道：
- 线：`line-hair`（行分隔）/ `line`（卡片描边）/ `line-strong`（输入、按钮、区块边界）。
- 影：三级 token（`shadow-1/2/3`），全部**只做扩散、不做硬边**，颜色通道取自 `scrim` 的 `color-mix`（1px offset、低 alpha），因此暗态自动加深而不需要第二套阴影声明。
- `shadow-1` 给卡片/按钮，`shadow-2` 给浮层（Popover/Toast），`shadow-3` 只给抽屉与遮罩上的浮层。
- 禁止：零偏移彩色光晕、玻璃拟态（无 `backdrop-blur` 默认化）、阴影叠阴影、卡片套卡片。

## Shapes

圆角三档 + 全圆：`sm 6px`（按钮/输入/tab/代码块/任务卡）、`md 10px`（卡片/面板/侧栏项容器/看板列）、`lg 14px`（抽屉与模拟屏外框，出现极少）、`full`（筛选 chip、toast）。嵌套内圆角 = 外圆角 − 间隙。与 V1 相比不再有「章形近方」这一处对比——印形元素已随朱砂退场。

## Components

- **button-primary（强调动作）**：`accent` 实心 + `on-accent` 字 + `shadow-1`；hover `accent-deep`；focus-visible 2px `accent` outline + 2px offset；disabled 40% 透明度。动词仍是「使生效」类（注入/应用/保存/确认）。
- **button-secondary**：`panel` 底 + `line-strong` 描边 + `ink-body` 字；hover `panel-2` + 描边加深。
- **button-ghost**：透明底 + `ink-muted` 字；hover `panel-2` + `ink`。
- **button-danger（破坏动作）**：`danger-soft` 底 + `danger-line` 描边 + `danger` 字；hover 转 `danger` 实心 + `panel` 字；**点击后必须二次确认并给出影响范围**。与 primary 永不同时出现在同一动作上。
- **chip（状态）**：`full` 圆角 + **11px** 行高 1.7；**六形制** ＝ 默认 / `accent` / `ok` / `warn` / `danger` / `info`。⚠️ **默认形制是中性形制**（`panel-sunk` 底 + `line` 描边 + `ink-muted` 字），**不是**「soft 底」三件套；其余五形制才是「soft 底 + 同色系 line + 同色系 solid 字」。**永远配图标 + 文字**（颜色不单独承载语义）。可按压的筛选 chip 用 `aria-pressed`，选中态转 `accent-soft` + `accent-deep`。
  - **M9 掌握度三态的落法**（`m9-dev-language-roadmap.md` §3.3，2026-10-21 登记）：「本项目未涉及」＝ **默认形制**（中性）／「本项目用到过」＝ `accent`／「掌握」＝ `ok`。⚠️ 三态文案取自 `@openvibe/shared` 的 `MASTERY_STATE_LABELS`（**口径只留一处**，界面不另写）；⚠️ **不得出现「你已掌握」**——这套推断只认得出「用过」。
- **tag（元信息标签）**：`sm` 圆角 + **11.5px** 行高 1.7 + `panel-2` 底 + `line-hair` 描边 + `ink-muted` 字；**纯文字、无状态语气**——装的是 `v5` / `pkg@ver` / 平台名 / 变量名这类**没有状态语义**的元信息。⚠️ **状态一律走 chip**（要图标），不要用 tag 承载状态；`.mono` 变体（`tagMonoCls`）用于指纹 / 路径 / 命令。**2026-10-21 登记**（M9-P3.7）——本形制早就在仓里用了 **36 处 / 15 个文件**，此前**从未登记**，本轮补上。
- **input / field**：`panel` 底 + `line-strong` 描边 + `sm` 圆角；focus 时描边转 `accent` + 3px `accent-soft` 光晕（这是全站唯一允许的"光晕"，且是同色相低透明）；前缀图标色 `ink-faint`；mono 变体用于指纹/路径/命令。
- **tabs（segmented）**：`panel-2` 槽 + `line` 描边 + `sm` 圆角；选中段 `panel` 底 + `shadow-1` + `ink` 字。**注入冲突处置**用它：选中段即"处置决定"，**段数由数据给**——`DRIFT` 三档（以包为准 / 保留本地 / 跳过）、`CONFLICT` 只两档（以包为准 / 跳过；本包从未拥有该文件，"保留本地"无从成立），不硬写三档（取数 `packages/core/src/inject/planner.ts` 的 `RULES`，细则见 `docs/specs/m6-standard-pack.md` FR-7.5）。默认选中项**待 owner 裁定**（队列 **㉕**，`docs/decisions.md`；现为「保留本地」，而 CLI 已发布行为是 `overwrite` ⇒ 界面预选与「CLI 默认」必须同屏并列，响应不改 `defaultDecision` 一个字）。
- **ledger-table（台账表）**：表头 11.5px `ink-faint` + `line` 底线；行 `line-hair` 分隔；数字列 `tabular-nums` 右对齐；状态列 = 图标 + 文字 + chip（一致 `ok` / 漂移 `warn` / 新增 `info` / 失败 `danger`）。
- **rows（行列表）**：11px 14px 内边距 + `line-hair` 分隔；hover `panel-2`；`aria-selected` 转 `accent-soft`。行内长文本 `-webkit-line-clamp` 到 1–2 行，不撑破列宽。
- **term-row / 词条**：**不再做 ruby 注音展示**；头词 16px/600 + 英文副行 `ink-muted` + 定义列 13.5px/1.65 + 来源反链行 `accent` 链接。`TermOut.pinyin` 字段保留（它承担 `en-alpha|pinyin|manual` 三种排序口径）。
- **stat（统计卡）**：键 12px `ink-faint` / 值 27px/600 `ink` tabular-nums / 注 12px `ink-muted`。
- **note（四态）**：`*-soft` 底 + `*-line` 描边 + `*` 加粗标题行 + `ink-body` 正文；与 chip 的区别是 note 承载成段说明。
- **empty-hint**：`line-strong` 虚线框 + `ink-faint` 一句话 + **一个下一步 CTA**（不是"暂无数据"）。
- **drawer（sheet）/ dialog（center）**：遮罩 `bg-scrim/40` + `shadow-3`；Radix 承载，Esc 与焦点圈闭沿用现有 `DialogPanel`。
- **toast**：`ink` 底 + `canvas` 字 + `full` 圆角 + `shadow-2`；文案即结果陈述。
- **skeleton / progress（V2 新建原子）**：骨架用 `panel-2` 底 + `line-hair` 内联块，只做渐隐（400–700ms）；进度条 6px 高、`line-hair` 槽 + `accent` 实心段。
- 每个组件必须同批交付空 / 加载 / 错误 / 超长内容四态。

## Readability Contract（V2 的验收线，十项）

1. 正文对比度 ≥ 7:1（AAA），不用纯黑 `#000`——纯黑在暖底上视觉过硬。
2. 次要文字 ≥ 4.5:1（AA）；弱化色（`ink-faint`）只承载元信息，不承载长文本，且不落 `-soft` 容器。
3. 正文行长 ≤ 68ch，超出即换行容器而不是拉宽文本块。
4. 正文 15px / 行高 1.72，字重不低于 400。
5. 中文优先字体栈（PingFang SC / Hiragino Sans GB / Microsoft YaHei），Latin 只有一张脸。
6. 数字与时间 `tabular-nums`，表格列不跳动。
7. 状态不只靠颜色——每个状态都配图标与文字。
8. 焦点环 2px 实心 + 2px offset，键盘全程可达（含看板左右键推进）。
9. 动效 160ms，`prefers-reduced-motion` 下全部关闭。
10. 暗主题不反相亮度、不转冷，保留同一暖相只调明度与饱和。

这十项是**量具**而非口号：设置页第 7 区「可读性与设计系统」在运行时用 CSS 变量真实算对比度并列出 AA/AAA 判定，任何 <4.5 的配对直接红牌。

## Do's and Don'ts

- Do：所有颜色只出自 `apps/web/src/index.css` 的 `@theme` 亮块 + 暗块，调用点只写语义 utility；四阶墨色按 rank 使用（标题 `ink` / 正文 `ink-body` / 说明 `ink-muted` / 元信息 `ink-faint`）；数字一律 tnum；状态三通道；四态与主态同批交付。
- Don't：禁止在调用点写字面色值或 Tailwind 色阶；禁止纯黑文字与冷灰描边；禁止第二个强调色（绿/蓝只做状态，不做品牌）；禁止把 `danger` 红当"批准/权威"用（V1 朱砂语义已废）；禁止渐变按钮、玻璃拟态、光晕边缘、装饰圆斑、波浪分隔、卡片套卡片；禁止图标圆圈 + 三栏特性卡 + 居中一切的 SaaS 套路；禁止为中文引入 webfont；禁止细体（<400）正文；禁止 emoji 做设计元素；禁止用颜色单独承载状态。
- 唯一渐变豁免：品牌 tile 的 `accent → accent-deep` 同色相双色。除此之外的渐变一律不合法。

## Motion

- **Approach:** minimal-functional —— 过渡只为解释状态变化，无弹跳、无过冲、无装饰动画。
- **Base:** `160ms` + `cubic-bezier(.2,.7,.3,1)`；进出对称（V1 的 enter/exit 分档取消，一档够用）。
- **Duration:** micro 160ms（hover/焦点/chip 按压）/ short 160ms（面板、抽屉滑入、遮罩淡入）/ medium 200ms（Dialog）/ long 400–700ms（仅骨架屏渐隐）。
- **The one authored moment：无。** V1 的唯一表演位「验印落章 200ms 落定」随朱砂一并撤销（且实测从未有组件挂载它）。V2 把"信任时刻"从动效改成**信息**：指纹可见、`created|idempotent` 状态、预览字节即产物。
- `prefers-reduced-motion: reduce` 下全站 transition/animation 关闭（V1 未支持，V2 是硬要求）。

## Migration & Retirements（V1 → V2 逐条改判）

**撤案的四个 V1 招牌**（均为 owner 2026-09-29 主动选择的风险项，2026-10-01 由同一 owner 裁定撤销）：

| V1 | V2 | 落点影响 |
|----|----|----------|
| 书脊竖排侧栏（76px，`writing-mode: vertical-rl`，单字导航） | 顶栏 58px + 侧栏 216px 四组八项 | `AppShell.tsx` 重写；`.v-rl` 退场；**顺带作废** `m4-playbook.md` FR-10.2「书脊单字冲突」与队列「书脊第 8 字待裁」 |
| 朱砂朱批（`seal` 四件套，"使生效"的权威红） | 赭石 `accent` 五件套（强调即赭石）；红只剩 `danger` | 朱砂色调用点 5 处全部改指 accent；`--color-seal*` / `on-seal` 删除 |
| 验印章 `.seal-badge` + 落章动效（含 −1.5° 微旋） | 「预览即产物」改为 `ok` chip（图标 + 文字） | `.seal-badge(.zi/.animate)`、`@keyframes seal-stamp-in` 退场；`PackPreviewPane` 换 chip |
| ruby 注音头词 + 思源宋体字标 | 无注音展示；无衬线字标 | `.term-ruby` 与 `--font-serif` 退场，两支宋体 woff2（79,156 B）删除；**`TermOut.pinyin` 字段保留**（排序口径） |

**token 改名表**（Phase A 的执行依据；调用点普查 `node docs/devlog-evidence/DEV-0080/census.mjs`（仓内驱动器，采样 sha `30e7fee`；原 `/tmp/openvibe-v2/census.js` 已丢失，仓内件复现同值））：

| V1 token（引用数） | V2 归属 | 说明 |
|--------------------|---------|------|
| `brand`(64) / `brand-soft`(25) | 按**角色**分流：链接 / 激活 / 强调 → `accent`(+`accent-soft`)；台账状态"一致" → `ok` | 一色分两职，逐调用点判读，不能全局替换 |
| `seal`(3) / `seal-deep`(1) / `on-seal`(1) / `seal-wash`(0) | `accent` / `accent-deep` / `on-accent` / `accent-soft` | `seal-wash` 已零引用（只被 `.seal-badge` 的 var 用到） |
| `fill-soft`(51) / `fill`(8) | `panel-2` / `panel-sunk` | 表面按"悬浮 vs 下沉"命名，不再按"填充" |
| `canvas` #FAF9F6 / `panel` #FFFFFF | #FAF5EC / #FFFDF9 | 面板不再纯白，画布转暖 |
| `danger-*` 六档 / `warn-*` 六档 / `success-*` 四档 / `info-*` 三档（oklch） | 每族三档 `solid / -soft / -line`（hex） | 状态族从 19 支收敛到 12 支；`success` 族改名 `ok` |

**墨阶七档收敛为四档**（按角色归并，`on panel` 实测前 → 后）：

| V1（引用数） | V2 | 对比度 |
|--------------|----|--------|
| `ink-strong`(4) | `ink` | 15.50 → **15.68** |
| `ink`(23) + `ink-body`(22) | `ink-body` | 10.98 / 9.41 → **10.57** |
| `ink-muted`(46) + **`ink-subtle`(124)** | `ink-muted` | 5.47 / **3.48** → **6.67** |
| **`ink-faint`(118)** + `ink-ghost`(4) | `ink-faint` | **2.19** / 1.51 → **5.67** |
| `fill-soft`(51) / `fill`(8) | `panel-2` / `panel-sunk` | 表面按"悬浮 vs 下沉"命名，不再按"填充" |
| `canvas` #FAF9F6 / `panel` #FFFFFF | #FAF5EC / #FFFDF9 | 面板不再纯白，画布转暖 |
| `danger-*` 六档 / `warn-*` 六档 / `success-*` 四档 / `info-*` 三档（oklch） | 每族三档 `solid / -soft / -line`（hex） | 状态族从 19 支收敛到 12 支；`success` 族改名 `ok` |

V2 颜色 token 共 **29 支**（V1 为 40 支），双主题各一份；原型自带的 `--canvas-2` 因零引用不带入（否则撞「声明必被引用」那道闸）。

**修复的缺陷（这是本轮的正当理由）**：V1 有两支承载文字却不过 AA 的 token——`ink-faint` 2.19:1、`ink-subtle` 3.48:1，在 `panel` 底上，实测调用点 **118 + 124 = 242 处**；另有暗色朱批按钮白字 3.88:1（`theme.md` §7.4-③ 的既有 finding）。V2 之后最弱配对是 4.71（暖纸 faint on sunk）/ 4.85（暖夜 faint on panel-2），且暗色按钮升到 8.60。

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-29 | 设计系统「墨松账本 · 书斋版」立项（/design-consultation） | 记忆点裁定为「中文开发者的 native 工作台」；产品灵魂（lock/指纹/diff）映射为「账本 + 验印」母题 |
| 2026-09-29 | 拒绝 Fontshare 字体（Satoshi/General Sans），选 Source Sans 3 + JetBrains Mono | ITF Free Font License 禁止再分发字体文件，无法随 CLI tarball 打包；OFL 字体可再分发可子集化（license 实查于 fontshare.com） |
| 2026-09-29 | 中文走系统原生栈，不引 CJK webfont | native 感来自排印质量而非字体堆料；CJK webfont 数 MB 且会撞 bundle:check 闸门（入口 ≤300kB / chunk ≤500kB） |
| 2026-09-29 | 风险升级：书脊侧栏 / 注音头词 / 朱批主色（收窄为「使生效」动作） | owner 在 D6 明确选择「换更冒险的风险项」；D7 未答，按推荐项全收并内置朱批缓和（不含所有主按钮） |
| 2026-09-29 | 冲突处置默认「保留本地」出现在模拟屏与组件规范 | 设计建议，与「手改不被无声覆盖」的承诺对齐；产品默认值变更属行为裁定，归 dev-plan 队列，非本文档单方面生效 |
| 2026-10-01 | **全盘换肤为「暖纸 V2」，撤销 V1 的松绿品牌 / 朱砂朱批 / 书脊侧栏 / ruby 注音 / 验印落章** | owner 明确要求以 `docs/prototypes/暖系-暖纸V2-可读性交互Demo-20260929.html` 为准重构前端 UI/UX；根因是 V1 有 242 处调用点承载文字却不过 AA（ink-faint 2.19、ink-subtle 3.48），V2 全配对 ≥4.5 |
| 2026-10-01 | Latin 由 Source Sans 3 改 Outfit；思源宋体随衬线字标一并退场 | 原型指定 Outfit；两道前置实查通过——license URL 内嵌 OFL、GSUB 含 `tnum`（fonttools 4.63 实测 latin 可变子集）；字体资产 139,288 B → 63,568 B |
| 2026-10-01 | 暗主题属性值仍叫 `dark`，不采用原型的 `night` | 改值要付两处代价：`localStorage` 里已存的 `'dark'` 会被判为未知值而无声回亮；治理闸第 2 道按 `\[data-theme='dark'\]` 字面匹配暗块。原型那只是 demo 的选择器名，非设计决策 |
| 2026-10-01 | `ink-faint` 由原型 #806E5A 改深为 **#75634C** | 原型在自己的 `panel-2` / `panel-sunk` 底上只有 4.36 / 4.00——换肤若原样照抄会新造 sub-AA；改值后四底最低 4.71，代价是 faint 与 muted 的间距收窄 |
| 2026-10-01 | 断点沿用 Tailwind 默认档，就近映射原型的 1080/900/560 → `lg/md/sm` | 仓内已有 38 处响应式变体，为 5–8% 的像素差新增 `--breakpoint-*` 并重写不划算；折叠语义逐条照搬 |
| 2026-10-01 | 阴影改为「scrim 的 color-mix」三级 token | 保住暗块「只允许 `--color-*`」这条不变量：阴影随主题自动换浓淡，暗块不需要 `--shadow-*` 覆盖 |
| 2026-10-21 | **`.tag` 形制登记进本文档**（M9-P3.7）；同批**按实现订正 chip 描述**：默认形制是中性的 `panel-sunk` 底（不是「soft 三件套」）、字号 **11px**（11.5px 是 `.tag` 的） | `.tag` 早就在仓里用了 **36 处 / 15 个文件**却**从未登记**，`m9-dev-language-roadmap.md` §3.5 把它点名为「本仓已有的待办缺口」；⚠️ **描述与实现分叉时，实现是已交付的事实** ⇒ 文档向 `apps/web/src/components/ui/styles.ts` 的 `CHIP_TONES` / `tagCls` 对齐，而不是反过来改 39 处调用点的观感 |
