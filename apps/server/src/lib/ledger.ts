import { LocalEventsRepo, type LocalEventInput, type SqliteDatabase } from '@openvibe/core'

/**
 * 路由侧的本机事件台账写入点（local-event-ledger.md FR-3 的**降级形态**）。
 *
 * ## 为什么在 lib 而不是各处 new repo
 *
 * `repos/localEvents.ts` 的不变式 ① 写的是「写入点集中在本 repo 的一处，**调用方**是服务层；
 * 服务层未落地时的降级形态是『route 调这里』，但**写入处必须留指向 FR-3 的注释**」。
 * 「写入处」= `LocalEventsRepo.record`，本文件不新增任何 INSERT，一行都没有 ——
 * 它只是把「装 repo + 取时钟」这两件重复劳动收到一处，好让上面的不变式不必在六个路由里各抄一遍。
 *
 * ## 为什么缺省也照记，而不是「没注入就不记」
 *
 * 「未注入则静默跳过」是最坏形态：某天装配点漏传，台账会无声地少记一类事件，
 * 而 D15 判的是「两周窗内 ≥10 次」——**少记会让真用户被判成假用户**，且无从排查。
 * 故缺省时退化为隐式 `new Date()` 的真 writer：**牺牲时间可钉住性，不牺牲记录本身**。
 * 需要断言 `day` 的测试走 `buildApp({ now })` 这条注入点。
 *
 * ## payload 禁列（FR-6.3）
 *
 * 只放 **id 与枚举值**；绝对路径 / 项目名 / 用户名 / 资产正文一律不进。
 * 调用点写 payload 前请对照 FR-6.3 自查，§7-d 有对 `payload_json` 的绝对路径与用户名模式扫描兜底。
 */

export type LedgerWriter = (input: LocalEventInput) => void

export interface LedgerDeps {
  db: SqliteDatabase
  /** 时钟注入点（缺省隐式 `new Date()`），与 `buildApp({ now })` 同源 */
  now?: () => Date
  /** 已在别处置好的 writer；缺省按上面说明现场构造 */
  ledger?: LedgerWriter
}

/** 资产类 kind 的 `subject_type` 闭集（FR-6.3「只放枚举值」的落法） */
export const ASSET_SUBJECT_TYPES = ['prompt', 'skill', 'term', 'playbook', 'flow_template'] as const
export type AssetSubjectType = (typeof ASSET_SUBJECT_TYPES)[number]

export function resolveLedger(deps: LedgerDeps): LedgerWriter {
  if (deps.ledger) return deps.ledger
  const repo = new LocalEventsRepo(deps.db)
  const now = deps.now ?? ((): Date => new Date())
  return (input: LocalEventInput): void => {
    repo.record(input, now())
  }
}

/**
 * `asset_created` / `asset_updated` 的统一 payload。
 *
 * `origin` 恒为 `'user'` 是**判定一次**的结果（§6.3：写入时判，不留给读取时跨五表反推）：
 * 这五个 POST 端点全是用户手工动作；seed 通道走 `seed:check` / `/api/settings/reseed`，
 * **不经由这些端点**，故 seed 资产永远不会记成用户行为 —— 这正是 growth-path F2
 * 「`asset_created` 且 `source != seed`」要的方向：**宁可少记不可虚高**。
 */
export function assetEventInput(
  kind: 'asset_created' | 'asset_updated',
  assetType: AssetSubjectType,
  assetId: string,
): LocalEventInput {
  return {
    kind,
    subjectType: assetType,
    subjectId: assetId,
    payload: { assetType, origin: 'user' },
  }
}
