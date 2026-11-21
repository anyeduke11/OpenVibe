/**
 * agent 注册表的默认种子（v0.3.0 FR-3.0-1）。
 *
 * 数据源唯一出处：`docs/competitive-analysis-20261119.md` §2.2.2 九问总表与 §2.2.3 旗标映射表。
 * **不猜**：报告未给出或标 ⚠️ 的旗标一律留 NULL（= 未声明），由真机探针补齐，而不是编造。
 *
 * 为什么种子在服务层懒播种、而不是写进 migration SQL：
 *   0024 的注释已定「迁移必须是纯 schema 变更」。且种子要能被探针结果回写（XP-1），
 *   把数据写死在迁移里会让每次修正都欠一次新迁移。
 *
 * 幂等语义：`ON CONFLICT(id) DO NOTHING` —— 种子里**不覆盖**用户已改的
 * executable / health / archived / 配额。用户删掉的条目也不会被种子复活。
 */

export type AgentCapability = 'yes' | 'no' | 'unknown'

export interface AgentRegistrySeed {
  id: string
  displayName: string
  executable: string | null
  headlessFlag: string | null
  resumeFlag: string | null
  jsonFlag: string | null
  capabilities: Record<'hooks' | 'sandbox' | 'subagent' | 'sdk', AgentCapability>
  archived: 0 | 1
}

export const AGENT_REGISTRY_SEEDS: readonly AgentRegistrySeed[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    executable: 'claude',
    headlessFlag: '-p',
    resumeFlag: '--resume',
    // 实测（2026-11-20 探针）：`--print` 模式下 `--output-format=stream-json` 必须配 `--verbose`，
    // 否则直接报错退出。声明缺这一条就等于 L1-2 永远红。
    jsonFlag: '--output-format stream-json --verbose',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    executable: 'codex',
    headlessFlag: 'exec',
    resumeFlag: 'exec resume',
    jsonFlag: '--json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    executable: 'gemini',
    headlessFlag: '-p',
    resumeFlag: '--resume',
    jsonFlag: '--output-format stream-json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'no' },
    archived: 0,
  },
  {
    id: 'crush',
    displayName: 'Crush',
    executable: 'crush',
    headlessFlag: 'run',
    resumeFlag: '-s',
    jsonFlag: null,
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'no', sdk: 'unknown' },
    archived: 0,
  },
  {
    id: 'goose',
    displayName: 'Goose',
    executable: 'goose',
    headlessFlag: 'run',
    resumeFlag: '--resume',
    jsonFlag: '--output-format stream-json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'no', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    executable: 'opencode',
    headlessFlag: 'run',
    resumeFlag: '--session',
    jsonFlag: '--format json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'qwen',
    displayName: 'Qwen Code',
    executable: 'qwen',
    headlessFlag: '-p',
    resumeFlag: '--resume',
    jsonFlag: '--output-format stream-json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy',
    executable: 'codebuddy',
    headlessFlag: '-p',
    resumeFlag: '-r',
    jsonFlag: '--output-format stream-json',
    // 报告 §2.2.2 对 CodeBuddy 的沙箱与子代理标 ⚠️（文档不足待真机验证）
    capabilities: { hooks: 'unknown', sandbox: 'unknown', subagent: 'unknown', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'trae',
    displayName: 'Trae agent',
    executable: 'trae-cli',
    headlessFlag: 'run',
    resumeFlag: null,
    jsonFlag: null,
    capabilities: { hooks: 'no', sandbox: 'no', subagent: 'no', sdk: 'no' },
    archived: 0,
  },
  {
    id: 'kimi',
    displayName: 'Kimi Code',
    executable: 'kimi',
    headlessFlag: '-p',
    resumeFlag: '-S',
    jsonFlag: '--output-format stream-json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'mcode',
    displayName: 'MiniMax Code',
    executable: 'mcode',
    headlessFlag: 'exec',
    resumeFlag: '--session',
    jsonFlag: '--output-format stream-json',
    capabilities: { hooks: 'yes', sandbox: 'yes', subagent: 'yes', sdk: 'yes' },
    archived: 0,
  },
  {
    id: 'iflow',
    displayName: 'iFlow',
    executable: 'iflow',
    headlessFlag: null,
    resumeFlag: null,
    jsonFlag: null,
    capabilities: { hooks: 'unknown', sandbox: 'unknown', subagent: 'unknown', sdk: 'unknown' },
    // 2026 年停服（竞品报告 §2.1.1）。保留行、标归档，不删
    archived: 1,
  },
] as const

// 落库语句只有一处，在 repos/agentRegistry.ts 的 seedIfEmpty 里——
// 数据与写入分开，避免同一 UPSERT 在两处漂移。
