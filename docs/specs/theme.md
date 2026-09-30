# SPEC · 主题与视觉基线（横切：亮暗双 token + 自托管字体 + 排印形制）

| 项 | 值 |
|------|------|
| 模块 | **横切能力**（不属于 PRD 3.2 的任何 M 号）——按 dev-plan §0.4 规则 5「横切能力用功能名」立文件，与 `onboarding.md`、`seed-content.md` 同类 |
| 优先级 | P2（PRD 第 8 章 P2 行「暗色主题（前置是设计 token 化重构）」；D19 由 P1.1 移入 P2；dev-plan §15.1-7） |
| 上游 | PRD 第 8 章 P2 行 + 附录 D D19、**`DESIGN.md`（设计系统规范源，gstack spec 格式，2026-09-29 /design-consultation 定稿）**、`CLAUDE.md`（把 DESIGN.md 立为视觉/UI 口径入口）、dev-plan §5.5 样式基线 |
| 下游设计 | design.md §2（Tailwind v4 + Radix 无组件库锁定）、dev-plan §5.1 路由表 / §5.2 组件清单 |
| 关联任务 | **无 tasks.md 任务行**（实测 `grep -c 暗色 docs/tasks.md` → 0）；实现随 commit `453a535` 入库，本 spec 是 §0.4 规则 4「No spec, no task」的**欠账补写**（实现先于规格，见 §7.1） |
| 版本 | v1.0（2026-09-30 定稿。**补写件**：亮暗主题、token 化、字体自托管、ruby 注音形制已于 2026-09-29/30 落地并入库（`git show 453a535 --stat`），但当时未建 spec，dev-plan §5.5 仍写「MVP 仅浅色」——本文件按**已入库实现 + DESIGN.md 口径**逐条核对写出，凡两者不一致处一律在 §7.5「未对齐」点名，**不替实现背书**；本行是本文件唯一版本行，后续修订按 §0.3 B 级追加 `→ v1.x` 段） |

---

## 1. 目标与用户价值

把「换一套肤色」从「重写一遍样式」降级成「改一个文件的两块 token」，同时让 OpenVibe 在视觉上像**中文开发者的 native 工作台**而不是翻译过来的 admin 壳：

- **暗环境是真场景**：开发者夜里编码要暗色，但暗色必须是**完整对偶 token 组**（同层级、同语义），不是给几个类名加 `dark:` 前缀——否则每个调用点都要维护两套，换肤成本随页面数线性增长。
- **稀有即有意义**：朱砂（`seal`）只出现在「使生效」的一刻（注入/应用/覆盖确认/验印），日常动作是松绿与墨阶。颜色一旦通胀，信任信号就失效——而 lock 指纹 / diff 一致 / 预览即产物这套产品灵魂**全靠视觉信号传达**。
- **中文是第一公民**：不为中文塞 CJK webfont（数 MB，撞 `bundle:check` 闸门），而是 Latin/数字给一张可再分发的脸 + 中文交给各平台最好的系统渲染器，排印质量（行高 ≥1.7、字距只给拉丁、表数字 tnum）补位。

> 本 spec **只拥有主题/token/字体/形制**这一层。词条卡的 ruby **数据语义**在 `m3-glossary.md` FR-5（`TermOut.pinyin` 派生字段），本文件只规定它长什么样（§4 FR-5.5），不复制字段契约——反漂移原则（dev-plan §0.3）。

## 2. 范围

