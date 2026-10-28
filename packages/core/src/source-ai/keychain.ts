// `packages/core/src/source-ai/keychain.ts` —— **系统钥匙串**（macOS `security` CLI）
// （owner 2026-10-22 裁决一「手动调控」的凭据存放处）
//
// ## 它是什么
//
// 把 provider 的 API key 放进 **macOS 系统钥匙串**，而不是明文躺在 `app_meta` 里。
// ⚠️ **零依赖**（owner 的技术口径）⇒ 用系统自带的 `security` 命令，不引任何 npm 包。
//
// ## ⚠️ 写 key 时**绝不进 argv**
//
// `security add-generic-password -w <key>` 会把 key 放进**命令行** ⇒
// 它会出现在 `ps` 的进程表里（同机任何进程都看得到）⇒ **不可接受**。
// ⇒ 实测（2026-10-22）：`-w` **放最后且不带值**时，`security` 从 **stdin** 读密码
//   （读两遍：「password data for new item:」与「retype password for new item:」）
//   ⇒ 秘密全程不进 argv。
//
// ## ⚠️ 三条降级纪律
//
// 1. **非 macOS**（Linux / Windows）⇒ 没有钥匙串 ⇒ 降级为 `app_meta` 明文；
// 2. **没有 `security` 命令**（精简 macOS / PATH 异常）⇒ 同上；
// 3. **钥匙串锁着 / 没有 GUI 会话**（SSH 登录）⇒ `security` 会失败 ⇒ 同上。
//
// ⇒ **降级必须被界面如实显示**（「以明文存」），不许悄悄降级 ——
//   见 `InterpretProviderView.api_key_storage_detail`。
//
// ## ⚠️ 为什么做成**可注入**的接口
//
// 单测**绝不能碰用户真实的钥匙串** ⇒ 核心逻辑收成一个接口
// （`KeychainStore`），真实现是 `realKeychainStore`，测试注入内存实现。

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runWithStdin } from '../source-scan/run-with-stdin'

const execFileAsync = promisify(execFile)

/** 钥匙串里的**服务名**（全局固定 —— 一把 key 一个账号）。 */
export const KEYCHAIN_SERVICE = 'com.openvibe.m9.interpret'

/** 钥匙串里的**账号名**（全局固定 ⇒ 换 provider 名不会攒下一堆孤儿条目）。 */
export const KEYCHAIN_ACCOUNT = 'api-key'

/** 这台机器能不能用系统钥匙串（探测结果）。 */
export interface KeychainSupport {
  available: boolean
  /** 人话说明（**不可用时要说清为什么**）。 */
  detail: string
}

/** 一次写入的结果。 */
export interface KeychainWriteResult {
  ok: boolean
  /** 人话说明。 */
  detail: string
}

/**
 * **钥匙串的存取接口**（可注入 ⇒ 测试不碰真钥匙串）。
 */
export interface KeychainStore {
  /** 这台机器能不能用。 */
  support(): Promise<KeychainSupport>
  /** 写一把 key（**成功与否都要说清楚**）。 */
  store(service: string, account: string, secret: string): Promise<KeychainWriteResult>
  /** 读一把 key（读不到 ⇒ `null`）。 */
  read(service: string, account: string): Promise<string | null>
  /** 删一把 key（删掉没有这一项 ⇒ 也算「删干净了」）。 */
  remove(service: string, account: string): Promise<boolean>
}

/** 探测（本机是不是 macOS、`security` 在不在）。 */
async function detect(): Promise<KeychainSupport> {
  if (process.platform !== 'darwin') {
    return {
      available: false,
      detail: `本机不是 macOS（${process.platform}）⇒ 没有系统钥匙串可用`,
    }
  }
  try {
    // ⚠️ `list-keychains` 比 `security -h` 合适 —— 后者退出码非 0（那是「打印用法」）
    await execFileAsync('security', ['list-keychains'], { timeout: 8_000 })
    return { available: true, detail: '本机有 macOS 系统钥匙串（security 命令可用）' }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === 'ENOENT') {
      return { available: false, detail: '本机没有 security 命令 ⇒ 没有系统钥匙串可用' }
    }
    return { available: false, detail: `系统钥匙串不可用：${(e.message ?? '').slice(0, 160)}` }
  }
}

/** 写一把 key（**秘密走 stdin**，不进 argv）。 */
async function store(
  service: string,
  account: string,
  secret: string,
): Promise<KeychainWriteResult> {
  // ⚠️ **`-w` 放最后且不带值** ⇒ `security` 从 stdin 读密码（读两遍）
  //   ⇒ 秘密**不进命令行**（不进 `ps` 的进程表）。
  const payload = `${secret}\n${secret}\n`
  try {
    const res = await runWithStdin(
      'security',
      ['add-generic-password', '-U', '-a', account, '-s', service, '-w'],
      payload,
      { timeoutMs: 20_000 },
    )
    if (res.timedOut) {
      return { ok: false, detail: '写系统钥匙串超时（钥匙串可能在等你解锁）' }
    }
    if (res.code !== 0) {
      const msg = (res.stderr || res.stdout).replace(/\s+/gu, ' ').trim()
      return { ok: false, detail: `写系统钥匙串失败：${msg.slice(0, 200)}` }
    }
    return { ok: true, detail: '已写入系统钥匙串' }
  } catch (err) {
    const e = err as { code?: string; message?: string }
    if (e.code === 'ENOENT') {
      return { ok: false, detail: '本机没有 security 命令 ⇒ 改用本地数据库存储' }
    }
    return { ok: false, detail: `写系统钥匙串失败：${(e.message ?? '').slice(0, 200)}` }
  }
}

/** 读一把 key（读不到 ⇒ `null`）。 */
async function read(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-a', account, '-s', service, '-w'],
      { timeout: 15_000, encoding: 'utf8' },
    )
    const value = stdout.replace(/\r?\n$/u, '')
    return value === '' ? null : value
  } catch {
    // ⚠️ **读不到不是错**（没配过 / 钥匙串锁着）⇒ 统一成 `null`
    return null
  }
}

/** 删一把 key。 */
async function remove(service: string, account: string): Promise<boolean> {
  try {
    await execFileAsync('security', ['delete-generic-password', '-a', account, '-s', service], {
      timeout: 15_000,
    })
    return true
  } catch {
    // ⚠️ 删不掉（本来就没有 / 钥匙串锁着）⇒ 报「没删掉」，由上层决定要不要如实说
    return false
  }
}

/** **真实现**（macOS `security` CLI）。 */
export const realKeychainStore: KeychainStore = { support: detect, store, read, remove }

/**
 * **内存实现**（单测用）—— 绝不碰用户真实的钥匙串。
 *
 * ⚠️ **故意做成「能失败」**（`failWith`）—— 降级路径本身也要被测到
 *   （「这台机器没有钥匙串 ⇒ key 以明文存」是**必须被验证的行为**，不是例外）。
 */
export function memoryKeychainStore(opts: { failWith?: string } = {}): KeychainStore & {
  items: Map<string, string>
} {
  const items = new Map<string, string>()
  const failWith = opts.failWith
  return {
    items,
    support: async () =>
      failWith === undefined
        ? { available: true, detail: '（测试用）内存钥匙串' }
        : { available: false, detail: failWith },
    store: async (_service, account, secret) => {
      if (failWith !== undefined) return { ok: false, detail: failWith }
      items.set(account, secret)
      return { ok: true, detail: '已写入（测试用）' }
    },
    read: async (_service, account) => items.get(account) ?? null,
    remove: async (_service, account) => items.delete(account),
  }
}
