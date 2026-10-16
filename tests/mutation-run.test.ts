import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  diagnosisFor,
  parseVitestSummary,
  renderReport,
  runLeg,
  stripAnsi,
  type MutationLeg,
} from '../scripts/mutation-run'

/**
 * `scripts/mutation-run.ts` 自身的判据测试（2026-10-16）。
 *
 * ## 为什么测试放 `tests/` 而不是 `scripts/`
 * `vitest.config.ts` 的 `unit` project 的 `include` 是 `packages/<pkg>/src` 下的测试文件与
 * `tests` 目录下的测试文件 —— **`scripts/` 不在其中**。放 `scripts/` 的测试文件永远不会被跑到，
 * 那等于写了个永假的测试。
 *
 * ⚠️ 上面刻意不写带通配符的完整 glob：本文件第一版把 `packages/` 后的星号原样写进注释，
 * 而「星号紧跟斜杠」正是块注释的闭合符，于是它提前收尾，后半截 glob 被当成代码，
 * esbuild 报 `Unexpected "."`。**在注释里写 glob 本身就是个坑，别把它抄回去** ——
 * 真要写，就用 `packages/<pkg>/src` 这种尖括号占位，或者干脆描述成「各包 src 目录」。
 *
 * ## 为什么 `runLeg` 有可注入的 runner
 * 默认路径会 `spawnSync npx vitest`。若测试直接走默认路径，等于**测试套件里再跑一遍测试套件**
 * （慢、可能递归）。注入点让「备份／还原／锚点断言／诊断」这些真正要验的逻辑被真实覆盖，
 * 而不必真起 vitest。
 * ⚠️ 注入点本身是逃逸口，所以文末有**两条用例**专门钉它：不注入时确实真起 `npx vitest` 子进程。
 */

interface Fixture {
  root: string
  file: string
  /** 绝对路径：供「在真仓库 cwd 下变异临时文件」的逃逸口守卫用例使用 */
  abs: string
  cleanup: () => void
}

function fixture(content = 'const ok = 1\nconst drifted = null\n'): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'mutation-run-test-'))
  const abs = join(root, 'target.ts')
  writeFileSync(abs, content, 'utf8')
  return {
    root,
    file: 'target.ts',
    abs,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  }
}

const leg = (over: Partial<MutationLeg> = {}): MutationLeg => ({
  name: '测试腿',
  file: 'target.ts',
  anchor: 'const drifted = null',
  replacement: 'const drifted = false',
  testCmd: ['tests/x.test.ts'],
  expect: 1,
  ...over,
})

/** 假 runner：返回预设的 vitest 汇总行 */
const runner = (summary: string) => () => ({ stdout: `\n Tests  ${summary}\n` })

describe('mutation-run · parseVitestSummary：把 vitest 汇总行读成数字', () => {
  it('全绿形态 `Tests  8 passed (8)`', () => {
    expect(parseVitestSummary(' Tests  8 passed (8)\n')).toEqual({ failed: 0, passed: 8 })
  })
  it('有红形态 `Tests  1 failed | 10 passed (11)`', () => {
    expect(parseVitestSummary(' Tests  1 failed | 10 passed (11)\n')).toEqual({ failed: 1, passed: 10 })
  })
  it('多条红 `Tests  3 failed | 5 passed (8)`', () => {
    expect(parseVitestSummary(' Tests  3 failed | 5 passed (8)\n')).toEqual({ failed: 3, passed: 5 })
  })
  it('⚠️ 上色输出（带 ANSI 转义码）也必须能解析 —— 真跑 vitest 在 CI=1 下就是这种', () => {
    // 这条钉的是实测踩到的真缺陷：`defaultRunner` 设了 CI=1 ⇒ 子进程强制上色 ⇒
    // 汇总行行首是转义码而非空白 ⇒ 未剥除时**每条真跑变异腿都被误报成 vitest-crashed**。
    // 假 runner 吐的是干净文本，所以若没有这条用例，剥除逻辑就是永真断言。
    //
    // 只断言契约（转义码清干净、数字读对），**不断言剥除后的精确空格**：
    // 上色输出剥除后是「两个空格」，`--no-color` 输出是「一个空格」，那是 vitest 的排版差异，
    // 拿它当断言等于在测 vitest 而非测本脚本。
    const colored = '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m1 passed\u001b[39m \u001b[22m (1)\u001b[22m\n'
    const stripped = stripAnsi(colored)
    expect(stripped, '转义码必须被清干净').not.toContain('\u001b')
    expect(stripped).toContain('Tests')
    expect(stripped).toContain('1 passed')
    expect(parseVitestSummary(colored)).toEqual({ failed: 0, passed: 1 })
  })
  it('⚠️ 没有汇总行 ⇒ 返回 null（调用方据此判「vitest 没跑起来」，不得当成 0 红）', () => {
    // 这条是本文件里最重要的否定式判据：把 null 误当成 {failed:0} 会让「崩溃」显示成「判据太弱」
    expect(parseVitestSummary('No test files found, exiting with code 1')).toBeNull()
    expect(parseVitestSummary('')).toBeNull()
    expect(parseVitestSummary('error: cannot find module')).toBeNull()
  })
})