| In（本 spec 拥有） | Out（明确不做 / 未做） |
|--------------------|------------------------|
| 亮「温纸白」+ 暗「夜账本」**双 token 源**（`apps/web/src/index.css` 的 `@theme` 块 + `[data-theme='dark']` 覆盖块） | 第三套主题、用户自定义配色、每模块独立肤色 |
| 主题切换 + **客户端 localStorage 持久化**（单键 `openvibe.theme`） | 服务端 `settings` 存主题（**刻意不做**：会动 `GET /settings` 响应形状 = §0.3 B 级契约面） |
| 首帧前预涂脚本（防暗色用户闪白） | 跟随系统 `prefers-color-scheme`（实测全仓零命中，含 `matchMedia` 亦零命中 → 见 §6.7） |
| 三套自托管字体（Source Sans 3 / JetBrains Mono / 思源宋体 900 切片 ×2，均 OFL）+ 中文系统原生栈 | CJK webfont、Fontshare 等禁止再分发的字体源（见 §8 许可纪律） |
| token 治理闸（`tests/design-tokens.test.ts`，四道 WEB-TOKENS 断言） | 像素级视觉回归基线（无 golden 截图对比，暗色正确性目前只有人工目验凭据 → §7.6） |
| 组件形制：朱批按钮 / 危险动作互斥形制 / 验印章 / 书脊侧栏 / 注音 rt | 动效库、`prefers-reduced-motion` 支持（实测零命中 → §6.8） |

## 3. 数据与核心概念

```
Theme  = "light" | "dark"                  // 二值，无 "system"
STORAGE_KEY = "openvibe.theme"             // 值只有 "dark" 被判定；其余（含读失败）一律 light
挂载点 = document.documentElement.dataset.theme  // 即 <html data-theme="dark">，全站唯一祖先
```

**token 分层**（单一出处 = `apps/web/src/index.css`）：

| 层 | 载体 | 规则 |
|----|------|------|
| 字族/圆角 | `@theme { --font-* / --radius-* }` | **不随主题变**；`--font-sans` 是「Latin 一张脸 + 中文系统栈」的栈序，暗块不许改 |
| 颜色（亮） | `@theme { --color-* }` | 唯一的**字面 hex / oklch 许可地**（亮块 + 暗块之外一处都不许，由闸钉住） |
| 颜色（暗） | `[data-theme='dark'] { --color-* }` | **只允许 `--color-*` 覆盖**，夹带任何其他声明 = 治理闸直接失败（闸内做了剥离复算） |

**DESIGN.md 语义名 ↔ 本仓 token 名**（DESIGN.md 用 Figma 式角色名，实现用 Tailwind v4 色utility 名，两套名字必须能对上，否则「按 DESIGN.md 走查」无法落地）：

| DESIGN.md | token（`--color-…`） | Tailwind 类 |
|-----------|---------------------|-------------|
| `primary`（朱砂，使生效） | `seal` / `seal-deep`（hover）/ `seal-wash`（洗底）/ `on-seal`（印上文字） | `bg-seal` `text-on-seal` … |
| `accent`（松绿，品牌常色） | `brand` / `brand-soft` | `text-brand` `bg-brand-soft` |
| `error`（与朱砂**互斥**） | `danger-50/200/600/700/800/900`（oklch 族） | `text-danger-700` |
| 中性墨阶 / 账本线 / 表面 | `ink-*`（ghost→strong 七档）/ `line-*`（三档）/ `canvas` `panel` `fill` `fill-soft` `scrim` | `text-ink-body` `border-line` … |
| 状态族 | `warn-*` `success-*` `info-*`（各带 soft 容器与 solid 两形态） | 同上 |

> **暗色生效机制（易被误判为"没生效"）**：Tailwind v4 把 `@theme` 编译进 `@layer theme`，而 `[data-theme='dark']` 块是**未入层**的普通 CSS——未层 CSS 在与分层 CSS 冲突时胜出，故暗块不需要比 `:root` 更高的特异性。凭据：DEV_LOG「SSRF 误报裁定 + 视觉目验 + ruby 注音头词落地」那条记录做过 PNG 采样，暗色画布实测 `rgb(28,27,23)` = `#1C1B17`。

## 4. 功能需求（FR）

