/**
 * E2E-FLOW-01 飞轮主链（dev-plan §9-T9）：首启播种 → 建提示词 → 建项目 → 组包导出 →
 * CLI sync 临时目录 → 手改文件 → diff 报漂移 → 日志回流建术语草稿。
 *
 * 形态选型（owner 裁定 2026-09-23，见 dev-plan §14-6）：主链留在 vitest，不用 Playwright。
 * 与被排除的 `@openvibe/server` import 相对，这里起的是**真 serve 子进程**（`apps/cli` 的 R4
 * 边界不许测试直接 import server），八条腿全部走 HTTP 与真 CLI 进程——即用户点的那条链本身。
 * Web 界面的等价证据由 DEV-0019 的 CDP 走查驱动器承担，两者不互相替代。
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_ENTRY = join(HERE, '..', 'src', 'index.ts')
// serve 只带 --port 0：腿 1 要证的就是零参数首启能自己找到仓库的 seed 与 Web 产物

const ROOT = mkdtempSync(join(tmpdir(), 'openvibe-e2e-flow-'))
const HOME = join(ROOT, 'home')
const PROJECT = join(ROOT, 'project')
const BUNDLE = join(ROOT, 'bundle.json')

mkdirSync(HOME, { recursive: true })
mkdirSync(PROJECT, { recursive: true })

let serve: ChildProcess | null = null
let serveSummary: ServeSummary | null = null
let base = ''
let token = ''

/** serve 的 --json 只出一个对象；轮询到它能解析为止（端口 0 由系统分配，不能猜） */
interface ServeSummary {
  ok: true
  url: string
  token: string
  firstRun: boolean
  webServed: boolean
  telemetry: { endpoint: string; intervalMs: number }
}

async function waitForServe(proc: ChildProcess): Promise<ServeSummary> {
  let out = ''
  proc.stdout?.on('data', (d) => {
    out += String(d)
  })
  proc.stderr?.on('data', (d) => {
    out += String(d)
  })
  for (let i = 0; i < 80; i += 1) {
    await new Promise((r) => setTimeout(r, 250))
    try {
      const parsed = JSON.parse(out) as { summary?: Partial<ServeSummary> }
      if (parsed.summary?.ok === true && parsed.summary.url && parsed.summary.token)
        return parsed.summary as ServeSummary
    } catch {
      // 摘要尚未打全，继续等
    }
  }
  throw new Error(`serve 未输出摘要：${out.slice(0, 500)}`)
}

async function api(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  return { status: res.status, json: text === '' ? null : (JSON.parse(text) as unknown) }
}

/** 真 CLI 进程：与用户敲的命令同一条路径，含配置发现链与退出码 */
function cli(...args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, ['--import', 'tsx', CLI_ENTRY, ...args], {
    encoding: 'utf8',
    timeout: 25_000,
    env: { ...process.env, OPENVIBE_HOME: HOME },
  })
  return { status: r.status, stdout: String(r.stdout), stderr: String(r.stderr) }
}

function summaryOf(out: { stdout: string }): Record<string, unknown> {
  const parsed = JSON.parse(out.stdout) as { summary: Record<string, unknown> }
  return parsed.summary
}

