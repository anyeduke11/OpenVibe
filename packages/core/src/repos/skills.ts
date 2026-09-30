import type { SqliteDatabase } from '../db'
import { nowIso } from '../db/runner'
import {
  AppError,
  newId,
  type SkillCreateInput,
  type SkillDuplicatesReport,
  type SkillOut,
  type SkillReviewIssue,
  type SkillReviewReport,
  type SkillScanReport,
  type SkillVersionOut,
} from '@openvibe/shared'
import { parseJsonColumn, sha256Hex } from './util'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
  remote_ref: string | null
  remote_tree_hash: string | null
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
    remoteRef: row.remote_ref ?? null,
    remoteTreeHash: row.remote_tree_hash ?? null,
  }
}

const IGNORED_FILES = new Set(['.DS_Store'])
const IGNORED_DIRS = new Set(['node_modules'])
/** home 点目录里永不扫描的：.Trash 里的 skill 是已删除的，扫了会复活台账条目 */
const EXCLUDED_HOME_ENTRIES = new Set(['.Trash'])

/** 目录指纹（m2 FR-1.3）：按相对路径排序，逐文件 sha256，拼接 `${rel}:${hash}\n` 后整体 sha256 */
export function computeDirHash(dir: string): { dirHash: string; fileCount: number } {
  const entries: { rel: string; sha256: string }[] = []
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
        entries.push({ rel, sha256: hash })
      }
    }
  }
  walk(dir, '')
  entries.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return hashSkillEntries(entries)
}

/** SKILL.md YAML frontmatter 单行 name/description 容错解析（m2 FR-1.2）；
 *  DEV-0067 起 name/description 剥掉包裹引号——YAML 里 `name: "foo"` 的引号是语法不是值，
 *  旧实现把 `"PRD to Prototype"` 整串存成了台账名 */
export function parseSkillFrontmatter(
  content: string,
): { name?: string; description?: string; ok: boolean } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match || !match[1]) return { ok: false }
  const yaml = match[1] ?? ''
  const unquote = (raw: string): string => {
    const t = raw.trim()
    if (
      t.length >= 2 &&
      ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))
    ) {
      return t.slice(1, -1)
    }
    return t
  }
  let name: string | undefined
  let description: string | undefined
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!m) continue
    if (m[1] === 'name' && m[2]) name = unquote(m[2])
    if (m[1] === 'description') description = unquote(m[2] ?? '')
  }
  return { name, description, ok: name !== undefined }
}

/**
 * 目录指纹的内存版（DEV-0067）：输入「相对路径 + 文件内容 sha256(hex)」，按同一公式
 * （路径排序 → `${rel}:${hash}\n` 拼接 → 整体 sha256）产出 dirHash。本地扫描
 * computeDirHash 与远程导入（GitHub 逐文件下载 / SkillHub 文件清单自带 sha256）共用，
 * 同一套文件在两边算出同一个指纹——跨源去重才成立。
 */
export function hashSkillEntries(entries: readonly { rel: string; sha256: string }[]): {
  dirHash: string
  fileCount: number
} {
  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const payload = sorted.map((e) => `${e.rel}:${e.sha256}\n`).join('')
  return { dirHash: sha256Hex(payload), fileCount: sorted.length }
}