### FR-1 主题切换与持久化
1. 唯一入口：书脊侧栏底部**单字按钮**，亮态显示「夜」、暗态显示「昼」（即"点它会变成什么"），`aria-label` 固定为「切换亮暗主题（温纸白 / 夜账本）」，`title` 显示当前态名。除该按钮外全站无第二个切换入口。
2. 持久化走客户端 `localStorage`，键 `openvibe.theme`；**不进服务端 settings**——`GET/POST /api/settings` 的形状是 P0 冻结面，主题不属之。
3. **首帧前预涂**：`index.html` 的内联脚本必须在挂载 React 之前读同一键并设 `data-theme`，使暗色用户刷新时不出现亮色闪烁。该脚本与 `useTheme.ts` 的键位是**两处硬编码**（见 §6.1）。
4. 主题态在页面刷新后保持；`localStorage` 不可用（无痕 / 配额）时**降级为仅本会话生效**，读与写两处各自 `try/catch` 静默，不得因存储失败抛错到 UI。
5. 不做系统跟随（§2 Out），因此**系统暗色用户首次启动得到的是亮色**，这是有意的一次点击成本而非缺陷；若要改判属新增 FR，走 §0.3 B 级。

### FR-2 token 单一出处与治理闸
1. 换肤**只改** `apps/web/src/index.css` 的亮块与暗块；调用点（`apps/web/src/**/*.{ts,tsx}`）不得出现 Tailwind 自带色阶——禁用清单以 `tests/design-tokens.test.ts` 的 `RAW_FAMILIES` / `RAW_PALETTE` 为单源（本文不抄色族个数，§13-9 同族纪律）。
2. 裸 hex/oklch 字面量只许住在两个 token 块内；其余 CSS 规则一律 `var(--color-…)`。
3. **引用必声明**：用到的每个语义色名都要在 `@theme` 里存在——Tailwind v4 对未知色名**静默不产出 CSS**，写错一处表现为"少个颜色"而不是报错。
4. **声明必被引用**：未被任何调用点引用的 token 会被 v4 tree-shake 掉，换肤时**静默失效**——闸的第 4 道专抓这一类。（实例：落地时删掉了失去引用的 `--color-on-brand` 与 `--color-danger-100`，而不是留着当"备用"。）
5. 暗色覆盖块内**只允许 `--color-*` 声明与注释**；加一条 `box-shadow` 或 `font-*` 进暗块即闸红。理由：暗块混入结构性规则 = 把"换肤"变成"改布局"，双主题同构从此不可保证。
6. 新增色族（如再加一组状态色）必须**同时扩闸**（`SEMANTIC_CLASS` 的色族清单），不得绕闸——落地时原 3 支断言先红，修法是扩闸。
7. 治理闸跑在 **unit** project（根 `vitest.config.ts` 的 `include: ['packages/*/src/**/*.test.ts', 'tests/**/*.test.ts']`），命令 `pnpm test`（可单跑 `pnpm vitest run --project unit tests/design-tokens.test.ts`）。

### FR-3 双主题同构（"只换光照，不换层级"）
1. 亮暗**同名同档**：`ink-*` 七档、`line-*` 三档、`canvas/panel/fill/fill-soft`、`brand`、`seal` 四件套在暗块全部有对应值，不许暗块漏一档而靠亮值穿透（漏档 = 暗色下某处仍是纸白）。
2. 状态族换法固定：`*-50/100/200/300`（soft 容器/洗底）**转深**，`*-600/700/800/900`（文字/描边）**转亮**；亮色侧是 oklch，暗色侧是手调 hex——这一处不对称是刻意的（暗底上 oklch 中段亮度会刺眼），改任一侧都要在 §7.4 复算里重新判对比度。
3. `--color-scrim` **两主题共用 `#000000`**（暗块不覆盖）：它只作 Dialog 遮罩 `bg-scrim/30`，黑色遮罩在两套底色下都成立，不需要对偶值。闸的「声明必被引用」会保住它不被 tree-shake。
4. 布局、圆角、字族、字号阶梯**不因主题变**；主题差异只允许出现在颜色通道。
5. `data-theme` 只挂在 `<html>`，全站不出现局部子树换肤（无 per-component 主题作用域）。

