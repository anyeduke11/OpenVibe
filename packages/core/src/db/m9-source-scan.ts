// `packages/core/src/db/m9-source-scan.ts` —— M9 v1.6 **P4 的扫描结果存储**
// （`m9-dev-language-roadmap.md` §3.9 / §3.10 · dev-plan §6.10 P4.3 / P4.5 / P4.6）
//
// ## 它做什么
//
// 三件事，各对应规格的一段：
// ① **命中落库**（`lang_topic_findings`，§3.10）—— 先清后写；
// ② **同意记忆**（`lang_source_consent`，§3.9）—— 记「全发 / 全不发」，可整体清除；
// ③ **出网计数**（`lang_source_shares`，§3.9）—— 只存计数，`consent_source` 二分。
//
// ## ⚠️ 落库的是**位置与模式**，不是源码
//
// §3.8 三条线第 1 条：「源码片段**不写进台账**」。
// ⇒ `lang_topic_findings` 里没有正文字段，也没有「文件内容」列 —— 只有
//   `file_rel_path` / `line` / `col` / `matched_pattern`。
//
// ## ⚠️ 「先清后写」
//
// 与 P2 的 `saveTopicStates` 同款：重扫一次就把上一版的命中换掉，
// 不留旧扫描的残影 ⇒ 库里永远不会同时存在两次扫描的结果。
import type { SqliteDatabase } from '../db'
import { exportGrepPattern } from '../source-scan/pattern-text'
import {
  type LangCode,
  type ScanConfidence,
  type ScannerMode,
  type TopicEvidence,
} from '@openvibe/shared'

/** 落库前的一行（topic 用 **slug** 表示，id 在这里解析）。 */
export interface FindingRowInput {
  topic_slug: string
  file_rel_path: string
  line: number
  col: number
  matched_pattern: string
  confidence: ScanConfidence
  scanner_mode: ScannerMode
}

/** 读回来的一行（**带知识点信息**，给界面用）。 */
export interface FindingRow {
  id: number
  scan_id: number
  topic_id: number
  topic_slug: string
  topic_title: string
  lang: LangCode
  file_rel_path: string
  line: number
  col: number
  matched_pattern: string
  confidence: ScanConfidence
  scanner_mode: ScannerMode
}

/** 落库的结果（含**被跳过的孤儿 slug** —— ⚠️ 不静默丢弃）。 */
export interface SaveFindingsResult {
  written: number
  /** 模式表里有、但库里没有的知识点 slug（**孤儿**） */
  unknownSlugs: string[]
}

/**
 * 把命中落库（**先清后写**）。
 *
 * ## ⚠️ 这张表**没有项目列**（§3.10 的字段清单里没有）⇒ 命中是「最近一次扫描」的
 *
 * 这是**规格限制**，不是漏做：0011 迁移纪律要求「字段逐字取自规格，规格没列的不主动加」。
 * ⇒ 后果如实登记：扫了项目 B 之后，项目 A 的命中**不再保留**（被先清后写换掉）。
 * ⇒ 界面上的「项目」只决定**扫哪个目录**，不决定命中归谁。
 *
 * @param db 数据库
 * @param scanId 扫描 id
 * @param rows 命中（topic 用 slug）
 */