describe('mutation-run · 锚点断言：把「变异没打上」变成可检出的状态', () => {
  it('锚点命中 0 次 ⇒ anchor-not-applied，且**根本不调用 runner**', () => {
    const f = fixture('const x = 1\n')
    let called = false
    const r = runLeg(leg({ anchor: '不存在的锚点' }), f.root, () => {
      called = true
      return { stdout: ' Tests  1 failed | 0 passed (1)\n' }
    })
    expect(r.status).toBe('anchor-not-applied')
    expect(r.anchorHits).toBe(0)
    expect(called, '锚点没命中就不该跑测试——否则「变异没打上」会被误读成「判据太弱」').toBe(false)
    f.cleanup()
  })

  it('锚点命中 2 次 ⇒ 同样拒绝（要求唯一命中，避免「只替换了第一处」）', () => {
    const f = fixture('const drifted = null\nconst drifted = null\n')
    const r = runLeg(leg(), f.root, runner('1 failed | 0 passed (1)'))
    expect(r.status).toBe('anchor-not-applied')
    expect(r.anchorHits).toBe(2)
    f.cleanup()
  })
})

describe('mutation-run · 变异确实打上后才跑测试', () => {
  it('达到期望红数 ⇒ ok，且诊断为空', () => {
    const f = fixture()
    const r = runLeg(leg(), f.root, runner('1 failed | 9 passed (10)'))
    expect(r.status).toBe('ok')
    expect(r.failed).toBe(1)
    expect(r.diagnosis).toEqual([])
    f.cleanup()
  })

  it('`expect` 是精确匹配：红 2 支而期望 1 支 ⇒ 判 below-expectation', () => {
    const f = fixture()
    const r = runLeg(leg({ expect: 1 }), f.root, runner('2 failed | 8 passed (10)'))
    expect(r.status).toBe('below-expectation')
    f.cleanup()
  })

  it('`expectMin` 是下限：红 3 支而 min=1 ⇒ 判 ok', () => {
    const f = fixture()
    const r = runLeg(leg({ expect: undefined, expectMin: 1 }), f.root, runner('3 failed | 7 passed (10)'))
    expect(r.status).toBe('ok')
    f.cleanup()
  })

  it('变异真的落到了文件上（不是只改了内存副本）', () => {
    const f = fixture()
    let seen = ''
    runLeg(leg(), f.root, () => {
      seen = readFileSync(join(f.root, 'target.ts'), 'utf8')
      return { stdout: ' Tests  1 failed | 0 passed (1)\n' }
    })
    expect(seen).toContain('const drifted = false')
    f.cleanup()
  })
})

