/**
 * 版本号的唯一真源（T9a-2）。入口 index.ts 与发布暂存清单都从这里取，
 * 由 `tests/publish-manifest.test.ts` 把它与 `apps/cli/package.json` 的 version 钉在一起，
 * tag（`v0.2.3`）再由演练驱动器钉回这里。
 * 0.1.0 → 0.2.3（2026-10-24，DEV-0115）：openvibe-cli 在 npm 的**首次发布即 v0.2.3**——
 * 工作树自 v0.1.0 演练以来已含 verify / OM / 可读诊断 / sync 前置提示，首发带着它们走，
 * 不发一个不含现版能力的 0.1.0（发布说明 docs/release-notes/v0.2.3.md 单源）。
 */
export const CLI_VERSION = '0.2.3'