function isDirectory(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/**
 * 默认扫描根（DEV-0063）：home 下一切遵循 `~/.<tool>/skills` 约定的目录
 * （claude/qoder/trae/codebuddy/workbuddy/openclaw 系等）+ cwd 的 `.claude/skills`。
 * 各 agent 工具已统一采纳 claude 的 SKILL.md 约定，故按「存在即扫」发现而非硬编码
 * 工具清单——新工具无需改代码即可覆盖；非约定路径走显式 roots。
 */
export function discoverSkillRoots(homeDir: string, cwdSkillsDir?: string): string[] {
  const roots = new Set<string>()
  let entries: string[]
  try {
    entries = readdirSync(homeDir)
  } catch {
    entries = []
  }
  for (const name of entries) {
    if (!name.startsWith('.') || EXCLUDED_HOME_ENTRIES.has(name)) continue
    const skillsDir = join(homeDir, name, 'skills')
    if (isDirectory(skillsDir)) roots.add(skillsDir)
  }
  const cwdRoot = cwdSkillsDir ?? join(process.cwd(), '.claude', 'skills')
  if (isDirectory(cwdRoot)) roots.add(cwdRoot)
  return [...roots].sort()
}

export function defaultScanRoots(): string[] {
  const home = homedir()
  return [...new Set([...discoverSkillRoots(home), ...zcodePluginSkillRoots(home)])].sort()
}

/**
 * ZCode 智能体的插件 skill 根（DEV-0064）。两个来源：
 * ① `~/.zcode/cli/plugins/installed_plugins.json` 逐插件取 `installPath`（用户显式安装的，
 *    ZCode 实际加载的版本）；
 * ② 清单外的缓存插件（内置/预装，无注册文件）：每插件只取**最高版本**的 skills——缓存里
 *    历史版本共存（升级残留），全扫会把陈旧内容污染进台账版本线；清单已钉版本的插件不再
 *    走缓存猜测（清单是权威）。
 * skills 布局兼容两种：`<installPath>/skills` 与 `<installPath>/payload/skills`（mimosa 实测）。
 * 未装 ZCode / 缓存缺失 / 清单损坏都静默降级，不产生假覆盖。
 */
export function zcodePluginSkillRoots(homeDir: string): string[] {
  const roots = new Set<string>()
  const pinned = new Set<string>()
  const manifest = join(homeDir, '.zcode', 'cli', 'plugins', 'installed_plugins.json')
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { plugins?: unknown }
    if (Array.isArray(parsed.plugins)) {
      for (const entry of parsed.plugins) {
        const installPath = (entry as { installPath?: unknown }).installPath
        if (typeof installPath !== 'string' || installPath === '') continue
        pinned.add(installPath)
        const dir = pluginSkillsDir(installPath)
        if (dir) roots.add(dir)
      }
    }
  } catch {
    // 清单缺失/损坏 → 只走 ② 缓存兜底
  }

  const cache = join(homeDir, '.zcode', 'cli', 'plugins', 'cache')
  let sources: string[]
  try {
    sources = readdirSync(cache)
  } catch {
    sources = []
  }
  for (const source of sources) {
    const sourceDir = join(cache, source)
    let pluginNames: string[]
    try {
      pluginNames = readdirSync(sourceDir)
    } catch {
      continue
    }
    for (const plugin of pluginNames) {
      const pluginDir = join(sourceDir, plugin)
      if (isPinnedUnder(pinned, pluginDir)) continue // ① 已覆盖该插件，缓存猜测不参与
      let versions: string[]
      try {
        versions = readdirSync(pluginDir).filter((v) => isDirectory(join(pluginDir, v)))
      } catch {
        continue
      }
      if (versions.length === 0) continue
      const latest = versions.sort(compareVersionDesc)[0]
      if (latest === undefined) continue
      const dir = pluginSkillsDir(join(pluginDir, latest))
      if (dir) roots.add(dir)
    }
  }
  return [...roots].sort()
}

/** 插件目录内的 skills 布局：`skills/` 优先，其次 `payload/skills/`（mimosa 布局） */
function pluginSkillsDir(installPath: string): string | null {
  for (const rel of ['skills', join('payload', 'skills')]) {
    const dir = join(installPath, rel)
    if (isDirectory(dir)) return dir
  }
  return null
}

function isPinnedUnder(pinned: ReadonlySet<string>, pluginDir: string): boolean {
  const prefix = `${pluginDir}/`
  for (const path of pinned) {
    if (path.startsWith(prefix)) return true
  }
  return false
}

/** 版本段数值比较（缺段补 0，非数字段排最后）；同值退回字典序保证确定性 */
function compareVersionDesc(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const va = /^\d+$/.test(pa[i] ?? '') ? Number(pa[i]) : -1
    const vb = /^\d+$/.test(pb[i] ?? '') ? Number(pb[i]) : -1
    if (va !== vb) return vb - va
  }
  return a < b ? 1 : a > b ? -1 : 0
}

