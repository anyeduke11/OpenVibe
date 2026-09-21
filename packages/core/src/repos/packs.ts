import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type PackCreateInput,
  type PackExportOut,
  type PackOut,
  type PackSelection,
  type PackUpdateInput,
} from '@openvibe/shared'
import { parseJsonColumn } from './util'

// preview / export（依赖 T6 的 composer+adapters）在本任务组之后补齐；
// 本文件先落 CRUD、导出历史读取与注入上报（dev-plan §7.1 其余签名）。

type PackRow = {
  id: string
  name: string
  description: string
  selection: string
  targets: string
  created_at: string
  updated_at: string
}

function rowToPack(row: PackRow): PackOut {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    selection: parseJsonColumn<PackSelection>(row.selection, {
      promptIds: [],
      termIds: [],
      skillIds: [],
      playbookIds: [],
      flowTemplateId: null,
    }),
    targets: parseJsonColumn<PackOut['targets']>(row.targets, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PacksRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: PackCreateInput): PackOut {
    const existing = this.db.prepare('SELECT id FROM standard_packs WHERE name = ?').get(input.name) as
      | { id: string }
      | undefined
    if (existing) throw new AppError('NAME_CONFLICT', `包名已存在: ${input.name}`)
    const selection: PackSelection = {
      promptIds: input.selection?.promptIds ?? [],
      termIds: input.selection?.termIds ?? [],
      skillIds: input.selection?.skillIds ?? [],
      playbookIds: input.selection?.playbookIds ?? [],
      flowTemplateId: input.selection?.flowTemplateId ?? null,
    }
    const id = newId('pack')
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO standard_packs (id, name, description, selection, targets, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.description ?? '', JSON.stringify(selection), JSON.stringify(input.targets), ts, ts)
    const pack = this.get(id)
    if (!pack) throw new AppError('INTERNAL', '创建后读取失败')
    return pack
  }

  update(id: string, patch: PackUpdateInput): PackOut {
    const existing = this.get(id)
    if (!existing) throw new AppError('NOT_FOUND', `标准包不存在: ${id}`)
    if (patch.name !== undefined && patch.name !== existing.name) {
      const dup = this.db.prepare('SELECT id FROM standard_packs WHERE name = ?').get(patch.name) as
        | { id: string }
        | undefined
      if (dup) throw new AppError('NAME_CONFLICT', `包名已存在: ${patch.name}`)
    }
    this.db
      .prepare(
        'UPDATE standard_packs SET name=?, description=?, selection=?, targets=?, updated_at=? WHERE id=?',
      )
      .run(
        patch.name ?? existing.name,
        patch.description ?? existing.description,
        JSON.stringify(patch.selection ?? existing.selection),
        JSON.stringify(patch.targets ?? existing.targets),
        nowIso(),
        id,
      )
    const pack = this.get(id)
    if (!pack) throw new AppError('INTERNAL', '更新后读取失败')
    return pack
  }

  delete(id: string): void {
    const info = this.db.prepare('DELETE FROM standard_packs WHERE id = ?').run(id)
    if (info.changes === 0) throw new AppError('NOT_FOUND', `标准包不存在: ${id}`)
  }

  get(id: string): PackOut | null {
    const row = this.db.prepare('SELECT * FROM standard_packs WHERE id = ?').get(id) as
      | PackRow
      | undefined
    return row ? rowToPack(row) : null
  }

  getByName(name: string): PackOut | null {
    const row = this.db.prepare('SELECT * FROM standard_packs WHERE name = ?').get(name) as
      | PackRow
      | undefined
    return row ? rowToPack(row) : null
  }

  list(): PackOut[] {
    const rows = this.db
      .prepare('SELECT * FROM standard_packs ORDER BY updated_at DESC')
      .all() as PackRow[]
    return rows.map(rowToPack)
  }

  /** 注入历史登记（CLI 上报，m6a FR-5）；pack 已删除时仅留痕（pack_id 可空） */
  reportInjection(input: {
    packId: string | null
    packVersion: string | null
    projectPath: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO injections (id, pack_id, pack_version, project_path, injected_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(newId('injection'), input.packId, input.packVersion, input.projectPath, nowIso())
  }

  listInjections(packId?: string): {
    id: string
    packId: string | null
    packVersion: string | null
    projectPath: string
    injectedAt: string
  }[] {
    const rows = (
      packId
        ? this.db
            .prepare('SELECT * FROM injections WHERE pack_id = ? ORDER BY injected_at DESC')
            .all(packId)
        : this.db.prepare('SELECT * FROM injections ORDER BY injected_at DESC').all()
    ) as {
      id: string
      pack_id: string | null
      pack_version: string | null
      project_path: string
      injected_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      packId: r.pack_id,
      packVersion: r.pack_version,
      projectPath: r.project_path,
      injectedAt: r.injected_at,
    }))
  }

  /** 导出历史（preview/export 生成逻辑随 T6 落地；此处为历史读取） */
  exportsOf(packId: string): PackExportOut[] {
    const rows = this.db
      .prepare(
        'SELECT id, pack_id, version, fingerprint, channel, exported_at FROM pack_exports WHERE pack_id = ? ORDER BY exported_at DESC',
      )
      .all(packId) as {
      id: string
      pack_id: string
      version: string
      fingerprint: string
      channel: string
      exported_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      packId: r.pack_id,
      version: r.version,
      fingerprint: r.fingerprint,
      channel: r.channel as PackExportOut['channel'],
      exportedAt: r.exported_at,
    }))
  }

  /** 保存一条不可变导出记录（T6 packs API / 首启预置包经此写入）；同版本同指纹幂等 */
  recordExport(input: {
    packId: string
    version: string
    fingerprint: string
    manifestJson: string
    channel: PackExportOut['channel']
  }): { status: 'created' | 'idempotent' } {
    const existing = this.db
      .prepare('SELECT fingerprint FROM pack_exports WHERE pack_id = ? AND version = ?')
      .get(input.packId, input.version) as { fingerprint: string } | undefined
    if (existing) {
      if (existing.fingerprint === input.fingerprint) return { status: 'idempotent' }
      throw new AppError('VERSION_IMMUTABLE', `${input.version} 已导出且内容已变化，请升版本号`)
    }
    this.db
      .prepare(
        `INSERT INTO pack_exports (id, pack_id, version, fingerprint, manifest_json, channel, exported_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId('packExport'),
        input.packId,
        input.version,
        input.fingerprint,
        input.manifestJson,
        input.channel,
        nowIso(),
      )
    return { status: 'created' }
  }
}
