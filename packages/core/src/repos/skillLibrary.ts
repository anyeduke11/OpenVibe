import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { nowIso } from '../db/runner'
import { AppError } from '@openvibe/shared'
import type { SqliteDatabase } from '../db'

/**
 * **Skill 库**（owner 2026-10-30 裁定「建立 skill 库，独立于其他 agent」）。
 *
 * ## 是什么
 *
 * 一个 OpenVibe 自有的 skill 存放目录 `~/.openvibe/skills/<name>/`，
 * 与任何 agent 的目录**互不影响**。台账每条 skill 至多有一份库内副本（`skills.library_dir`）。
 *
 * ## 为什么需要
 *
 * 扫描登记的 skill 都指着**别的 agent 的目录**（`~/.claude/skills/...`）。
 * 那个 agent 被卸载、升级、被清理时：
 *  - 台账条目指向一个**死路径**（本机实测 455 条里 38 条已如此）；
 *  - skill 的**内容**随之消失 —— 没有任何地方留有副本。
 *
 * 库解决的是后者：备份一份到 OpenVibe 自己的地盘，agent 走了内容还在。
 *
 * ## 边界（明确不做）
 *
 * - **不做多平台分发**：不往 agent 目录写文件、不建 symlink（m2 §2 Out 的「symlink/copy
 *   多平台分发」仍未做）。库是**备份与生命周期管理**的落点，不是分发通道。
 * - **不做自动备份**：备份是用户显式动作。自动备份会在用户没预期时复制几百 MB。
 * - **不改正件**：备份只读原件、原件只读不写。
 */

/** 库根：`~/.openvibe/skills/`（与 `packs/` 同层；`OPENVIBE_HOME` 可覆盖） */
export function skillLibraryRoot(home?: string): string {
  const base = home ?? process.env.OPENVIBE_HOME ?? join(homedir(), '.openvibe')
  return join(base, 'skills')
}

/** 库内某条 skill 的目录：`~/.openvibe/skills/<name>/` */
export function skillLibraryDir(name: string, home?: string): string {
  return join(skillLibraryRoot(home), name)
}

/** 忽略的文件/目录（与扫描侧同一口径：不备份系统噪音） */
const IGNORED_FILES = new Set(['.DS_Store'])
const IGNORED_DIRS = new Set(['node_modules'])

export interface BackupResult {
  /** 副本目录（绝对路径） */
  libraryDir: string
  /** 复制的文件数 */
  fileCount: number
  /** 副本内容的目录指纹（与扫描侧同公式 ⇒ 可跨源判重） */
  dirHash: string
}

/** 目录内的文件相对路径清单（相对路径 → 绝对路径），跳过忽略项 */
function listFiles(dir: string): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = []
  const walk = (current: string, prefix: string): void => {
    for (const name of readdirSync(current).sort()) {
      if (IGNORED_FILES.has(name) || IGNORED_DIRS.has(name)) continue
      const abs = join(current, name)
      const rel = prefix === '' ? name : `${prefix}/${name}`
      if (statSync(abs).isDirectory()) walk(abs, rel)
      else out.push({ rel, abs })
    }
  }
  walk(dir, '')
  return out
}

/** 目录指纹（与 `computeDirHash` 同公式：相对路径排序 + 逐文件 sha256 聚合） */
export function dirHashOf(dir: string): { dirHash: string; fileCount: number } {
  const entries = listFiles(dir).map((f) => ({
    rel: f.rel,
    sha256: createHash('sha256').update(readFileSync(f.abs)).digest('hex'),
  }))
  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const payload = sorted.map((e) => `${e.rel}:${e.sha256}\n`).join('')
  return {
    dirHash: createHash('sha256').update(payload).digest('hex'),
    fileCount: sorted.length,
  }
}

export interface SkillLibraryRepo {
  /** 备份一条 skill 到库；已备份则覆盖副本（幂等） */
  backup(skillId: string): BackupResult
  /** 从库副本恢复到目标目录（默认：原 skill 目录）；返回实际写入的目录与文件数 */
  restore(skillId: string, targetDir?: string): { targetDir: string; fileCount: number }
  /** 移出库：删副本并清空台账列（不动原 skill 目录） */
  remove(skillId: string): void
  /** 批量移出库（清理路径用）：逐条删副本并清空台账列 */
  removeCopies(skillIds: readonly string[]): void
  /** 某条 skill 的库副本是否存在（磁盘实况，不信台账） */
  hasCopy(skillId: string): boolean
}

