import { AppError, AGENT_PAYLOAD_KEYS } from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { LocalEventsRepo } from '../repos/localEvents'

/**
 * M8 `agent_bridge_installed` 的写入点（PRD §6.3 触发点 ／ §6.4 去重键 ／
 * `m8-agent-bridge.md` FR-5.1 声明的第五类）。
 *
 * ## ⚠️ 本文件当前**没有生产调用方** —— 这是登记在案的事实，不是遗漏
 *
 * PRD 给的触发点是「**检测到项目内存在 skill 目录**」。而 skill 目录的**目录名与格式**
 * 正是 M8-A 未闭合的形态三问之一：`m8-agent-bridge.md:51` 自己写着——
 * 「它的核心形态取决于 Trae/CodeBuddy 的 skill 发现约定（目录/格式），
 * 而该约定**运行半边本轮未经真机核验**」。
 * 那个「运行半边」就是探针五问的 **Q3（skill 内脚本可执行性）与 Q4（对 symlink 的限制）**，
 * 两者至今全空（`docs/devlog-evidence/M8-probe/results-20261016.md`）。
 *
 * ⇒ **在 Q3/Q4 闭合前，没有任何一处代码知道「skill 目录」长什么样**，
 * 于是「检测到 skill 目录」这个触发条件写不出来。此时硬造一个触发点，
 * 只能凭空发明目录名 —— 那等于把一个未验证的约定写进产品，比不写更坏。
 *
 * **那这个文件为什么还写**：去重口径（PRD §6.4「按 `(project_id, adapter, pack_version)`
 * 去重，重复检测不重复记」）**不依赖那个约定** —— 它只认 payload 的三个值，
 * 而 payload 的键闭集 `adapter` / `packVersion` 已在 `AGENT_PAYLOAD_SHAPE` 里定死并有守卫。
 * 去重恰恰是这类事件最容易做错的地方（重复检测会把「用了几次」虚高，
 * 而 D15 正拿这些数字判活跃度），先把它做实、测死，M8-A 落地时直接挂上去即可。
 *
 * **为什么不加 HTTP 端点**：`command-run` 那类端点的存在理由是「CLI 不直接开库、
 * 只能经 HTTP 上报」（FR-4.4）。而 M8-A 届时是走 CLI 上报还是进程内直接调用，
 * **取决于 Q3/Q4 的答案**（复制 vs symlink 决定了要写几次、谁来写）。
 * 现在把端点形状钉死，很可能 Q4 一答就作废。故**只做服务层，端点留到形态闭合后**。
 */

/** payload 键闭集（FR-5.1.1），从单一出处派生，避免与规格各写各的 */
export const BRIDGE_INSTALL_PAYLOAD_KEYS = AGENT_PAYLOAD_KEYS.agent_bridge_installed

/**
 * `packVersion` 的长度上限。
 * semver（`MAJOR.MINOR.PATCH`）加预发布/构建后缀，64 字符绰绰有余；
 * 而它必须**有上限** —— 否则一个把整个 lock 文件内容塞进来的调用方
 * 会把一大段自由文本直接写进台账，而 FR-5.1.2 的禁列只挡路径与用户名，挡不住长文本。
 */
const PACK_VERSION_MAX_LEN = 64

/** `adapter` 的长度上限。够放 `claude-code` / `codebuddy` / `generic-agents` */
const ADAPTER_MAX_LEN = 64

export interface BridgeInstallInput {
  projectId?: unknown
  adapter?: unknown
  packVersion?: unknown
}

export interface BridgeInstallServiceDeps {
  db: SqliteDatabase
  /** 时间源显式注入：与 `commandRunService` 同源，`day` 由它派生 */
  now: () => Date
}

export interface BridgeInstallResult {
  /** `false` 表示命中去重键、本次未记 —— 调用方据此知道该次检测没产生新事实 */
  recorded: boolean
}

