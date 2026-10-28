import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  PACK_LOCK_REL,
  diffPackLock,
  diffSections,
  parsePackLock,
  resolveWriteTarget,
  summarizeDiff,
  type SectionDiffResult,
} from '@openvibe/core'
import { compareSemver, type PackExportOut, type PackLock } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { pickExport } from '../pack-source'

/**
 * `openvibe diff <projectPath>`（m6b FR-5）：磁盘 vs pack.lock.json 的只读比对，
 * 外加一次「服务端有没有更新导出版本」的探测。全程零写入，且探测失败只降级成警告——
 * 磁盘结论与退出码（0 clean / 2 漂移或有新版 / 1 错误）是本命令对外的全部契约。
 */

export class DiffError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'DiffError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface DiffOptions {
  projectPath: string
}

export interface DiffDeps {
  client?: ApiClient
}

export interface PackOutdated {
  from: string
  to: string
}

export interface DiffOutcome {
  projectPath: string
  lockPath: string
  pack: PackLock['pack']
  injectedAt: string
  /** lock 里的文件项总数（含 managed=false 的留痕项） */
  tracked: number
  clean: boolean
  drifted: { path: string; expected: string; actual: string }[]
  missing: string[]
  /**
   * **新增列**（owner 2026-10-15 授权，FR-2.3）：lock 里 `managed=false` 或落在 `.openvibe/`
   * 下的条目，盘上被改过时会落在这里，**不再混进 `drifted`**。
   *
   * ⚠️ 这是可观察的输出变化，但**信息一条没少**、**退出码口径未变**
   * （foreign 非空 ⇒ `clean=false` ⇒ 仍退 2）。变的只是「报在哪一列」：
   * 此前用户分不出「受管产物漂移」与「未受管条目被改」，现在分得出了。
   */
  foreign: { path: string; actual: string }[]
  outdated: PackOutdated | null
  /**
   * 段级差异（v0.2.3 批次 C RQ4，只读）：对漂移文件做「包渲染段文本 vs 磁盘段文本」
   * 的受管块/块外自由区对比。**离线或包侧不可达时为空数组**（降级为文件级报告，
   * 不阻塞 diff 的磁盘结论）。数据源 = 与 preview/export 同一 renderPack。
   */
  sections: { path: string; result: SectionDiffResult }[]
  /** 是否真的调过服务端（离线/无令牌时 false） */
  probedOnline: boolean
  warnings: string[]
  hints: string[]
  exitCode: 0 | 2
}

/** 不做 realpath：lock 位置必须按用户给的路径原样拼出（符号链接根下 resolve 会改写法） */
export function lockPathOf(projectPath: string): string {
  return join(projectPath, PACK_LOCK_REL)
}

/** 目录校验：resolve 掉 `.` 与 `..`，但不 realpath（符号链接根要保持用户写法） */
function assertProjectDir(projectPath: string): string {
  const abs = resolve(projectPath)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new DiffError(
      'PROJECT_NOT_DIR',
      `项目路径不是目录：${abs}（openvibe diff <projectPath>，路径需是已注入过的项目根）`,
    )
  }
  return abs
}

