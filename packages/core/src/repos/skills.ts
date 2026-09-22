import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type SkillCreateInput,
  type SkillOut,
  type SkillScanReport,
  type SkillVersionOut,
} from '@openvibe/shared'
import { parseJsonColumn, sha256Hex } from './util'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

type SkillRow = {
  id: string
  name: string
  description: string
  source: string
  skill_dir: string | null
  latest_version_id: string | null
  installed_targets: string
  created_at: string
  updated_at: string
}

function rowToSkill(row: SkillRow): SkillOut {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source as SkillOut['source'],
    skillDir: row.skill_dir,
    latestVersionId: row.latest_version_id,
    installedTargets: parseJsonColumn<string[]>(row.installed_targets, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const IGNORED_FILES = new Set(['.DS_Store'])
const IGNORED_DIRS = new Set(['node_modules'])

/** 目录指纹（m2 FR-1.3）：按相对路径排序，逐文件 sha256，拼接 `${rel}:${hash}\n` 后整体 sha256 */
export function computeDirHash(dir: string): { dirHash: string; fileCount: number } {
  const entries: { rel: string; hash: string }[] = []
  const walk = (current: string, prefix: string) => {
    for (const name of readdirSync(current).sort()) {
      if (IGNORED_FILES.has(name) || IGNORED_DIRS.has(name)) continue
      const abs = join(current, name)
      const rel = prefix === '' ? name : `${prefix}/${name}`
      const st = statSync(abs)
      if (st.isDirectory()) {
        walk(abs, rel)
      } else {
        const hash = createHash('sha256').update(readFileSync(abs)).digest('hex')
        entries.push({ rel, hash })
      }
    }
  }
  walk(dir, '')
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const payload = entries.map((e) => `${e.rel}:${e.hash}\n`).join('')
  return { dirHash: sha256Hex(payload), fileCount: entries.length }
}

/** SKILL.md YAML frontmatter 单行 name/description 容错解析（m2 FR-1.2） */
export function parseSkillFrontmatter(
  content: string,
): { name?: string; description?: string; ok: boolean } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match || !match[1]) return { ok: false }
  const yaml = match[1] ?? ''
  let name: string | undefined
  let description: string | undefined
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!m) continue
    if (m[1] === 'name' && m[2]) name = m[2].trim()
    if (m[1] === 'description') description = (m[2] ?? '').trim()
  }
  return { name, description, ok: name !== undefined }
}

export function defaultScanRoots(): string[] {
  return [join(homedir(), '.claude', 'skills'), join(process.cwd(), '.claude', 'skills')]
}

