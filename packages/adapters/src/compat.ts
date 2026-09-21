/**
 * 兼容矩阵（design §8 / dev-plan §8.3）：**仅展示用**，不产生代码分支。
 * `reads` 必须是某个 adapter 的产物路径——新增兼容平台只加一行，零代码；
 * `coveredPlatforms()` 据此推导「本包覆盖平台」，所以行的正确性由 UT-ADAPTER-04 守住。
 */
export interface CompatRow {
  platform: string
  reads: string
  note?: string
}

export const COMPAT_MATRIX: CompatRow[] = [
  {
    platform: 'Cline',
    reads: 'AGENTS.md',
    note: '社区惯例（design §8 契约依据：强）',
  },
  {
    platform: 'Codex',
    reads: 'AGENTS.md',
    note: '社区惯例（design §8 契约依据：强）',
  },
  {
    platform: 'Kimi Code',
    reads: 'AGENTS.md',
    note: '官方 CLI 文档，感知链 AGENTS.md → .cursor/rules；子 Agent 感知缺陷属上游 bug',
  },
  {
    platform: 'OpenCode',
    reads: 'AGENTS.md',
    note: '社区惯例（design §8 契约依据：强）',
  },
  {
    platform: 'Qwen Code',
    reads: 'AGENTS.md',
    note: '社区惯例（design §8 契约依据：强）',
  },
  {
    platform: 'Trae CN',
    reads: 'AGENTS.md',
    note: '一手证据：T6 真机核验（Trae CN 二进制含「Include AGENTS.md in context」设置且默认开启）',
  },
  {
    platform: 'zcode',
    reads: 'AGENTS.md',
    note: '一手证据：zcode 自身按 AGENTS.md 约定加载用户/项目指令',
  },
]