### FR-4 字体与排印
1. 三套自托管 + 一个系统栈，`--font-sans/serif/mono` 三个出口：Latin 与数字 = Source Sans 3（可变 200–900）；代码/指纹/路径 = JetBrains Mono（可变 400–800，`font-variant-numeric: tabular-nums`）；wordmark 与「验」印字 = 思源宋体 900；中文正文 = 系统原生栈（PingFang SC / HarmonyOS Sans SC / MiSans / Microsoft YaHei）。
2. 全部 `font-display: swap`，离线可用（系统栈兜底），字体是**渲染增强**而非阻塞依赖。
3. 思源宋体只以 **`unicode-range` 两个切片**引入，仅服务 `.wordmark`（「灵典」）与 `.seal-badge .zi`（「验」），**不给正文标题**——衬线出现的两处都是品牌/印章语义。
4. 字体文件走 vite **asset 通道**（`src/assets/fonts/*.woff2`），因此**不进 `bundle:check` 的 chunk 预算**（闸只读 `dist/assets/*.js`）；这是"诚实代价"，体积必须按 §7.3 的命令实测登记，不得沿用 DESIGN.md 写作时的估算数。
5. 排印基线：正文 15px / 行高 ≥1.7（中文必需）、界面标签 12px 且**字距只给拉丁**、注音 `rt` 10px 字距 0.08em、`--font-serif` 只走 `.wordmark`。
6. 许可纪律：只用 **OFL**（可再分发、可子集化）的字体进 tarball/包；DESIGN.md Decisions Log 已裁掉 Fontshare（其 ITF Free Font License 禁止再分发字体文件）——**新增字体前先查许可是否允许随包分发**。

### FR-5 组件形制（账本 + 验印母题的五个落点）
1. `btnPrimary` = 朱砂实心（`border-seal bg-seal text-on-seal`，hover `seal-deep`），**只给"使生效"类动作**（注入/应用/覆盖确认/保存/确认）。
2. `btnDanger` 与朱砂**互斥**：透明底 + `danger-700` 文字 + `line-strong` 描边 + 调用点二次确认；禁止继承朱砂样式（两套形制混用会让"权威动作"和"破坏动作"在用户眼里同色）。
3. `.seal-badge`（验印章）= `radius-sm` 近方圆角 + 1.5px 朱砂描边 + `seal-wash` 洗底 + 方章字块 + `-1.5deg` 微旋，**永远配文字不裸奔**；出现时机限验印语义（指纹一致 / 预览即产物）。DESIGN.md 的口径是**三处**（lock 指纹校验通过、diff 一致、装包验证），实现当前**只落一处**（`PackPreviewPane` 的「验 · 预览即产物」，取数 `grep -rn "seal-badge" apps/web/src --include='*.tsx'` → 命中 1）⇒ 差的两处属未做，见 §7.5-7。
4. `.seal-badge.animate`（验印落章）按设计应是**全站唯一 authored moment**：200ms `ease-out` 从 `scale(1.08)` + `opacity 0` 落定，无回弹；其余过渡 ≤150ms 且只解释状态变化。**现状：动画类与 `@keyframes seal-stamp-in` 都在 CSS 里，但没有任何组件挂 `.animate`**（取数 `grep -rn "animate" apps/web/src --include='*.tsx'` → 零命中）⇒ 该表演位实际不播放，属"CSS 写了、行为没接"（§7.5-8）。本条按**设计要求**写为 FR，实现缺口不反向充当验收标准（dev-plan §0.1 反例条）。
5. `.term-ruby rt` = 10px / `font-weight 400` / `--color-ink-subtle` / 字距 0.08em；只在词条头词有非空 `pinyin` 时包裹（缺省降级为无 ruby）。数据契约在 `m3-glossary.md` FR-5。
6. 书脊侧栏 = 宽 76px、`writing-mode: vertical-rl` 竖排字标与标签、单字导航（激活项 `bg-brand-soft text-brand` + 左侧朱砂 1px 书签点）、`<md` 退化为横向顶栏并把竖排转回横排。**七个单字槽全部指向已实现路由**（`AppShell.tsx` 的 `NAV`：库 `/library`、词 `/terms`、技 `/skills`、流 `/flows`、项 `/projects`、包 `/packs`、设 `/settings`）——**注意同名异物**：这里的「技」是 **M2 Skill 台账**，不是 PRD 3.2 的 **M4 技巧库**（M4 无 spec 无实现，dev-plan §15.1-9 / D22）；M4 落地时不能占用「技」字，需另定单字（走本 FR 的 B 级修订）。

