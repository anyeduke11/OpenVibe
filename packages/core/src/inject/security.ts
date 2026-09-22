// packages/core/src/inject/security —— 注入前的「整包拒绝」防线（m6b §6.1/§6.3/§6.7 + design §7.7/§11.3）。
// 与导出侧 validatePackFiles 的关键差异：导出侧规模越限只警告（m6a §6.4），
// 注入侧要写用户磁盘，同一越限必须硬拒绝。
import { realpathSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import {
  AppError,
  LIMITS,
  compareCodeUnit,
  isValidPackRelativePath,
  utf8ByteLength,
} from '@openvibe/shared'

export interface InjectPackFile {
  path: string
  content: string
}

export interface SecurityDeps {
  /** 注入以便跨平台稳定测试符号链接用例（Windows CI 无建链权限） */
  realpath?: (p: string) => string | null
}

export type PathCheck =
  { ok: true; absPath: string } | { ok: false; reason: 'MALFORMED' | 'ESCAPE' }

export interface InjectablePack {
  /** 相对路径 → 已校验落在项目内的绝对路径（CLI 落盘前直接用它，不再自行 resolve） */
  absPaths: Record<string, string>
  totalBytes: number
}

function tryRealpath(p: string): string | null {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

function isInside(root: string, abs: string): boolean {
  return abs === root || abs.startsWith(root.endsWith(sep) ? root : `${root}${sep}`)
}

/**
 * 单文件写入路径校验（design §7.7 规则 3 的双保险）。
 * 语法违规与「resolve / 符号链接解析后越出项目根」都算不合法，调用方必须拒绝整个包。
 */
export function checkWritePath(
  projectPath: string,
  relPath: string,
  deps: SecurityDeps = {},
): PathCheck {
  if (!isValidPackRelativePath(relPath)) return { ok: false, reason: 'MALFORMED' }
  const realpath = deps.realpath ?? tryRealpath
  const absPath = resolve(projectPath, relPath)
  if (!isInside(projectPath, absPath)) return { ok: false, reason: 'ESCAPE' }

  // 项目根自身也可能经符号链接到达（macOS 的 /var → /private/var），两侧都要归一
  const root = realpath(projectPath) ?? projectPath
  const parent = dirname(absPath)
  const realParent = realpath(parent) ?? parent
  if (!isInside(root, realParent)) return { ok: false, reason: 'ESCAPE' }
  // 目标自身是符号链接时，writeFile 会顺着它写到项目外
  const realSelf = realpath(absPath)
  if (realSelf && !isInside(root, realSelf)) return { ok: false, reason: 'ESCAPE' }
  return { ok: true, absPath }
}

/** 落盘前的最后一道：合法则返回绝对路径，越界返回 null（CLI 据此中止且已有备份不受损） */
export function resolveWriteTarget(
  projectPath: string,
  relPath: string,
  deps: SecurityDeps = {},
): string | null {
  const check = checkWritePath(projectPath, relPath, deps)
  return check.ok ? check.absPath : null
}

export interface InjectionViolations {
  fileCount: number
  totalBytes: number
  invalidPaths: string[]
  escapingPaths: string[]
  oversizedFiles: { path: string; bytes: number }[]
}

/**
 * 整包安全校验：一次跑完全部规则并聚合同类违规（§6.1「报告违规项」），
 * 任何违规都抛 VALIDATION_ERROR，details 即上表——CLI 直接渲染，退出码 1、零写入。
 */
export function checkPackInjectable(
  projectPath: string,
  files: readonly InjectPackFile[],
  deps: SecurityDeps = {},
): InjectablePack {
  const violations: InjectionViolations = {
    fileCount: files.length,
    totalBytes: 0,
    invalidPaths: [],
    escapingPaths: [],
    oversizedFiles: [],
  }
  const absPaths: Record<string, string> = {}

  for (const file of files) {
    const bytes = utf8ByteLength(file.content)
    violations.totalBytes += bytes
    if (bytes > LIMITS.singleFileMaxBytes) {
      violations.oversizedFiles.push({ path: file.path, bytes })
    }
    const check = checkWritePath(projectPath, file.path, deps)
    if (!check.ok) {
      ;(check.reason === 'MALFORMED' ? violations.invalidPaths : violations.escapingPaths).push(
        file.path,
      )
      continue
    }
    absPaths[file.path] = check.absPath
  }

  const clauses: string[] = []
  if (violations.fileCount > LIMITS.packFileCountMax) {
    clauses.push(
      `文件数 ${violations.fileCount} 超过上限 ${LIMITS.packFileCountMax}（§7.7 规则 1）`,
    )
  }
  if (violations.invalidPaths.length > 0) {
    clauses.push(
      `${violations.invalidPaths.length} 个路径非法（绝对路径 / .. / 反斜杠 / 空段 / 超长）`,
    )
  }
  if (violations.escapingPaths.length > 0) {
    clauses.push(`${violations.escapingPaths.length} 个路径解析后越出项目目录（符号链接逃逸）`)
  }
  if (violations.oversizedFiles.length > 0) {
    clauses.push(
      `${violations.oversizedFiles.length} 个单文件超过上限 ${LIMITS.singleFileMaxBytes}B（m6b §6.3）`,
    )
  }
  if (violations.totalBytes > LIMITS.packTotalMaxBytes) {
    clauses.push(
      `包内容总量 ${violations.totalBytes}B 超过上限 ${LIMITS.packTotalMaxBytes}B（m6b §6.3）`,
    )
  }
  if (clauses.length > 0) {
    sortViolations(violations)
    throw new AppError('VALIDATION_ERROR', `注入前校验未通过（${clauses.join('；')}），整包拒绝`, {
      ...violations,
    })
  }
  return { absPaths, totalBytes: violations.totalBytes }
}

/** 违规清单码点序（三平台同一输出，也与 --json 消费方约定一致） */
function sortViolations(v: InjectionViolations): void {
  v.invalidPaths.sort(compareCodeUnit)
  v.escapingPaths.sort(compareCodeUnit)
  v.oversizedFiles.sort((a, b) => compareCodeUnit(a.path, b.path))
}
