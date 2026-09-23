import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PacksRepo,
  bundleJson,
  directoryFiles,
  type SqliteDatabase,
} from '@openvibe/core'
import {
  ADAPTER_IDS,
  PACK_FILE_MANIFEST,
  type AdapterId,
  type PackOut,
  type PackSelection,
} from '@openvibe/shared'
import { renderPack } from './pack-assemble'
import { packExportDir, writeDirectoryExport } from './pack-export'

/**
 * 预置演示标准包（onboarding FR-1，T8b）。
 * 选集口径「种子且未被人改」= `seed_hash IS NOT NULL`：条目被用户编辑过时 repos 会把
 * seed_hash 置空，因此改过的内容不会被预置包重新吞回去。
 * 六个 adapter 全开（D7+D9）；导出登记走 m6a 正常通道，形成导出历史。
 */

export const DEFAULT_PACK_NAME = 'default'
export const DEFAULT_PACK_VERSION = '1.0.0'
export const DEFAULT_PACK_DESCRIPTION =
  '开箱演示包：种子术语 + 精选提示词 + 个人轻量流模板，六个 adapter 全开（onboarding FR-1）'
/** FR-1.1 指定的流程模板名；缺失即视为种子未就绪 */
export const DEFAULT_PACK_FLOW = '个人轻量流'

export type DefaultPackStatus = 'created' | 'exists' | 'skipped' | 'failed'

export interface DefaultPackOutcome {
  status: DefaultPackStatus
  packId: string | null
  /** 本轮是否真的建了包/登了导（D-3：只有缺失才重建） */
  rebuilt: boolean
  version: string | null
  directoryPath: string | null
  /** 人读文案：skipped/failed 时给原因，bootstrap 折叠进 warnings */
  reason: string | null
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

const sortedIds = (ids: readonly string[]): string[] => [...ids].sort()
const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  JSON.stringify(sortedIds(a)) === JSON.stringify(sortedIds(b))

const sameSelection = (a: PackSelection, b: PackSelection): boolean =>
  sameList(a.promptIds, b.promptIds) &&
  sameList(a.termIds, b.termIds) &&
  sameList(a.skillIds, b.skillIds) &&
  sameList(a.playbookIds, b.playbookIds) &&
  a.flowTemplateId === b.flowTemplateId

/** 种子行（未被用户改过）的 id 升序集合 */
function seedIds(db: SqliteDatabase, table: string): string[] {
  const rows = db.prepare(`SELECT id FROM ${table} WHERE seed_hash IS NOT NULL`).all() as {
    id: string
  }[]
  return sortedIds(rows.map((r) => r.id))
}

export interface SeedSelection extends PackSelection {
  flowTemplateName: string
}

/** 种子未就绪（缺术语 / 缺提示词 / 缺「个人轻量流」）时返回 null，调用方按失败降级 */
export function seedSelection(db: SqliteDatabase): SeedSelection | null {
  const promptIds = seedIds(db, 'prompts')
  const termIds = seedIds(db, 'terms')
  const flow = db
    .prepare('SELECT id FROM flow_templates WHERE name = ?')
    .get(DEFAULT_PACK_FLOW) as { id: string } | undefined
  if (promptIds.length === 0 || termIds.length === 0 || !flow) return null
  return {
    promptIds,
    termIds,
    skillIds: [],
    playbookIds: [],
    flowTemplateId: flow.id,
    flowTemplateName: DEFAULT_PACK_FLOW,
  }
}

/** 同版本导出目录不可覆盖（design §7.1），新建包最多向前找几个补丁号 */
const VERSION_PROBES = 5

/** 导出目录里 manifest 归属的包 id；目录不存在/读不到即「无人占用」 */
function exportDirOwner(dir: string): string | null {
  try {
    const raw = JSON.parse(
      readFileSync(join(dir, PACK_FILE_MANIFEST), 'utf8'),
    ) as { pack?: { id?: unknown } }
    return typeof raw.pack?.id === 'string' ? raw.pack.id : null
  } catch {
    return null
  }
}

function nextPatch(version: string): string {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!parts) return version
  return `${parts[1]}.${parts[2]}.${Number(parts[3]) + 1}`
}

/**
 * 第一个可写版本号：目录不存在、或 manifest 已属于本包（幂等重写）即可用；
 * 被别的包占用（典型场景是「删掉 default 包后重建」，旧目录仍留着已发布的 1.0.0）则顺延补丁号。
 * 这不是给改过的包自动升版（D-3 禁止的是那条），而是不与既成不可变产物相撞。
 */
