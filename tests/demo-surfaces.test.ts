import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEMO_KINDS, DEMO_SURFACES, DEMO_KIND_META } from '../apps/web/src/data/demo-surfaces'

/**
 * 演示面标记的**双向一致闸**（owner 增强项：为演示功能加统一标记，实现后去掉）。
 *
 * ## 它守的是什么
 *
 * `apps/web/src/data/demo-surfaces.ts` 是演示面的**唯一出处**，界面只写
 * `<DemoChip id="…" />`。这两边一旦脱节，标记就失去了意义：
 *
 * - **清单有、代码没有** ⇒ 登记了一个不存在的演示面（清单腐烂）；
 * - **代码有、清单没有** ⇒ 界面上挂着一个**无出处**的标记（读者不知道它属于哪块、
 *   该不该信），而闸也不会再管它。
 *
 * ## ⚠️ 为什么扫描形态写死成 `<DemoChip id="…" />`
 *
 * 闸靠正则扫源码。形态一变（换行、包变量、改组件名），正则就**静默失效** ⇒
 * 双向判退化成单向判，而它看起来还是绿的。
 * ⇒ 组件注里写死「调用形态必须单行」，本文件再补一条**提取器自证**（哨兵）：
 *   证明正则真的能从一段已知文本里抓到 id。少了这条，正则写错时本闸恒绿。
 */

const REPO_ROOT = resolve(__dirname, '..')
const WEB_SRC = join(REPO_ROOT, 'apps', 'web', 'src')

/** 调用形态：`<DemoChip id="xxx" />`（单行；换行会扫不到，见组件注） */
const CALL_RE = /<DemoChip\s+id="([^"]+)"\s*\/>/g

/** 递归收集 `apps/web/src` 下的 .ts/.tsx（跳过测试文件——判据自身不该被扫） */
function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p)
        continue
      }
      if (!/\.(ts|tsx)$/.test(name)) continue
      if (/\.test\.(ts|tsx)$/.test(name)) continue
      out.push(p)
    }
  }
  walk(WEB_SRC)
  return out
}

/** 源码里被 `<DemoChip id="…" />` 引用的 id（去重、排序） */
function referencedIds(): string[] {
  const ids = new Set<string>()
  for (const file of sourceFiles()) {
    const code = readFileSync(file, 'utf8')
    for (const m of code.matchAll(CALL_RE)) {
      const id = m[1]
      if (id !== undefined) ids.add(id)
    }
  }
  return [...ids].sort()
}

describe('演示面清单 · 自身合法性', () => {
  it('每条都有非空 label / where / kinds', () => {
    for (const s of DEMO_SURFACES) {
      expect(s.label.length, `${s.id} 缺 label`).toBeGreaterThan(0)
      expect(s.where.length, `${s.id} 缺 where`).toBeGreaterThan(0)
      expect(s.kinds.length, `${s.id} 缺 kinds`).toBeGreaterThan(0)
    }
  })

  it('id 唯一（重复会让 chip 与清单对不上）', () => {
    const ids = DEMO_SURFACES.map((s) => s.id)
    expect(new Set(ids).size, `重复 id：${ids.join(',')}`).toBe(ids.length)
  })

  it('⚠️ kinds 必须落在闭集内（新增类别而忘加元数据 ⇒ 本支红）', () => {
    for (const s of DEMO_SURFACES) {
      for (const k of s.kinds) {
        expect(DEMO_KINDS, `${s.id} 的类别 ${k} 不在闭集内`).toContain(k)
        expect(DEMO_KIND_META[k], `${k} 缺元数据`).toBeTruthy()
      }
    }
  })

  it('每个类别都有元数据（反向：闭集里没有「有元数据却无类别」的孤立项）', () => {
    expect(Object.keys(DEMO_KIND_META).sort()).toEqual([...DEMO_KINDS].sort())
  })

  it('⚠️ where 指向的文件真实存在（标记挪了位置而忘改清单 ⇒ 本支红）', () => {
    for (const s of DEMO_SURFACES) {
      const abs = join(REPO_ROOT, s.where)
      expect(existsSync(abs), `${s.id} 的 where 不存在：${s.where}`).toBe(true)
    }
  })
})

describe('演示面标记 · 双向一致（清单 ↔ 代码）', () => {
  it('清单里每个 id 都在它自己 where 的文件里被引用（防「清单腐烂」）', () => {
    for (const s of DEMO_SURFACES) {
      const code = readFileSync(join(REPO_ROOT, s.where), 'utf8')
      expect(
        code,
        `${s.id} 登记在 ${s.where}，但该文件里没有 <DemoChip id="${s.id}" /> —— ` +
          '要么补标记，要么删掉这条清单（实现真实功能后应删）。',
      ).toContain(`<DemoChip id="${s.id}" />`)
    }
  })

  it('⚠️ 代码里引用的每个 id 都在清单里（防「无出处的标记」）', () => {
    const known = new Set(DEMO_SURFACES.map((s) => s.id))
    const unknown = referencedIds().filter((id) => !known.has(id))
    expect(
      unknown,
      `源码引用了未登记的演示面 id：${unknown.join('、')} —— ` +
        '请先在 demo-surfaces.ts 登记，或删掉该标记。',
    ).toEqual([])
  })

  it('⚠️ 提取器自证：正则真的扫得到（否则上面两条会静默恒绿）', () => {
    const sample = 'const x = <DemoChip id="team-page" />'
    const hits = [...sample.matchAll(CALL_RE)].map((m) => m[1])
    expect(hits).toEqual(['team-page'])
  })

  it('清单非空（哨兵：提取器失效时上面几条会因空集而假绿）', () => {
    expect(DEMO_SURFACES.length).toBeGreaterThan(0)
    expect(referencedIds().length).toBeGreaterThan(0)
  })
})

describe('演示面标记 · 与覆盖地图不冲突', () => {
  /**
   * 覆盖地图（`data/coverage.ts`）是**能力位粒度**，本表是**页面/块粒度** ——
   * 两者不重复。这条只守一条底线：本表的 id 不得与覆盖地图的**能力位 id**
   * （`M1-1` / `G-2` 这种）撞号，否则「演示面」与「能力位」两个概念会混。
   */
  it('id 不与覆盖地图的能力位 id 撞号', () => {
    const coverageSrc = readFileSync(join(WEB_SRC, 'data', 'coverage.ts'), 'utf8')
    const capabilityIds = new Set(
      [...coverageSrc.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1] ?? ''),
    )
    const clashes = DEMO_SURFACES.map((s) => s.id).filter((id) => capabilityIds.has(id))
    expect(clashes, `演示面 id 与能力位撞号：${clashes.join('、')}`).toEqual([])
  })
})

/** 供人读的清单快照（改清单时顺带看一眼） */
describe('演示面清单 · 内容快照', () => {
  it('当前登记条目（改动即留痕）', () => {
    const summary = DEMO_SURFACES.map(
      (s) =>
        `${s.id} · ${s.label} · ${s.kinds.join('+')} · ${relative(REPO_ROOT, join(REPO_ROOT, s.where))}`,
    )
    // 断言的是「结构与数量可读」，不是钉死具体条目 —— 实现真实功能后**条目会减少**，
    // 那时应同步更新本行的期望数量，而不是改测试让它继续绿。
    expect(summary.length).toBe(DEMO_SURFACES.length)
    for (const line of summary) expect(line).toContain(' · ')
  })
})
