import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type FlowKind,
  type FlowTemplateCreateInput,
  type FlowTemplateOut,
  type Stage,
} from '@openvibe/shared'
import { parseJsonColumn, sha256Hex, stableJson } from './util'

type FlowRow = {
  id: string
  name: string
  kind: string
  stages: string
  builtin: number
  seed_hash: string | null
  created_at: string
  updated_at: string
}

function rowToFlow(row: FlowRow): FlowTemplateOut {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as FlowKind,
    stages: parseJsonColumn<Stage[]>(row.stages, []),
    builtin: row.builtin === 1,
    seedHash: row.seed_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class FlowTemplatesRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: FlowTemplateCreateInput, options: { builtin?: boolean } = {}): FlowTemplateOut {
    const id = newId('flowTemplate')
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO flow_templates (id, name, kind, stages, builtin, seed_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.kind,
        JSON.stringify(input.stages),
        options.builtin ? 1 : 0,
        ts,
        ts,
      )
    const flow = this.get(id)
    if (!flow) throw new AppError('INTERNAL', '创建后读取失败')
    return flow
  }

  update(id: string, patch: { name?: string; stages?: Stage[] }): FlowTemplateOut {
    const existing = this.get(id)
    if (!existing) throw new AppError('NOT_FOUND', `模板不存在: ${id}`)
    if (existing.builtin) {
      throw new AppError('BUILTIN_IMMUTABLE', '内置模板不可编辑（m5 FR-2）')
    }
    this.db
      .prepare('UPDATE flow_templates SET name=?, stages=?, updated_at=? WHERE id=?')
      .run(
        patch.name ?? existing.name,
        JSON.stringify(patch.stages ?? existing.stages),
        nowIso(),
        id,
      )
    const flow = this.get(id)
    if (!flow) throw new AppError('INTERNAL', '更新后读取失败')
    return flow
  }

  delete(id: string): void {
    const existing = this.get(id)
    if (!existing) throw new AppError('NOT_FOUND', `模板不存在: ${id}`)
    if (existing.builtin) {
      throw new AppError('BUILTIN_IMMUTABLE', '内置模板不可删除（m5 FR-2）')
    }
    this.db.prepare('DELETE FROM flow_templates WHERE id = ?').run(id)
  }

  get(id: string): FlowTemplateOut | null {
    const row = this.db
      .prepare('SELECT * FROM flow_templates WHERE id = ?')
      .get(id) as FlowRow | undefined
    return row ? rowToFlow(row) : null
  }

  findByName(name: string): FlowTemplateOut | null {
    const row = this.db
      .prepare('SELECT * FROM flow_templates WHERE name = ?')
      .get(name) as FlowRow | undefined
    return row ? rowToFlow(row) : null
  }

  list(): FlowTemplateOut[] {
    const rows = this.db
      .prepare('SELECT * FROM flow_templates ORDER BY builtin DESC, updated_at DESC')
      .all() as FlowRow[]
    return rows.map(rowToFlow)
  }

  /** 复制为自定义（kind→custom、builtin=0，名称加「副本」并去重，m5 FR-2.2） */
  duplicate(id: string): FlowTemplateOut {
    const source = this.get(id)
    if (!source) throw new AppError('NOT_FOUND', `模板不存在: ${id}`)
    let name = `${source.name} 副本`
    let n = 2
    while (this.findByName(name)) {
      name = `${source.name} 副本${n}`
      n += 1
    }
    return this.create(
      { name, kind: 'custom', stages: source.stages.map((s) => structuredClone(s)) },
    )
  }

  setSeedHash(id: string, seedHash: string): void {
    this.db.prepare('UPDATE flow_templates SET seed_hash = ? WHERE id = ?').run(seedHash, id)
  }

  seedItemHash(item: { name: string; kind: FlowKind; stages: Stage[] }): string {
    return sha256Hex(stableJson(item))
  }
}