describe('mutation-run · 还原：这是本脚本最不能出错的一步', () => {
  it('跑完一条腿后，文件与变异前**逐字节一致**', () => {
    const original = 'const ok = 1\nconst drifted = null\n'
    const f = fixture(original)
    runLeg(leg(), f.root, runner('1 failed | 0 passed (1)'))
    expect(readFileSync(join(f.root, 'target.ts'), 'utf8')).toBe(original)
    f.cleanup()
  })

  it('锚点未命中时文件也不该被碰过', () => {
    const original = 'const x = 1\n'
    const f = fixture(original)
    runLeg(leg({ anchor: '没有这个' }), f.root, runner('1 failed | 0 passed (1)'))
    expect(readFileSync(join(f.root, 'target.ts'), 'utf8')).toBe(original)
    f.cleanup()
  })

  it('⚠️ 测试自己把源文件改了 ⇒ 还原仍会强制覆盖回原样', () => {
    // 这条钉的是「还原不是『把变量改回去』，而是『从备份整份拷回』」
    const original = 'const ok = 1\nconst drifted = null\n'
    const f = fixture(original)
    runLeg(leg(), f.root, () => {
      writeFileSync(join(f.root, 'target.ts'), '被第三方改坏了\n', 'utf8')
      return { stdout: ' Tests  1 failed | 0 passed (1)\n' }
    })
    expect(readFileSync(join(f.root, 'target.ts'), 'utf8')).toBe(original)
    f.cleanup()
  })

  it('⚠️ runner 抛异常 ⇒ 原异常照常传播，且文件仍被还原（不得被 finally 吞掉）', () => {
    // 这条钉的是控制流重构后的语义：还原动作放在 finally、但**抛在 finally 之外**。
    // 若有人图省事把 throw 挪回 finally，原异常就会被顶掉 —— 那正是 no-unsafe-finally 守的东西。
    const original = 'const ok = 1\nconst drifted = null\n'
    const f = fixture(original)
    expect(() =>
      runLeg(leg(), f.root, () => {
        throw new Error('runner 炸了')
      }),
    ).toThrow('runner 炸了')
    expect(readFileSync(join(f.root, 'target.ts'), 'utf8'), '抛异常也必须还原').toBe(original)
    f.cleanup()
  })
})

describe('mutation-run · 三因诊断（本脚本的核心价值）', () => {
  it('红数 > 0 ⇒ 诊断为空数组（不给噪音）', () => {
    expect(diagnosisFor(leg(), 2, 8)).toEqual([])
  })

  it('红数 = 0 ⇒ 诊断必须含「已排除变异没打上」＋两条待查＋反向手段', () => {
    const d = diagnosisFor(leg(), 0, 10).join('\n')
    expect(d).toContain('已排除：变异没打上')
    expect(d).toContain('待查 ①') // 测试未走到分支
    expect(d).toContain('待查 ②') // 判据太弱或永真
    expect(d).toContain('反向变异')
    expect(d).toContain('同一毫秒') // 本仓真实踩过的坑，要点进去
    expect(d).toContain('交集') // 另一条真实踩过的坑
  })

  it('反向腿的诊断要提示「本腿已是反向腿」', () => {
    const d = diagnosisFor(leg({ invert: true }), 0, 3).join('\n')
    expect(d).toContain('本腿已是反向腿')
  })

  it('below-expectation 的实际结果里带着诊断（不是只有纯函数才有）', () => {
    const f = fixture()
    const r = runLeg(leg(), f.root, runner('10 passed (10)'))
    expect(r.status).toBe('below-expectation')
    expect(r.failed).toBe(0)
    expect(r.diagnosis.join()).toContain('待查 ①')
    expect(r.tail, '没红时必须留下 vitest 输出尾部供人直接看').not.toBe('')
    f.cleanup()
  })

  it('⚠️ 变异腿自证：把「已排除变异没打上」这句删掉 ⇒ 上面那条断言必须红', () => {
    // 防止诊断文本退化成空壳而不被发现
    const crippled = (l: MutationLeg, f: number, p: number) =>
      diagnosisFor(l, f, p).filter((d) => !d.includes('已排除')).join('\n')
    expect(crippled(leg(), 0, 10)).not.toContain('已排除')
    expect(crippled(leg(), 0, 10)).toContain('待查 ①')
  })
})

