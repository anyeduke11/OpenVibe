import { AppError, compareSemver, type ExportOut, type PackOut } from '@openvibe/shared'
import type { SqliteDatabase } from '../db'
import { PacksRepo } from '../repos/packs'
import { bundleJson, directoryFiles, type RenderedPack } from '../pack'

/**
 * 标准包服务（service-layer.md FR-1 的 `packService`，owner 2026-10-14 裁① 定下的三个服务之一）。
 *
 * ## 为什么 `renderPack` 是注入而不是 import
 *
 * 渲染实现在 `apps/server/src/lib/pack-assemble.ts`，而它 `:1` 直连 **adapters 包**
 * （`ADAPTER_MAIN_PATH` / `planMainFiles` / `coveredPlatforms`）。**core 若 import 它就破 R2**
 * —— FR-5.1 明写 `packages/core/**` 对 adapters 的命中数必须保持 0，FR-5.3 要求此时**停手回报**。
 *
 * 处置走 FR-5.2 指定的处方：「需要平台产物路径时经 `deps` 注入，形制照 `pack-assemble.ts:39`」。
 * 那里本来就有现成的缝——`export const packAdapters: AdapterBundle = { planMainFiles, coveredPlatforms }`，
 * 也就是说 core 侧本来就只吃注入的 `AdapterBundle`，adapters 的 import 只发生在最外层那一处。
 * 于是把**渲染整体**当外部能力注入，既保 R2，又不重复造那个缝。
 *
 * ⚠️ **本轮没搬的两项，及原因**（不是遗漏，是撞上 R2 的诚实边界）：
 * - **preview**（`routes/packs.ts:69-74`）：`toPreviewOut` → `buildSizeEstimate` 直读 `ADAPTER_MAIN_PATH`，
 *   同样在 adapters 上。要搬得连 `ADAPTER_MAIN_PATH` 一起注入，那是另一笔改动，不夹带；
 * - **CRUD**（list/get/create/update/delete/exportsOf）：FR-3.2 只点名了导出编排这一段，
 *   且 FR-1.1 要「一次用户意图级的入口函数」，把 repo 原样代理 10 个方法反而是反模式。
 *   ⇒ `routes/packs.ts` 的 FR-3.1 命中数**本轮没有下降**（repo 实例仍在，供 CRUD 用），
 *   这不是「已收敛」，如实登记。
 */

export interface PackServiceDeps {
  db: SqliteDatabase
  /** 时间源注入（FR-1.2）。传 `nowIso` 即可；测试传固定值以便断言 `exportedAt`。 */
  now: () => string
  /** 外部能力：组包渲染。**不可**在 core 内 import `pack-assemble`（见上，R2）。 */
  renderPack: (pack: PackOut, version: string, exportedAt: string) => RenderedPack
  /** 外部能力：`channel === 'directory'` 时的落盘目录（绝对路径） */
  packExportDir: (packName: string, version: string) => string
  /** 外部能力：目录导出落盘 */
  writeDirectoryExport: (root: string, artifacts: Record<string, string>) => void
}

export interface ExportWithRecordInput {
  packId: string
  version: string
  channel: 'download' | 'directory'
}

export function createPackService(deps: PackServiceDeps) {
  const packs = new PacksRepo(deps.db)

  function needPack(id: string): PackOut {
    const pack = packs.get(id)
    if (!pack) throw new AppError('NOT_FOUND', `标准包不存在: ${id}`)
    return pack
  }

  /**
   * 导出编排（m6a FR-2.3「预览即产物」的那一半）：版本单调校验 → 组包 →
   * 目录通道落盘 → 记导出记录 → 组出参。
   *
   * **整段从 `apps/server/src/routes/packs.ts:76-121` 迁入**（service-layer.md FR-3.2），
   * 行为零变化：出参形状、错误码、`bundlePath` 拼法、幂等重导语义逐字保持。
   */
  function exportPackWithRecord(input: ExportWithRecordInput): ExportOut {
    const pack = needPack(input.packId)

    const latest = packs.latestExport(input.packId)
    if (latest && compareSemver(input.version, latest.version) < 0) {
      throw new AppError('VALIDATION_ERROR', `新导出版本必须 ≥ ${latest.version}（m6a FR-4.1）`, {
        fieldErrors: { version: [`需 ≥ ${latest.version}，当前 ${input.version}`] },
      })
    }

    // exportedAt 真实时间只进 manifest.pack，不进正文与指纹（design §7.3 零时间戳）
    const rendered = deps.renderPack(pack, input.version, deps.now())
    const directoryPath =
      input.channel === 'directory' ? deps.packExportDir(pack.name, input.version) : null
    if (directoryPath) deps.writeDirectoryExport(directoryPath, directoryFiles(rendered))

    const record = packs.recordExport({
      packId: input.packId,
      version: input.version,
      fingerprint: rendered.fingerprint,
      manifestJson: rendered.manifestJson,
      bundleJson: bundleJson(rendered),
      channel: input.channel,
    })
    // 幂等重导回既有记录（同 pack 同版本只有一行，UNIQUE(pack_id, version)）
    const row = packs.exportByVersion(input.packId, input.version)
    if (!row) throw new AppError('INTERNAL', '导出记录写入后读取失败')

    return {
      status: record.status,
      export: {
        id: row.id,
        packId: row.packId,
        version: row.version,
        fingerprint: row.fingerprint,
        channel: row.channel,
        exportedAt: row.exportedAt,
      },
      directoryPath,
      bundlePath: `/api/packs/${input.packId}/exports/${row.id}/bundle`,
      fingerprint: row.fingerprint,
      warnings: rendered.warnings,
    }
  }

  return { exportPackWithRecord, needPack }
}
