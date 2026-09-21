import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  AppError,
  ExportInput,
  InjectionCreateInput,
  PackCreateInput,
  PackUpdateInput,
  SEMVER_RE,
  compareSemver,
  type ExportOut,
  type PackOut,
} from '@openvibe/shared'
import {
  PacksRepo,
  bundleFileName,
  bundleJson,
  directoryFileName,
  directoryFiles,
  nowIso,
  openvibeHome,
  sha256Hex,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { renderPack, toPreviewOut } from '../lib/pack-assemble'

export interface PackRouteDeps {
  db: SqliteDatabase
}

/**
 * 预览版本号：pack 定义不带 version（版本属于导出实例），向导第 5 步才设定，
 * 因此预览允许缺省。缺省值只影响标题与受管标记里的 `<name>@<version>`。
 */
const PreviewBody = z.object({ version: z.string().regex(SEMVER_RE).default('1.0.0') })

/** 目录导出根（design §7.1）：`~/.openvibe/packs/<name>@<version>/` */
export function packExportDir(name: string, version: string): string {
  return join(openvibeHome(), 'packs', directoryFileName(name, version))
}

/**
 * 写目录前先比对（m6a §6.5）：同名文件内容不一致说明被手改过，静默覆盖等于丢用户改动
 * → 409；全部一致则幂等重写。路径已由 composePack 内的 validatePackFiles 净化（§7.7）。
 */
function writeDirectoryExport(root: string, artifacts: Record<string, string>): void {
  const entries = Object.entries(artifacts)
  const drifted = entries.filter(
    ([rel, content]) =>
      existsSync(join(root, rel)) &&
      sha256Hex(readFileSync(join(root, rel), 'utf8')) !== sha256Hex(content),
  )
  if (drifted.length > 0) {
    throw new AppError(
      'VERSION_IMMUTABLE',
      `${root} 下同名文件内容与本次导出不一致（本地手改？），未覆盖：${drifted.map(([rel]) => rel).join(', ')}`,
      { fieldErrors: { channel: [`请先移除或备份 ${root} 再导出`] } },
    )
  }
  for (const [rel, content] of entries) {
    const target = join(root, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
}

/** dev-plan §3.8 + bundle 下载通道（owner 裁定 2026-09-21） */
export function registerPackRoutes(app: FastifyInstance, deps: PackRouteDeps): void {
  const packs = new PacksRepo(deps.db)

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
    const pack = needPack(id)
    const { version, channel } = parseOrThrow(ExportInput, req.body)

    const latest = packs.latestExport(id)
    if (latest && compareSemver(version, latest.version) < 0) {
      throw new AppError('VALIDATION_ERROR', `新导出版本必须 ≥ ${latest.version}（m6a FR-4.1）`, {
        fieldErrors: { version: [`需 ≥ ${latest.version}，当前 ${version}`] },
      })
    }

    // exportedAt 真实时间只进 manifest.pack，不进正文与指纹（design §7.3 零时间戳）
    const rendered = renderPack(deps.db, pack, version, nowIso())
    const directoryPath = channel === 'directory' ? packExportDir(pack.name, version) : null
    if (directoryPath) writeDirectoryExport(directoryPath, directoryFiles(rendered))

    const record = packs.recordExport({
      packId: id,
      version,
      fingerprint: rendered.fingerprint,
      manifestJson: rendered.manifestJson,
      bundleJson: bundleJson(rendered),
      channel,
    })
    // 幂等重导回既有记录（同 pack 同版本只有一行，UNIQUE(pack_id, version)）
    const row = packs.exportByVersion(id, version)
    if (!row) throw new AppError('INTERNAL', '导出记录写入后读取失败')

    const result: ExportOut = {
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
      bundlePath: `/api/packs/${id}/exports/${row.id}/bundle`,
      fingerprint: row.fingerprint,
      warnings: rendered.warnings,
    }
    return result
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
