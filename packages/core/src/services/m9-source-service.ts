/**
 * `packages/core/src/services/m9-source-service.ts` —— M9 v1.6 **P4 的扫描服务**
 * （`m9-dev-language-roadmap.md` §3.8 / §3.9 / §3.10 · dev-plan §6.10 P4.1 ~ P4.6）
 *
 * ## 它做什么
 *
 * 把「扫描 → 落库 → 重算掌握度」串成**一次调用**：
 *
 * ```
 * 项目 local_path ──► 扫描（Python ast ＋ Go 双路径）
 *                        │
 *                        ├─► 落库命中（lang_topic_findings）
 *                        ├─► 命中 → source_hit 证据（§3.13：同一出处只算一次）
 *                        └─► 重算三态（复用 P2 的 derive/save）
 * ```
 *
 * ## ⚠️ 重算时**旧的源码证据要先剔掉**
 *
 * P2 的 `saveTopicStates` 是「先清后写」⇒ 调用方必须给**完整**的证据集。
 * 而 `lang_topic_state` 里**上一轮扫描**留下的 `source_hit` 行也在里面
 * ⇒ 若不剔掉，本轮没再命中的文件会**残影**在状态里（「我项目里用到过 X」但其实已经删了）。
 * ⇒ 合并前先滤掉 `source_hit`，只保留**清单/技能/任务**三类行为证据。
 */
import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { SqliteDatabase } from '../db'
import {
  buildExportText,
  findingsToEvidence,
  readFindings,
  saveFindings,
  type FindingRow,
} from '../db/m9-source-scan'
import { deriveTopicStates, loadPersistedEvidence, saveTopicStates } from '../db/m9-p2-state'
import { scanProjectSource } from '../source-scan/scan'
import type { SourceScanResult, TopicEvidence } from '@openvibe/shared'

/** 扫描服务抛出的错（**显式**，不静默）。 */
export class SourceServiceError extends Error {
  constructor(
    public readonly reason:
      | 'project-not-found'
      | 'project-no-local-path'
      | 'local-path-not-absolute'
      | 'local-path-missing',
    message: string,
  ) {
    super(message)
    this.name = 'SourceServiceError'
  }
}

/** 读项目的根目录（**必须是存在的绝对路径**）。 */
export function readProjectRoot(db: SqliteDatabase, projectId: string): string {
  const row = db.prepare('SELECT id, local_path FROM projects WHERE id = ?').get(projectId) as
    { id: string; local_path: string | null } | undefined
  if (row === undefined) {
    throw new SourceServiceError('project-not-found', `项目 ${projectId} 不存在`)
  }
  const path = row.local_path
  if (path === null || path === '') {
    throw new SourceServiceError('project-no-local-path', `项目 ${projectId} 没有设置本地目录`)
  }
  if (!isAbsolute(path)) {
    throw new SourceServiceError(
      'local-path-not-absolute',
      `项目 ${projectId} 的本地目录不是绝对路径`,
    )
  }
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new SourceServiceError('local-path-missing', `项目 ${projectId} 的本地目录不存在`)
  }
  return path
}

/** 一次扫描的结果（**含落库与重算的账**）。 */
export interface ScanServiceResult {
  scan: SourceScanResult
  /** 落库的命中条数 */
  written: number
  /** 模式表里有、但库里没有的知识点 slug（**孤儿**，不静默） */
  unknownSlugs: string[]
  /** 重算了多少个知识点的状态 */
  statesUpdated: number
}

/**
 * 扫一个项目并把结果落库。
 *
 * @param db 数据库
 * @param projectId 项目 id
 * @param computedAt 状态的参照日（**与状态同行 ⇒ 天生对齐**）
 */
export async function runProjectScan(
  db: SqliteDatabase,
  projectId: string,
  computedAt: string,
  opts: { pythonBin?: string; goBin?: string; maxFiles?: number } = {},
): Promise<ScanServiceResult> {
  const root = readProjectRoot(db, projectId)
  const scan = await scanProjectSource({
    projectId,
    root,
    pythonBin: opts.pythonBin,
    goBin: opts.goBin,
    maxFiles: opts.maxFiles,
  })

  const saved = saveFindings(
    db,
    scan.scan_id,
    projectId,
    scan.findings.map((f) => ({
      topic_slug: f.topic_slug,
      file_rel_path: f.file_rel_path,
      line: f.line,
      col: f.col,
      matched_pattern: f.matched_pattern,
      confidence: f.confidence,
      scanner_mode: f.scanner_mode,
    })),
  )

  // ⚠️ 旧的源码证据先剔掉（见文件头），只保留清单/技能/任务三类行为证据
  const existing = loadPersistedEvidence(db, projectId)
  // ⚠️ **按项目取源码证据**（owner 2026-10-22）：命中表现在每个项目各存一份
  //   ⇒ 不按项目过滤的话，别的项目的命中会算进这个项目的掌握度（跨项目污染）。
  const sourceEvidence = findingsToEvidence(readFindings(db, projectId))
  const merged = new Map<number, TopicEvidence[]>()
  for (const [topicId, list] of existing) {
    const kept = list.filter((e) => e.kind !== 'source_hit')
    if (kept.length > 0) merged.set(topicId, kept)
  }
  for (const [topicId, list] of sourceEvidence) {
    const prev = merged.get(topicId) ?? []
    merged.set(topicId, [...prev, ...list])
  }

  const states = deriveTopicStates(db, merged)
  saveTopicStates(db, projectId, states, merged, computedAt)

  return {
    scan,
    written: saved.written,
    unknownSlugs: saved.unknownSlugs,
    statesUpdated: states.size,
  }
}

/**
 * 生成导出清单（DL-22 / DL-23）。
 *
 * @param db 数据库
 * @param projectId 项目 id
 */
export function exportFindingsText(db: SqliteDatabase, projectId: string): string {
  // ⚠️ **按项目读**（owner 2026-10-22）：命中表现在每个项目各存一份
  const rows = readFindings(db, projectId)
  const scanId = rows.length > 0 ? (rows[0] as FindingRow).scan_id : 0
  return buildExportText(projectId, scanId, rows)
}
