import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type DevLogCreateInput,
  type DevLogEvidence,
  type DevLogOut,
} from '@openvibe/shared'
import { parseJsonColumn } from './util'

type LogRow = {
  id: string
  project_id: string
  type: string
  entry_no: number
  title: string
  body: string
  related_files: string
  evidence: string | null
  linked_asset_ids: string
  created_at: string
}

function padEntryNo(no: number): string {
  return no > 9999 ? String(no) : String(no).padStart(4, '0')
}

function rowToLog(row: LogRow): DevLogOut {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as DevLogOut['type'],
    entryNo: row.entry_no,
    displayNo: `${row.type}-${padEntryNo(row.entry_no)}`,
    title: row.title,
    body: row.body,
    relatedFiles: parseJsonColumn<string[]>(row.related_files, []),
    evidence: row.evidence ? (JSON.parse(row.evidence) as DevLogEvidence) : null,
    linkedAssetIds: parseJsonColumn<string[]>(row.linked_asset_ids, []),
    createdAt: row.created_at,
  }
}

export class DevLogRepo {
  constructor(private readonly db: SqliteDatabase) {}

  /** entryNo 事务分配（同项目同类型 max+1，UNIQUE 冲突重试一次，dev-plan §2.6） */
  create(projectId: string, input: DevLogCreateInput): DevLogOut {
    const assign = this.db.transaction(() => {
      const row = this.db
        .prepare(
          'SELECT MAX(entry_no) AS n FROM dev_log_entries WHERE project_id = ? AND type = ?',
        )
        .get(projectId, input.type) as { n: number | null }
      return (row.n ?? 0) + 1
    })

    const id = newId('devLog')
    const ts = nowIso()
    const insert = this.db.transaction((entryNo: number) => {
      this.db
        .prepare(
          `INSERT INTO dev_log_entries (id, project_id, type, entry_no, title, body,
             related_files, evidence, linked_asset_ids, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
        )
        .run(
          id,
          projectId,
          input.type,
          entryNo,
          input.title ?? '',
          input.body ?? '',
          JSON.stringify(input.relatedFiles ?? []),
          input.evidence ? JSON.stringify(input.evidence) : null,
          ts,
        )
    })

    let firstError: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        insert(assign())
        firstError = undefined
        break
      } catch (err) {
        firstError = err
      }
    }
    if (firstError !== undefined) throw firstError

    const log = this.get(id)
    if (!log) throw new AppError('INTERNAL', '创建后读取失败')
    return log
  }

  get(id: string): DevLogOut | null {
    const row = this.db.prepare('SELECT * FROM dev_log_entries WHERE id = ?').get(id) as
      | LogRow
      | undefined
    return row ? rowToLog(row) : null
  }

  list(projectId: string, type?: DevLogCreateInput['type']): DevLogOut[] {
    const rows = type
      ? (this.db
          .prepare(
            'SELECT * FROM dev_log_entries WHERE project_id = ? AND type = ? ORDER BY entry_no DESC',
          )
          .all(projectId, type) as LogRow[])
      : (this.db
          .prepare(
            'SELECT * FROM dev_log_entries WHERE project_id = ? ORDER BY created_at DESC, entry_no DESC',
          )
          .all(projectId) as LogRow[])
    return rows.map(rowToLog)
  }

  /** 回流反链：linkedAssetIds 追加（幂等） */
  linkAsset(entryId: string, assetId: string): void {
    const log = this.get(entryId)
    if (!log) throw new AppError('NOT_FOUND', `日志不存在: ${entryId}`)
    if (log.linkedAssetIds.includes(assetId)) return
    this.db
      .prepare('UPDATE dev_log_entries SET linked_asset_ids = ? WHERE id = ?')
      .run(JSON.stringify([...log.linkedAssetIds, assetId]), entryId)
  }

  /** 导出单类型合并 Markdown（DEV_LOG.md / CHECK_LOG.md，编号有序，m5 FR-5.4） */
  export(projectId: string, type: DevLogCreateInput['type']): string {
    const entries = this.list(projectId, type)
      .slice()
      .sort((a, b) => a.entryNo - b.entryNo)
    const lines: string[] = [`# ${type === 'DEV' ? 'DEV_LOG' : 'CHECK_LOG'}`, '']
    for (const e of entries) {
      lines.push(`## ${e.displayNo}${e.title ? ` · ${e.title}` : ''}`, '')
      if (e.relatedFiles.length > 0) {
        lines.push(`- 关联文件: ${e.relatedFiles.join('、')}`)
      }
      if (e.body) lines.push('', e.body)
      if (e.evidence) {
        lines.push('', `- 测试命令: \`${e.evidence.command}\``, `- 结果: ${e.evidence.resultSummary}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }
}