/**
 * 值里含路径分隔符即拒。
 *
 * **为什么拒而不洗**：`adapter` 与 `packVersion` 形态上都该来自闭集与 semver，
 * 一个含 `/` 或 `\` 的值说明调用方传错了东西。静默截断会让调用方以为记成功了，
 * 真出事时反而查不出来；直接 422 说清怎么改，调用方能立刻纠正。
 * 路径形态也是 FR-5.1.2 禁列（绝对路径 / 项目名）在**写入点**的兜底 ——
 * 键白名单只管键名，管不住值。
 */
function valueViolation(field: string, value: string, max: number): string | null {
  if (value.length > max) return `${field} 超过 ${max} 字符`
  if (/[/\\~]/.test(value)) return `${field} 不得含路径分隔符（绝对路径 / 项目名属 FR-5.1.2 禁列）`
  if (value.trim() === '') return `${field} 不得为空白串`
  return null
}

export function createBridgeInstallService(deps: BridgeInstallServiceDeps) {
  const ledger = new LocalEventsRepo(deps.db)

  /**
   * 记一次「agent bridge 已装进某项目」。
   *
   * **去重为什么在服务层而不是靠调用方**：PRD §6.4 明写「重复检测不重复记」。
   * 「检测」天然会被重试、并发、页面重渲染放大；把去重做成调用方的自觉，
   * 换一处调用点就失效一次。同 `cli_agent_command_run` 的口径 —— 计数只能虚高不能虚低时，
   * 去重必须住在写入点。
   */
  function recordBridgeInstalled(input: BridgeInstallInput): BridgeInstallResult {
    const fieldErrors: Record<string, string[]> = {}

    if (typeof input.projectId !== 'string' || input.projectId.trim() === '') {
      fieldErrors.projectId = ['projectId 必须是非空字符串']
    }
    for (const field of ['adapter', 'packVersion'] as const) {
      const raw = input[field]
      if (typeof raw !== 'string') {
        fieldErrors[field] = [`${field} 必须是字符串`]
        continue
      }
      const why = valueViolation(field, raw, field === 'adapter' ? ADAPTER_MAX_LEN : PACK_VERSION_MAX_LEN)
      if (why) fieldErrors[field] = [why]
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new AppError('VALIDATION_ERROR', '请求参数校验失败', { fieldErrors })
    }

    // 校验通过后才收窄：上面抛错时这些值未被认定为合法类型
    const projectId = input.projectId as string
    const adapter = input.adapter as string
    const packVersion = input.packVersion as string

    if (existsFor(adapter, packVersion, projectId)) return { recorded: false }

    ledger.record(
      {
        kind: 'agent_bridge_installed',
        subjectType: 'project',
        subjectId: projectId,
        projectId,
        // 白名单构造：两键写死，不 spread 入参（spread 会把任意多余键带进 payload）
        payload: { adapter, packVersion },
      },
      deps.now(),
    )
    return { recorded: true }
  }

  /**
   * 去重键 = `(project_id, adapter, pack_version)`（PRD §6.4）。
   *
   * **为什么在 JS 里比而不是用 `json_extract`**：仓内**零处**用过 SQLite 的 JSON 函数
   * （实测 `json_extract` → 0 命中），那是一层新的运行时依赖，且本仓不 build FTS
   * 一类的「顺手加面」。而按 `project_id` 收窄后要扫的行数天然很小
   * （一个项目装 bridge 的次数是有限的），解析成本可忽略。
   * ⚠️ 若日后事件量级变了，这里要换成**建索引的真去重**而不是继续扫 ——
   * 届时得先确认 SQLite 版本带 JSON1。
   */
  function existsFor(adapter: string, packVersion: string, projectId: string): boolean {
    const rows = deps.db
      .prepare(
        `SELECT payload_json FROM local_events
          WHERE kind = 'agent_bridge_installed' AND project_id = ?`,
      )
      .all(projectId) as { payload_json: string }[]
    return rows.some((r) => {
      try {
        const p = JSON.parse(r.payload_json) as Record<string, unknown>
        return p.adapter === adapter && p.packVersion === packVersion
      } catch {
        // 坏 JSON 不等于命中：宁可多记一条也不吞掉一次真实检测
        return false
      }
    })
  }

  return { recordBridgeInstalled }
}