function freeVersion(name: string, packId: string): string | null {
  let version = DEFAULT_PACK_VERSION
  for (let i = 0; i < VERSION_PROBES; i += 1) {
    const owner = exportDirOwner(packExportDir(name, version))
    if (owner === null || owner === packId) return version
    version = nextPatch(version)
  }
  return null
}

/** 与 routes/packs.ts 的 export 同源；exportedAt 取 pack.updatedAt 以保证同一定义渲染字节一致 */
function registerDirectoryExport(db: SqliteDatabase, pack: PackOut, version: string): string {
  const rendered = renderPack(db, pack, version, pack.updatedAt)
  const directoryPath = packExportDir(pack.name, version)
  writeDirectoryExport(directoryPath, directoryFiles(rendered))
  new PacksRepo(db).recordExport({
    packId: pack.id,
    version,
    fingerprint: rendered.fingerprint,
    manifestJson: rendered.manifestJson,
    bundleJson: bundleJson(rendered),
    channel: 'directory',
  })
  return directoryPath
}

/**
 * 幂等确保 default 包在位（dev-plan §4.3 步骤 5，也是设置页「重建预置包」的同一实现）。
 * D-3 裁定：只在缺失时组装；在位但选集/目标不同判为「用户已修改」并跳过，绝不自动改包定义。
 */
export function ensureDefaultPack(db: SqliteDatabase): DefaultPackOutcome {
  const packs = new PacksRepo(db)

  /** 建包与补登记共用：挑一个不与不可变产物相撞的版本号写出目录并登记 */
  const register = (pack: PackOut): DefaultPackOutcome => {
    const version = freeVersion(pack.name, pack.id)
    if (!version) {
      return {
        status: 'failed',
        packId: pack.id,
        rebuilt: false,
        version: null,
        directoryPath: null,
        reason: `${pack.name}@${DEFAULT_PACK_VERSION} 起的 ${VERSION_PROBES} 个版本目录已被其它包占用，未覆盖`,
      }
    }
    try {
      return {
        status: 'created',
        packId: pack.id,
        rebuilt: true,
        version,
        directoryPath: registerDirectoryExport(db, pack, version),
        reason: null,
      }
    } catch (e) {
      return {
        status: 'failed',
        packId: pack.id,
        rebuilt: false,
        version: null,
        directoryPath: null,
        reason: `导出登记失败：${message(e)}`,
      }
    }
  }

  const selection = seedSelection(db)
  if (!selection) {
    return {
      status: 'failed',
      packId: null,
      rebuilt: false,
      version: null,
      directoryPath: null,
      reason: '种子未就绪（缺术语/提示词/个人轻量流模板），跳过预置包组装',
    }
  }
  const targets = [...ADAPTER_IDS] as AdapterId[]
  const existing = packs.getByName(DEFAULT_PACK_NAME)

  if (existing) {
    if (!sameSelection(existing.selection, selection) || !sameList(existing.targets, targets)) {
      return {
        status: 'skipped',
        packId: existing.id,
        rebuilt: false,
        version: packs.latestExport(existing.id)?.version ?? null,
        directoryPath: null,
        reason: '用户已修改',
      }
    }
    const exportRow = packs.latestExport(existing.id)
    if (exportRow) {
      return {
        status: 'exists',
        packId: existing.id,
        rebuilt: false,
        version: exportRow.version,
        directoryPath: packExportDir(existing.name, exportRow.version),
        reason: null,
      }
    }
    // 选集一致却从未导出登记（用户删掉过导出历史）：只补登记，不碰包定义
    return register(existing)
  }

  let pack: PackOut
  try {
    pack = packs.create({
      name: DEFAULT_PACK_NAME,
      description: DEFAULT_PACK_DESCRIPTION,
      selection: {
        promptIds: selection.promptIds,
        termIds: selection.termIds,
        skillIds: selection.skillIds,
        playbookIds: selection.playbookIds,
        flowTemplateId: selection.flowTemplateId,
      },
      targets,
    })
  } catch (e) {
    return {
      status: 'failed',
      packId: null,
      rebuilt: false,
      version: null,
      directoryPath: null,
      reason: `预置包创建失败：${message(e)}`,
    }
  }
  return register(pack)
}
