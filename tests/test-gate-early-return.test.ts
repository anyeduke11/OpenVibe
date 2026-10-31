import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * 测试的「**早退不许计为通过**」元测试（2026-10-31 · v0.2.4 R0 · F13 / X3）。
 *
 * ## 它防的是什么
 *
 * 测试框架把「未抛错的提前 `return`」记为**通过** ⇒ 报告里的 passed 混着「根本没跑」。
 * 典型形态：环境门控写成 `if (!hasGo) return`（无 Go 工具链就跳过），但报告里显示 passed
 * ⇒ 环境缺失被读作覆盖率 ⇒ 「全绿」可能包含大量未执行路径。
 *
 * ⇒ 环境门控必须走 `it.skipIf` / `ctx.skip()`（报告里显式出现 skipped），
 *   若仍用裸 `return`，必须同行写 `// gate: skip` 标记，让元测试能认出「有意为之」。
 *
 * ## 为什么扫源码而不是测运行时行为
 *
 * 「这个用例到底跑没跑」在运行时**没有统一接口**可问（框架只给 passed/failed/skipped，
 * 而裸 return 的用例落在 passed 里）⇒ 唯一能判的形态是**源码里的写法**。
 * 这与仓内既有的判据测试同一形制（扫源码写法，不跑整套 UI）。
 *
 * ## 判定口径（两类形态，PRD X3 点名的）
 *
 * 1. **函数体内的裸早退**：`it(` / `test(` 的回调里出现 `if (…) return`（且该行无
 *    `// gate: skip` 标记）。
 * 2. **包住 `it(` / `describe(` 的外层条件分支**：`if (…) { it(...) }` 这种形态
 *    ⇒ 整块用例被条件吞掉，报告里连 skipped 都没有。
 *
 * ⚠️ **已知不可静态检出**（PRD X3 已登记）：helper / fixture 内部的提前返回、
 *   运行时短路造成的「未执行但无标记」⇒ 不纳入本闸承诺，由 review 约定约束。
 */

const ROOT = resolve(__dirname, '..')

/** 扫到的测试文件（apps/ 与 packages/ 下的 *.test.ts） */
function testFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) testFiles(p, out)
    else if (/\.test\.tsx?$/.test(e.name)) out.push(p)
  }
  return out.sort()
}

/** 该文件是不是本闸要扫的（排除本文件自身：它故意含有这两类形态的样例） */
function isScannable(file: string): boolean {
  return !file.endsWith('tests/test-gate-early-return.test.ts')
}

/**
 * 从源码里抽出「`it(` / `test(` 回调的函数体文本。
 *
 * ⚠️ 用**括号配对**而不是正则：正则要处理嵌套对象、字符串里的括号、注释里的括号
 *   —— 那些组合会让判据变得不可靠。括号配对虽然朴素，但它对**语法正确**的源码是可靠的。
 *
 * ⚠️ **配对必须跳过字符串与注释**：标题里就有 `(`（如「注入后 → CONSISTENT（离线…）」），
 *   字符串里也有括号 ⇒ 不跳过就会把参数表截断在字符串中间 ⇒ 抽不出 `{ … }`。
 *
 * ⚠️ **匹配形态要注意**：`it('标题', async () => { … })` 里 `it` 与 `(` 之间隔着
 *   标题字符串 ⇒ 正则必须允许「`it` 后直接跟 `(`」（标题在括号**内**）。
 */
