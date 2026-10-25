import { describe, expect, it } from 'vitest'
import {
  classifyNativeFailure,
  describeNativeEnv,
  formatNativeStorageDiagnosis,
  loadDatabaseConstructor,
  NativeStorageUnavailableError,
} from './native-load'

/**
 * v0.2.3 批次 A FR-3：better-sqlite3 载入失败的可读诊断。
 * 判级 B（apps/cli 只消费 message，不第二处实现——加载点单源在 ./native-load.ts）。
 * 分类与排版是确定性纯函数，合成错误即可覆盖全部三类；
 * 真子进程的端到端腿在 apps/cli/test/native-failure.test.ts。
 */

const abiError = Object.assign(
  new Error(
    'Was compiled against a different Node.js version using\nNODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 147. Please re-compile your .node file',
  ),
  { code: 'ERR_DLOPEN_FAILED' },
)

const env = { platform: 'darwin', arch: 'arm64', nodeVersion: '22.11.0', abi: '147' }

describe('classifyNativeFailure', () => {
  it('ABI 不匹配 → abi-mismatch，摘录只取首行', () => {
    const r = classifyNativeFailure(abiError)
    expect(r.kind).toBe('abi-mismatch')
    expect(r.detail).toBe('Was compiled against a different Node.js version using')
  })

  it('模块缺失 → module-missing（code 与文案两种形态）', () => {
    const byCode = Object.assign(new Error('x'), { code: 'MODULE_NOT_FOUND' })
    expect(classifyNativeFailure(byCode).kind).toBe('module-missing')
    expect(classifyNativeFailure(new Error("Cannot find module 'better-sqlite3'")).kind).toBe(
      'module-missing',
    )
  })

  it('其他加载失败 → load-failed；非 Error 值也能归类', () => {
    expect(classifyNativeFailure(new Error('dlopen failed for some reason')).kind).toBe(
      'load-failed',
    )
    expect(classifyNativeFailure('一段裸文本').kind).toBe('load-failed')
  })

  it('超长摘录截断到 200 字符 + 省略号', () => {
    const r = classifyNativeFailure('x'.repeat(500))
    expect(r.detail.length).toBe(201)
    expect(r.detail.endsWith('…')).toBe(true)
  })
})

describe('formatNativeStorageDiagnosis（FR-3.1 三要素）', () => {
  const text = formatNativeStorageDiagnosis(env, classifyNativeFailure(abiError))

  it('要素一：当前平台与架构', () => {
    expect(text).toContain('当前环境：darwin / arm64')
  })

  it('要素二：Node 版本与 ABI', () => {
    expect(text).toContain('Node 22.11.0')
    expect(text).toContain('NODE_MODULE_VERSION 147')
  })

  it('要素三：三条修复路径（预编译 / 切 Node 版本 / 源码编译）', () => {
    expect(text).toContain('npm i -g openvibe-cli')
    expect(text).toContain('Node LTS')
    expect(text).toContain('npm rebuild better-sqlite3')
  })

  it('不透出堆栈（无缩进的 at 帧、无 Require stack）', () => {
    expect(text).not.toMatch(/^\s+at /m)
    expect(text).not.toContain('Require stack')
  })

  it('离线说明在场：不依赖此模块的命令仍可用', () => {
    expect(text).toContain('sync --file')
  })

  it('load-failed 与 module-missing 的人话原因分列（DL-08：「没配」与「跑挂了」是两件事）', () => {
    expect(formatNativeStorageDiagnosis(env, { kind: 'module-missing', detail: 'x' })).toContain(
      '模块未安装或解析不到',
    )
    expect(formatNativeStorageDiagnosis(env, { kind: 'load-failed', detail: 'x' })).toContain(
      '原生模块加载失败',
    )
  })
})

describe('describeNativeEnv / loadDatabaseConstructor', () => {
  it('默认取当前进程；versions 缺失时如实写 unknown，不造假数字', () => {
    const e = describeNativeEnv()
    expect(e.platform).toBe(process.platform)
    expect(e.abi).toBe(process.versions.modules)
    const partial = describeNativeEnv({
      platform: 'linux',
      arch: 'x64',
      versions: {},
    } as unknown as NodeJS.Process)
    expect(partial.nodeVersion).toBe('unknown')
    expect(partial.abi).toBe('unknown')
  })

  it('加载点（createRequire 路径）在本机可用，且构造器被缓存复用', () => {
    const first = loadDatabaseConstructor()
    expect(typeof first).toBe('function')
    expect(loadDatabaseConstructor()).toBe(first)
  })

  it('NativeStorageUnavailableError：name 固定，cause 保留（serve catch 按名映射错误码）', () => {
    const e = new NativeStorageUnavailableError('诊断文本', { cause: abiError })
    expect(e.name).toBe('NativeStorageUnavailableError')
    expect((e as { cause?: unknown }).cause).toBe(abiError)
  })
})
