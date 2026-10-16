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

/**
 * apps/cli/src/index.ts 里真正注册进 program 的子命令，以及它的 `.description()`。
 *
 * 带 **接收者**（receiver）是必须的：`session` 是命令组，`log` 注册在它自己身上
 * （`sessionCmd.command('log')`），而 shared 的 name 记的是**顶层命令名**。
 * 只按 `.command('…')` 取名字会把子命令 `log` 当成顶层命令，于是漂移闸要么误报、
 * 要么逼着 shared 多登记一条叫 `log` 的命令（那会让 usage 前缀断言 IT-CLI-CMD-01 必红）。
 */
interface RegisteredCommand {
  /** 命令名 */
  name: string
  /** 注册挂在谁身上：`program` 是顶层命令，其余是子命令 */
  receiver: string
  /** 同名注册紧跟其后的 `.description('…')` 原文；取不到就是 null */
  summary: string | null
}

function registeredCommands(): RegisteredCommand[] {
  const src = readFileSync(CLI_INDEX, 'utf8')
  const hits = [...src.matchAll(/(\w+)\s*\.command\('([a-z][a-z-]*)'\)/g)]
  return hits.map((hit, i) => {
    const from = (hit.index ?? 0) + hit[0].length
    const to = hits[i + 1]?.index ?? src.length
    const desc = src.slice(from, to).match(/\.description\(\s*'((?:[^'\\]|\\.)*)'\s*\)/)
    return {
      name: hit[2] as string,
      receiver: hit[1] as string,
      summary: desc ? (desc[1] as string) : null,
    }
  })
}

/** 顶层命令：挂在 program 上的那些 */
function topLevelCommands(): RegisteredCommand[] {
  return registeredCommands().filter((c) => c.receiver === 'program')
}

describe('GET /api/cli/commands（CLI 命令参考）', () => {
  it('IT-CLI-CMD-01: 200 + 九条命令（既有五条 + M8 四条），字段齐全且 risk 落在闭集内', async () => {
    const h = await makeHarness()
    const res = await api(h, '/api/cli/commands')
    expect(res.statusCode).toBe(200)

    const body = res.json as CliCommandsOut
    expect(Object.keys(body)).toEqual(['items'])
    expect(body.items).toHaveLength(9)
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

  it('IT-CLI-CMD-02: 漂移闸——shared 的顶层命令名集合 == apps/cli 的真实注册名集合', () => {
    const top = topLevelCommands()
    expect(top.length).toBeGreaterThan(0)
    expect(top.map((c) => c.name).sort()).toEqual([...CLI_COMMANDS].map((c) => c.name).sort())
    // 子命令闭集：挂在别的命令对象上的注册。改动它必须同时改 shared 的 usage，
    // 否则漂移闸看不见这条命令 ⇒ 这里钉成闭集，多一条少一条都红。
    //
    // ⚠️ 逐字序而非排序序：`requirement add` 的注册刻意排在 `session log` **之前**
    // （apps/cli/src/index.ts 的 buildProgram 里有注释说明），故源码序恰等于码点序
    // （'add' < 'log'）。顺序因此仍是契约——**不是**为了省事才这么排；
    // 若日后挪动注册顺序，必须改成排序比较并在测试里说明放弃了顺序校验。
    expect(registeredCommands().filter((c) => c.receiver !== 'program').map((c) => c.name)).toEqual([
      'add',
      'log',
    ])
  })

  it('IT-CLI-CMD-05: summary 逐字等于注册处的 .description()（FR-4.3.3）', () => {
    const descriptions = new Map(topLevelCommands().map((c) => [c.name, c.summary]))
    for (const meta of CLI_COMMANDS) {
      expect(descriptions.get(meta.name) ?? null, `apps/cli 未注册 ${meta.name}`).toBe(meta.summary)
    }
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
    // ask / status 只发 GET（FR-4.4），三只都不碰本机磁盘
    expect(byName.get('ask')?.risk).toBe('readonly')
    expect(byName.get('ask')?.writesDisk).toBe(false)
    expect(byName.get('status')?.risk).toBe('readonly')
    expect(byName.get('status')?.writesDisk).toBe(false)
    // session log 改服务端 DB 且无确认闸 ⇒ 与 scan 同档同因（FR-4.3.2）
    expect(byName.get('session')?.risk).toBe('decision')
    expect(byName.get('session')?.writesDisk).toBe(false)
    // requirement add 同样只发一次 POST /api/agent/ingest 改服务端 DB（落一条 pending 记录），
    // CLI 侧无确认闸 ⇒ 同一档；本机零落盘 ⇒ writesDisk 仍为 false
    expect(byName.get('requirement')?.risk).toBe('decision')
    expect(byName.get('requirement')?.writesDisk).toBe(false)
  })

  it('IT-CLI-CMD-04: 缺令牌 401', async () => {
    const h = await makeHarness()
    const anon = await h.app.inject({ method: 'GET', url: '/api/cli/commands' })
    expect(anon.statusCode).toBe(401)
  })
})
