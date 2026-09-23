/**
 * 版本号的唯一真源（T9a-2）。入口 index.ts 与发布暂存清单都从这里取，
 * 由 `tests/publish-manifest.test.ts` 把它与 `apps/cli/package.json` 的 version 钉在一起，
 * tag（`v0.1.0`）再由演练驱动器钉回这里。
 */
export const CLI_VERSION = '0.1.0'
