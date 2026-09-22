import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { chmodSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  ConfigError,
  configFilePath,
  readConfigFile,
  resolveConfig,
  writeConfigFile,
} from '../src/config'

// Windows 的 chmod 只映射只读位，0600 断言是 POSIX 权限模型专属。
const itPosix = process.platform === 'win32' ? it.skip : it

/** 各用例的一次性 home，收尾统一删除 */
const homes: string[] = []

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'openvibe-home-'))
  homes.push(dir)
  return dir
}

afterAll(async () => {
  await Promise.all(homes.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function putFile(home: string, text: string): Promise<void> {
  await mkdir(home, { recursive: true })
  await writeFile(configFilePath(home), text, 'utf8')
}

describe('CLI 配置发现链（m6b §3）', () => {
  it('CLI-CFG-01: 优先级 旗标 > 环境变量 > config.json > 内置默认', async () => {
    const home = await tempHome()
    writeConfigFile({ serverUrl: 'http://127.0.0.1:9000', token: 'tok-file', port: 9000 }, home)

    expect(resolveConfig({}, { env: {}, home }).serverUrl).toBe('http://127.0.0.1:9000')
    expect(
      resolveConfig({}, { env: { OPENVIBE_SERVER: 'http://127.0.0.1:9100' }, home }).serverUrl,
    ).toBe('http://127.0.0.1:9100')
    expect(
      resolveConfig(
        { server: 'http://127.0.0.1:9200' },
        { env: { OPENVIBE_SERVER: 'http://127.0.0.1:9100' }, home },
      ).serverUrl,
    ).toBe('http://127.0.0.1:9200')

    const empty = await tempHome()
    expect(resolveConfig({}, { env: {}, home: empty }).serverUrl).toBe('http://127.0.0.1:8787')
    expect(resolveConfig({}, { env: {}, home: empty }).sources.serverUrl).toBe('default')
  })

  it('CLI-CFG-02: token 同链路，sources 逐字段可追溯（供 --json 与排错）', async () => {
    const home = await tempHome()
    writeConfigFile({ serverUrl: 'http://127.0.0.1:8787', token: 'tok-file', port: 8787 }, home)

    const flag = resolveConfig({ token: 'tok-flag' }, { env: {}, home })
    expect(flag.token).toBe('tok-flag')
    expect(flag.sources).toEqual({ serverUrl: 'config.json', token: 'flag', port: 'config.json' })

    const env = resolveConfig({}, { env: { OPENVIBE_TOKEN: 'tok-env' }, home })
    expect(env.token).toBe('tok-env')
    expect(env.sources.token).toBe('env')
  })

  itPosix('CLI-CFG-03: config.json 落盘 0600，二次覆盖仍 0600（m6b §7.8）', async () => {
    const home = await tempHome()
    const path = writeConfigFile(
      { serverUrl: 'http://127.0.0.1:8787', token: 'a'.repeat(48), port: 8787 },
      home,
    )
    expect(path).toBe(configFilePath(home))
    // 掩码取 0o777（全权限位）；0o077 只覆盖 group+other，用它比对 0o600 恒为 0，断言会假通过
    expect(statSync(path).mode & 0o777).toBe(0o600)

    // 先把权限放宽（模拟被别的工具/旧版本建过的 config.json），再走写入路径确认被收回 0600：
    // writeFile 的 mode 只在新建时生效，已存在时沿用旧权限，必须显式 chmod
    chmodSync(path, 0o644)
    expect(statSync(path).mode & 0o777).toBe(0o644)
    writeConfigFile({ serverUrl: 'http://127.0.0.1:8788', token: 'b'.repeat(48), port: 8788 }, home)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(path, 'utf8')).port).toBe(8788)
  })

  it('CLI-CFG-04: 父目录不存在时自动创建（首启 ~/.openvibe 尚未建立）', async () => {
    const home = join(await tempHome(), 'deep', 'nest')
    await mkdir(join(home, '..'), { recursive: true })
    const path = writeConfigFile(
      { serverUrl: 'http://127.0.0.1:8787', token: 't', port: 8787 },
      home,
    )
    expect(path).toBe(configFilePath(home))
    expect(JSON.parse(await readFile(path, 'utf8')).token).toBe('t')
  })

  it('CLI-CFG-05: 损坏 JSON / 字段缺失降级为默认值并给 warning，不抛异常', async () => {
    const corrupt = await tempHome()
    await putFile(corrupt, '{"serverUrl": ')
    expect(readConfigFile(corrupt).error).toBeTruthy()
    const r = resolveConfig({}, { env: {}, home: corrupt })
    expect(r.serverUrl).toBe('http://127.0.0.1:8787')
    expect(r.warnings.join(' ')).toContain('config.json')
    expect(r.warnings).toHaveLength(1)

    const partial = await tempHome()
    await putFile(partial, '{"port": 8787}')
    const p = resolveConfig({}, { env: {}, home: partial })
    expect(p.token).toBeNull()
    expect(p.warnings).toHaveLength(1)

    const missing = await tempHome()
    expect(readConfigFile(missing)).toEqual({ config: null })
    expect(resolveConfig({}, { env: {}, home: missing }).warnings).toEqual([])
  })

  it('CLI-CFG-06: 无 token 时给可执行提示（m6b §6.6），离线模式不受影响', async () => {
    const home = await tempHome()
    const r = resolveConfig({}, { env: {}, home })
    expect(r.token).toBeNull()
    expect(r.hint).toContain('openvibe serve')

    await putFile(
      home,
      JSON.stringify({ serverUrl: 'http://127.0.0.1:8787', token: '', port: 8787 }),
    )
    expect(resolveConfig({}, { env: {}, home }).token).toBeNull()
  })

  it('CLI-CFG-07: 非法旗标早失败（不带着坏配置发请求），尾斜杠归一化', async () => {
    const home = await tempHome()
    expect(() => resolveConfig({ server: 'not a url' }, { env: {}, home })).toThrow(ConfigError)
    expect(() => resolveConfig({ server: 'ftp://127.0.0.1:8787' }, { env: {}, home })).toThrow(
      /http/,
    )
    expect(() => resolveConfig({ token: 'has space' }, { env: {}, home })).toThrow(ConfigError)
    expect(resolveConfig({ server: 'http://127.0.0.1:8787/' }, { env: {}, home }).serverUrl).toBe(
      'http://127.0.0.1:8787',
    )
    // 非回环 host 允许（远程自部署场景），但必须显式给出
    expect(resolveConfig({ server: 'http://10.0.0.5:8787' }, { env: {}, home }).serverUrl).toBe(
      'http://10.0.0.5:8787',
    )
  })

  it('CLI-CFG-08: port 由解析后的 serverUrl 推导，缺省回 8787', async () => {
    const home = await tempHome()
    expect(resolveConfig({ server: 'http://127.0.0.1:9300' }, { env: {}, home }).port).toBe(9300)
    expect(resolveConfig({}, { env: {}, home: join(home, 'none') }).port).toBe(8787)
    writeConfigFile({ serverUrl: 'http://127.0.0.1:9400', token: 't', port: 9400 }, home)
    expect(resolveConfig({}, { env: {}, home }).port).toBe(9400)
  })
})