export class SqliteSkillLibrary implements SkillLibraryRepo {
  constructor(
    private readonly db: SqliteDatabase,
    /**
     * 库根的**父目录**（缺省走 `OPENVIBE_HOME` / `~/.openvibe`）。
     *
     * ⚠️ **刻意不给「库根」而给「父目录」**：库根恒为 `<父目录>/skills`。
     *   若允许直接传库根，调用方就会有两个拼法（有的传父、有的传根）⇒
     *   「副本在不在库内」的判定会分叉 ⇒ 删副本时判成「不在库内」而留下孤儿目录。
     */
    private readonly home?: string,
  ) {}

  private rowOf(
    skillId: string,
  ): { id: string; name: string; skill_dir: string | null } | undefined {
    return this.db.prepare('SELECT id, name, skill_dir FROM skills WHERE id = ?').get(skillId) as
      { id: string; name: string; skill_dir: string | null } | undefined
  }

  backup(skillId: string): BackupResult {
    const row = this.rowOf(skillId)
    if (row === undefined) throw new AppError('NOT_FOUND', `skill 不存在: ${skillId}`)
    const source = row.skill_dir
    if (source === null || !existsSync(source)) {
      throw new AppError('VALIDATION_ERROR', `skill 目录不存在，无法备份: ${row.name}`)
    }
    const target = skillLibraryDir(row.name, this.home)
    // 先清空目标再拷 —— 覆盖语义必须「以本次为准」，否则上一版多出的文件会残留
    if (existsSync(target)) rmSync(target, { recursive: true, force: true })
    mkdirSync(target, { recursive: true })
    for (const f of listFiles(source)) {
      const dest = join(target, f.rel)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(f.abs, dest)
    }
    const { dirHash, fileCount } = dirHashOf(target)
    this.db
      .prepare('UPDATE skills SET library_dir = ?, updated_at = ? WHERE id = ?')
      .run(target, nowIso(), skillId)
    return { libraryDir: target, fileCount, dirHash }
  }

  restore(skillId: string, targetDir?: string): { targetDir: string; fileCount: number } {
    const row = this.rowOf(skillId)
    if (row === undefined) throw new AppError('NOT_FOUND', `skill 不存在: ${skillId}`)
    const libraryDir = this.db
      .prepare('SELECT library_dir FROM skills WHERE id = ?')
      .get(skillId) as { library_dir: string | null } | undefined
    const source = libraryDir?.library_dir ?? null
    if (source === null || !existsSync(source)) {
      throw new AppError('VALIDATION_ERROR', `该 skill 没有库内副本，无法恢复: ${row.name}`)
    }
    const target = targetDir ?? row.skill_dir
    if (target === null || target === '') {
      throw new AppError('VALIDATION_ERROR', `该 skill 没有原始目录，无法确定恢复位置`)
    }
    mkdirSync(target, { recursive: true })
    const files = listFiles(source)
    for (const f of files) {
      const dest = join(target, f.rel)
      mkdirSync(dirname(dest), { recursive: true })
      copyFileSync(f.abs, dest)
    }
    return { targetDir: target, fileCount: files.length }
  }

  remove(skillId: string): void {
    const row = this.rowOf(skillId)
    // ⚠️ **不存在即无事可做**：删台账的调用方会先调本方法，条目不存在不该炸
    if (row === undefined) return
    const dir = this.libraryDirOf(skillId)
    if (dir !== null && existsSync(dir)) {
      // 只删**库内**那一份，绝不碰原 skill 目录（那是别的 agent 的地盘）
      const root = skillLibraryRoot(this.home)
      const rel = relative(root, dir)
      if (!rel.startsWith('..') && !rel.startsWith(sep) && rel !== '') {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    this.db.prepare('UPDATE skills SET library_dir = NULL WHERE id = ?').run(skillId)
  }

  removeCopies(skillIds: readonly string[]): void {
    for (const id of skillIds) this.remove(id)
  }

  /** 台账里记的库副本路径（不判存在性） */
  private libraryDirOf(skillId: string): string | null {
    const row = this.db.prepare('SELECT library_dir FROM skills WHERE id = ?').get(skillId) as
      { library_dir: string | null } | undefined
    return row?.library_dir ?? null
  }

  hasCopy(skillId: string): boolean {
    const libraryDir = this.db
      .prepare('SELECT library_dir FROM skills WHERE id = ?')
      .get(skillId) as { library_dir: string | null } | undefined
    const dir = libraryDir?.library_dir ?? null
    return dir !== null && existsSync(dir)
  }
}
