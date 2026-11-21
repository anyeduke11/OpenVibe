import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  COVERAGE,
  STATUS_META,
  coverageTotals,
  pathTokensOf,
  resolveSourceToken,
  type CapabilityStatus,
} from './coverage'

/**
 * `apps/web/src/data/coverage.test.ts` —— 覆盖地图数据源的判据。
 *
 * ## 它挡什么
 *
 * 覆盖地图的价值全在「**每条都有出处**」：一份没有出处的能力表，读的人无法验证，
 * 很快就会变成没人信的装饰。这条判据把「出处非空」钉住。
 *
 * 第二条挡的是**编号唯一**：编号是人在 DEV_LOG / 规格里引用能力位的唯一把手，
 * 重号会让「改哪个」变成歧义。
 *
 * ## 出处的「腐烂」反向检查（2026-11-08 加）
 *
 * 出处里凡能解析出**仓内路径**的，都要真的存在 —— 否则那条出处在说谎。
 * ⚠️ **只判能解析的**：描述性出处（`PRD M5 · P1`、`P2`、`=FR-1`、`流程条款（人工执行）`）
 *   天生没有路径，强行判会造出**假红**，而假红比不红更坏。故本文件的判定分三档：
 *   `存在` / `解析不出（跳过）` / `解析出但不存在（红）`。
 */

// apps/web/src/data → 上四级 = 仓根（data → src → web → apps → OpenVibe）
const REPO_ROOT = resolve(__dirname, '../../../..')

/** 递归收集 `.ts/.tsx/.md/.json/.sql` 的 basename → 仓内相对路径列表（只建一次） */
function buildBasenameIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const walk = (dir: string): void => {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as never
    } catch {
      return
    }
    for (const e of entries as unknown as { name: string; isDirectory(): boolean }[]) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist') continue
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.(?:ts|tsx|md|json|sql)$/.test(e.name)) continue
      const rel = relative(REPO_ROOT, full).split('\\').join('/')
      const list = index.get(e.name) ?? []
      list.push(rel)
      index.set(e.name, list)
    }
  }
  for (const top of ['apps', 'packages', 'docs', 'scripts', 'tests', 'deploy']) {
    walk(join(REPO_ROOT, top))
  }
  return index
}

/** 候选路径是否存在（无扩展名时逐个补全；目录也算存在） */
function candidateExists(candidate: string): boolean {
  const suffixes = ['', '.ts', '.tsx', '.md', '.json']
  for (const s of suffixes) {
    const p = join(REPO_ROOT, candidate + s)
    if (existsSync(p)) return true
  }
  return false
}

