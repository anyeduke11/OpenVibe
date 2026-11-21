#!/usr/bin/env node
/**
 * scripts/dev-iso.mjs —— 隔离实例入口（2026-11-10 整合后变为**薄封装**）。
 *
 * ## 整合说明
 *
 * 隔离能力（临时数据目录 + 自动挑端口 + 冲突重试）已折叠进 `scripts/dev-all.mjs --iso`，
 * 本文件只负责把 `--iso` 传过去 —— **实现只有一份**，避免两处各写一遍重试逻辑。
 *
 * ```sh
 * pnpm dev:iso          # 等同于 pnpm dev --iso
 * ```
 *
 * 保留本文件（而不是把 `package.json` 的 `dev:iso` 直接指向 `dev-all.mjs --iso`）
 * 是因为 `tests/isolated-home.test.ts` 与 `docs/dev-plan.md` §1.5 都以
 * 「`dev:iso` 是一个具名入口」为口径；改名会牵动判据与登记，收益不抵代价。
 */
process.argv.push('--iso')
await import('./dev-all.mjs')