export class SkillsRepo {
  constructor(private readonly db: SqliteDatabase) {}

  /**
   * 扫描发现（m2 FR-1）：根目录一层子目录含 SKILL.md 者；同名同指纹跳过、指纹变化追加版本。
   * 显式 roots（含空数组）不回落默认（否则读真实 home，结果随机器漂移）；默认根按存在
   * 即扫发现，缺目录是常态、静默跳过——显式传入的根缺失才告警并记入 missingRoots。
   */
  scan(roots?: string[]): SkillScanReport {
    const explicit = roots !== undefined
    const wanted = explicit ? [...new Set(roots)] : defaultScanRoots()
    const report: SkillScanReport = {
      discovered: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: [],
      scannedRoots: [],
      missingRoots: [],
    }
    for (const root of wanted) {
      let dirs: string[]
      try {
        dirs = readdirSync(root, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .filter((d) => statSync(join(root, d.name)).isDirectory())
          .map((d) => d.name)
      } catch {
        if (explicit) {
          report.missingRoots.push(root)
          report.warnings.push(`扫描根不存在或不可读，跳过: ${root}`)
        }
        continue
      }
      report.scannedRoots.push(root)
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
        report[this.recordVersion({ name, description: fm.description ?? '', source: 'local', dir: skillDir, versionLabel: dirName, dirHash, fileCount })] += 1
      }
    }
    return report
  }