beforeAll(async () => {
  serve = spawn(process.execPath, ['--import', 'tsx', CLI_ENTRY, '--json', 'serve', '--port', '0'], {
    env: { ...process.env, OPENVIBE_HOME: HOME },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const info = await waitForServe(serve)
  serveSummary = info
  base = info.url
  token = info.token
}, 30_000)

afterAll(async () => {
  if (serve && serve.exitCode === null) serve.kill()
  await new Promise((r) => setTimeout(r, 200))
  rmSync(ROOT, { recursive: true, force: true })
})

describe('E2E-FLOW-01 飞轮主链（dev-plan §9-T9）', () => {
  it(
    '播种 → 提示词 → 项目 → 组包导出 → sync → 手改 → diff 报漂移 → 回流建术语草稿',
    async () => {
      // ── 腿 1：首启播种（--port 0 的 serve 自己跑完 migration + seed + default 包组装）
      const settings = (await api('GET', '/api/settings')).json as {
        seed: { terms: number; flowTemplates: number; prompts: number }
        db: { status: string }
      }
      expect(settings.db.status).toBe('ok')
      expect(settings.seed.terms).toBeGreaterThanOrEqual(100)
      expect(settings.seed.flowTemplates).toBe(3)
      expect(settings.seed.prompts).toBe(20)
      expect(serveSummary?.firstRun).toBe(true)
      // 零外联是发布口径：没手写端点就连上报器都不建（结构闸门，不是运行时开关）
      expect(serveSummary?.telemetry.endpoint).toBe('')

      // ── 腿 2：建提示词（飞轮的输入侧）
      const promptRes = await api('POST', '/api/prompts', {
        title: 'E2E 主链提示词',
        content: '评审 PR 时先列风险再列改动，禁止无证据的“看起来没问题”。',
        folderPath: '/工程',
        platformMarks: ['claude-code'],
        useAs: 'rule',
        status: 'active',
      })
      expect(promptRes.status).toBe(201)
      const promptId = (promptRes.json as { id: string }).id
      expect(promptId).toBeTruthy()

      // ── 腿 3：建项目（localPath 必须是绝对路径，m5 FR-1.3）
      const templates = (await api('GET', '/api/flow-templates')).json as {
        items: { id: string }[]
      }
      const projectRes = await api('POST', '/api/projects', {
        name: 'e2e-flow-project',
        localPath: PROJECT,
        flowTemplateId: String(templates.items[0]?.id ?? ''),
      })
      expect(projectRes.status).toBe(201)
      const project = projectRes.json as { id: string; localPath: string }
      expect(project.localPath).toBe(PROJECT)

      // ── 腿 4：组包 + 导出 + 下载 bundle（bundle 是 CLI 唯一认得的交接物）
      const terms = (await api('GET', '/api/terms')).json as { items: { id: string }[] }
      const packRes = await api('POST', '/api/packs', {
        name: 'e2e-flow',
        description: '主链用例的包',
        selection: { promptIds: [promptId], termIds: [String(terms.items[0]?.id ?? '')] },
        targets: ['claude-code'],
      })
      expect(packRes.status).toBe(201)
      const pack = packRes.json as { id: string }
      const exportRes = await api('POST', `/api/packs/${pack.id}/export`, {
        version: '1.0.0',
        channel: 'download',
      })
      expect(exportRes.status).toBe(200)
      const exported = exportRes.json as { bundlePath: string; fingerprint: string }
      const downloaded = await fetch(`${base}${exported.bundlePath}`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(downloaded.status).toBe(200)
      expect(downloaded.headers.get('x-pack-fingerprint')).toBe(exported.fingerprint)
      writeFileSync(BUNDLE, await downloaded.text())

      // ── 腿 5：CLI sync 临时目录（九项产物里的 claude-code 侧 + lock）
      const sync = cli('--json', 'sync', PROJECT, '--file', BUNDLE, '--yes')
      expect(sync.status, sync.stderr.slice(0, 400)).toBe(0)
      const syncSummary = summaryOf(sync)
      expect(syncSummary.written).toBeGreaterThan(0)
      expect(syncSummary.injectionReported).toBe(true)
      const claudeMd = join(PROJECT, 'CLAUDE.md')
      const lock = join(PROJECT, '.openvibe', 'pack.lock.json')
      expect(existsSync(claudeMd)).toBe(true)
      expect(existsSync(lock)).toBe(true)
      expect(readFileSync(claudeMd, 'utf8')).toContain('E2E 主链提示词')

      // 注入上报要真的落到服务端，而不是 CLI 自说自话
      const injections = (await api('GET', `/api/packs/${pack.id}/injections`)).json as {
        total: number
      }
      expect(injections.total).toBeGreaterThanOrEqual(1)

      // ── 腿 6：手改受管文件（用户的真实退场路径之一）
      appendFileSync(claudeMd, '\n<!-- 手工追加的一行 -->\n')

      // ── 腿 7：diff 报漂移（退出码 2 = 有漂移，是本命令的对外契约）
      const drift = cli('--json', 'diff', PROJECT)
      expect(drift.status).toBe(2)
      const driftSummary = summaryOf(drift)
      expect(driftSummary.clean).toBe(false)
      expect((driftSummary.drifted as { path: string }[]).map((d) => d.path)).toContain('CLAUDE.md')
      expect(driftSummary.probedOnline).toBe(true)

      // 恢复路径：--yes 的缺省策略是「以包为准」（sync.ts:479），再 sync 应把受管文件写回、
      // diff 重回 clean——这同时排除了「漂移来自 lock 自身不稳定」的替代解释
      const resync = cli('--json', 'sync', PROJECT, '--file', BUNDLE, '--yes')
      expect(resync.status, resync.stderr.slice(0, 400)).toBe(0)
      const reclean = cli('--json', 'diff', PROJECT)
      expect(reclean.status, reclean.stdout.slice(0, 400)).toBe(0)
      expect(summaryOf(reclean).clean).toBe(true)

      // ── 腿 8：日志回流建术语草稿（飞轮第⑤步，闭环回到资产库）
      const logRes = await api('POST', `/api/projects/${project.id}/devlog`, {
        type: 'DEV',
        title: 'E2E 主链走查发现术语缺口',
        body: '把主链里冒出来的口径写回术语表，下次组包就能选到。',
        relatedFiles: ['apps/cli/test/e2e-flow.test.ts'],
      })
      expect(logRes.status).toBe(201)
      const log = logRes.json as { id: string; displayNo: string }
      expect(log.displayNo).toBe('DEV-0001')

      const draftRes = await api('POST', '/api/terms', {
        zh: '受管块',
        en: 'managed block',
        definition: '由 OpenVibe 注入并纳入漂移检测的文件区间，块内手写内容会被覆盖。',
        source: 'project:e2e-flow-project',
        status: 'draft',
      })
      expect(draftRes.status).toBe(201)
      const draft = draftRes.json as { id: string; status: string; source: string }
      expect(draft.status).toBe('draft')

      const link = await api('POST', `/api/projects/${project.id}/devlog/${log.id}/assets`, {
        assetId: draft.id,
      })
      expect((link.json as { log: { linkedAssetIds: string[] } }).log.linkedAssetIds).toContain(
        draft.id,
      )
      // 反查链：术语详情页靠它显示「来源：项目 X 的 DEV-0001」
      const origin = (await api('GET', `/api/reflow-origin/${draft.id}`)).json as {
        origin: { displayNo?: string }[] | null
      }
      expect(JSON.stringify(origin.origin)).toContain('DEV-0001')

      // 飞轮计数：注入 ≥1、回流 ≥1（loops 需要项目显式绑包，本用例不主张）
      const stats = (await api('GET', '/api/stats')).json as { injections: number; reflows: number }
      expect(stats.injections).toBeGreaterThanOrEqual(1)
      expect(stats.reflows).toBeGreaterThanOrEqual(1)
    },
    60_000,
  )
})