## 5. 输入 / 输出

- **API**：无。主题面**零服务端契约**（这是 FR-1.2 的刻意选择，不新增也不修改任何端点）。
- **文件落点（实现侧单一出处清单）**：
  - `apps/web/src/index.css` —— `@font-face` ×4、`@theme` 亮块、`[data-theme='dark']` 暗块、`.mono/.wordmark/.v-rl/.term-ruby/.seal-badge(.zi/.animate)`
  - `apps/web/src/hooks/useTheme.ts` —— `readStoredTheme` / `applyTheme` / `useTheme`（`{theme, toggle}`，全站唯一状态出口）
  - `apps/web/index.html` —— 首帧前预涂内联脚本
  - `apps/web/src/components/AppShell.tsx` —— `ThemeToggle`（单字按钮）+ 书脊 `<aside>`
  - `apps/web/src/components/ui/styles.ts` —— `btnPrimary/btnGhost/btnDanger/inputCls/chipCls` 的类组合单一出处
  - `apps/web/src/i18n/zh.ts` —— `common.theme.{aria,dark,light}` 三键
  - `apps/web/src/assets/fonts/` —— 4 个 woff2
  - `tests/design-tokens.test.ts` —— 治理闸
- **文档口径**：`DESIGN.md`（规范源，含 YAML token 五组 + Colors/Typography/Layout/Elevation/Shapes/Components/Do&Don'ts/Motion/Decisions Log）、`CLAUDE.md`（规定"任何视觉/UI 决策前先读 DESIGN.md，QA 模式要 flag 不符项"）。
- **对下游输出**：亮暗两套都成立且无调用点字面色阶 ⇒ 后续任何页面/组件新增只需引用语义 token，不再触碰 `index.css`。

## 6. 边界与异常

1. **键位双处硬编码**（`useTheme.ts` 与 `index.html` 各写一次 `'openvibe.theme'`）：改一处而漏另一处的症状是"暗色用户刷新时闪一下亮色"，不报错、不可测——改键必须同步两处（复算：`grep -rn "openvibe.theme" apps/web/src/hooks/useTheme.ts apps/web/index.html` → 期望 **2** 处命中；少于 2 即某处漂了）。
2. 存储值只认字面 `'dark'`，任何其他值（含手写脏值、`null`、旧版本残留）一律解析为 `light` ⇒ 主题面**无脏值路径**，也不需要迁移。
3. `localStorage` 读失败（无痕、Safari 隔离存储）降级为 `light`；写失败静默、仅本会话生效。两处 `try/catch` 都在，不得让存储异常冒到渲染层。
4. 暗块里写非 `--color-*` 声明 ⇒ 闸第 2 道红（它会剥掉注释与 `--color-*:` 行后要求残串为空）。这是**设计期就拦**而不是上线后目验。
5. 引用未声明色名 ⇒ 闸第 3 道红；声明未被引用 ⇒ 闸第 4 道红（v4 会 tree-shake，留着等于没有）。
6. 思源宋体只嵌两切片、共 371 个码点 token（`grep -oE "U\+[0-9a-fA-F]{2,6}" apps/web/src/index.css | wc -l`）：**换 wordmark 文案（如「灵典」改他字）必须先确认新字在切片内**，不在则回落到系统衬线（Songti SC/SimSun），表现为"字标忽然不像了"而不是报错。
7. 无系统跟随：`prefers-color-scheme` / `matchMedia` 全仓零命中。系统暗色用户首启是亮色（FR-1.5 有意为之）。
8. 无 `prefers-reduced-motion` 支持：验印落章 200ms 动效对动敏感用户不可关闭——属已知未做面（§7.6），不在本版本声称。
9. 中文系统栈按平台不同（macOS 苹方 / Windows 雅黑 / Linux 思源或 Noto），**Windows 雅黑字重偏重**，头词的 semibold 映射需按平台微调；本机三平台目验只做过 macOS（§7.6）。
10. `--color-on-seal` 在亮暗两块**都声明为 `#ffffff`**（暗块写了同值）。这看似冗余，但删掉暗块那行不影响外观、留着才被「声明必被引用」算作"暗色有对偶"——若将来暗色改深字，改动点就在暗块这一行，不在调用点。

