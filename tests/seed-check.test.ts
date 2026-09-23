import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

/**
 * seed:check 门禁自身的负向用例（dev-plan §9-T8 映射表 seed-1 / seed-3）。
 * 门禁脚本此前只在 `pnpm seed:check` 里跑「真种子应当通过」这一支，没有反证：
 * 删掉词条它是否真的非零？阶段名被改一个字它是否真的点名？「通过」与「根本没跑到那条断言」
 * 在只测正向时无法区分。故这里把脚本对着一份临时副本重跑，制造四类必须失败的最小篡改。
 * 每个负向用例先对未篡改的同一副本跑一次 exit 0 作对照，保证「非零」只可能来自篡改本身。
 */

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(REPO_ROOT, 'scripts', 'seed-check.ts')
const REAL_SEED_DIR = join(REPO_ROOT, 'content', 'seed')
const SEED_FILES = ['terms.json', 'flow-templates.json', 'prompts.json'] as const

/** 篡改后必然一起被点到的兜底错误，用于确认「负向探针没被别的报错抢先掩盖」 */
type Run = { status: number | null; out: string }

function runSeedCheck(seedDir?: string): Run {
  const r = spawnSync(process.execPath, ['--import', 'tsx', SCRIPT], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      ...(seedDir === undefined ? {} : { OPENVIBE_SEED_DIR: seedDir }),
    },
  })
  if (r.error) throw r.error
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** 只读口验证：脚本对副本目录也只读不改写，所以篡改前跑一次即建立基线 */
function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'openvibe-seed-probe-'))
  for (const f of SEED_FILES) copyFileSync(join(REAL_SEED_DIR, f), join(dir, f))
  return dir
}

function itemsIn(dir: string, file: string): Record<string, unknown>[] {
  const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as { items: Record<string, unknown>[] }
  return bundle.items
}

function writeItems(dir: string, file: string, items: Record<string, unknown>[]): void {
  const bundle = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>
  bundle['items'] = items
  writeFileSync(join(dir, file), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
}

const sandboxes: string[] = []
afterAll(() => {
  for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true })
})

describe('SCRIPT-SEED-00 · 正向基线 + 覆盖口只读', () => {
  it('不带 OPENVIBE_SEED_DIR 时按仓库真种子通过（exit 0）', () => {
    const run = runSeedCheck()
    expect(run.status, run.out).toBe(0)
    expect(run.out).toContain('[seed:check] 通过')
  })

  it('带 OPENVIBE_SEED_DIR 指向真种子的逐字节副本时同样通过，且脚本不改写副本', () => {
    const dir = mkdtempSync(join(tmpdir(), 'openvibe-seed-copy-'))
    sandboxes.push(dir)
    const originals = SEED_FILES.map((f) => readFileSync(join(REAL_SEED_DIR, f)))
    for (const [i, f] of SEED_FILES.entries()) writeFileSync(join(dir, f), originals[i]!)

    expect(runSeedCheck(dir).status).toBe(0)

    for (const [i, f] of SEED_FILES.entries()) {
      expect(readFileSync(join(dir, f)).equals(originals[i]!), `${f} 被脚本改写`).toBe(true)
    }
  })
})

describe('SCRIPT-SEED-01 · seed-content §7.1 词条数量门槛', () => {
  it('词条数压到门槛之下（截到 95 条）→ 非零，并点名「95 条 < 门槛 100 条」', () => {
    const dir = sandbox()
    sandboxes.push(dir)
    const total = itemsIn(dir, 'terms.json').length
    expect(runSeedCheck(dir).status, '篡改前必须先通过').toBe(0)

    // 门槛是绝对值 100，「删 5 条」只在种子恰好 104 条时等价于「掉到门槛之下」；
    // 种子只增不减（DEV-0022 回流即 104→109），故按目标绝对量截，断言字面量随之固定。
    const dropTo = 95
    expect(total, '夹具前提：真种子须高于截断目标').toBeGreaterThan(dropTo)
    writeItems(dir, 'terms.json', itemsIn(dir, 'terms.json').slice(0, dropTo))
    const run = runSeedCheck(dir)
    expect(run.status).not.toBe(0)
    expect(run.out).toContain(`terms.json · 数量 — ${String(dropTo)} 条 < 门槛 100 条`)
  })
})

describe('SCRIPT-SEED-02 · seed-content §7.3 模板 3/7/4 阶段逐字一致', () => {
  it('阶段名改一个字 → 非零并点名模板与差异阶段', () => {
    const dir = sandbox()
    sandboxes.push(dir)
    expect(runSeedCheck(dir).status, '篡改前必须先通过').toBe(0)

    const items = itemsIn(dir, 'flow-templates.json')
    const light = items.find((i) => i['name'] === '个人轻量流')
    expect(light).toBeDefined()
    const stages = (light!['stages'] ?? []) as { name: string }[]
    expect(stages.map((s) => s.name)).toEqual(['启动', '开发', '复盘'])
    stages[2] = { ...stages[2]!, name: '回顾' }
    writeItems(dir, 'flow-templates.json', items)

    const run = runSeedCheck(dir)
    expect(run.status).not.toBe(0)
    expect(run.out).toContain('flow-templates.json · 个人轻量流 — 阶段名需逐字一致，收到 启动 / 开发 / 回顾')
  })

  it('Spec 驱动流删掉一个阶段 → 非零并点名「阶段数期望 7，收到 6」', () => {
    const dir = sandbox()
    sandboxes.push(dir)
    expect(runSeedCheck(dir).status, '篡改前必须先通过').toBe(0)

    const items = itemsIn(dir, 'flow-templates.json')
    const spec = items.find((i) => i['name'] === 'Spec 驱动流')
    expect(spec).toBeDefined()
    const stages = spec!['stages'] as { name: string }[]
    expect(stages.length).toBe(7)
    spec!['stages'] = stages.slice(0, -1)
    writeItems(dir, 'flow-templates.json', items)

    const run = runSeedCheck(dir)
    expect(run.status).not.toBe(0)
    expect(run.out).toContain('Spec 驱动流 — 阶段数期望 7，收到 6')
  })
})