export class SkillsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  /** 扫描发现（m2 FR-1）：根目录一层子目录含 SKILL.md 者；同名同指纹跳过、指纹变化追加版本 */
  scan(roots?: string[]): SkillScanReport {
    const report: SkillScanReport = { discovered: 0, created: 0, updated: 0, skipped: 0, warnings: [] }
    for (const root of roots ?? defaultScanRoots()) {
      let dirs: string[]
      try {
        dirs = readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .filter((d) => statSync(join(root, d.name)).isDirectory())
          .map((d) => d.name)
      } catch {
        report.warnings.push(`扫描根不存在或不可读，跳过: ${root}`)
        continue
      }
      for (const dirName of dirs) {
        const skillDir = join(root, dirName)
        let skillMd: string
        try {
          skillMd = readFileSync(join(skillDir, 'SKILL.md'), 'utf8')
        } catch {
          continue // 无 SKILL.md → 不是 skill（m2 FR-1.1）
        }
        report.discovered += 1
        const fm = parseSkillFrontmatter(skillMd)
        const name = fm.name ?? dirName
        if (!fm.ok) report.warnings.push(`SKILL.md frontmatter 缺失/非法，name 回退目录名: ${name}`)
        const { dirHash, fileCount } = computeDirHash(skillDir)
        const existing = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(name) as
          | SkillRow
          | { id: string; latest_version_id: string | null; source: string; skill_dir: string | null; description: string }
          | undefined

        if (!existing) {
          const id = newId('skill')
          const ts = nowIso()
          this.db.transaction(() => {
            this.db
              .prepare(
                `INSERT INTO skills (id, name, description, source, skill_dir, latest_version_id,
                   installed_targets, created_at, updated_at)
                 VALUES (?, ?, ?, 'local', ?, NULL, '[]', ?, ?)`,
              )
              .run(id, name, fm.description ?? '', skillDir, ts, ts)
            const versionId = newId('skillVersion')
            this.db
              .prepare(
                `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              )
              .run(versionId, id, dirName, dirHash, fileCount, ts)
            this.db
              .prepare('UPDATE skills SET latest_version_id = ? WHERE id = ?')
              .run(versionId, id)
          })()
          report.created += 1
          continue
        }

        const dupVersion = this.db
          .prepare('SELECT id FROM skill_versions WHERE skill_id = ? AND dir_hash = ?')
          .get(existing.id, dirHash) as { id: string } | undefined
        if (dupVersion) {
          // 指纹未变；顺手刷新描述与目录（信息字段）
          this.db
            .prepare('UPDATE skills SET description = ?, skill_dir = ?, updated_at = ? WHERE id = ?')
            .run(fm.description ?? '', skillDir, nowIso(), existing.id)
          report.skipped += 1
          continue
        }
        const versionId = newId('skillVersion')
        const ts = nowIso()
        this.db.transaction(() => {
          this.db
            .prepare(
              `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
            .run(versionId, existing.id, dirName, dirHash, fileCount, ts)
          this.db
            .prepare(
              'UPDATE skills SET latest_version_id = ?, description = ?, skill_dir = ?, updated_at = ? WHERE id = ?',
            )
            .run(versionId, fm.description ?? '', skillDir, ts, existing.id)
        })()
        report.updated += 1
      }
    }
    return report
  }

  create(input: SkillCreateInput): SkillOut {
    const existing = this.db.prepare('SELECT id FROM skills WHERE name = ?').get(input.name) as
      | { id: string }
      | undefined
    if (existing) throw new AppError('NAME_CONFLICT', `同名 skill 已存在: ${input.name}`)
    if (input.source === 'local' && !input.skillDir) {
      throw new AppError('VALIDATION_ERROR', 'local 源必须提供 skillDir（m2 §3）')
    }
    const id = newId('skill')
    const ts = nowIso()
    // 手动登记即为首版本（m2 §3 versionLabel「无则 v1」）：无目录指纹，dirHash 留空串。
    // §7.4 要求「同名目录再扫 → 该手动条目 versions=2」，没有这一行就永远只涨到 1。
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO skills (id, name, description, source, skill_dir, latest_version_id,
             installed_targets, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
        )
        .run(
          id,
          input.name,
          input.description ?? '',
          input.source ?? 'manual',
          input.skillDir ?? null,
          JSON.stringify(input.installedTargets ?? []),
          ts,
          ts,
        )
      const versionId = newId('skillVersion')
      this.db
        .prepare(
          `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
           VALUES (?, ?, 'v1', '', 0, ?)`,
        )
        .run(versionId, id, ts)
      this.db
        .prepare('UPDATE skills SET latest_version_id = ? WHERE id = ?')
        .run(versionId, id)
    })()
    const skill = this.get(id)
    if (!skill) throw new AppError('INTERNAL', '创建后读取失败')
    return skill
  }

  update(id: string, patch: { description?: string; installedTargets?: string[] }): SkillOut {
    const existing = this.get(id)
    if (!existing) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    this.db
      .prepare('UPDATE skills SET description=?, installed_targets=?, updated_at=? WHERE id=?')
      .run(
        patch.description ?? existing.description,
        JSON.stringify(patch.installedTargets ?? existing.installedTargets),
        nowIso(),
        id,
      )
    const skill = this.get(id)
    if (!skill) throw new AppError('INTERNAL', '更新后读取失败')
    return skill
  }

  delete(id: string): void {
    const info = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id)
    if (info.changes === 0) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
  }

  get(id: string): SkillOut | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as
      | SkillRow
      | undefined
    return row ? rowToSkill(row) : null
  }

  list(): SkillOut[] {
    const rows = this.db.prepare('SELECT * FROM skills ORDER BY name ASC, id ASC').all() as SkillRow[]
    return rows.map(rowToSkill)
  }

  versions(skillId: string): SkillVersionOut[] {
    // scanned_at 只到毫秒，同一次扫描/登记常落在同一毫秒；随机 id 兜底会让顺序变成抛硬币，故用 rowid（= 落库序）
    const rows = this.db
      .prepare(
        `SELECT sv.*, s.name FROM skill_versions sv JOIN skills s ON s.id = sv.skill_id
          WHERE sv.skill_id = ? ORDER BY sv.scanned_at ASC, sv.rowid ASC`,
      )
      .all(skillId) as {
      id: string
      skill_id: string
      version_label: string
      dir_hash: string
      file_count: number
      scanned_at: string
    }[]
    return rows.map((r) => ({
      id: r.id,
      skillId: r.skill_id,
      versionLabel: r.version_label,
      dirHash: r.dir_hash,
      fileCount: r.file_count,
      scannedAt: r.scanned_at,
    }))
  }
}
