// packages/core/src/inject/lock.ts —— `.openvibe/pack.lock.json` 的装配与解析（design §7.5）。
// CLI 是唯一写入方，服务端只读（apps/cli 落盘，packages/core/src/local/lock.ts 消费）。
import { join } from 'node:path'
import { PackLockSchema, compareCodeUnit, type PackLock } from '@openvibe/shared'
import type { InjectPlan } from './planner'

/** 备份目录相对项目根（m6b FR-2.5）；时间戳子目录与其 -1/-2 冲突后缀由 CLI 依磁盘状态决定 */
export const PACK_BACKUP_REL = join('.openvibe', 'backup')

export interface BuildLockInput {
  pack: { id: string; name: string; version: string; fingerprint: string }
  plan: InjectPlan
  /** 本次实际写入的路径（applyDecisions 的结果） */
  written: readonly string[]
  oldLock: PackLock | null
  injectedAt: string
}

/**
 * lock = 全部包文件的**期望哈希** + managed 标记。
 *
 * managed 取「上次已受管 ∪ 本次实写」：§7.5 只规定被 --target 过滤、从未写入的文件记
 * managed=false（登记期望哈希供后续补齐）。若按「本次是否写入」重算，
 * 一次 `--target cursor` 之后其余文件会在下次全量 sync 时从 DRIFT 降级成 CONFLICT——
 * 用户手改过的包内文件会被当成陌生本地文件，这是信息丢失而非更严格。
 */
export function buildPackLock(input: BuildLockInput): PackLock {
  const written = new Set(input.written)
  const planPaths = new Set(input.plan.files.map((f) => f.path))
  const oldByPath = new Map<string, PackLock['files'][number]>()
  for (const entry of input.oldLock?.files ?? []) oldByPath.set(entry.path, entry)

  const files = input.plan.files.map((file) => ({
    path: file.path,
    sha256: file.packSha256,
    managed: written.has(file.path) || (oldByPath.get(file.path)?.managed ?? false),
  }))
  // 包更新后消失的旧文件：MVP 不清理（P1 update 向导处理），哈希留档备查（m6b §6.2）
  for (const entry of input.oldLock?.files ?? []) {
    if (!planPaths.has(entry.path)) files.push({ ...entry })
  }
  files.sort((a, b) => compareCodeUnit(a.path, b.path))

  return {
    schemaVersion: 1,
    pack: { ...input.pack },
    injectedAt: input.injectedAt,
    files,
  }
}

/** 落盘文本：两空格缩进 + 结尾换行，与 manifest/bundle 同一口径 */
export function packLockJson(lock: PackLock): string {
  return `${JSON.stringify(lock, null, 2)}\n`
}

/** 读不到 / 不是 JSON / schema 不符 → null（调用方按「无 lock」走 CONFLICT 分支，安全侧） */
export function parsePackLock(text: string): PackLock | null {
  try {
    const parsed: unknown = JSON.parse(text)
    const result = PackLockSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}
