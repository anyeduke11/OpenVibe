import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  AppError,
  PackLockSchema,
  type InjectionFileRow,
  type InjectionFileScanOut,
  type InjectionStatusOut,
} from '@openvibe/shared'
import { diffPackLock } from '../inject/planner'

/** CLI 唯一写入的登记文件（design §7.5），服务端只读 */
export const PACK_LOCK_REL = join('.openvibe', 'pack.lock.json')

/** N3 钩子执行留痕（docs/specs/n3-hooks.md FR-4.6）：JSONL 追加，每次执行一行，服务端只读 */
export const HOOKS_RUN_REL = join('.openvibe', 'hooks-run.jsonl')

export interface LocalPathCheck {
  exists: boolean
  isDir: boolean
  lockExists: boolean
  /** 有值即「允许保存但需提示」（m5 FR-1.3 / §6.1） */
  warning?: string
}

/** 保存项目时校验 localPath：不存在或不是目录都降级为 warning，不阻断创建 */
export function checkLocalPath(localPath: string | null | undefined): LocalPathCheck {
  if (!localPath) return { exists: false, isDir: false, lockExists: false }
  let isDirectory = false
  try {
    isDirectory = statSync(localPath).isDirectory()
  } catch {
    return { exists: false, isDir: false, lockExists: false, warning: '路径当前不存在' }
  }
  if (!isDirectory) {
    return {
      exists: true,
      isDir: false,
      lockExists: false,
      warning: 'localPath 不是目录，按未注入处理',
    }
  }
  return { exists: true, isDir: true, lockExists: existsSync(join(localPath, PACK_LOCK_REL)) }
}

export interface InjectionStatusInput {
  localPath: string | null
  registered: { packId: string | null; version: string | null } | null
}

/**
 * 只读解析 `<localPath>/.openvibe/pack.lock.json`（m5 FR-6）。
 * 任何读取/解析失败都回 { lockPresent:false, error } —— 注入状态是旁路信息，不得影响工作台其他字段。
 */
export function readInjectionStatus(input: InjectionStatusInput): InjectionStatusOut {
  const { localPath, registered } = input
  if (!localPath) return { lockPresent: false, error: '未登记本地路径' }

  let lockText: string
  try {
    lockText = readFileSync(join(localPath, PACK_LOCK_REL), 'utf8')
  } catch {
    return { lockPresent: false, error: 'lock 文件异常' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(lockText)
  } catch {
    return { lockPresent: false, error: 'lock 文件异常' }
  }
  const lock = PackLockSchema.safeParse(parsed)
  if (!lock.success) return { lockPresent: false, error: 'lock 文件异常' }

  const out: InjectionStatusOut = {
    lockPresent: true,
    pack: {
      name: lock.data.pack.name,
      version: lock.data.pack.version,
      fingerprint: lock.data.pack.fingerprint,
    },
    injectedAt: lock.data.injectedAt,
    suggestedCommand: `npx openvibe-cli sync ${localPath} --pack ${lock.data.pack.name}`,
  }
  if (registered?.version) {
    out.registered = { packId: registered.packId ?? lock.data.pack.id, version: registered.version }
    out.upToDate = registered.version === lock.data.pack.version
  }
  return out
}

/**
 * 扫描注入产物（原型 inject「产物台账（九文件 + lock）」）。
 *
 * 与 `readInjectionStatus` 的分工：后者答「注入过没有、版本对不对」，
 * 本函数答「**每个文件现在对不对得上**」。两者都只读 lock，都不写盘。
 *
 * ⚠️ 逐文件判定**复用** `diffPackLock`（service-layer FR-2 的单一比对规则），
 *   本函数不另写一套哈希比对 —— 另写必然与 CLI 的 diff/verify 漂移。
 * ⚠️ lock 自身作为**合成行** `LOCK` 附在末尾：它不是包产物，但台账要能看见它。
 * ⚠️ 非 ENOENT/ENOTDIR 的读错误**原样上抛**（与 CLI 的 diskReader 同口径）：
 *   权限/IO 失败不能当成「文件不存在」，更不能当成「内容不一致」。
 */
export function scanInjectionFiles(localPath: string | null): InjectionFileScanOut {
  if (!localPath) return { lockPresent: false, files: [], error: '未登记本地路径' }

  let lockText: string
  try {
    lockText = readFileSync(join(localPath, PACK_LOCK_REL), 'utf8')
  } catch {
    return { lockPresent: false, files: [], error: 'lock 文件异常' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(lockText)
  } catch {
    return { lockPresent: false, files: [], error: 'lock 文件异常' }
  }
  const lock = PackLockSchema.safeParse(parsed)
  if (!lock.success) return { lockPresent: false, files: [], error: 'lock 文件异常' }

  const readDisk = (relPath: string): string | null => {
    try {
      return readFileSync(join(localPath, relPath), 'utf8')
    } catch (e) {
      const err = e as NodeJS.ErrnoException
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null
      throw new AppError('INTERNAL', `读取注入产物失败：${relPath}`, undefined, err.message)
    }
  }

  const rows: InjectionFileRow[] = diffPackLock(lock.data, readDisk).files.map((f) => ({
    path: f.path,
    state: f.state,
    managed: f.managed,
    declaredSha256: f.declaredSha256,
    diskSha256: f.diskSha256,
  }))
  rows.push({ path: PACK_LOCK_REL, state: 'LOCK', managed: false })

  return {
    lockPresent: true,
    pack: {
      name: lock.data.pack.name,
      version: lock.data.pack.version,
      fingerprint: lock.data.pack.fingerprint,
    },
    injectedAt: lock.data.injectedAt,
    files: rows,
  }
}
