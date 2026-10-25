# v0.2.3 会话产物提交清单（owner 分批提交用；v2 修正版）

> v2（2026-10-25）：v1 的路径解析漏了大量 M 态文件且收录了 7 个已迁移旧路径（预检脚本首跑抓出），
> 本版以 porcelain 三列后路径重收。并行会话在编（docs-check.ts / langRoadmap / restore-link-check /
> dev-plan 等）与历史禁区（demo/ redesign/）不在此列。

## A 批：可读诊断（3）

- `apps/cli/test/native-failure.test.ts`
- `packages/core/src/db/native-load.test.ts`
- `packages/core/src/db/native-load.ts`

## B 批：verify（4）

- `apps/cli/src/commands/verify.ts`
- `apps/cli/test/verify.test.ts`
- `packages/core/src/inject/verify.test.ts`
- `packages/core/src/inject/verify.ts`

## C 批：tooling 物理归位（含自 db/ 迁移的 7 件）（1）

- `packages/core/src/tooling/`

## C 批：种子三态（8）

- `packages/core/src/db/m9-p1-seed-lang-topics.ts`
- `packages/core/src/db/m9-p1b-seed-resources.ts`
- `packages/core/src/db/m9-p1d-seed-profiles.ts`
- `packages/core/src/db/seed-merge.test.ts`
- `packages/core/src/db/seed-merge.ts`
- `packages/core/src/db/seed-perf.test.ts`
- `packages/core/src/db/seed-registry.ts`
- `packages/core/src/db/seed.ts`

## C 批：分离闸/快照/审计（5）

- `scripts/barrel-audit.ts`
- `scripts/barrel-snapshot.ts`
- `tests/main-face-snapshot.test.ts`
- `tests/support/barrel-parse.ts`
- `tests/tooling-face.test.ts`

## C/D 批：迁移 0019-0023（3）

- `packages/core/src/db/migrations/0019_lang_seed_hash.sql`
- `packages/core/src/db/migrations/0020_lang_topic_content_key.sql`
- `packages/core/src/db/migrations/0022_adoption_snapshots.sql`

## D 批：提取链（13）

- `apps/server/src/routes/extract.ts`
- `apps/server/test/extract.api.test.ts`
- `apps/web/src/components/projects/ExtractLauncher.test.tsx`
- `apps/web/src/components/projects/ExtractLauncher.tsx`
- `apps/web/src/hooks/useExtract.ts`
- `apps/web/src/hooks/useExtractRun.ts`
- `docs/specs/v023-d-ai-extract.md`
- `packages/core/src/db/migrations/0021_ai_extract.sql`
- `packages/core/src/db/migrations/0023_ai_extract_shares.sql`
- `packages/shared/src/extract-prompt.ts`
- `packages/shared/src/schemas/extract.ts`
- `scripts/extract-m9-guide-phases.ts`
- `scripts/extract-m9-guide-resources.ts`

## D/E 批：提取与问答（core/extract）（1）

- `packages/core/src/extract/`

## E 批：discuss（3）

- `apps/cli/src/commands/discuss.ts`
- `apps/cli/test/discuss.test.ts`
- `apps/server/test/discuss.api.test.ts`

## F 批：MCP（2）

- `apps/cli/src/commands/mcp.ts`
- `apps/cli/test/mcp.test.ts`

## A 批：发布说明与 runbook（2）

- `docs/release-notes/v0.2.3-publish-runbook.md`
- `docs/release-notes/v0.2.3.md`

## 工具脚本（4）

- `scripts/m9-grade-guard.ts`
- `scripts/migrate-drill.ts`
- `scripts/v023-preflight.ts`
- `scripts/verify-matrix.ts`

## 规格与 PRD（6）

- `docs/PRD-v0.2.3-v1.0-20261024.md`
- `docs/product-lines.md`
- `docs/specs/v023-a-launch.md`
- `docs/specs/v023-b-first-lap.md`
- `docs/specs/v023-c-consolidation.md`
- `docs/specs/v023-e-ai-assistant.md`

## 文档收口（1）

- `README.md`

## 其他（接线/合同随迁）（78）