export function saveFindings(
  db: SqliteDatabase,
  scanId: number,
  rows: readonly FindingRowInput[],
): SaveFindingsResult {
  const idBySlug = new Map<string, number>()
  for (const t of db.prepare('SELECT id, slug FROM lang_topics').all() as {
    id: number
    slug: string
  }[]) {
    idBySlug.set(t.slug, t.id)
  }

  const unknown = new Set<string>()
  const insert = db.prepare(
    `INSERT INTO lang_topic_findings
       (scan_id, topic_id, file_rel_path, line, col, matched_pattern, confidence, scanner_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  let written = 0
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM lang_topic_findings').run()
    for (const r of rows) {
      const topicId = idBySlug.get(r.topic_slug)
      if (topicId === undefined) {
        // ⚠️ **孤儿 slug 不静默丢弃**（模式表与 lang_topics 分叉的信号）
        unknown.add(r.topic_slug)
        continue
      }
      insert.run(
        scanId,
        topicId,
        r.file_rel_path,
        r.line,
        r.col,
        r.matched_pattern,
        r.confidence,
        r.scanner_mode,
      )
      written += 1
    }
  })
  tx()
  return { written, unknownSlugs: [...unknown] }
}

/**
 * 读**最近一次**扫描的命中。
 *
 * ⚠️ **不带项目参数** —— `lang_topic_findings` 没有项目列（§3.10 的字段清单里没有），
 *   命中只属于「最近一次扫描」。见 `saveFindings` 的说明。
 * ⚠️ **排序在 JS 里做**（`lang_topic_findings` 的主键是单列 `id`，
 *   但排序口径要的是 file → line ⇒ 放 JS 更直白，也与其他 M9 读端同款）。
 */
export function readFindings(db: SqliteDatabase): FindingRow[] {
  const latest = db
    .prepare('SELECT MAX(scan_id) AS scan_id FROM lang_topic_findings')
    .get() as { scan_id: number | null }
  if (latest.scan_id === null) return []
  const rows = db
    .prepare(
      `SELECT f.id AS id, f.scan_id AS scan_id, f.topic_id AS topic_id,
              t.slug AS topic_slug, t.title AS topic_title, t.lang AS lang,
              f.file_rel_path AS file_rel_path, f.line AS line, f.col AS col,
              f.matched_pattern AS matched_pattern,
              f.confidence AS confidence, f.scanner_mode AS scanner_mode
         FROM lang_topic_findings f
         JOIN lang_topics t ON t.id = f.topic_id
        WHERE f.scan_id = ?`,
    )
    .all(latest.scan_id) as FindingRow[]
  return rows.sort(
    (a, b) =>
      a.file_rel_path.localeCompare(b.file_rel_path) ||
      a.line - b.line ||
      a.col - b.col ||
      a.topic_slug.localeCompare(b.topic_slug),
  )
}

/**
 * 把命中转成 P2 的**证据**（`source_hit`）。
 *
 * ⚠️ §3.13：**同一出处只算一次** —— 同一个文件里的 20 次命中，
 *   只产生 **1 条**证据（证据的 `ref` 是相对路径）。
 *   ⇒ 「重复命中不增加掌握度」这条规则**在证据层就成立**，不是靠下游再判一次。
 */
export function findingsToEvidence(rows: readonly FindingRow[]): Map<number, TopicEvidence[]> {
  const byTopic = new Map<number, Map<string, TopicEvidence>>()
  for (const r of rows) {
    const refs = byTopic.get(r.topic_id) ?? new Map<string, TopicEvidence>()
    if (!refs.has(r.file_rel_path)) {
      refs.set(r.file_rel_path, { kind: 'source_hit', ref: r.file_rel_path, count: 1 })
    }
    byTopic.set(r.topic_id, refs)
  }
  const out = new Map<number, TopicEvidence[]>()
  for (const [topicId, refs] of byTopic) {
    out.set(
      topicId,
      [...refs.values()].sort((a, b) => a.ref.localeCompare(b.ref)),
    )
  }
  return out
}

// ───────────────────────── 同意记忆（§3.9 · P4.5）─────────────────────────

/** 记忆一行。 */
export interface ConsentRow {
  project_id: string
  remember_all: boolean
  remembered_at: string
}

/** 读该项目的记忆（**没有行 = 没有记忆** ⇒ 默认全不勾）。 */
export function readConsent(db: SqliteDatabase, projectId: string): ConsentRow | null {
  const row = db
    .prepare('SELECT project_id, remember_all, remembered_at FROM lang_source_consent WHERE project_id = ?')
    .get(projectId) as
    | { project_id: string; remember_all: number; remembered_at: string }
    | undefined
  if (row === undefined) return null
  return {
    project_id: row.project_id,
    remember_all: row.remember_all === 1,
    remembered_at: row.remembered_at,
  }
}

/**
 * 写记忆（**upsert**）。
 *
 * @param rememberAll true = 记住「全发」；false = 记住「全不发」
 */
export function setConsent(
  db: SqliteDatabase,
  projectId: string,
  rememberAll: boolean,
  rememberedAt: string,
): ConsentRow {
  db.prepare(
    `INSERT INTO lang_source_consent (project_id, remember_all, remembered_at)
     VALUES (?, ?, ?)
     ON CONFLICT(project_id) DO UPDATE SET
       remember_all = excluded.remember_all,
       remembered_at = excluded.remembered_at`,
  ).run(projectId, rememberAll ? 1 : 0, rememberedAt)
  return { project_id: projectId, remember_all: rememberAll, remembered_at: rememberedAt }
}

/**
 * **清除记忆**（DL-21）—— 删掉这一行 ⇒ 下次读回来是 `null` ⇒ **回到全不勾**。
 *
 * ⚠️ 删除**整个项目这一行**（不是把 `remember_all` 置 0）：
 *   置 0 会留下「曾经记住过、现在记住的是『全不发』」的残影 ——
 *   而「清除」的意思是**不再有任何记忆**。
 */
export function clearConsent(db: SqliteDatabase, projectId: string): boolean {
  const res = db.prepare('DELETE FROM lang_source_consent WHERE project_id = ?').run(projectId)
  return res.changes > 0
}

/**
 * 读**全部**项目的记忆（设置页要列出「你 Remember 过哪些项目」）。
 *
 * ⚠️ 排序在 JS 里做。
 */
export function readAllConsents(db: SqliteDatabase): ConsentRow[] {
  const rows = db
    .prepare('SELECT project_id, remember_all, remembered_at FROM lang_source_consent')
    .all() as { project_id: string; remember_all: number; remembered_at: string }[]
  return rows
    .map((r) => ({
      project_id: r.project_id,
      remember_all: r.remember_all === 1,
      remembered_at: r.remembered_at,
    }))
    .sort((a, b) => a.project_id.localeCompare(b.project_id))
}

// ───────────────────────── 出网计数（§3.9 · P4.6）─────────────────────────

/** 一次出网的计数（**不含内容**）。 */
export interface ShareRow {
  id: number
  project_id: string
  topic_id_count: number
  snippet_count: number
  created_at: string
  consent_source: 'explicit_tick' | 'remembered'
}

/**
 * 记一次出网（**只存计数**）。
 *
 * ⚠️ `consent_source` 必须能区分「当次勾的」与「因为记住了而默认勾的」（§3.9 末段）。
 */
export function recordShare(
  db: SqliteDatabase,
  row: {
    project_id: string
    topic_id_count: number
    snippet_count: number
    created_at: string
    consent_source: 'explicit_tick' | 'remembered'
  },
): void {
  db.prepare(
    `INSERT INTO lang_source_shares
       (project_id, topic_id_count, snippet_count, created_at, consent_source)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    row.project_id,
    row.topic_id_count,
    row.snippet_count,
    row.created_at,
    row.consent_source,
  )
}

