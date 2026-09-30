# CLAUDE.md

## Design System

Always read DESIGN.md before making any visual or UI decisions.
All font choices, colors, spacing, and aesthetic direction are defined there.
Do not deviate without explicit user approval.
In QA mode, flag any code that doesn't match DESIGN.md.

Additional project-specific notes:

- 设计系统「墨松账本 · 书斋版」由 /design-consultation 于 2026-09-29 定稿；预览页样张见 `/tmp/design-consultation-preview-openvibe.html`（易失，可在 DESIGN.md 基础上重建）。
- 本仓现有 `apps/web/src/index.css` 的 `@theme` token 块是颜色的单一出处——实施本系统时只改该块与 `AppShell.tsx`，调用点不出现字面色阶（现有约定保持）。
- 字体为自托管 asset：Source Sans 3 / JetBrains Mono / 思源宋体二字子集（均 OFL）。改动打包时注意 `bundle:check` 闸门（入口 ≤300kB / chunk ≤500kB），字体不进 chunk 预算但要如实记录体积。