- `apps/cli/package.json`
- `apps/cli/src/commands/diff.ts`
- `apps/cli/src/commands/sync.ts`
- `apps/cli/src/index.ts`
- `apps/cli/src/version.ts`
- `apps/cli/test/diff-sections.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/routes/navCounts.ts`
- `apps/server/src/routes/settings.ts`
- `apps/server/test/cliCommands.api.test.ts`
- `apps/server/test/navCounts.api.test.ts`
- `apps/server/test/om.api.test.ts`
- `apps/server/test/reseed-m9.api.test.ts`
- `apps/web/src/components/agent/AgentPanel.tsx`
- `apps/web/src/components/agent/DiscussBlock.test.tsx`
- `apps/web/src/components/agent/DiscussBlock.tsx`
- `apps/web/src/components/projects/DevLogList.tsx`
- `apps/web/src/components/settings/OmSection.test.tsx`
- `apps/web/src/components/settings/SettingsSections.tsx`
- `apps/web/src/hooks/useSettings.ts`
- `apps/web/src/i18n/lane-agent.ts`
- `apps/web/src/i18n/lane-system.ts`
- `apps/web/src/i18n/zh.ts`
- `apps/web/src/pages/SettingsPage.tsx`
- `docs/docs-check-baseline.json`
- `docs/specs/m6-standard-pack.md`
- `docs/tasks.md`
- `package.json`
- `packages/core/package.json`
- `packages/core/src/db/core-db.test.ts`
- `packages/core/src/db/index.ts`
- `packages/core/src/db/m8-ledger-schema.test.ts`
- `packages/core/src/db/m9-p1-10-source-freshness.test.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-p1-10-source-freshness.test.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-p1-5-concept-content.test.ts`
- `packages/core/src/db/m9-p1-5-concept-content.ts`
- `packages/core/src/db/m9-p1-6-concept-deltas.test.ts`
- `packages/core/src/db/m9-p1-6-concept-deltas.ts`
- `packages/core/src/db/m9-p1-7-topic-stages.ts`
- `packages/core/src/db/m9-p1b-necessity.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-p1b-necessity.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-p1b-readme.ts`
- `packages/core/src/db/m9-p1b-resources.test.ts`
- `packages/core/src/db/m9-p1b-spec.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-p1b-spec.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-p1c-links.test.ts`
- `packages/core/src/db/m9-p1d-mode-assign.ts`
- `packages/core/src/db/m9-p1d-mode-profiles.test.ts`
- `packages/core/src/db/m9-p1d-spec.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-p1d-spec.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-p1d-vibe-static.test.ts`
- `packages/core/src/db/m9-p1f-grade-guard.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-p1f-grade-guard.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-p1f-stage-tracks.test.ts`
- `packages/core/src/db/m9-source-freshness.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-source-freshness.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-time-window-guard.test.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-time-window-guard.test.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-time-window-guard.ts` —— **删除态**（CS1-v2 迁至 `packages/core/src/tooling/m9-time-window-guard.ts`；git add 须含此删除侧）
- `packages/core/src/db/m9-topic-filter.ts`
- `packages/core/src/db/m9-topic-terms.ts`
- `packages/core/src/db/term-ai-ledger.test.ts`
- `packages/core/src/index.ts`
- `packages/core/src/inject/index.ts`
- `packages/core/src/inject/section-diff.test.ts`
- `packages/core/src/inject/section-diff.ts`
- `packages/core/src/repos/appMeta.ts`
- `packages/core/src/services/agentPayload.test.ts`
- `packages/core/src/services/agentService.ts`
- `packages/shared/src/cli-commands.ts`
- `packages/shared/src/constants.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas/nav.ts`
- `packages/shared/src/schemas/playbooks.ts`
- `packages/shared/src/schemas/settings.ts`
- `packages/shared/src/schemas/term.ts`
- `scripts/build-cli.ts`
- `scripts/collect-m9-github-sources.ts`
- `scripts/collect-m9-sources.ts`
- `scripts/failure-evidence.sh`
- `tests/core-main-exports.txt`
- `tests/docs-check.test.ts`
- `tests/m9-mutations.test.ts`
- `tests/order-determinism.test.ts`
- `tests/publish-manifest.test.ts`

## 登记与台账（9）

- `DEV_LOG.md`
- `docs/decisions.md`
- `docs/devlog-evidence/M8-probe/raw/trae-r1.md`
- `docs/devlog-evidence/M8-probe/raw/trae-r2.md`
- `docs/devlog-evidence/M8-probe/raw/trae-r5.md`
- `docs/devlog-evidence/M8-probe/raw/trae-r6.md`
- `docs/devlog-evidence/dev-0119-library-folderbar.png`
- `docs/devlog-evidence/v023-commit-manifest.md`
- `docs/devlog-evidence/v023-first-lap-protocol.md`

合计：143 个文件。提交建议顺序：core/迁移 → server/cli 接线 → web → 工具脚本 → spec/docs → README/登记。