  /** name-keyed 落账核心（scan 与远程导入共用，DEV-0067 抽取）：新建 / 同指纹跳过 / 变更追加版本 */
  private recordVersion(input: {
    name: string
    description: string
    source: 'local' | 'github' | 'skillhub'
    dir: string | null
    versionLabel: string
    dirHash: string
    fileCount: number
    remoteRef?: string | null
    remoteTreeHash?: string | null
  }): 'created' | 'updated' | 'skipped' {
    const existing = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(input.name) as
      | SkillRow
      | undefined

    if (!existing) {
      const id = newId('skill')
      const ts = nowIso()
      this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO skills (id, name, description, source, skill_dir, latest_version_id,
               installed_targets, created_at, updated_at, remote_ref, remote_tree_hash)
             VALUES (?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?, ?)`,
          )
          .run(
            id,
            input.name,
            input.description,
            input.source,
            input.dir,
            ts,
            ts,
            input.remoteRef ?? null,
            input.remoteTreeHash ?? null,
          )
        const versionId = newId('skillVersion')
        this.db
          .prepare(
            `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(versionId, id, input.versionLabel, input.dirHash, input.fileCount, ts)
        this.db
          .prepare('UPDATE skills SET latest_version_id = ? WHERE id = ?')
          .run(versionId, id)
      })()
      return 'created'
    }

    const dupVersion = this.db
      .prepare('SELECT id FROM skill_versions WHERE skill_id = ? AND dir_hash = ?')
      .get(existing.id, input.dirHash) as { id: string } | undefined
    if (dupVersion) {
      // 指纹未变；顺手刷新描述/目录/远程追踪（信息字段）。NULL 不回写已有值
      this.db
        .prepare(
          `UPDATE skills SET description = ?, skill_dir = COALESCE(?, skill_dir),
             remote_ref = COALESCE(?, remote_ref), remote_tree_hash = COALESCE(?, remote_tree_hash),
             updated_at = ? WHERE id = ?`,
        )
        .run(input.description, input.dir, input.remoteRef ?? null, input.remoteTreeHash ?? null, nowIso(), existing.id)
      return 'skipped'
    }
    const versionId = newId('skillVersion')
    const ts = nowIso()
    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO skill_versions (id, skill_id, version_label, dir_hash, file_count, scanned_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(versionId, existing.id, input.versionLabel, input.dirHash, input.fileCount, ts)
      this.db
        .prepare(
          `UPDATE skills SET latest_version_id = ?, description = ?, skill_dir = COALESCE(?, skill_dir),
             remote_ref = COALESCE(?, remote_ref), remote_tree_hash = COALESCE(?, remote_tree_hash),
             updated_at = ? WHERE id = ?`,
        )
        .run(versionId, input.description, input.dir, input.remoteRef ?? null, input.remoteTreeHash ?? null, ts, existing.id)
    })()
    return 'updated'
  }

  /**
   * 远程导入落账（DEV-0067）：GitHub / SkillHub 拉到的 skill 按 name-keyed 与本地同一套
   * 去重与版本线语义合并。无本地目录（skill_dir 留空），溯源串进 version_label
   * （如 `owner/repo@main`、`slug@1.0.0`）；DEV-0068 起同时记录 remoteRef 与树指纹，
   * 供检查更新做零内容下载的廉价对比。
   */
  upsertRemote(input: {
    name: string
    description: string
    source: 'github' | 'skillhub'
    versionLabel: string
    dirHash: string
    fileCount: number
    remoteRef: string
    remoteTreeHash: string
  }): 'created' | 'updated' | 'skipped' {
    return this.recordVersion({ ...input, dir: null })
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

  /**
   * 重复整理报告（DEV-0067）：① 同内容不同名（最新版本 dir_hash 一致且非空）——同名已被
   * 扫描去重，剩下的是改名副本或跨源重复；② 本地条目目录已消失（删了/挪了）；③ 名称
   * 不合规范的存量条目（引号残留等）。只报告不删——删除走既有 DELETE，由 owner 逐条确认。
   */
  duplicates(): SkillDuplicatesReport {
    const rows = this.db
      .prepare(
        `SELECT s.id, s.name, s.source, s.skill_dir, sv.dir_hash, sv.file_count
           FROM skills s JOIN skill_versions sv ON sv.id = s.latest_version_id
          ORDER BY s.name ASC, s.id ASC`,
      )
      .all() as {
      id: string
      name: string
      source: string
      skill_dir: string | null
      dir_hash: string
      file_count: number
    }[]

    const byHash = new Map<string, typeof rows>()
    const report: SkillDuplicatesReport = { sameContent: [], stale: [], nameAnomalies: [] }
    for (const row of rows) {
      const anomaly = skillNameIssue(row.name)
      if (anomaly !== null) {
        report.nameAnomalies.push({ id: row.id, name: row.name, issue: anomaly })
      }
      if (row.source === 'local' && row.skill_dir !== null && !existsSync(row.skill_dir)) {
        report.stale.push({ id: row.id, name: row.name, skillDir: row.skill_dir })
      }
      if (row.dir_hash !== '') {
        const group = byHash.get(row.dir_hash) ?? []
        group.push(row)
        byHash.set(row.dir_hash, group)
      }
    }
    for (const [dirHash, group] of [...byHash.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (group.length < 2) continue
      report.sameContent.push({
        dirHash,
        fileCount: group[0]?.file_count ?? 0,
        skills: group.map((g) => ({
          id: g.id,
          name: g.name,
          source: g.source,
          skillDir: g.skill_dir,
        })),
      })
    }
    return report
  }

  /** 审查单条（DEV-0067）：有本地目录读 SKILL.md 全文，无目录（远程/手动）仅元数据审查 */
  review(ids?: string[]): SkillReviewReport {
    const all = this.list()
    const wanted =
      ids === undefined ? all : all.filter((s) => ids.includes(s.id))
    const items: SkillReviewReport['items'] = []
    const summary = { ok: 0, info: 0, warn: 0, fail: 0 }
    for (const skill of wanted) {
      let content: string | null = null
      if (skill.skillDir !== null) {
        try {
          content = readFileSync(join(skill.skillDir, 'SKILL.md'), 'utf8')
        } catch {
          content = null // 目录在台账里但文件读不到 → 按仅元数据审查
        }
      }
      const issues = reviewSkill({ name: skill.name, description: skill.description, content })
      const level =
        issues.some((i) => i.severity === 'fail')
          ? 'fail'
          : issues.some((i) => i.severity === 'warn')
            ? 'warn'
            : issues.length > 0
              ? 'info'
              : 'ok'
      items.push({ skillId: skill.id, name: skill.name, level, issues })
      summary[level] += 1
    }
    return { items, summary }
  }
}

/** 台账名规范（Anthropic SKILL.md 约定）：小写字母/数字/连字符，≤64；返回问题码或 null */
export function skillNameIssue(name: string): 'quoted' | 'convention' | null {
  if (/^["'].*["']$/.test(name)) return 'quoted'
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) return 'convention'
  return null
}

/**
 * 内置 skill 审查（DEV-0067）：规范面（frontmatter/名称/描述）+ 质量面（正文、触发词）+
 * 安全面（私钥样串、本机路径泄漏、内网 IP 字面量）。纯函数，无 IO；content 为 null 表示
 * 无本地目录，只做元数据审查。
 */
export function reviewSkill(input: {
  name: string
  description: string
  content: string | null
}): SkillReviewIssue[] {
  const issues: SkillReviewIssue[] = []
  const { name, description, content } = input

  const nameIssue = skillNameIssue(name)
  if (nameIssue === 'quoted') {
    issues.push({
      severity: 'fail',
      code: 'name-quoted',
      message: '名称带引号残留（frontmatter 值外层的引号不是名字的一部分），删除后重扫即可归一',
    })
  } else if (nameIssue === 'convention') {
    issues.push({
      severity: 'warn',
      code: 'name-convention',
      message: '名称不符合约定（应为小写字母/数字/连字符、≤64 字符），部分工具按此规范匹配触发',
    })
  }

  if (description.trim() === '') {
    issues.push({
      severity: 'fail',
      code: 'description-empty',
      message: '描述为空——描述是模型判断何时触发的唯一依据，空描述等于永远不触发',
    })
  } else if (description.length > 1024) {
    issues.push({
      severity: 'warn',
      code: 'description-long',
      message: `描述 ${String(description.length)} 字符，超过 SKILL.md 规范建议上限 1024`,
    })
  } else if (
    !/(use when|use this|trigger|when the user|当用户|触发|适用|何时|帮.{0,8}(做|写|生成|学习|分析))/i.test(
      description,
    )
  ) {
    issues.push({
      severity: 'info',
      code: 'description-no-trigger',
      message: '描述里没有触发条件表述（如「当用户…」「Use when…」），补上可减少误触发/漏触发',
    })
  }

  if (content === null) {
    issues.push({
      severity: 'info',
      code: 'review-metadata-only',
      message: '无本地目录（远程导入或目录已失效），仅完成元数据审查',
    })
    return issues
  }

  const fm = parseSkillFrontmatter(content)
  if (!fm.ok) {
    issues.push({
      severity: 'warn',
      code: 'frontmatter-missing',
      message: 'SKILL.md 缺少合法 frontmatter（--- 包裹的 name/description），名称已回退目录名',
    })
  }
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim()
  if (body.length < 30) {
    issues.push({ severity: 'warn', code: 'body-empty', message: '正文过短（<30 字符），skill 缺少可执行指引' })
  } else if (body.length > 65536) {
    issues.push({
      severity: 'warn',
      code: 'body-huge',
      message: `正文 ${String(body.length)} 字符，超出常驻上下文的合理体量，考虑把细节挪进附属文件`,
    })
  }

  const secretMatch = content.match(
    /(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{15,})/,
  )
  if (secretMatch !== null) {
    issues.push({
      severity: 'fail',
      code: 'possible-secret',
      message: `疑似凭据样串（${secretMatch[0].slice(0, 8)}…），注入项目时会随 skill 全文进入模型上下文`,
    })
  }
  // 家目录/内网 IP 在 fenced code block（``` 围栏）内多为示例高发误报，只查正文
  const prose = content.replace(/```[\s\S]*?```/g, '')
  const homePath = prose.match(/\/Users\/[A-Za-z0-9._-]+\//)
  if (homePath !== null) {
    issues.push({
      severity: 'warn',
      code: 'leaks-user-path',
      message: `正文含本机家目录路径（${homePath[0]}…），跨机器不可复现且有暴露面`,
    })
  }
  const privateIp = prose.match(
    /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|127\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/,
  )
  if (privateIp !== null) {
    issues.push({
      severity: 'info',
      code: 'private-ip-literal',
      message: `正文含内网/环回 IP 字面量（${privateIp[0]}），若非示例地址建议移除`,
    })
  }
  return issues
}