/** 读该项目的出网计数（**新到旧**）。 */
export function readShares(db: SqliteDatabase, projectId: string): ShareRow[] {
  const rows = db
    .prepare(
      `SELECT id, project_id, topic_id_count, snippet_count, created_at, consent_source
         FROM lang_source_shares
        WHERE project_id = ?`,
    )
    .all(projectId) as ShareRow[]
  return rows.sort((a, b) => b.id - a.id)
}

/** 一个项目的**出网汇总**（界面据此显示「出网过几次」）。 */
export interface ShareSummaryRow {
  project_id: string
  /** 出网次数 */
  share_count: number
  /** 累计发出去的片段条数 */
  snippet_total: number
  /** 累计涉及的知识点条数 */
  topic_total: number
  /** 最近一次出网时刻 */
  last_shared_at: string
  /** 其中「当次勾的」次数 */
  explicit_tick_count: number
  /** 其中「因为记住了而默认勾的」次数 */
  remembered_count: number
}

/**
 * 读**全部**项目的出网汇总（按项目聚合）。
 *
 * ## ⚠️ 为什么单独一个读端（而不是复用 `readAllConsents` 的列表）
 *
 * 出网**不等于**被记住过：用户当次勾了片段发出去、但没点「记住」⇒
 * 这一笔在 `lang_source_shares` 里，却**不在** `lang_source_consent` 里
 * ⇒ 若把计数挂在那张表的项目列表上，**当次授权的出网会整段消失**。
 *
 * ## ⚠️ 清除记忆**不改变**这个计数
 *
 * 两者语义不同：记忆是「下次的默认选择」，出网是「已经发生的事实」
 * ⇒ 清除记忆不撤销历史，也不该改历史数字（§3.9）。
 */
