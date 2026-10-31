import { existsSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ADAPTER_MAIN_PATH } from '@openvibe/adapters'
import {
  diffPackLock,
  parsePackLock,
  planVerify,
  resolveWriteTarget,
  summarizeDiff,
} from '@openvibe/core'
import type { PackExportOut, PackLock } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'
import { pickExport } from '../pack-source'
import { lockPathOf } from './diff'

/**
 * `openvibe verify <projectPath>`（v0.2.3 批次 B FR-4，spec `v023-b-first-lap.md`）：
 * 包 / lock / 磁盘 三方一致性的只读核验，输出六态之一（CONSISTENT / PARTIAL /
 * ORPHAN / DISK_DRIFT / STALE_LOCK / UNMANAGED）。全程零写入——「verify 前后项目
 * 目录逐字节不变」是本命令的验收判据之一。包侧核验 v1 用版本级代理（服务端同包
 * 最新导出版本 vs lock 版本），渲染级比对留给 preview 集成（登记于 DEV-0113）。
 */

/** 磁盘上若出现带注入标记却不在 lock 里的文件，就是弃儿（lock 被删/重建的残骸） */
const PRODUCT_MARKER = '<!-- openvibe:pack='

export class VerifyError extends Error {
  readonly code: string
  /**
   * 诊断原文（允许英文：Node 的 errno 消息等）。
   *
   * 与 `message` 分通道：`message` 只写中文一句话（说清哪里坏了），
   * `detail` 承接排障原文。打印在 `printer.fail(code, message, detail)`。
   */
  readonly detail?: string
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'VerifyError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

export interface VerifyOptions {
  projectPath: string
}

export interface VerifyDeps {
  client?: ApiClient
}

export type VerifyOutcomeState =
  'CONSISTENT' | 'PARTIAL' | 'ORPHAN' | 'DISK_DRIFT' | 'STALE_LOCK' | 'UNVERIFIED' | 'UNMANAGED'

export interface VerifyOutcome {
  projectPath: string
  lockPath: string
  pack: PackLock['pack'] | null
  state: VerifyOutcomeState
  /** 一句人话结论（planVerify 的 reason；UNMANAGED 有自己的文案） */
  reason: string
  missing: string[]
  drifted: { path: string; expected: string; actual: string }[]
  orphan: string[]
  newer: { from: string; to: string } | null
  /** 是否真的调过服务端（离线/无令牌时 false） */
  probedOnline: boolean
  warnings: string[]
  /** 与 warnings 同序等长的诊断原文（允许英文） */
  warningDetails?: (string | undefined)[]
  hints: string[]
  exitCode: 0 | 2
}

function assertProjectDir(projectPath: string): string {
  const abs = resolve(projectPath)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new VerifyError(
      'PROJECT_NOT_DIR',
      `项目路径不是目录：${abs}（openvibe verify <projectPath>）`,
    )
  }
  return abs
}

/** 与 diff 的 diskReader 同一口径：返回 utf8 文本（哈希由 diffPackLock 内部统一做）；缺失返回 null */
function diskTextOf(projectPath: string, relPath: string): string | null {
  const abs = resolveWriteTarget(projectPath, relPath)
  if (abs === null) throw new VerifyError('PATH_ESCAPE', `lock 里的 ${relPath} 解析后不在项目内`)
  try {
    return readFileSync(abs, 'utf8')
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null
    throw new VerifyError('READ_FAILED', `读取 ${abs} 失败`, err.message)
  }
}

/** 扫六个平台主文件：带注入标记却不在 lock 登记内 ⇒ 弃儿 */
function scanMarkedUnregistered(projectPath: string, lock: PackLock): string[] {
  const registered = new Set(lock.files.map((f) => f.path))
  const found: string[] = []
  for (const relPath of Object.values(ADAPTER_MAIN_PATH)) {
    if (registered.has(relPath)) continue
    try {
      const text = readFileSync(join(projectPath, relPath), 'utf8')
      if (text.includes(PRODUCT_MARKER)) found.push(relPath)
    } catch {
      // 不存在或读不了都不算弃儿（读错误会在受管比对一侧如实抛）
    }
  }
  return found
}

