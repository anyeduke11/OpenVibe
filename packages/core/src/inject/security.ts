// packages/core/src/inject/security —— 注入前的「整包拒绝」防线（m6b §6.1/§6.3/§6.7 + design §7.7/§11.3）。
// 与导出侧 validatePackFiles 的关键差异：导出侧规模越限只警告（m6a §6.4），
// 注入侧要写用户磁盘，同一越限必须硬拒绝。
import { lstatSync, realpathSync } from 'node:fs'
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
  // 根与目标两侧都先过 resolve 再比对：resolve 出来的目标已经是平台写法（Windows 上把
  // '/tmp/proj' 归成 '\tmp\proj'），拿未归一的根去 startsWith 必然不等，一次正常注入会被判成逃逸。
  const rootPath = resolve(projectPath)
  const absPath = resolve(rootPath, relPath)
  if (!isInside(rootPath, absPath)) return { ok: false, reason: 'ESCAPE' }

  // 项目根自身也可能经符号链接到达（macOS 的 /var → /private/var、Linux 的 /tmp），两侧都要归一。
  // 父目录尚未创建时（NEW 文件要 mkdir -p）realpath 必然失败：在项目根内逐级上溯到最近的存在
  // 祖先再比对，否则「新项目 + 链接来的项目根」会被误判成逃逸，拒掉一次本该成功的注入。
  const root = realpath(rootPath) ?? rootPath
  const parent = dirname(absPath)
  const realParent = realpathNearestWithin(parent, rootPath, realpath) ?? parent
  if (!isInside(root, realParent)) return { ok: false, reason: 'ESCAPE' }
  // 目标自身是符号链接时，writeFile 会顺着它写到项目外
  const realSelf = realpath(absPath)
  if (realSelf === null) {
    // 悬空链接（目标文件还不存在）realpath 必然失败，落点无法证明在项目内：
    // 注入从不需要顺着链接写，一律拒绝，否则 writeFile 会在项目外凭空建出文件
    if (isSymbolicLink(absPath)) return { ok: false, reason: 'ESCAPE' }
  } else if (!isInside(root, realSelf)) {
    return { ok: false, reason: 'ESCAPE' }
  }
  return { ok: true, absPath }
}

function isSymbolicLink(abs: string): boolean {
  try {
    return lstatSync(abs).isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 上溯到项目根内最近的存在目录并归一符号链接；一路到项目根都不存在则 null。
 * 到边界即停：项目根之下不存在的路径段不可能是符号链接，越过根去比对反而会把
 * 「/tmp 自身是 /private/tmp 的链接」这类环境事实误判成逃逸。
 */
function realpathNearestWithin(
  dir: string,
  boundary: string,
  realpath: (p: string) => string | null,
): string | null {
  let cur = dir
  for (;;) {
    const real = realpath(cur)
    if (real !== null) return real
    const up = dirname(cur)
    if (up === cur || !isInside(boundary, up)) return null
    cur = up
  }
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

/**
 * clean 的 lock 路径净化（m6b FR-6.6 v1.4）——**必须早于 `PackLockSchema` 整机校验**。
 * 理由已写进规格：`packPathSchema`（shared/schemas/pack.ts:130 = isValidPackRelativePath）会先把
 * 含 `..` 的 lock 整份判成 schema 不符，顺序反了就只剩 §7.10 f2 的 LOCK_INVALID，
 * §7.10 g 要的「报告含违规路径」永远出不来（g 与 f2 互吃）。
 *
 * 入参是**宽松读出的 JSON**（`unknown`）而不是 `PackLock`：能读出 `files[].path` 字符串就报得出违规项；
 * 结构读不出（没有 `files`、路径不是字符串）时返回空清单，那一档才是 LOCK_INVALID 的活。
 * 违规一律记进 `escapingPaths` 单桶——对 clean 而言「malformed」与「escaping」是同一种危险
 * （resolve 后落在项目外），`invalidPaths` 那桶留给 sync 的 bundle 侧，这里不造第二套词。
 * 符号链接不在本函数查：那是磁盘状态而非 lock 文本的属性，归调用方的逐条 `resolveWriteTarget`
 * （两道闸各查一半，谁也不复制谁）。
 */
export function auditLockPaths(projectPath: string, raw: unknown): { escapingPaths: string[] } {
  const escapingPaths: string[] = []
  const files = (raw as { files?: unknown } | null | undefined)?.files
  if (!Array.isArray(files)) return { escapingPaths }
  const rootPath = resolve(projectPath)
  for (const entry of files) {
    const relPath = (entry as { path?: unknown } | null | undefined)?.path
    if (typeof relPath !== 'string') continue // 点不出名的违规项交给 schema 判 LOCK_INVALID
    // 文本规则与「相对项目根 resolve 后是否还在根内」查的是同一种危险的两侧，但两侧并不完全重合：
    // win32 上 `C:/evil.txt` 不含反斜杠、不以 `/` 开头，isValidPackRelativePath 放行，
    // resolve 却会把它归成根外的绝对路径——净化闸拿着 projectPath 就是为了这一步。
    if (!isValidPackRelativePath(relPath) || !isInside(rootPath, resolve(rootPath, relPath))) {
      escapingPaths.push(relPath)
    }
  }
  return { escapingPaths: escapingPaths.sort(compareCodeUnit) }
}