## 7. 验收标准（pass/fail）

> 本段的"自动化项"一律给**文件 + describe/it 标题 + 命令**，不写支数（dev-plan §13-9）；"人工项"给可复跑的走查路径与判读表。§7.1 是本 spec 的性质声明，不是验收项。

1. **补写件的判定基准**：本 spec 是 2026-09-30 对已入库实现（`git show 453a535 --stat` 的 23 个文件）的反向核对。凡实现与 DESIGN.md 口径不符，**判定以本文件 §7.5 的清单为准**，§7.2–§7.4 只验"闸与实测数"，不含对 DESIGN.md 的背书。
2. **token 治理闸**：`tests/design-tokens.test.ts` 的 `WEB-TOKENS · 颜色单一出处` 四道断言全绿——四道标题分别是「调用点零残留字面色阶」「裸 hex 只住在 token 源内…」「用到的每个语义色名都在 @theme 里声明了」「声明的每个 token 都被引用…」；取数 `grep -cE "^[[:space:]]*it[\.(]" tests/design-tokens.test.ts`，命令 `pnpm vitest run --project unit tests/design-tokens.test.ts`。**判据 = 全绿；任一红即本模块不合格**（闸的 4 道就是 FR-2.1–2.5 的机器版）。
3. **字体 asset 与预算**：`bundle:check` 入口/chunk 闸绿，且字体四支合计体积以命令为准——
   `node -e 'const fs=require("fs"),d="apps/web/src/assets/fonts/";const a=fs.readdirSync(d).filter(f=>f.endsWith(".woff2"));console.log(a.length, a.reduce((s,f)=>s+fs.statSync(d+f).size,0))'`
   预期形状：`4` 与 `≈139,288 B`（口径 = `sample sha 453a535` 工作树实测、按 1000B=1KB、不含 `.DS_Store`；DESIGN.md 写作时的「~60–90KB」与「宋体子集约 5KB」是**估算**，已被实测作废 ⇒ 见 §7.5-2）。
4. **对比度可复算（WCAG 2.1 相对亮度，sRGB，正文阈 4.5 / 大字阈 3.0）**：
   ```
   node -e 'const L=h=>{const[r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*r+.7152*g+.0722*b};const C=(a,b)=>{const[l1,l2]=[L(a),L(b)].sort((x,y)=>y-x);return((l1+.05)/(l2+.05)).toFixed(2)};console.log(C("C3402B","FAF9F6"),C("D9583F","1C1B17"),C("FFFFFF","D9583F"),C("FFFFFF","C3402B"))'
   ```
   2026-09-30 实测四个数（口径：`main` 工作树 + 上式手算，非浏览器取色）：`4.88 / 4.45 / 3.88 / 5.14`。
   判读：① 亮色朱砂 on 温纸白 **4.88 ≥ 4.5** ⇒ AA 正文达标（DESIGN.md 手算「≈4.9」与此吻合）；② 暗色朱砂文字/描边 on 夜账本 **4.45 < 4.5** ⇒ **AA 正文未达标**、AA 大字达标；③ 暗色实心按钮白字 **3.88 < 4.5** ⇒ **AA 正文未达标**（`btnPrimary` 实际 14px 常规字重 = 属正文档）；④ 亮色实心按钮白字 5.14 达标。**②③ 是 finding，不是通过项**，登记在 §7.5-5 待裁；改任一侧 token 都必须重跑本条。