function testCallBodies(src: string): string[] {
  const bodies: string[] = []
  const re = /\b(?:it|test)(?:\.\w+)*\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1
    // 扫描到**最外层**闭合括号（跳过字符串与注释）
    let depth = 0
    let i = open
    let quote: string | null = null
    let inLineComment = false
    let inBlockComment = false
    for (; i < src.length; i++) {
      const c = src[i] ?? ''
      const n = src[i + 1] ?? ''
      if (inLineComment) {
        if (c === '\n') inLineComment = false
        continue
      }
      if (inBlockComment) {
        if (c === '*' && n === '/') {
          inBlockComment = false
          i += 1
        }
        continue
      }
      if (quote !== null) {
        if (c === '\\') {
          i += 1
          continue
        }
        if (c === quote) quote = null
        continue
      }
      if (c === '/' && n === '/') {
        inLineComment = true
        i += 1
        continue
      }
      if (c === '/' && n === '*') {
        inBlockComment = true
        i += 1
        continue
      }
      if (c === "'" || c === '"' || c === '`') {
        quote = c
        continue
      }
      if (c === '(') depth += 1
      else if (c === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const args = src.slice(open, i + 1)
    // 回调体 = **箭头函数后**的 `{ … }` ⇒ 取**第一个** `{`（不是最后一个）
    //
    // ⚠️ 为什么不是最后一个：函数体末尾常有**解构赋值**（`const { parser, heuristic } = …`）
    //   ⇒ `lastIndexOf('{')` 会取到那个解构的花括号 ⇒ 抽出来的「函数体」是残片
    //   ⇒ 里面的早退就看不见了（闸静默失效）。
    const arrow = args.indexOf('=>')
    const braceStart = arrow < 0 ? args.indexOf('{') : args.indexOf('{', arrow)
    if (braceStart < 0) continue
    let bd = 0
    let j = braceStart
    for (; j < args.length; j++) {
      if (args[j] === '{') bd += 1
      else if (args[j] === '}') {
        bd -= 1
        if (bd === 0) break
      }
    }
    bodies.push(args.slice(braceStart, j + 1))
    re.lastIndex = i + 1
  }
  return bodies
}

/**
 * 裸早退的形态：`if (…) return`（单行或花括号块），且该行无 `// gate: skip` 标记。
 *
 * ⚠️ **必须排除「业务逻辑早退」**：测试体里大量 `if (…) return` 是**正常业务代码**
 *   （mock 的 `if (url === …) return new Response(…)`、filter 回调的 `if (…) return false`）
 *   ⇒ 把它们全判红，元测试立刻变成噪音闸（而噪音的闸，人只会绕过它）。
 *
 * ⇒ 判据用**两条正交特征**同时成立才算门控：
 *   1. **void 早退**：`return` 后面**没有值**（`return new Response(…)` / `return false`
 *      是业务返回值，调用方要用它，不是「什么都不做就结束」）。
 *   2. **不在嵌套函数里**：用**缩进**判定 —— 早退行的缩进必须与「用例体的基准缩进」
 *      相同（本仓测试都过 prettier，缩进可靠）；业务早退都在嵌套回调里 ⇒ 缩进更深。
 *
 * ⚠️ **不能用「早退后还有没有 expect」来区分**：真实的环境门控（无 Go 工具链就早退）
 *   早退之后**照样有断言**（断言在「有 Go」的分支里）⇒ 用那条判据会把真门控放过。
 */
function hasBareEarlyReturn(body: string): boolean {
  const lines = body.split('\n')
  // 基准缩进：**函数体第一层**的缩进。
  // ⚠️ 不是「全段最小缩进」：抽出的 body 首行是 `{`（缩进 0）⇒ 用它当基准会把
  //   「函数体第一层的语句」全部判成「嵌套」⇒ 真门控被放过。
  // ⇒ 基准 = 首行之后**第一行非空语句**的缩进（那才是函数体第一层）。
  let baseIndent: number | null = null
  for (const l of lines.slice(1)) {
    if (l.trim() === '') continue
    baseIndent = l.length - l.trimStart().length
    break
  }
  if (baseIndent === null) return false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!/\bif\s*\(/.test(line)) continue
    const sameLine = /\breturn\b/.test(line.slice(line.indexOf(')') + 1))
    const nextLine = lines[i + 1] ?? ''
    const nextIsReturn = /^\s*return\b/.test(nextLine)
    if (!sameLine && !nextIsReturn) continue
    const retSrc = sameLine ? line.slice(line.indexOf(')') + 1) : nextLine
    // 特征 1：void 早退
    if (/\breturn\s+(?!$|;|\/\/)/.test(retSrc)) continue
    // 特征 2：不在嵌套函数里（缩进与函数体第一层相同）
    const indent = line.length - line.trimStart().length
    if (indent !== baseIndent) continue
    // 标记豁免：本行或下一行有 `// gate: skip`
    if (line.includes('// gate: skip') || nextLine.includes('// gate: skip')) continue
    return true
  }
  return false
}

/**
 * 外层条件分支包住 `it(` / `describe(` 的形态。
 *
 * ⚠️ **判据靠「缩进关系」而非「后面几行内有没有 it(」**：
 *   `if (…) {` 之后、**缩进比 if 更深**的那一层，若出现 `it(` / `describe(`
 *   ⇒ 它被条件包住了（整块用例被吞，报告里连 skipped 都没有）。
 *   若 `it(` 与 `if` **同缩进** ⇒ 那是并列语句，不是条件体（常见于格式化后的样例代码）。
 *
 * ⚠️ 粗判据（只要后面 12 行内有 `it(`）会把「测试体内有个 if」误判成「条件包裹」，
 *   那会让元测试变成噪音闸（而噪音的闸，人只会绕过它）。
 */
