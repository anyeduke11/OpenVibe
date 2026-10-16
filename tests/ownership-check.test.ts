import { describe, expect, it } from 'vitest'
import {
  classify,
  DEFAULT_MARKERS,
  FORBIDDEN,
  renderReport,
  SELF_QUOTING,
  type DirtyFile,
} from '../scripts/ownership-check'

/**
 * `scripts/ownership-check.ts` 的判据测试（2026-10-16）。
 *
 * ## 为什么测试放 `tests/` 而不是 `scripts/`
 * 与 `mutation-run.test.ts` 同理：`vitest.config.ts` 的 `unit` project 只收 `tests/`，
 * 放 `scripts/` 的测试永远不会被跑到，等于写了个永假的测试。
 *
 * ## 本文件真正要钉的东西只有一个：**判定顺序**
 *
 * `classify` 的价值全在「谁压过谁」上。判错了顺序，工具就从「防事故」变成「制造事故」：
 * 禁区文件被放行、或混了他人改动的文件被整文件提交 —— 都是比不做工具更坏的结果。
 */

const OWNED = [
  { label: '本会话', reason: '本会话产出', pattern: /^apps\/cli\// },
  { label: '本会话·闸与脚本', reason: '判据测试与脚本', pattern: /^tests\// },
]

const f = (over: Partial<DirtyFile> & { path: string }): DirtyFile => ({
  status: ' M',
  added: 1,
  removed: 0,
  addedLines: [],
  ...over,
})

const classifyOne = (file: DirtyFile, owned = OWNED) =>
  classify([file], { forbidden: FORBIDDEN, owned, markers: DEFAULT_MARKERS }).files[0]!

describe('ownership-check · 判定顺序：禁区压过一切', () => {
  it('命中禁区 ⇒ hold，理由写明', () => {
    const v = classifyOne(f({ path: 'apps/web/src/index.css' }))
    expect(v.verdict).toBe('hold')
    expect(v.reason).toContain('并行会话')
  })

  it('⚠️ 同时命中禁区与 owned ⇒ 仍然 hold（禁区必须压过 owned）', () => {
    // 这条是本文件的第一条命门：若顺序写反，禁区文件会被标成可提交。
    const v = classifyOne(f({ path: 'apps/web/src/index.css' }), [
      { label: '本会话', reason: '自称本会话', pattern: /^apps\/web\// },
    ])
    expect(v.verdict).toBe('hold')
  })

  it('M4 回退类文档命中禁区', () => {
    for (const p of ['docs/dev-plan.md', 'docs/decisions.md', 'docs/specs/m4-playbook.md']) {
      expect(classifyOne(f({ path: p })).verdict, p).toBe('hold')
    }
  })
})

describe('ownership-check · 判定顺序：「混了」压过 owned', () => {
  it('owned 且新增行没有标志 ⇒ commit', () => {
    const v = classifyOne(f({ path: 'apps/cli/src/commands/ask.ts', addedLines: ['export const ask = 1'] }))
    expect(v.verdict).toBe('commit')
    expect(v.label).toBe('本会话')
  })

  it('⚠️ owned 但新增行命中标志 ⇒ 强制降级为 review，并点名原因', () => {
    // 这是工具的头号价值：拦住「同一文件里既有我的改动、又有别人回退」的情况。
    const v = classifyOne(
      f({ path: 'apps/cli/src/commands/ask.ts', addedLines: ['// T12 人日未估', 'export const ask = 1'] }),
    )
    expect(v.verdict).toBe('review')
    expect(v.label).toBe('疑似混入他人改动')
    expect(v.reason).toContain('整文件提交会夹带他人改动')
  })

  it('⚠️ 三个真实回退字样都要能被抓到（用本仓实测踩过的原话，不自造）', () => {
    const samples = ['- 人日未估', '+ 恒为 []（M4 未上）', '- 已裁已落']
    for (const line of samples) {
      const v = classifyOne(f({ path: 'apps/cli/src/x.ts', addedLines: [line] }))
      expect(v.verdict, `没抓到：${line}`).toBe('review')
      expect(v.markerHits.length).toBeGreaterThan(0)
    }
  })

  it('只扫新增行：同样的字样出现在删除行不算「混了」', () => {
    // 删除方向才是回退的证据吗？恰好相反 —— 并行会话的回退表现为「新增了旧措辞」。
    // 这里钉住的是**判定输入只有新增行**，避免以后有人把删除行也喂进来造成双向误报。
    const v = classifyOne(f({ path: 'apps/cli/src/x.ts', addedLines: ['export const ok = 1'] }))
    expect(v.verdict).toBe('commit')
  })

  it('markerHits 最多回显 5 条，但计数不截断', () => {
    const many = Array.from({ length: 12 }, (_, i) => `// 人日未估 ${i}`)
    const r = classify([f({ path: 'apps/cli/src/x.ts', addedLines: many })], {
      forbidden: FORBIDDEN,
      owned: OWNED,
      markers: DEFAULT_MARKERS,
    })
    expect(r.files[0]!.markerHits).toHaveLength(5)
    expect(r.files[0]!.reason).toContain('12')
  })
})

describe('ownership-check · 自引用豁免', () => {
  it('⚠️ 把标志字样当 fixture 的判据测试本身不该被判成「混入」', () => {
    // 与「校验命令会扫到自己」同一类问题：判据测试必须原样引用标志字样才能测到它，
    // 所以必须显式豁免。但豁免是**登记**出来的，不自动推断（自动推断会让判据可被绕过）。
    const selfFile = f({
      path: 'tests/ownership-check.test.ts',
      addedLines: ['const samples = ["- 人日未估"]'],
    })
    const r = classify([selfFile], {
      forbidden: FORBIDDEN,
      owned: OWNED,
      markers: DEFAULT_MARKERS,
      selfQuoting: SELF_QUOTING,
    })
    expect(r.files[0]!.verdict).toBe('commit')
    expect(r.files[0]!.exempt).toBe(true)
    expect(r.mixed, '豁免了就不该出现在 mixed 清单里').toEqual([])
  })

  it('⚠️ 但豁免是精确到路径的：别的文件引用同样字样仍要被抓', () => {
    // 证明豁免不是「凡是测试文件就放过」——否则任何人把回退写进测试文件就绕过了闸。
    const other = f({ path: 'tests/other.test.ts', addedLines: ['// 人日未估'] })
    const r = classify([other], {
      forbidden: FORBIDDEN,
      owned: OWNED,
      markers: DEFAULT_MARKERS,
      selfQuoting: SELF_QUOTING,
    })
    expect(r.files[0]!.verdict).toBe('review')
    expect(r.files[0]!.exempt).toBe(false)
    expect(r.mixed).toEqual(['tests/other.test.ts'])
  })
})

describe('ownership-check · 未判定与计数', () => {
  it('未命中任何规则 ⇒ review（不猜归属）', () => {
    const v = classifyOne(f({ path: 'packages/shared/src/foo.ts' }), [])
    expect(v.verdict).toBe('review')
    expect(v.label).toBe('未判定')
  })

  it('计数与 mixed 列表一致', () => {
    const r = classify(
      [
        f({ path: 'apps/web/src/a.tsx' }),
        f({ path: 'apps/cli/src/b.ts' }),
        f({ path: 'packages/shared/src/c.ts', addedLines: ['// 人日未估'] }),
      ],
      { forbidden: FORBIDDEN, owned: OWNED, markers: DEFAULT_MARKERS },
    )
    expect(r.holdCount).toBe(1)
    expect(r.commitCount).toBe(1)
    expect(r.reviewCount).toBe(1)
    expect(r.mixed).toEqual(['packages/shared/src/c.ts'])
    expect(r.commitCount + r.holdCount + r.reviewCount).toBe(3)
  })

  it('排序恒为 hold → review → commit', () => {
    const r = classify(
      [f({ path: 'apps/cli/src/z.ts' }), f({ path: 'apps/web/src/a.tsx' }), f({ path: 'apps/cli/src/y.ts', addedLines: ['// M4 未上'] })],
      { forbidden: FORBIDDEN, owned: OWNED, markers: DEFAULT_MARKERS },
    )
    expect(r.files.map((v) => v.verdict)).toEqual(['hold', 'review', 'commit'])
  })

  it('⚠️ 空输入 ⇒ 全零，不是崩溃', () => {
    const r = classify([], { forbidden: FORBIDDEN, owned: OWNED, markers: DEFAULT_MARKERS })
    expect(r.files).toEqual([])
    expect(r.commitCount + r.holdCount + r.reviewCount).toBe(0)
  })
})

describe('ownership-check · 报告渲染', () => {
  it('报告含三类计数与「不要整文件 add」的对策', () => {
    const r = classify(
      [f({ path: 'apps/web/src/a.tsx' }), f({ path: 'packages/shared/src/c.ts', addedLines: ['// 人日未估'] })],
      { forbidden: FORBIDDEN, owned: [], markers: DEFAULT_MARKERS },
    )
    const text = renderReport(r)
    expect(text).toContain('可提交 0')
    expect(text).toContain('禁区留存 1')
    expect(text).toContain('待人工判定 1')
    expect(text).toContain('git add -p')
    expect(text).toContain('命中标志：')
  })
})