function diskReader(projectPath: string): (relPath: string) => string | null {
  return (relPath) => {
    const abs = resolveWriteTarget(projectPath, relPath)
    if (abs === null) {
      throw new DiffError('PATH_ESCAPE', `lock 里的 ${relPath} 解析后不在项目内，拒绝作为基准`)
    }
    try {
      return readFileSync(abs, 'utf8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      // ENOENT/ENOTDIR = 文件没了（missing），其余读错误（权限/IO）不能当成「内容不一致」
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null
      throw new DiffError('READ_FAILED', `读取 ${abs} 失败：${err.message}`)
    }
  }
}

/** 有 client 才探测；任何探测失败只警告，磁盘结论照旧 */
async function probeOutdated(
  client: ApiClient,
  pack: PackLock['pack'],
): Promise<{ outdated: PackOutdated | null; warnings: string[]; probedOnline: boolean }> {
  try {
    const list = await client.getJson<{ items: PackExportOut[] }>(`/api/packs/${pack.id}/exports`)
    if (list.items.length === 0) {
      return {
        outdated: null,
        warnings: [
          `服务端没有标准包 ${pack.name}@${pack.version} 的导出记录，无法判断是否有更新版本`,
        ],
        probedOnline: true,
      }
    }
    const newest = pickExport(list.items, null)
    return {
      outdated:
        compareSemver(newest.version, pack.version) > 0
          ? { from: pack.version, to: newest.version }
          : null,
      warnings: [],
      probedOnline: true,
    }
  } catch (e) {
    const detail =
      e instanceof ServerUnreachable
        ? `服务端不可达（${e.detail}）`
        : ((e as Error).message ?? String(e))
    return {
      outdated: null,
      warnings: [`未探测更新版本（${detail}）；磁盘比对不受影响`],
      probedOnline: false,
    }
  }
}

export async function diffAction(options: DiffOptions, deps: DiffDeps = {}): Promise<DiffOutcome> {
  const projectPath = assertProjectDir(options.projectPath)
  const lockPath = lockPathOf(projectPath)
  let text: string
  try {
    text = readFileSync(lockPath, 'utf8')
  } catch {
    throw new DiffError(
      'NO_LOCK',
      `${lockPath} 不存在：该项目还没注入过标准包。先运行 openvibe sync <projectPath>（或 --pack name@version）`,
    )
  }
  const lock = parsePackLock(text)
  if (!lock) {
    throw new DiffError(
      'LOCK_INVALID',
      `${lockPath} 无法解析或含非法文件路径：被改过的 lock 不能当比对基准。` +
        '删掉它再 openvibe sync 一次可重建（重建前请自行确认磁盘产物来自哪个包版本）',
    )
  }

  const diff = diffPackLock(lock, diskReader(projectPath))
  const buckets = summarizeDiff(diff)
  const warnings: string[] = []
  const hints: string[] = []
  let outdated: PackOutdated | null = null
  let probedOnline = false
  const sections: { path: string; result: SectionDiffResult }[] = []
  if (deps.client) {
    const probe = await probeOutdated(deps.client, lock.pack)
    outdated = probe.outdated
    probedOnline = probe.probedOnline
    warnings.push(...probe.warnings)

    // 段级差异（RQ4，只读）：包渲染文本来自与 preview/export 同一 renderPack；
    // 任何失败只降级成提示，磁盘结论与退出码不受影响（与 probeOutdated 同款纪律）。
    if (buckets.drifted.length > 0) {
      try {
        const preview = await deps.client.postJson<{ files: { path: string; content: string }[] }>(
          `/api/packs/${lock.pack.id}/preview`,
          { version: lock.pack.version },
        )
        const byPath = new Map(preview.files.map((f) => [f.path, f.content]))
        const reader = diskReader(projectPath)
        for (const d of buckets.drifted) {
          const expected = byPath.get(d.path)
          if (expected === undefined) continue
          const actual = reader(d.path)
          if (actual === null) continue
          sections.push({ path: d.path, result: diffSections(expected, actual) })
        }
        if (sections.length > 0)
          hints.push('块外自由区的差异属于你，同步覆盖建议永远倒向保留本地（永不触碰）')
      } catch (e) {
        warnings.push(
          `段级差异不可用（${e instanceof ServerUnreachable ? `服务端不可达（${e.detail}）` : ((e as Error).message ?? String(e))}）；文件级报告不受影响`,
        )
      }
    }
  } else {
    hints.push('离线：未探测服务端是否有更新导出版本')
  }

  if (buckets.drifted.length > 0)
    hints.push(
      `漂移 ${buckets.drifted.length} 项：${buckets.drifted.map((d) => d.path).join('、')}`,
    )
  if (buckets.missing.length > 0)
    hints.push(`缺失 ${buckets.missing.length} 项：${buckets.missing.join('、')}`)
  // 未受管 / .openvibe 下被改：单列，且**不静默省略** —— 此前它混进「漂移」，用户看不出区别
  if (buckets.foreign.length > 0)
    hints.push(
      `未受管条目被改 ${buckets.foreign.length} 项：${buckets.foreign.map((d) => d.path).join('、')}` +
        `（lock 标记为不受管，或位于 .openvibe/ 下；这些不参与同步覆盖）`,
    )
  if (outdated) hints.push(`pack-outdated(${outdated.from} → ${outdated.to})`)
  if (diff.clean && !outdated) hints.push('clean：磁盘与 lock 一致，且没有更新的导出版本')

  return {
    projectPath,
    lockPath,
    pack: lock.pack,
    injectedAt: lock.injectedAt,
    tracked: lock.files.length,
    clean: diff.clean,
    drifted: buckets.drifted,
    missing: buckets.missing,
    foreign: buckets.foreign,
    outdated,
    sections,
    probedOnline,
    warnings,
    hints,
    exitCode: diff.clean && !outdated ? 0 : 2,
  }
}