5. **人工目验凭据**（本 spec 落地时的唯一视觉凭据）：`docs/devlog-evidence/DEV-0046/01-library-light.png`、`02-library-dark.png`、`03-terms-dark-ruby.png` 三张存在且分别对应「亮色书脊首页 / 暗色首页 / 暗色 + 注音词条页」；暗色那张做过 PNG 采样（画布 `rgb(28,27,23)`）。走查路径：`pnpm dev` → 5144 → 首页点书脊「夜」→ 刷新看是否闪白 → `/terms` 看 `rt` 是否悬挂不破行。
6. **未验证面（不得声称已验）**：
   - 四道闸之外的**暗色全站覆盖**没有自动化：无像素回归基线、无 `data-theme` 断言、无暗色下的 DOM 快照。暗色正确性目前 = 上面 3 张截图 + 一次采样，属**单点人工凭据**。
   - 首帧预涂（FR-1.3）与降级路径（FR-1.4、§6.3）**无自动化**：需要真刷新时序与无痕环境，未做用例。
   - 验印落章动效（FR-5.4）无自动化，且 `prefers-reduced-motion` 未支持（§6.8）。
   - Windows / Linux 的系统字体栈与字重映射未目验（DEV_LOG 换肤那笔的潜在风险②自述「需在三个平台各目验一次」，现只做了 macOS）。
   - 书脊七条路由的**渲染与交互无自动化断言**（导航态、激活书签点、`<md` 退化布局都靠目验），书脊竖排（`writing-mode: vertical-rl`）的跨浏览器细节未验证；极窄屏（320px）下注音 rt 宽度未测（DEV_LOG ruby 落地那笔风险②同源）。
   - 暗色遮罩 `bg-scrim/30` 在暗底上的对话框边界可读性未目验（scrim 不对偶，§3 表 FR-3.3）。
   - 书脊导航的「技」指向未实现的 M4（§2 模块本身无 spec，见 dev-plan §15.1-9）⇒ 视觉上像已交付，属**导航暴露未实现模块**，待 M4 spec 落定后判保留/摘除。
7. **上游缺席登记**：PRD 3.2 未把「主题/token 化/字体」列为任何模块功能，仅第 8 章 P2 行与 D19 提到「暗色主题（前置是设计 token 化重构）」；dev-plan §5.5 仍写「深浅色 MVP 仅浅色（P1.1 评估暗色）」。本 spec 立起后，§5.5 那格由本笔同步改写为指向本文，避免"文档说没做、代码已做完"的第二次漂移。

### 7.5 未对齐清单（DESIGN.md 口径 ↔ 已入库实现，逐条待裁）