describe('coverage · 能力位数据完整性', () => {
  it('每条能力位都有非空出处（没有出处的能力位等于没有）', () => {
    const missing = COVERAGE.flatMap((g) =>
      g.items.filter((it) => it.source.trim() === '').map((it) => `${g.group} / ${it.id}`),
    )
    expect(missing).toEqual([])
  })

  it('状态取值落在四态闭集内（不收第五种）', () => {
    const allowed = new Set<CapabilityStatus>(['ok', 'partial', 'design', 'no'])
    for (const g of COVERAGE) {
      for (const it of g.items) {
        expect(allowed.has(it.status), `${it.id} 的状态 ${String(it.status)} 不在闭集内`).toBe(true)
      }
    }
  })

  it('编号全仓唯一（编号是引用能力位的唯一把手）', () => {
    const ids = COVERAGE.flatMap((g) => g.items.map((it) => it.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('四态都有元数据（漏一态 ⇒ 那一态在界面上没有标签与颜色）', () => {
    const statuses = new Set(COVERAGE.flatMap((g) => g.items.map((it) => it.status)))
    for (const s of statuses) {
      expect(STATUS_META[s], `缺 ${String(s)} 的元数据`).toBeDefined()
      expect(STATUS_META[s]?.label).not.toBe('')
    }
  })
})

describe('coverage · 汇总', () => {
  it('各态计数之和 == 能力位总数', () => {
    const totals = coverageTotals()
    const total = COVERAGE.reduce((n, g) => n + g.items.length, 0)
    expect(totals.ok + totals.partial + totals.design + totals.no).toBe(total)
  })

  it('至少有一条「已上线」与一条「设计稿」（否则这张表没在说真话）', () => {
    const totals = coverageTotals()
    expect(totals.ok).toBeGreaterThan(0)
    expect(totals.design).toBeGreaterThan(0)
  })
})

describe('coverage · 出处路径抽取', () => {
  it('抽出行号前的路径，剥掉行号', () => {
    expect(pathTokensOf('routes/prompts.ts:119,129')).toEqual(['routes/prompts.ts'])
  })

  it('带路径反引号形态', () => {
    expect(pathTokensOf('components/library/VariableFillModal.tsx')).toEqual([
      'components/library/VariableFillModal.tsx',
    ])
  })

  it('中文括号里的提及也会被抽出（纯 ASCII 段），但不带中文', () => {
    expect(pathTokensOf('P2；代码无实现（stage.ts:63 仅文案）')).toEqual(['stage.ts'])
  })

  it('尾部中文（`「尚未开工」`）不污染 token', () => {
    expect(pathTokensOf('GrowthPage.tsx:60「尚未开工」')).toEqual(['GrowthPage.tsx'])
  })

  it('.git/ 前缀丢弃（git 内部目录不是产品出处）', () => {
    expect(pathTokensOf('FR-6 已落地（钩子需安装 .git/hooks）')).toEqual([])
  })

  it('无扩展名且无斜杠的标识符不抽（`SettingsSections`、`P2`）', () => {
    expect(pathTokensOf('SettingsSections')).toEqual([])
  })

  it('描述性出处抽不出路径（⇒ 检查跳过，不判红）', () => {
    expect(pathTokensOf('PRD M5 · P1')).toEqual([])
    expect(pathTokensOf('=FR-1 / A-1 待 owner 签收')).toEqual([])
    expect(pathTokensOf('流程条款（人工执行）')).toEqual([])
  })
})

describe('coverage · 出处可复算（腐烂反向检查）', () => {
  const index = buildBasenameIndex()

  it('⚠️ 凡是能解析出路径的出处，文件必须真的存在', () => {
    const broken: string[] = []
    let checked = 0
    let skipped = 0

    for (const g of COVERAGE) {
      for (const it of g.items) {
        const tokens = pathTokensOf(it.source)
        if (tokens.length === 0) {
          skipped++
          continue
        }
        for (const token of tokens) {
          const candidates = resolveSourceToken(token, index)
          if (candidates.length === 0) {
            skipped++
            continue
          }
          checked++
          if (!candidates.some((c) => candidateExists(c))) {
            broken.push(`${it.id} · ${token} → ${candidates.join(' / ')}`)
          }
        }
      }
    }

    // 自证这条判据**真的在跑**（否则「0 broken」可能只是因为压根没检查）
    expect(checked, '至少要检查到若干条路径，否则本判据是空转的').toBeGreaterThan(10)
    // 「跳过」必须真的少于总数 —— 全跳过说明解析器整个失效了
    expect(skipped, '跳过多于零但少于总数，否则解析器整个失效').toBeGreaterThan(0)
    expect(skipped).toBeLessThan(checked + skipped)
    expect(broken).toEqual([])
  })

  it('⚠️ 变异腿：删掉一个出处文件后，同一条判据应当报「不存在」', () => {
    // 用「必然不存在」的 token 冒充一条出处，证明判定式不是恒绿
    const ghost = resolveSourceToken('routes/definitely-missing.ts', index)
    expect(ghost).toEqual(['apps/server/src/routes/definitely-missing.ts'])
    expect(ghost.some((c) => candidateExists(c))).toBe(false)
  })

  it('裸 basename 靠全仓索引反查（唯一命中才解析，重名即不可判）', () => {
    expect(resolveSourceToken('PackWizard.tsx', index)).toEqual([
      'apps/web/src/components/packs/PackWizard.tsx',
    ])
    expect(resolveSourceToken('不存在的文件.tsx', index)).toEqual([])
  })
})
