import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  ExportInput,
  InjectionCreateInput,
  PackCreateInput,
  PackUpdateInput,
  SEMVER_RE,
  type PackOut,
} from '@openvibe/shared'
import {
  PacksRepo,
  bundleFileName,
  createPackService,
  nowIso,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { renderPack, toPreviewOut } from '../lib/pack-assemble'
import { packExportDir, writeDirectoryExport } from '../lib/pack-export'

export interface PackRouteDeps {
  db: SqliteDatabase
}

/**
 * 预览版本号：pack 定义不带 version（版本属于导出实例），向导第 5 步才设定，
 * 因此预览允许缺省。缺省值只影响标题与受管标记里的 `<name>@<version>`。
 */
const PreviewBody = z.object({ version: z.string().regex(SEMVER_RE).default('1.0.0') })

/** dev-plan §3.8 + bundle 下载通道（owner 裁定 2026-09-21） */
export function registerPackRoutes(app: FastifyInstance, deps: PackRouteDeps): void {
  const packs = new PacksRepo(deps.db)

  /**
   * 导出编排已迁入 `packService`（service-layer.md FR-3.2）。
   *
   * `renderPack` / `packExportDir` / `writeDirectoryExport` 以**注入**传入而非服务层 import：
   * `pack-assemble.ts:1` 直连 `@openvibe/adapters`，core 若 import 即破 R2（FR-5.1），
   * 故按 FR-5.2 走 deps 注入 —— 最外层这一处是 adapters 的唯一合法 import 点。
   */
  const packService = createPackService({
    db: deps.db,
    now: nowIso,
    renderPack: (pack, version, exportedAt) => renderPack(deps.db, pack, version, exportedAt),
    packExportDir,
    writeDirectoryExport,
  })

  const needPack = (id: string): PackOut => {
    const pack = packs.get(id)
    if (!pack) throw new AppError('NOT_FOUND', `标准包不存在: ${id}`)
    return pack
  }

  app.get('/api/packs', async () => {
    const items = packs.list()
    return { items, total: items.length }
  })

  app.post('/api/packs', async (req, reply) => {
    const input = parseOrThrow(PackCreateInput, req.body)
    return reply.code(201).send(packs.create(input))
  })

  app.get('/api/packs/:id', async (req) => needPack((req.params as { id: string }).id))

  app.patch('/api/packs/:id', async (req) => {
    const { id } = req.params as { id: string }
    return packs.update(id, parseOrThrow(PackUpdateInput, req.body))
  })

  app.delete('/api/packs/:id', async (req, reply) => {
    packs.delete((req.params as { id: string }).id)
    return reply.code(204).send()
  })

  /** 预览即产物：与 export 同一 renderPack；exportedAt 取 updatedAt 保证可重复（§7.1 验收 1） */
  app.post('/api/packs/:id/preview', async (req) => {
    const { id } = req.params as { id: string }
    const pack = needPack(id)
    const { version } = parseOrThrow(PreviewBody, req.body)
    return toPreviewOut(renderPack(deps.db, pack, version, pack.updatedAt))
  })

  app.post('/api/packs/:id/export', async (req) => {
    const { id } = req.params as { id: string }
    const { version, channel } = parseOrThrow(ExportInput, req.body)
    return packService.exportPackWithRecord({ packId: id, version, channel })
  })

  app.get('/api/packs/:id/exports', async (req) => {
    const { id } = req.params as { id: string }
    needPack(id)
    const items = packs.exportsOf(id)
    return { items, total: items.length }
  })

  /** bundle 下载：内容来自库内 bundle_json，删源资产/删目录都不影响（m6a §7.5） */
  app.get('/api/packs/:id/exports/:exportId/bundle', async (req, reply) => {
    const { id, exportId } = req.params as { id: string; exportId: string }
    const row = packs.getExport(id, exportId)
    if (!row) throw new AppError('NOT_FOUND', `导出记录不存在: ${exportId}`)
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header(
        'content-disposition',
        `attachment; filename="${bundleFileName(row.packName, row.version)}"`,
      )
      .header('x-pack-fingerprint', row.fingerprint)
      .send(row.bundleJson)
  })

  app.get('/api/packs/:id/injections', async (req) => {
    const { id } = req.params as { id: string }
    needPack(id)
    const items = packs.listInjections(id)
    return { items, total: items.length }
  })

  /** CLI 上报（m6a FR-5.1 / m6b FR-2.5）；pack 已删除时 packId 传 null 仅留痕 */
  app.post('/api/injections', async (req, reply) => {
    const input = parseOrThrow(InjectionCreateInput, req.body)
    return reply.code(201).send(packs.reportInjection(input))
  })
}
