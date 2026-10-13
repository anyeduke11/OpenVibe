import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { newDb, type TestDbHandle } from '@openvibe/core/test-support'
import { CLI_COMMANDS, CLI_COMMAND_RISKS, type CliCommandsOut } from '@openvibe/shared'
import { buildApp } from '../src/app'

/**
 * GET /api/cli/commands：设置页「CLI 命令参考」表的只读数据源。
 *
 * 最要紧的是那条**漂移闸**：命令元数据落 shared 是为了绕开 R4（server 不得 import apps/cli），
 * 代价是这份快照可能与 apps/cli 的真实注册表脱节。所以从 apps/cli/src/index.ts 的源码里
 * 解析出 `.command('…')` 的真实注册名，与 shared 的 name 集合逐条比对，不一致即红。
 * （只读源码文本、不 import 该模块，与 R4 不冲突——R4 管的是模块依赖。）
 */

const TOKEN = 'test-token'
const CLI_INDEX = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'cli',
  'src',
  'index.ts',
)

interface Harness {
  app: FastifyInstance
  handle: TestDbHandle
}

const openHandles: Harness[] = []

async function makeHarness(): Promise<Harness> {
  const handle = newDb()
  const { app } = await buildApp({ db: handle.db, token: TOKEN })
  const harness = { app, handle }
  openHandles.push(harness)
  return harness
}

afterEach(() => {
  while (openHandles.length > 0) {
    const h = openHandles.pop()
    void h?.app.close()
    h?.handle.close()
  }
})

const api = async (h: Harness, url: string): Promise<{ statusCode: number; json: unknown }> => {
  const res = await h.app.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${TOKEN}` },
  })
  return { statusCode: res.statusCode, json: res.json() }
}

/** apps/cli/src/index.ts 里真正注册进 program 的子命令名 */
function registeredCommandNames(): string[] {
  const src = readFileSync(CLI_INDEX, 'utf8')
  return [...src.matchAll(/\.command\('([a-z][a-z-]*)'\)/g)].map((m) => m[1] as string)
}

describe('GET /api/cli/commands（CLI 命令参考）', () => {
  it('IT-CLI-CMD-01: 200 + 五条命令，字段齐全且 risk 落在闭集内', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/cli/commands')
    expect(res.statusCode).toBe(200)

    const body = res.json as CliCommandsOut
    expect(Object.keys(body)).toEqual(['items'])
    expect(body.items).toHaveLength(5)
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual([
        'flags',
        'name',
        'risk',
        'summary',
        'usage',
        'writesDisk',
      ])
      expect(item.usage.startsWith(`openvibe ${item.name}`)).toBe(true)
      expect(CLI_COMMAND_RISKS).toContain(item.risk)
      expect(typeof item.writesDisk).toBe('boolean')
      for (const f of item.flags) {
        expect(Object.keys(f).sort()).toEqual(['name', 'summary', 'value'])
        expect(f.name.startsWith('--')).toBe(true)
        expect(f.value).toMatch(/^<.+>$/)
      }
    }
  })

  it('IT-CLI-CMD-02: 漂移闸——shared 的命令名集合 == apps/cli 的真实注册名集合', async () => {
    const registered = registeredCommandNames().sort()
    expect(registered.length).toBeGreaterThan(0)
    expect([...CLI_COMMANDS].map((c) => c.name).sort()).toEqual(registered)
  })

  it('IT-CLI-CMD-03: risk 三档按真实行为落位（clean 删文件=destructive；diff 零写入=readonly）', async () => {
    const h = await makeHarness()
    const byName = new Map(
      ((await api(h, '/api/cli/commands')).json as CliCommandsOut).items.map((i) => [i.name, i]),
    )
    // clean 会 unlink 受管文件与 pack.lock.json（apps/cli/src/commands/clean.ts:372,395）
    expect(byName.get('clean')?.risk).toBe('destructive')
    expect(byName.get('clean')?.writesDisk).toBe(true)
    // diff 只 readFileSync/statSync + 一次 GET（diff.ts:1,96）
    expect(byName.get('diff')?.risk).toBe('readonly')
    expect(byName.get('diff')?.writesDisk).toBe(false)
    expect(byName.get('diff')?.flags).toEqual([])
    // sync 写盘 + 覆盖前备份 + 冲突需拍板（sync.ts:399,402,327）⇒ 归中间档
    expect(byName.get('sync')?.risk).toBe('decision')
    expect(byName.get('sync')?.writesDisk).toBe(true)
    // scan 零磁盘写但改服务端 DB（scan.ts:158,193）
    expect(byName.get('scan')?.risk).toBe('decision')
    expect(byName.get('scan')?.writesDisk).toBe(false)
    // serve 建 ~/.openvibe 并落 config.json（serve.ts:89,105）
    expect(byName.get('serve')?.risk).toBe('decision')
    expect(byName.get('serve')?.writesDisk).toBe(true)
  })

  it('IT-CLI-CMD-04: 缺令牌 401', async () => {
    const h = await makeHarness()
    const anon = await h.app.inject({ method: 'GET', url: '/api/cli/commands' })
    expect(anon.statusCode).toBe(401)
  })
})