export function readShareSummary(db: SqliteDatabase): ShareSummaryRow[] {
  const rows = db
    .prepare(
      `SELECT project_id,
              COUNT(*) AS share_count,
              COALESCE(SUM(snippet_count), 0) AS snippet_total,
              COALESCE(SUM(topic_id_count), 0) AS topic_total,
              MAX(created_at) AS last_shared_at,
              COALESCE(SUM(CASE WHEN consent_source = 'explicit_tick' THEN 1 ELSE 0 END), 0)
                AS explicit_tick_count,
              COALESCE(SUM(CASE WHEN consent_source = 'remembered' THEN 1 ELSE 0 END), 0)
                AS remembered_count
         FROM lang_source_shares
        GROUP BY project_id`,
    )
    .all() as ShareSummaryRow[]
  // ⚠️ 排序在 JS 里做（与 `readAllConsents` 同款；不依赖 SQL 的排序稳定性）
  return rows.sort((a, b) => a.project_id.localeCompare(b.project_id))
}

// ───────────────────────── 导出清单（§3.10 · DL-22 / DL-23）─────────────────────────

/** shell 单引号转义（`'` ⇒ `'\''`）。 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, "'\\''")}'`
}

/**
 * 生成**可 grep 复现**的导出清单（DL-22）。
 *
 * ## 每一条都带一条**可直接粘贴执行**的命令
 *
 * ```bash
 * grep -n -- '<matched_pattern>' <相对路径>
 * ```
 *
 * ⚠️ **清单里没有绝对路径**（DL-23）⇒ 命令里的路径是**相对项目根**的，
 *   使用说明写在抬头：「在项目根目录下执行」。
 *
 * @param projectId 项目 id
 * @param scanId 扫描 id
 * @param rows 命中
 */
export function buildExportText(
  projectId: string,
  scanId: number,
  rows: readonly FindingRow[],
): string {
  const lines: string[] = []
  lines.push('# M9 源码识别清单（可自查）')
  lines.push(`# 项目：${projectId}`)
  lines.push(`# 扫描：${String(scanId)}`)
  lines.push('#')
  lines.push('# 每一条都能用 grep 复现 —— 在**项目根目录**下执行下面的命令：')
  lines.push('#   grep -n -- <模式串> <相对路径>')
  lines.push('#')
  lines.push('# ⚠️ 本清单只含相对路径，不含任何本机绝对路径。')
  lines.push('')
  for (const r of rows) {
    const tag = r.confidence === 'confirmed' ? '已确认' : '可能'
    // ⚠️ **导出时再兜一道 BRE 安全**（`breSafePattern` 只在扫描侧生效）：
    //   库里的值若被人工改脏，直接印进命令 ⇒ 用户看到的是「grep 报语法错」，
    //   不是「命中了」⇒ 那比少报一条更糟。详见 `exportGrepPattern` 的注释。
    const pattern = exportGrepPattern(r.matched_pattern)
    lines.push(
      `${tag}  ${r.file_rel_path}:${String(r.line)}:${String(r.col)}  ${r.topic_slug}  «${pattern}»`,
    )
    lines.push(`  ↳ grep -n -- ${shellQuote(pattern)} ${r.file_rel_path}`)
  }
  lines.push('')
  lines.push(`# 共 ${String(rows.length)} 条`)
  return `${lines.join('\n')}\n`
}