/** 与 diff 的 probeOutdated 同一探测：服务端同包最新导出版本；任何失败只降级成警告 */
async function probeLatestVersion(
  client: ApiClient,
  pack: PackLock['pack'],
): Promise<{
  latest: string | null
  warnings: string[]
  warningDetails?: (string | undefined)[]
  probedOnline: boolean
}> {
  try {
    const list = await client.getJson<{ items: PackExportOut[] }>(`/api/packs/${pack.id}/exports`)
    if (list.items.length === 0) {
      return {
        latest: null,
        warnings: [`服务端没有标准包 ${pack.name}@${pack.version} 的导出记录，包侧未核`],
        probedOnline: true,
      }
    }
    return { latest: pickExport(list.items, null).version, warnings: [], probedOnline: true }
  } catch (e) {
    // 人话只说「探测失败」；英文诊断原文走 detail 位（warn 通道的双通道纪律）
    const reason = e instanceof ServerUnreachable ? '服务端不可达' : '探测失败'
    return {
      latest: null,
      warnings: [`包侧未核（${reason}）；lock 与磁盘的比对不受影响`],
      warningDetails: [
        e instanceof ServerUnreachable ? e.detail : ((e as Error).message ?? String(e)),
      ],
      probedOnline: false,
    }
  }
}

export async function verifyAction(
  options: VerifyOptions,
  deps: VerifyDeps = {},
): Promise<VerifyOutcome> {
  const projectPath = assertProjectDir(options.projectPath)
  const lockPath = lockPathOf(projectPath)

  if (!existsSync(lockPath)) {
    return {
      projectPath,
      lockPath,
      pack: null,
      state: 'UNMANAGED',
      reason: '该目录没有 pack.lock.json：尚未由 OpenVibe 托管',
      missing: [],
      drifted: [],
      orphan: [],
      newer: null,
      probedOnline: false,
      warnings: [],
      hints: [
        '该目录还没有 pack.lock.json：尚未由 OpenVibe 托管。openvibe sync <projectPath> 首次注入',
      ],
      exitCode: 2,
    }
  }

  let lock: PackLock | null
  try {
    lock = parsePackLock(readFileSync(lockPath, 'utf8'))
  } catch (e) {
    throw new VerifyError('LOCK_INVALID', `${lockPath} 读取失败`, (e as Error).message)
  }
  if (!lock) {
    throw new VerifyError(
      'LOCK_INVALID',
      `${lockPath} 无法解析或含非法文件路径：被改过的 lock 不能当核验基准。` +
        '删掉它再 openvibe sync 一次可重建',
    )
  }

  const buckets = summarizeDiff(diffPackLock(lock, (relPath) => diskTextOf(projectPath, relPath)))
  const orphan = scanMarkedUnregistered(projectPath, lock)

  let latest: string | null = null
  const warnings: string[] = []
  // 与 warnings 同序等长：每条提示的诊断原文（没有诊断的位置是 undefined）
  const warningDetails: (string | undefined)[] = []
  let probedOnline = false
  if (deps.client) {
    const probe = await probeLatestVersion(deps.client, lock.pack)
    latest = probe.latest
    warnings.push(...probe.warnings)
    warningDetails.push(...(probe.warningDetails ?? probe.warnings.map(() => undefined)))
    probedOnline = probe.probedOnline
  } else {
    warnings.push('离线：包侧未核（未探测服务端是否有更新导出版本）')
    warningDetails.push(undefined)
  }

  const plan = planVerify({
    missing: buckets.missing,
    drifted: buckets.drifted,
    markedUnregistered: orphan,
    latestExportVersion: latest,
    packVersion: lock.pack.version,
    // ⚠️ **R0 · 证据诚实（2026-10-31）**：把「到底问没问到服务端」传给判定函数。
    //   离线（无 client）或探测失败 ⇒ probedOnline=false ⇒ 判 UNVERIFIED（不再判 CONSISTENT）。
    probedOnline,
  })

  const hints: string[] = []
  if (plan.fix) hints.push(plan.fix)
  if (buckets.foreign.length > 0)
    hints.push(
      `未受管条目被改 ${buckets.foreign.length} 项（lock 标记 managed=false 或位于 .openvibe/ 下），不计入一致性判定`,
    )

  return {
    projectPath,
    lockPath,
    pack: lock.pack,
    state: plan.state,
    reason: plan.reason,
    missing: plan.missing,
    drifted: plan.drifted,
    orphan: plan.orphan,
    newer: plan.newer,
    probedOnline,
    warnings,
    // 活引用（不是快照）：probe 的 warnings 是整段汇入的，快照需与 push 逐次对齐，
    // 漏一处就丢一条 detail ⇒ 引用同一数组。
    warningDetails,
    hints,
    exitCode: plan.exitCode,
  }
}
