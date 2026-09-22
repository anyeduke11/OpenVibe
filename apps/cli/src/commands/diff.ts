import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PACK_LOCK_REL, diffPackLock, parsePackLock, resolveWriteTarget } from '@openvibe/core'
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
  outdated: PackOutdated | null
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
  const warnings: string[] = []
  const hints: string[] = []
  let outdated: PackOutdated | null = null
  let probedOnline = false
  if (deps.client) {
    const probe = await probeOutdated(deps.client, lock.pack)
    outdated = probe.outdated
    probedOnline = probe.probedOnline
    warnings.push(...probe.warnings)
  } else {
    hints.push('离线：未探测服务端是否有更新导出版本')
  }

  if (diff.drifted.length > 0)
    hints.push(`漂移 ${diff.drifted.length} 项：${diff.drifted.map((d) => d.path).join('、')}`)
  if (diff.missing.length > 0)
    hints.push(`缺失 ${diff.missing.length} 项：${diff.missing.join('、')}`)
  if (outdated) hints.push(`pack-outdated(${outdated.from} → ${outdated.to})`)
  if (diff.clean && !outdated) hints.push('clean：磁盘与 lock 一致，且没有更新的导出版本')

  return {
    projectPath,
    lockPath,
    pack: lock.pack,
    injectedAt: lock.injectedAt,
    tracked: lock.files.length,
    clean: diff.clean,
    drifted: diff.drifted,
    missing: diff.missing,
    outdated,
    probedOnline,
    warnings,
    hints,
    exitCode: diff.clean && !outdated ? 0 : 2,
  }
}
