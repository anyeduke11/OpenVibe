import { createRequire } from 'node:module'

/**
 * better-sqlite3 的受控加载点（v0.2.3 批次 A FR-3，全仓唯一加载面）。
 *
 * 为什么是 openDatabase 内懒加载而不是顶层 import：CLI 入口静态 import @openvibe/core
 * （barrel），顶层 import 意味着原生模块在任何代码执行之前就必须装好——ABI 不匹配时
 * 进程直接死在模块加载期，任何 try/catch 都来不及挂，用户看到的是原始编译错误堆栈。
 * 改为首次打开数据库时加载 ⇒ ① 加载失败被收敛成一个结构化错误，走 serve 既有错误通道
 * 输出三要素诊断（平台与架构 / Node 版本与 ABI / 三条修复路径）；② 不打开数据库的
 * 路径（`sync --file` 等离线命令、`--help`）在原生模块损坏的机器上照常可用。
 */

type DatabaseConstructor = typeof import('better-sqlite3')

export interface NativeEnvInfo {
  platform: string
  arch: string
  nodeVersion: string
  abi: string
}

/** 环境三要素的采集点；参数注入供测试使用 */
export function describeNativeEnv(
  env: Pick<NodeJS.Process, 'platform' | 'arch' | 'versions'> = process,
): NativeEnvInfo {
  return {
    platform: env.platform,
    arch: env.arch,
    nodeVersion: env.versions.node ?? 'unknown',
    abi: env.versions.modules ?? 'unknown',
  }
}

export type NativeFailureKind = 'abi-mismatch' | 'module-missing' | 'load-failed'

/**
 * 失败分类：只取「可解释原因」的**首行摘录**（超长截断），不透出堆栈与 Require stack。
 * 分类是确定性的字符串判据，与加载机制无关——测试用合成错误即可覆盖全部三类。
 */
export function classifyNativeFailure(cause: unknown): { kind: NativeFailureKind; detail: string } {
  const raw = cause instanceof Error ? cause.message : String(cause)
  const firstLine = raw.split('\n', 1)[0] ?? ''
  const detail = firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine
  if (/NODE_MODULE_VERSION/.test(raw)) return { kind: 'abi-mismatch', detail }
  const code = (cause as { code?: unknown } | null)?.code
  if (code === 'MODULE_NOT_FOUND' || /^Cannot find module/.test(raw)) {
    return { kind: 'module-missing', detail }
  }
  return { kind: 'load-failed', detail }
}

const REPAIR_PATHS = [
  '① 重装取预编译包：npm i -g openvibe-cli 重跑安装（安装器按平台与 Node ABI 自动取预编译产物；pnpm 用户先 pnpm approve-builds 勾选 better-sqlite3）',
  '② 对齐 Node 版本：改用与该模块编译时一致的 Node LTS 大版本（ABI 即 NODE_MODULE_VERSION 需一致），然后重做 ①',
  '③ 源码编译兜底：本机需 Python 3 与 C++ 工具链（macOS：xcode-select --install；Debian/Ubuntu：apt install build-essential python3），在安装目录执行 npm rebuild better-sqlite3',
]

/**
 * 三要素诊断文本（FR-3.1）：当前平台与架构、Node 版本与 ABI、三条修复路径。
 * 这是错误的 message 本体——serve 的既有错误通道（`错误 [CODE] <message>`，人读走
 * stderr / --json 走 summary.error）原样带出，无需第二个打印实现。
 */
export function formatNativeStorageDiagnosis(
  env: NativeEnvInfo,
  cause: { kind: NativeFailureKind; detail: string },
): string {
  const kindLine =
    cause.kind === 'abi-mismatch'
      ? '原因：原生模块与当前 Node 的 ABI 不匹配'
      : cause.kind === 'module-missing'
        ? '原因：模块未安装或解析不到'
        : '原因：原生模块加载失败'
  return [
    '本地数据库的存储模块 better-sqlite3 加载失败。（实际库路径见本错误信封的「数据库无法打开：」前缀）',
    `当前环境：${env.platform} / ${env.arch}；Node ${env.nodeVersion}（ABI/NODE_MODULE_VERSION ${env.abi}）。`,
    `${kindLine}：${cause.detail}`,
    '三条修复路径（按推荐顺序）：',
    ...REPAIR_PATHS,
    '说明：该错误只在打开本地数据库时发生；`sync --file` 等离线命令不依赖此模块，仍可使用。',
  ].join('\n')
}

export class NativeStorageUnavailableError extends Error {
  constructor(
    message: string,
    options: { cause: unknown },
  ) {
    super(message, { cause: options.cause })
    this.name = 'NativeStorageUnavailableError'
  }
}

let cached: DatabaseConstructor | null = null

/**
 * 全仓唯一加载点（openDatabase 专用）。成功后缓存构造器；失败不缓存，
 * 抛 NativeStorageUnavailableError，message 即三要素诊断文本。
 */
export function loadDatabaseConstructor(): DatabaseConstructor {
  if (cached !== null) return cached
  try {
    const req = createRequire(import.meta.url)
    cached = req('better-sqlite3') as DatabaseConstructor
  } catch (e) {
    throw new NativeStorageUnavailableError(
      formatNativeStorageDiagnosis(describeNativeEnv(), classifyNativeFailure(e)),
      { cause: e },
    )
  }
  return cached
}