describe('mutation-run · vitest 没跑起来 ≠ 判据太弱', () => {
  it('没有汇总行 ⇒ status=vitest-crashed，且诊断明确说「这不是判据问题」', () => {
    const f = fixture()
    const r = runLeg(leg(), f.root, () => ({ stdout: 'No test files found, exiting with code 1' }))
    expect(r.status).toBe('vitest-crashed')
    expect(r.diagnosis.join()).toContain('不是')
    f.cleanup()
  })
})

describe('mutation-run · 报告渲染', () => {
  it('有未达期望的腿时，报告末尾附上四步排查顺序', () => {
    const text = renderReport({
      legs: [
        {
          name: '腿 A',
          file: 'a.ts',
          status: 'below-expectation',
          anchorHits: 1,
          failed: 0,
          passed: 10,
          diagnosis: ['待查 ①'],
          tail: 'some output',
          durationMs: 12,
        },
      ],
      okCount: 0,
      failCount: 1,
    })
    expect(text).toContain('❌ 腿 A')
    expect(text).toContain('三种真因')
    expect(text).toContain('正向能红不够')
  })

  it('全部达标时不输出排查噪音', () => {
    const text = renderReport({
      legs: [
        {
          name: '腿 B',
          file: 'b.ts',
          status: 'ok',
          anchorHits: 1,
          failed: 1,
          passed: 9,
          diagnosis: [],
          tail: '',
          durationMs: 8,
        },
      ],
      okCount: 1,
      failCount: 0,
    })
    expect(text).toContain('✅ 腿 B')
    expect(text).not.toContain('三种真因')
  })
})

/**
 * 逃逸口守卫：上面所有用例都注入了假 runner，**默认路径（不注入）必须仍是真跑 vitest**。
 *
 * 关键取舍：这两条真起 `npx vitest` 子进程，cwd 必须是**真仓库**（测试文件都在那儿）。
 * 所以变异目标改指一个**临时绝对路径**（`leg.file` 支持绝对路径），而不是仓库文件 ——
 * 测试套件并行跑时去改仓库文件，会让别的用例读到变异中的中间态。
 * 选的文件刻意避开 `tests/mutation-run.test.ts` 自身 —— 否则会递归。
 */
describe('mutation-run · 逃逸口守卫：不注入 runner 时必须真跑 vitest', () => {
  it('真实测试文件跑通 ⇒ status=ok（证明确实起了子进程并解析了真实汇总行）', () => {
    const f = fixture()
    const r = runLeg(
      leg({ file: f.abs, testCmd: ['tests/design-tokens.test.ts'], expect: 0 }),
      process.cwd(),
    )
    expect(r.status, `默认路径没真跑 vitest：tail=${r.tail}`).toBe('ok')
    expect(r.anchorHits).toBe(1)
    expect(r.failed).toBe(0)
    // 顺带钉住：真跑完也必须还原
    expect(readFileSync(f.abs, 'utf8')).toBe('const ok = 1\nconst drifted = null\n')
    f.cleanup()
  }, 120_000)

  it('真实但不存在的测试文件 ⇒ status=vitest-crashed，且尾部留着真实报错', () => {
    const f = fixture()
    const r = runLeg(leg({ file: f.abs, testCmd: ['tests/__no_such_file_here__.test.ts'] }), process.cwd())
    expect(r.status, `默认路径没真跑 vitest：tail=${r.tail}`).toBe('vitest-crashed')
    expect(r.diagnosis.join()).toContain('不是')
    expect(r.tail, '崩溃时必须留下 vitest 的真实输出尾部').not.toBe('')
    expect(r.tail).toContain('No test files found')
    f.cleanup()
  }, 120_000)
})
