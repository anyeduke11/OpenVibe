# CLAUDE.md

## Output Format

任务收尾必须按固定三段输出，缺一不可：

1. **已完成** —— 原计划的每一项及其进度，逐项说明完成情况。
2. **未完成** —— 未完成项，每项写明原因。
3. **未考虑且需要增强的需求** —— 计划外但应当考虑的需求。每项写三点：为什么要考虑、如何实现、验收标准。

语言要求：言简意赅、清晰易懂。不要过度口语化（「搞定了」「这活儿」「踩坑了」一律不用），不要术语堆砌或生造名词；缩写、代号、内部黑话首次出现时须给出解释。

适用范围：任何任务收尾，不论大小、无论有无失败项。计划外的改进想法不得默默省略，必须进第三段。

依据：owner 于 2026-10-16 确立；同规范已写入全局记忆，跨项目适用。

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

Additional project-specific notes:

- 设计系统「暖纸 · 可读性工作台（V2）」于 2026-10-01 由 owner 裁定**全盘替换** V1「墨松账本 · 书斋版」，撤销项逐条登记在 DESIGN.md「Migration & Retirements」与 Decisions Log。视觉口径的唯一出处仍是 `DESIGN.md`；对照原型 `docs/prototypes/暖系-暖纸V2-可读性交互Demo-20260929.html`。
- **落地状态（读前三行必看）**：本轮是「治理文档先行」，**代码尚未换肤**——`apps/web/src/index.css` 此刻仍是 V1（复算 `grep -oE '^[[:space:]]*--color-[a-z0-9-]+:' apps/web/src/index.css | sed 's/[[:space:]]//g;s/:$//' | sort -u | wc -l` → **40**，含 V2 里退场的 `--color-seal*` / `--color-on-seal` / `--color-brand*`；采样 2026-10-01）。下面三条描述的是**目标态**，不是现测。
- 颜色的单一出处仍是 `apps/web/src/index.css`：V2 = **29 支颜色 token × 双主题同构**（`@theme` 亮块 + `[data-theme='dark']` 暗块）。换肤只改这两块，调用点只写语义 utility、不出现字面色阶——由 `tests/design-tokens.test.ts` 四道闸钉住（该闸现为 V1 的 40 支全过，改名不得使其放松）。V1→V2 的 token 改名表在 DESIGN.md，扩闸清单在 `docs/specs/theme.md` FR-2.6。
- 可读性是硬约束而非偏好：任何**承载文字**的颜色配对在两套主题都要 ≥4.5:1（3.0 大字阈只允许 ≥24px 或 ≥18.66px bold）；`ink-faint` 不得落在 `-soft` 容器上（暖夜下 4.29）。设置页第 7 区「可读性与设计系统」是常驻量具。
- 字体自托管两支（V2 目标态）：Outfit（latin 可变子集，SIL OFL，GSUB 实测含 `tnum`）+ JetBrains Mono（OFL）。中文走系统原生栈。V1 的思源宋体与 `--font-serif` **随衬线字标一并退场**（`apps/web/src/assets/fonts/noto-serif-sc-900-s0.woff2` 40,240 B + `-s1.woff2` 38,916 B = **79,156 B**，采样 2026-10-01；**删除是资产动作，须 owner 签收后才动**）。字体走 asset 通道、不进 `bundle:check` 的 chunk 预算（入口 ≤300kB / chunk ≤500kB），但体积必须如实登记；**新增字体前先查许可是否允许随 CLI tarball 分发**。