| # | DESIGN.md 说 | 实现是 | 影响 | 处置 |
|---|--------------|--------|------|------|
| 1 | 词条头词 **19px** semibold（Typography / term-card 两处同数） | `TermsTable.tsx` 头词 `text-[15px] font-semibold`（换肤那笔 DEV_LOG 里就写的是 15px） | 头词与正文同级，「内容面头词大」的记忆点弱化 | 待裁：改实现（一行）或改 DESIGN.md 口径并留痕 |
| 2 | wordmark 宋体「只嵌这两字的可变子集约 5KB」；字体诚实代价 ~60–90KB | 两支切片共 **79,156 B**、四支共 139,288 B，且切片含 371 个码点而非两字 | 数字陈旧（不影响功能，asset 不占 chunk 预算） | 本文 §7.3 以实测命令为单源；DESIGN.md 那两数按原样留着当写作时点记录 |
| 3 | 「ruby 注音可在设置关闭（关闭后回退为副行拼音）」 | **无开关**：`pinyin` 非空即渲染 ruby，全站无设置项、无降级副行 | 承诺的可访问性选择权缺失 | 已登记为增强项（DEV_LOG ruby 落地那笔风险④「属增强项」）；要做属 §0.3 B 级新增 FR + 设置页落点 |
| 4 | Motion「全站 ≤150ms」同时「the one authored moment = 200ms 落章」 | 实现取 200ms | DESIGN.md **自相矛盾**（通则与例外同文档并存） | 待裁：把通则改写成「≤150ms，唯一例外为验印落章 200ms」，否则走查无法判红 |
| 5 | 「暗色用提亮档 `#D9583F` 保对比」 | 实测 4.45（文字/描边）与 3.88（白字实心按钮），两项 AA 正文未达标 | 暗色下**朱批按钮**是全站最关键动作，却是唯一不达标的对比组合 | 待裁三选一：① 暗态按钮改深字（`#1C1B17` on `#D9583F` = 4.45，仍差 0.05）；② 暗态底色转深（白字 on `#A03020` = 7.15，达标但朱砂在暗底变沉、失去"提亮"初衷）；③ 认大字阈并加厚字重（按钮文案 ≥14px bold 可主张 3.0 阈）。任一改动都要重跑 §7.4 |
| 6 | `error` = `#B3372A` 单色 | 实现是 `danger-*` oklch 六档族（`btnDanger` 取 `-700`，暗色另值） | 语义等价、形状不同；按 DESIGN.md 字面找 `#B3372A` 会找不到 | 以 §3 映射表为准（`error ↔ danger-*`），DESIGN.md 的十六进制按其原文当历史记录 |
| 7 | seal-badge 出现时机「仅三处：lock 指纹校验通过、diff 一致、装包验证」 | 只落**一处**（`PackPreviewPane` 预览即产物）；复跑 `grep -rn "seal-badge" apps/web/src --include='*.tsx'`（采样 2026-09-30 工作树） | 「验印」信任信号只覆盖了一条链，另两条（lock 校验、diff 一致）视觉上无印 | 待裁：另两处是否随 M5/M6 的对应界面补挂；补挂属新增调用点，不触 token 块 |
| 8 | 「The one authored moment：验印落章 200ms 落定」 | CSS 有 `.seal-badge.animate` 与 `@keyframes seal-stamp-in`，**无任何组件挂 `.animate`**（复跑 `grep -rn "seal-badge" apps/web/src --include='*.tsx'` 无 `animate` 后缀；`grep -rn '\banimate\b' apps/web/src --include='*.tsx'` 零命中）⇒ 动画是死代码，表演位从不播放 | 设计最强调的那一下"盖章感"实际不存在 | 待裁：在验印章出现处按验印通过时机挂 `.animate`（一处即可），并据此重跑 §7.4 与目验 |

## 8. 依赖

- **依赖**：Tailwind v4 的 `@theme` → utility 生成与 tree-shake 语义（FR-2.3/2.4 两条断言成立的前提）；Radix Primitives 提供 Dialog/Toast 等浮层（scrim、shadow 形制的宿主）；vite asset 管线（字体走 asset 不 JS 侧）；`CLAUDE.md` 的"先读 DESIGN.md"纪律；pinyin 数据来自 `packages/core`（FR-5.5 的 `TermOut.pinyin`，非本模块）。
- **被依赖**：`apps/web` 全部页面与组件的视觉；`m1/m2/m3/m5/m6` 各 spec 的 UI 验收条目凡涉及颜色/字体，判定口径都指向本文件与 `DESIGN.md`，不各自描述颜色。
- **许可与分发**：Source Sans 3 / JetBrains Mono / Noto Serif SC 均 SIL OFL（允许再分发与子集化），故可随 `apps/web` 产物与 CLI tarball 同域分发；**禁止引入 ITF 类"免费但禁再分发"的字体**。
- **脆弱面（改动前必读）**：① `@theme` 与 `[data-theme='dark']` 的**层内/层外关系**是暗色生效的机制（§3 末段），把暗块包进 `@layer` 或改用 `@utility` 都可能静默破坏换肤；② 键位两处硬编码（§6.1）；③ 暗块内只许 `--color-*`，结构性差异要落在亮块之外的非主题规则；④ `bundle:check` 只统计 `.js`，字体膨胀**不会被闸拦**，靠 §7.3 的实测命令人工登记。