function hasConditionalWrapper(src: string): boolean {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!/\bif\s*\(/.test(line)) continue
    // 必须是「if (…) {」形态（单行带花括号），而不是 `if (…) xxx` 或裸 `if (`
    if (!/\{\s*$/.test(line)) continue
    const indent = line.length - line.trimStart().length
    // 从下一行往后找：缩进**更深** ⇒ 可能是 if 的直接体
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const l = lines[j] ?? ''
      if (l.trim() === '') continue
      const lIndent = l.length - l.trimStart().length
      if (lIndent < indent) break
      if (lIndent === indent) {
        // 同缩进 ⇒ 不是 if 的直接体（要么并列，要么 if 体已闭合）
        // 但仍要看它是否**自身**是 if（嵌套）—— 保守起见继续往下找更深的一层
        continue
      }
      // 更深 ⇒ 在 if 的直接体里
      if (/\b(?:it|describe)(?:\.\w+)?\s*\(/.test(l)) return true
      break
    }
  }
  return false
}

describe('测试门控 · 早退不许计为通过（R0 · F13 / X3）', () => {
  it('⚠️ 全仓没有「裸 if (!…) return」的环境门控（无标记即判红）', () => {
    const offenders: string[] = []
    for (const file of testFiles(join(ROOT, 'apps')).concat(testFiles(join(ROOT, 'packages')))) {
      if (!isScannable(file)) continue
      const src = readFileSync(file, 'utf8')
      for (const body of testCallBodies(src)) {
        if (hasBareEarlyReturn(body)) {
          offenders.push(file.replace(ROOT + '/', ''))
          break
        }
      }
    }
    expect(
      offenders,
      `这些测试里有裸的「if (…) return」环境门控（会被计为通过）：\n${offenders.join('\n')}\n` +
        `（请改用 it.skipIf / ctx.skip()，或在该行加 // gate: skip 标记说明是有意为之）`,
    ).toEqual([])
  })

  it('⚠️ 全仓没有「条件分支包住 it( / describe(」的形态（整块被吞且无 skipped）', () => {
    const offenders: string[] = []
    for (const file of testFiles(join(ROOT, 'apps')).concat(testFiles(join(ROOT, 'packages')))) {
      if (!isScannable(file)) continue
      const src = readFileSync(file, 'utf8')
      if (hasConditionalWrapper(src)) offenders.push(file.replace(ROOT + '/', ''))
    }
    expect(
      offenders,
      `这些测试里有「if (…) { it(…) }」形态（整块用例被条件吞掉）：\n${offenders.join('\n')}\n` +
        `（请改用 it.skipIf / describe.skipIf）`,
    ).toEqual([])
  })

  it('判据能红：裸早退形态会被逮到', () => {
    // ⚠️ 样例形态与**真实调用路径一致**：喂的是「抽出的函数体」（首行是 `{`），
    //   否则基准缩进算的是 `it(` 那行 ⇒ 判据与实际用法不同形。
    const body = testCallBodies(`
      it('没有 Go 就早退', async () => {
        if (!hasGo) return
        expect(x).toBe(1)
      })
    `)[0]
    expect(body).toBeDefined()
    expect(hasBareEarlyReturn(body ?? '')).toBe(true)
  })

  it('判据能绿：带 // gate: skip 标记的早退不误报（有意为之）', () => {
    const body = testCallBodies(`
      it('没有 Go 就早退', async () => {
        if (!hasGo) return // gate: skip
        expect(x).toBe(1)
      })
    `)[0]
    expect(hasBareEarlyReturn(body ?? '')).toBe(false)
  })

  it('判据能绿：嵌套回调里的早退是业务逻辑，不误报', () => {
    // ⚠️ mock 的早返回是**业务代码**（调用方要用那个返回值）⇒ 不是门控。
    const body = testCallBodies(`
      it('mock 命中', async () => {
        const handler = async (url: string) => {
          if (url.includes('/x')) return new Response('ok')
          return new Response('miss')
        }
        expect(await handler('/x')).toBeTruthy()
      })
    `)[0]
    expect(hasBareEarlyReturn(body ?? '')).toBe(false)
  })

  it('判据能绿：it.skipIf 形态不误报（这是推荐写法）', () => {
    const fake = `
      it.skipIf(IS_WINDOWS)('权限位', () => {
        expect(x).toBe(1)
      })
    `
    expect(hasBareEarlyReturn(fake)).toBe(false)
  })

  it('判据能红：条件分支包住 it( 会被逮到', () => {
    const fake = `
      if (IS_WINDOWS) {
        it('只在 Windows 跑', () => {
          expect(x).toBe(1)
        })
      }
    `
    expect(hasConditionalWrapper(fake)).toBe(true)
  })

  it('判据能绿：普通 if 不包住 it( 时不误报', () => {
    const fake = `
      it('普通用例', () => {
        if (x > 1) {
          expect(y).toBe(1)
        }
        expect(z).toBe(2)
      })
    `
    expect(hasConditionalWrapper(fake)).toBe(false)
  })
})
