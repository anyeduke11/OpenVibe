import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { PackLockSchema, type InjectionStatusOut } from '@openvibe/shared'

/** CLI 唯一写入的登记文件（design §7.5），服务端只读 */
export const PACK_LOCK_REL = join('.openvibe', 'pack.lock.json')

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
    return { exists: true, isDir: false, lockExists: false, warning: 'localPath 不是目录，按未注入处理' }
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
