import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  extractVariables,
  newId,
  type PromptCreateInput,
  type PromptImportItem,
  type PromptOut,
  type PromptQuery,
  type PromptUpdateInput,
  type PromptVersionOut,
} from '@openvibe/shared'
import { parseJsonColumn, sha256Hex } from './util'
import { searchPromptRowids } from '../search/fts'

type PromptRow = {
  id: string
  title: string
  description: string
  content: string
  content_hash: string
  variables: string
  tags: string
  folder_path: string
  platform_marks: string
  use_as: string
  status: string
  seed_hash: string | null
  created_at: string
  updated_at: string
}

function rowToPrompt(row: PromptRow): PromptOut {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content,
    contentHash: row.content_hash,
    variables: parseJsonColumn<string[]>(row.variables, []),
    tags: parseJsonColumn<string[]>(row.tags, []),
    folderPath: row.folder_path,
    platformMarks: parseJsonColumn<string[]>(row.platform_marks, []) as PromptOut['platformMarks'],
    useAs: row.use_as as PromptOut['useAs'],
    status: row.status as PromptOut['status'],
    seedHash: row.seed_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const RULE_VARIABLE_WARNING = '规则类提示词含 {{变量}}，注入后不会自动填充（m1 FR-2.4）'

function warningsFor(content: string, useAs: string | undefined): string[] {
  return useAs === 'rule' && /\{\{/.test(content) ? [RULE_VARIABLE_WARNING] : []
}

export class PromptsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  create(input: PromptCreateInput): { prompt: PromptOut; warnings: string[] } {
    const id = newId('prompt')
    const content = input.content
    const contentHash = sha256Hex(content)
    const variables = extractVariables(content)
    const useAs = input.useAs ?? 'reference'
    const ts = nowIso()
    const insert = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO prompts (id, title, description, content, content_hash, variables, tags,
             folder_path, platform_marks, use_as, status, seed_hash, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          id,
          input.title,
          input.description ?? '',
          content,
          contentHash,
          JSON.stringify(variables),
          JSON.stringify(input.tags ?? []),
          input.folderPath ?? '/',
          JSON.stringify(input.platformMarks ?? []),
          useAs,
          input.status ?? 'draft',
          ts,
          ts,
        )
      this.insertVersion(id, 1, content, contentHash, '')
    })
    insert()
    const prompt = this.get(id)
    if (!prompt) throw new AppError('INTERNAL', '创建后读取失败')
    return { prompt, warnings: warningsFor(content, useAs) }
  }

  update(
    id: string,
    patch: PromptUpdateInput,
  ): { prompt: PromptOut; versionCreated: PromptVersionOut | null; warnings: string[] } {
    const existing = this.db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as
      PromptRow | undefined
    if (!existing) throw new AppError('NOT_FOUND', `提示词不存在: ${id}`)

    const next = {
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      content: patch.content ?? existing.content,
      tags: patch.tags ?? parseJsonColumn<string[]>(existing.tags, []),
      folderPath: patch.folderPath ?? existing.folder_path,
      platformMarks: patch.platformMarks ?? parseJsonColumn<string[]>(existing.platform_marks, []),
      useAs: patch.useAs ?? (existing.use_as as PromptCreateInput['useAs']),
      status: patch.status ?? (existing.status as PromptCreateInput['status']),
    }
    const nextHash = sha256Hex(next.content)
    const contentChanged = nextHash !== existing.content_hash
    const nextVariables = contentChanged
      ? extractVariables(next.content)
      : parseJsonColumn<string[]>(existing.variables, [])
    const ts = nowIso()

    let versionCreated: PromptVersionOut | null = null
    const run = this.db.transaction(() => {
      if (contentChanged) {
        const versionNo =
          (
            this.db
              .prepare('SELECT MAX(version_no) AS n FROM prompt_versions WHERE prompt_id = ?')
              .get(id) as { n: number | null }
          ).n ?? 0
        versionCreated = this.insertVersion(id, versionNo + 1, next.content, nextHash, '')
      }
      this.db
        .prepare(
          `UPDATE prompts SET title=?, description=?, content=?, content_hash=?, variables=?,
             tags=?, folder_path=?, platform_marks=?, use_as=?, status=?, seed_hash=NULL, updated_at=? WHERE id=?`,
        )
        .run(
          next.title,
          next.description,
          next.content,
          nextHash,
          JSON.stringify(nextVariables),
          JSON.stringify(next.tags),
          next.folderPath,
          JSON.stringify(next.platformMarks),
          next.useAs,
          next.status,
          ts,
          id,
        )
    })
    run()

    const prompt = this.get(id)
    if (!prompt) throw new AppError('INTERNAL', '更新后读取失败')
    return {
      prompt,
      versionCreated,
      warnings: warningsFor(next.content, next.useAs),
    }
  }

  delete(id: string): void {
    const info = this.db.prepare('DELETE FROM prompts WHERE id = ?').run(id)
    if (info.changes === 0) throw new AppError('NOT_FOUND', `提示词不存在: ${id}`)
  }

  get(id: string): PromptOut | null {
    const row = this.db.prepare('SELECT * FROM prompts WHERE id = ?').get(id) as
      PromptRow | undefined
    return row ? rowToPrompt(row) : null
  }

  list(query: PromptQuery): { items: PromptOut[]; total: number; page: number } {
    const where: string[] = []
    const params: unknown[] = []
    if (query.status) {
      where.push('status = ?')
      params.push(query.status)
    }
    if (query.folder) {
      where.push('folder_path = ?')
      params.push(query.folder)
    }
    if (query.tag) {
      where.push('EXISTS (SELECT 1 FROM json_each(prompts.tags) WHERE value = ?)')
      params.push(query.tag)
    }
    if (query.platform) {
      where.push('EXISTS (SELECT 1 FROM json_each(prompts.platform_marks) WHERE value = ?)')
      params.push(query.platform)
    }

    let orderedIds: string[] | null = null
    if (query.q !== undefined && query.q !== '') {
      orderedIds = this.idsBySearch(query.q, where, params)
    }

    if (orderedIds !== null) {
      if (orderedIds.length === 0) return { items: [], total: 0, page: query.page }
      const total = orderedIds.length
      const pageIds = orderedIds.slice((query.page - 1) * query.size, query.page * query.size)
      const placeholders = pageIds.map(() => '?').join(',')
      const rows = this.db
        .prepare(`SELECT * FROM prompts WHERE id IN (${placeholders})`)
        .all(...pageIds) as PromptRow[]
      const byId = new Map(rows.map((r) => [r.id, rowToPrompt(r)]))
      const items = pageIds
        .map((pid) => byId.get(pid))
        .filter((p): p is PromptOut => p !== undefined)
      return { items, total, page: query.page }
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM prompts ${whereSql}`).get(...params) as {
        c: number
      }
    ).c
    const rows = this.db
      .prepare(`SELECT * FROM prompts ${whereSql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`)
      .all(...params, query.size, (query.page - 1) * query.size) as PromptRow[]
    return { items: rows.map(rowToPrompt), total, page: query.page }
  }

  private idsBySearch(q: string, where: string[], params: unknown[]): string[] {
    const rowids = searchPromptRowids(this.db, q)
    if (rowids.length === 0) return []
    const placeholders = rowids.map(() => '?').join(',')
    const whereSql = where.length > 0 ? `AND ${where.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT id FROM prompts WHERE rowid IN (${placeholders}) ${whereSql}`)
      .all(...rowids, ...params) as { id: string }[]
    if (rows.length === 0) return []
    const found = new Set(rows.map((r) => r.id))
    // 保持搜索排序（FTS 走 rank，LIKE 走 updatedAt）
    const orderedRows = this.db
      .prepare(
        `SELECT id, rowid AS rid FROM prompts WHERE id IN (${[...found].map(() => '?').join(',')})`,
      )
      .all(...found) as { id: string; rid: number }[]
    const rowidToId = new Map(orderedRows.map((r) => [r.rid, r.id]))
    return rowids.map((rid) => rowidToId.get(rid)).filter((x): x is string => x !== undefined)
  }

  versions(promptId: string): PromptVersionOut[] {
    const rows = this.db
      .prepare('SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version_no ASC')
      .all(promptId) as {
      id: string
      prompt_id: string
      version_no: number
      content: string
      content_hash: string
      changelog: string
      created_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      promptId: r.prompt_id,
      versionNo: r.version_no,
      content: r.content,
      contentHash: r.content_hash,
      changelog: r.changelog,
      createdAt: r.created_at,
    }))
  }

  /** 回滚 = 以旧版 content 创建新版本（从不改写既有版本，m1 FR-4.3） */
  restore(promptId: string, versionNo: number): { prompt: PromptOut; newVersionNo: number } {
    const version = this.db
      .prepare('SELECT * FROM prompt_versions WHERE prompt_id = ? AND version_no = ?')
      .get(promptId, versionNo) as { content: string; content_hash: string } | undefined
    if (!version) throw new AppError('NOT_FOUND', `版本不存在: v${versionNo}`)

    const result = this.update(promptId, { content: version.content })
    // update 已创建 versionCreated；补写 changelog
    this.db
      .prepare('UPDATE prompt_versions SET changelog = ? WHERE prompt_id = ? AND version_no = ?')
      .run(`回滚自 v${versionNo}`, promptId, result.versionCreated?.versionNo ?? 0)
    return { prompt: result.prompt, newVersionNo: result.versionCreated?.versionNo ?? 0 }
  }

  importBatch(items: PromptImportItem[]): {
    created: string[]
    skipped: { title: string; reason: string }[]
  } {
    const created: string[] = []
    const skipped: { title: string; reason: string }[] = []
    for (const item of items) {
      const hash = sha256Hex(item.content)
      const dup = this.db
        .prepare('SELECT id FROM prompts WHERE title = ? AND content_hash = ?')
        .get(item.title, hash) as { id: string } | undefined
      if (dup) {
        skipped.push({ title: item.title, reason: '重复（title + contentHash 一致）' })
        continue
      }
      const { prompt } = this.create(item)
      // 导出回导保留原时间戳（m1 §7.5 再导字节级一致）
      if (item.createdAt !== undefined || item.updatedAt !== undefined) {
        this.db
          .prepare(
            'UPDATE prompts SET created_at = COALESCE(?, created_at), updated_at = COALESCE(?, updated_at) WHERE id = ?',
          )
          .run(item.createdAt ?? null, item.updatedAt ?? null, prompt.id)
      }
      created.push(prompt.id)
    }
    return { created, skipped }
  }

  exportAll(query?: Partial<PromptQuery>): PromptOut[] {
    if (!query || Object.keys(query).length === 0) {
      const rows = this.db.prepare('SELECT * FROM prompts ORDER BY title ASC').all() as PromptRow[]
      return rows.map(rowToPrompt)
    }
    const { items } = this.list({ ...query, page: 1, size: query.size ?? 10000 } as PromptQuery)
    return items
  }

  /** seed 通道：写入 seed_hash（种子升级「用户改过则跳过」的判定依据） */
  setSeedHash(id: string, seedHash: string): void {
    this.db.prepare('UPDATE prompts SET seed_hash = ? WHERE id = ?').run(seedHash, id)
  }

  private insertVersion(
    promptId: string,
    versionNo: number,
    content: string,
    contentHash: string,
    changelog: string,
  ): PromptVersionOut {
    const id = newId('promptVersion')
    const ts = nowIso()
    this.db
      .prepare(
        `INSERT INTO prompt_versions (id, prompt_id, version_no, content, content_hash, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, promptId, versionNo, content, contentHash, changelog, ts)
    return {
      id,
      promptId,
      versionNo,
      content,
      contentHash,
      changelog,
      createdAt: ts,
    }
  }
}
