import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffMismatch, diffVsHead, repoPath, snapshotMismatch } from './support/file-diff'
import {
  STYLES_DEV0210_ADDED,
  STYLES_DEV0210_REMOVED,
} from './fixtures/styles-dev0210-registration'

/**
 * `tests/btn-display.test.ts` —— 按钮基座的 display 类隔离闸。
 *
 * ## 它挡什么
 *
 * **`btnBase` 里不得出现任何 `display` 工具类**（`inline-flex` / `flex` / `block` / `hidden` …）。
 *
 * ## 为什么这条闸非有不可
 *
 * 2026-11-08 实测（headless Chrome CDP，375×812）：顶栏三个按钮写了 `hidden sm:inline-flex`，
 * 但 `btnBase` 内含 `inline-flex`。Tailwind v4 的生成顺序里 `inline-flex` 排在 `hidden` **之后**
 * ⇒ `display` 被后者覆盖 ⇒ `hidden` **完全失效**，三个按钮照样渲染并横向溢出
 * （x 到 435 > 视口 375）。
 *
 * 这是**静默失效**：类名都写着，肉眼与 lint 都看不出来，只有量实际渲染才知道。
 * 本闸把它变成**源码层的静态断言** —— 零环境依赖，`pnpm test` 即可跑。
 *
 * ## 为什么断源码文本而不是渲染
 *
 * 渲染层断言需要浏览器（jsdom 不加载 `index.css`，见 `apps/web/src/components/ui/problock.test.tsx`）。
 * 而这条规则的失效面很窄（就是 `btnBase` 的字面量）⇒ 断它的文本足够且可常驻。
 * 布局回归的真实量测另由 CDP 脚本做（记在 DEV_LOG，不进 CI）。
 */

const STYLES = readFileSync(resolve(__dirname, '../apps/web/src/components/ui/styles.ts'), 'utf8')

/**
 * 剥掉一行里的注释：**整行注释**（`//` 起首，前可有缩进）与**行尾注释**（` // …`，`//` 前有空白）。
 *
 * ⚠️ 刻意**不**剥「字符串里的 `//`」：`'http://x'` 的 `//` 前是 `:`，不匹配 `\s+//`。
 *   两个函数共用这一条 —— 反引号计数（判模板串开合）与声明体清洗（判形状）
 *   必须对「注释算不算内容」有**同一个口径**，否则一处把注释当噪音、另一处当内容，
 *   就会出现「计数说不在模板串内、清洗说在」的自相矛盾。
 */
function stripLineComment(line: string): string {
  return line.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/.*$/, '')
}

/** 剥块注释（可跨行）—— 与行注释分开一条，因为块注释能跨行、行注释不能 */
function stripBlockComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 数一行里未转义的反引号个数（用于判断模板字面量开合）。
 *
 * ⚠️ 先剥注释再数：注释里的反引号会**翻转奇偶**，把下一个真正的 `export ` 误判成
 *   模板串内容（实测：`// 基座叫 \`btnBase` 一行就让 `btnPrimary` 整个被吞进 `btnBase` 的 body）。
 */
function countBackticks(line: string): number {
  const code = stripLineComment(line)
  let n = 0
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\\') {
      i++
      continue
    }
    if (code[i] === '`') n++
  }
  return n
}

/**
 * 清洗声明体：去块注释、去 `//` 注释（整行与行尾）、去空白，压成一行。
 *
 * ⚠️ 行尾注释必须剥：否则 `'a ' + // inline-flex` 里的 `inline-flex` 会被当成类名 ——
 *   而「变体自带 inline-flex」那条闸会**因注释而误绿**，与「注释是噪音」的口径相反。
 */
function normalize(body: string): string {
  // 管线固定：块注释（可跨行）→ 行注释（整行 + 行尾）→ 去空白 → 压一行
  return stripBlockComments(body)
    .split('\n')
    .map((l) => stripLineComment(l).trim())
    .filter((l) => l !== '')
    .join(' ')
}

/**
 * 取出 styles.ts 里所有 `export const btn*` 的声明体。
 *
 * 提取规则只有一条：**从 `export const btn… =` 那行起，到下一个**顶层** `^export ` 或文件结束**。
 * 刻意**不**用「续行必须以引号开头」这类排版习惯 —— 那条规则在声明体里出现对象字面量、
 * 数组、函数调用时会**静默截断**（body 只剩首行 `{`），而下游的 `includes('inline-flex')`
 * 之类判定**照样绿**。这正是本 describe 要防的失效形态。
 *
 * ⚠️ 「顶层」是关键：模板串内部（含 `${…}`）出现的 `export ` 行是**串内容**，不是下一个声明。
 *   故用反引号计数跟踪模板串开合 —— 处于未闭合模板串内时，`^export ` 不作边界
 *   （否则跨行模板串会在串内 `export ` 行处被提前截断，而形状判定可能仍绿）。
 *
 * 代价是 body 里可能夹着注释与空行 ⇒ 交给 `normalize()` 清洗后再判形状。
 */
function btnDeclarations(text: string = STYLES): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  let current: { name: string; lines: string[] } | null = null
  let backticks = 0 // 当前声明体内未闭合的模板串计数（奇数 = 在模板串内）

  for (const line of text.split('\n')) {
    // ⚠️ `= ?(.*)` 的 `?` 不可省：`btnBase` 的写法是 `export const btnBase =` 后**直接换行**，
    //   `= (.*)` 会因 `=` 后无空格而不匹配 ⇒ 整个基座从解析结果里消失（实测踩过）。
    const m = /^export const (btn[A-Za-z0-9_]*) = ?(.*)$/.exec(line)
    if (m && backticks % 2 === 0) {
      if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
      current = { name: m[1] ?? '', lines: [m[2] ?? ''] }
      backticks = countBackticks(m[2] ?? '')
      continue
    }
    // 下一个 export（任何导出，不限 btn*）结束当前声明 —— 但模板串内的 `export ` 行不算
    if (/^export /.test(line) && backticks % 2 === 0) {
      if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
      current = null
      backticks = 0
      continue
    }
    if (current !== null) {
      current.lines.push(line)
      backticks += countBackticks(line)
    }
  }
  if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
  return out
}

/**
 * 声明体必须是「类名表达式」：字符串字面量用 `+` 拼接，或单个模板字面量。
 *
 * ⚠️ 这是一条**形状闸**：本文件的所有断言都建立在「body 就是类名文本」这个前提上，
 * 而前提本身此前从没被验证过。若 `btnBase` 被改写成对象字面量 / 数组 / 函数调用，
 * 提取会拿到一堆非类名内容，而 `includes('inline-flex')` 之类的判定**照样绿** ——
 * 提取器坏了的表象是「闸恒绿」，最危险。
 *
 * ⚠️ 与 `btnBaseLiteral()` 共用这一条：闸（判形状）与消费者（取字面量）必须对
 *   「什么是类名文本」有同一个口径，否则一处认模板串、另一处只认引号串，会各说各话。
 */
function isClassNameExpression(norm: string): boolean {
  // 单个模板字面量（允许 `${…}` 插值，如 `${btnBase} inline-flex …`）
  if (norm.startsWith('`') && norm.endsWith('`')) return true
  // 字符串字面量的 `+` 拼接
  const parts = norm.split(/\s*\+\s*/).map((p) => p.trim())
  return parts.length > 0 && parts.every((p) => /^(['"])[^'"]*\1$/.test(p))
}

/**
 * 取出 `btnBase` 的字面量（含跨行拼接的字符串常量）。
 *
 * ⚠️ 口径与形状闸一致：先 `normalize`（剥块注释 + `//` 注释 + 空白），再从「字符串字面量的
 *   `+` 拼接」里抽引号内容。这样「哪些东西算类名」在本文件里**只有一个口径** ——
 *   早期版本直接对 raw body 跑 `/'([^']*)'/g`，与 `isClassNameExpression` 的判据并存两套，
 *   且注释里的引号会被当成类名（行尾注释 `'a ' + // 用 'x'` 会多抽出一个 `x`）。
 */
function btnBaseLiteral(): string {
  const base = btnDeclarations().find((d) => d.name === 'btnBase')
  expect(base, 'btnBase 的声明找不到（文件结构变了？本闸需要同步改）').toBeDefined()
  const norm = normalize(base!.body)
  expect(
    isClassNameExpression(norm),
    `btnBase 的值不再是「字符串拼接 / 模板字面量」——提取器的前提已失效，本闸会静默漏判，` +
      `请同步改闸（当前 body：${norm.slice(0, 80)}…）`,
  ).toBe(true)
  // 模板串：取反引号之间的内容；`+` 拼接：取所有引号串
  if (norm.startsWith('`') && norm.endsWith('`')) return norm.slice(1, -1)
  const parts = norm.split(/\s*\+\s*/).map((p) => p.trim().replace(/^['"]|['"]$/g, ''))
  expect(parts.length, 'btnBase 里没有字符串字面量（写法变了？）').toBeGreaterThan(0)
  return parts.join(' ')
}

/** 变体：四个按钮类各自的字面量 */
const VARIANTS = ['btnPrimary', 'btnSecondary', 'btnGhost', 'btnDanger'] as const

describe('btnBase · display 类隔离', () => {
  it('btnBase 不含任何 display 工具类', () => {
    const base = btnBaseLiteral()
    const displayClasses = [
      'inline-flex',
      'inline-block',
      'flex',
      'inline',
      'block',
      'hidden',
      'grid',
      'table',
      'contents',
      'list-item',
    ]
    const found = displayClasses.filter((c) =>
      new RegExp(`\\b${c.replace('-', '\\-')}\\b`).test(base),
    )
    expect(
      found,
      `btnBase 里出现 display 类：${found.join('、')}（会让调用点的 hidden/block 失效）`,
    ).toEqual([])
  })

  it('⚠️ 变异腿：闸自己能抓到（用一段含 inline-flex 的假基座验证判定式）', () => {
    const fake = 'items-center gap-1 inline-flex rounded-md border px-3 py-1.5'
    expect(/\binline-flex\b/.test(fake)).toBe(true)
  })

  for (const v of VARIANTS) {
    it(`${v} 自带 inline-flex（下沉后的落点）`, () => {
      const decl = btnDeclarations().find((d) => d.name === v)
      expect(decl, `${v} 的声明找不到`).toBeDefined()
      expect(normalize(decl!.body), `${v} 应自带 inline-flex`).toContain('inline-flex')
    })
  }

  it('四个变体都仍以 btnBase 开头（下沉不是重写）', () => {
    for (const v of VARIANTS) {
      const decl = btnDeclarations().find((d) => d.name === v)
      expect(decl, `${v} 的声明找不到`).toBeDefined()
      expect(normalize(decl!.body), `${v} 应基于 btnBase（body 应以 \`\${btnBase} 开头）`).toMatch(
        /^`\$\{btnBase\}/,
      )
    }
  })
})

/**
 * 反向扫描：`btnBase` 在 `styles.ts` **之外**的引用点。
 *
 * ## 为什么必须有这一条
 *
 * 上面几条断的都是**变体侧**（`btnPrimary` 等四个），它们兜不住「有人在别处
 * 新拼一次 `btnBase`」—— 而那正是隐患最可能复发的形态：新写一个按钮时
 * 图省事直接 `${btnBase} ...`，于是又回到「display 类与调用点的 hidden 抢优先级」。
 *
 * 断言：`styles.ts` 之外**只允许出现四个变体名**（`btnPrimary` / `btnSecondary` /
 * `btnGhost` / `btnDanger`），出现 `btnBase` 即红。
 *
 * ⚠️ 只扫 `apps/web/src`（这是唯一消费 `styles.ts` 的目录）且跳过测试文件本身 ——
 *   测试文件里出现这些名字是**在断言它们**，不是在使用它们。
 */
describe('btnBase · 引用面闭合', () => {
  const WEB_SRC = resolve(__dirname, '../apps/web/src')

  /** 递归收集 .ts/.tsx（跳过测试文件与 styles.ts 本体） */
  function sources(): { rel: string; text: string }[] {
    const out: { rel: string; text: string }[] = []
    const walk = (dir: string): void => {
      let entries: ReturnType<typeof readdirSync>
      try {
        entries = readdirSync(dir, { withFileTypes: true }) as never
      } catch {
        return
      }
      for (const e of entries as unknown as { name: string; isDirectory(): boolean }[]) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        const full = join(dir, e.name)
        if (e.isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(?:ts|tsx)$/.test(e.name)) continue
        // 跳过：styles.ts 本体（定义处）与所有测试文件（断言处）
        if (e.name === 'styles.ts' || /\.test\.tsx?$/.test(e.name)) continue
        out.push({
          rel: relative(WEB_SRC, full).split('\\').join('/'),
          text: readFileSync(full, 'utf8'),
        })
      }
    }
    walk(WEB_SRC)
    return out
  }

  it('styles.ts 之外不得出现 btnBase（只能走四个变体）', () => {
    const offenders: string[] = []
    for (const s of sources()) {
      // 整词匹配，避免 btnBaseXxx 这类误伤
      if (/\bbtnBase\b/.test(s.text)) offenders.push(s.rel)
    }
    expect(
      offenders,
      `这些文件直接用了 btnBase，应改用 btnPrimary/btnSecondary/btnGhost/btnDanger：${offenders.join('、')}`,
    ).toEqual([])
  })

  it('⚠️ 变异腿：判定式能抓到（塞一个假文件内容验证）', () => {
    const fake = sources().slice(0, 1)
    const withBase = [...fake, { rel: 'fake.tsx', text: 'const x = `${btnBase} border`;' }]
    const offenders = withBase.filter((s) => /\bbtnBase\b/.test(s.text)).map((s) => s.rel)
    expect(offenders).toContain('fake.tsx')
  })

  it('自证扫描面非空（否则上一条是空转的）', () => {
    const all = sources()
    expect(all.length, '扫描到的源文件数为 0，说明路径或过滤写错了').toBeGreaterThan(50)
    // 且确实扫到了用按钮的文件（否则「零 offenders」可能只是没扫到东西）
    const usingButtons = all.filter((s) =>
      /\b(btnPrimary|btnSecondary|btnGhost|btnDanger)\b/.test(s.text),
    )
    expect(usingButtons.length, '没有任何文件用四个变体，扫描面可疑').toBeGreaterThan(10)
  })
})

/**
 * 增量侧②：**任何新导出的按钮类**都必须自带 `inline-flex`。
 *
 * ## 为什么这一条比「枚举四个变体」更抗改名
 *
 * 上面几条把四个变体名**写死**了 —— 有人加 `btnBaseV2` 或 `btnLink` 就绕过去。
 * 本条改为**按前缀认**：`styles.ts` 里所有 `export const btn*` 的名字，
 * 只要它不是基座本身，就必须自带 `inline-flex`。
 *
 * ⚠️ 基座（`btnBase`）**刻意不要求** `inline-flex` —— 那正是本闸要守的东西。
 *   若基座也带上，就回到「调用点写 `hidden` 被覆盖」的老问题。
 */
describe('btnBase · 增量按钮类', () => {
  it('btn* 导出的字面量里，除 btnBase 外都必须自带 inline-flex', () => {
    const bad: string[] = []
    for (const d of btnDeclarations()) {
      if (d.name === 'btnBase') continue
      // 用 normalize 后的文本判，避免注释里出现 `inline-flex` 造成误伤
      if (!normalize(d.body).includes('inline-flex')) bad.push(d.name)
    }
    expect(
      bad,
      `这些按钮类没带 inline-flex（调用点的 hidden/block 会被基座的 display 类覆盖）：${bad.join('、')}`,
    ).toEqual([])
  })

  it('btnBase 仍然不带 inline-flex（本闸的守线，别被"顺手补上"）', () => {
    const all = btnDeclarations()
    const base = all.find((d) => d.name === 'btnBase')
    expect(
      base,
      `btnBase 的声明找不到（当前解析到：${all.map((d) => d.name).join('、')}）`,
    ).toBeDefined()
    expect(normalize(base!.body)).not.toContain('inline-flex')
  })

  it('每个 btn* 的声明体都是「类名表达式」（结构变了就报错，别静默绿）', () => {
    const bad: { name: string; body: string }[] = []
    for (const d of btnDeclarations()) {
      const norm = normalize(d.body)
      if (!isClassNameExpression(norm)) bad.push({ name: d.name, body: norm.slice(0, 80) })
    }
    expect(
      bad,
      `这些 btn* 的值不再是「字符串拼接 / 模板字面量」——提取器的前提已失效，本闸会静默漏判，` +
        `请同步改闸：${bad.map((b) => `${b.name}（${b.body}…）`).join('、')}`,
    ).toEqual([])
  })

  it('⚠️ 变异腿：形状判定式能抓到对象字面量（否则上一条是空转的）', () => {
    expect(isClassNameExpression(normalize(`{\n  base: 'items-center',\n}`))).toBe(false)
    expect(isClassNameExpression(normalize(`'a ' +\n  'b'`))).toBe(true)
    expect(isClassNameExpression(normalize('`${btnBase} inline-flex`'))).toBe(true)
    // 块注释：声明体里夹块注释时必须被剥掉，否则形状判定误判
    const normalized = normalize(`'a ' /* 行内 */ +\n  'b'`)
    expect(normalized).not.toContain('行内')
    expect(isClassNameExpression(normalized)).toBe(true)
    expect(isClassNameExpression(normalize(`/* 整行\n   多行 */\n  'a ' +\n  'b'`))).toBe(true)
    // 行尾注释必须剥：否则注释里的类名会被当成真类名（闸会因注释而误绿）
    const withTrailing = normalize(`'a ' + // inline-flex\n  'b'`)
    expect(withTrailing).not.toContain('inline-flex')
    expect(isClassNameExpression(withTrailing)).toBe(true)
    // 行尾注释会连带吃掉它前面的空格 —— 这是**已知且可接受**的：类名串的尾空格在
    //   `normalize` 里本来就会被 trim 掉，而「`+` 两侧」的空格是分隔符不是内容。
    //   断言写死这个行为，避免将来有人「顺手修」成保留空格而不知情。
    expect(withTrailing).toBe(`'a ' + 'b'`)
    // 字符串里的 `//` 不得被当注释剥（`'http://x'` 的 `//` 前是 `:`）
    expect(normalize(`'http://x ' +\n  'b'`)).toBe(`'http://x ' + 'b'`)
  })

  it('⚠️ 自证：判定式确实在判（扫到的 btn* 导出应恰为 5 个）', () => {
    const all = btnDeclarations()
    expect(all.length, 'btn* 导出数与预期不符，说明解析器或文件结构变了').toBe(5)
    expect(all.map((d) => d.name).sort()).toEqual([
      'btnBase',
      'btnDanger',
      'btnGhost',
      'btnPrimary',
      'btnSecondary',
    ])
  })

  it('提取边界：模板串内的 `export ` 行不得截断声明体', () => {
    // 声明体是跨行模板串，其中一行以 `export ` 开头 —— 旧边界规则会在此处提前截断
    const fixture = [
      'export const btnBase = `${itemsCenter} inline-flex',
      "export const fake = 'inside-template'",
      'border`',
      'export const btnPrimary = `${btnBase} inline-flex`',
    ].join('\n')
    const decls = btnDeclarations(fixture)
    expect(decls.map((d) => d.name)).toEqual(['btnBase', 'btnPrimary'])
    const base = decls.find((d) => d.name === 'btnBase')
    expect(base?.body).toContain('inside-template')
  })

  it('提取边界：注释里的反引号不得翻转模板串奇偶', () => {
    // 整行注释里出现奇数个反引号 —— 旧计数会把它算进模板串开合，
    //   于是下一个真正的 `export ` 被误判成串内容，整个声明被吞进上一个 body
    const fullLine = [
      'export const btnBase = `${itemsCenter} inline-flex',
      '// 基座叫 `btnBase（奇数个反引号）',
      'border`',
      'export const btnPrimary = `${btnBase} inline-flex`',
    ].join('\n')
    expect(btnDeclarations(fullLine).map((d) => d.name)).toEqual(['btnBase', 'btnPrimary'])

    // 行尾注释同理
    const trailing = [
      "export const btnBase = 'items-center ' + // 用 `btnBase` 做基座",
      "  'inline-flex border'",
      'export const btnPrimary = `${btnBase} inline-flex`',
    ].join('\n')
    expect(btnDeclarations(trailing).map((d) => d.name)).toEqual(['btnBase', 'btnPrimary'])
  })

  it('⚠️ 旧解析器复算：对象写法下旧状态机静默截断（本轮修复的动机）', () => {
    // DEV-0212 的旧状态机：续行必须以引号开头，否则视为声明结束
    function oldBtnDeclarations(text: string): { name: string; body: string }[] {
      const out: { name: string; body: string }[] = []
      let current: { name: string; lines: string[] } | null = null
      for (const line of text.split('\n')) {
        const m = /^export const (btn[A-Za-z0-9_]*) = ?(.*)$/.exec(line)
        if (m) {
          if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
          current = { name: m[1] ?? '', lines: [m[2] ?? ''] }
          continue
        }
        if (/^export /.test(line)) {
          if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
          current = null
          continue
        }
        if (current !== null && /^\s*['"`]/.test(line)) {
          current.lines.push(line)
        } else if (current !== null) {
          out.push({ name: current.name, body: current.lines.join('\n') })
          current = null
        }
      }
      if (current !== null) out.push({ name: current.name, body: current.lines.join('\n') })
      return out
    }

    const objectStyle = [
      'export const btnBase = {',
      "  layout: 'items-center gap-1 inline-flex',",
      "  focus: 'focus-visible:outline-2',",
      '}',
      'export const btnPrimary = `${btnBase} inline-flex`',
    ].join('\n')

    // 旧解析器：body 被截断为 `{`，inline-flex 检查静默漏判
    const oldBase = oldBtnDeclarations(objectStyle).find((d) => d.name === 'btnBase')
    expect(oldBase?.body.trim()).toBe('{')
    expect(oldBase?.body.includes('inline-flex')).toBe(false)

    // 新解析器：拿到完整 body，形状闸报红（提取器前提失效，不再静默）
    const newBase = btnDeclarations(objectStyle).find((d) => d.name === 'btnBase')
    expect(newBase?.body.includes('inline-flex')).toBe(true)
    expect(isClassNameExpression(normalize(newBase!.body))).toBe(false)
  })
})

/**
 * 增量侧③：**测试文件**里若出现 `btnBase`，必须同时出现四个变体之一。
 *
 * ## 为什么给测试开这个口子
 *
 * 反向扫描跳过测试文件，是因为测试里引用这些名字通常**是在断言它们**。
 * 但「测试文件」这个集合太大 —— 若有人在某个 `.test.tsx` 里真的拼了一次
 * `btnBase`，闸不会红，而测试代码同样会跑（只是不进产品构建）。
 *
 * 故加一条**次级约束**：测试文件里出现 `btnBase` 时，必须同时出现
 * `btnPrimary` / `btnSecondary` / `btnGhost` / `btnDanger` 之一
 * （即：只允许在**对比断言**的语境里出现，不允许单独出现）。
 *
 * ⚠️ 这是**放宽后的兜底**，不是硬禁 —— 硬禁会误伤本文件（本文件就同时在引用两者）。
 */
describe('btnBase · 测试文件次级约束', () => {
  const VARIANT_RE = /\b(btnPrimary|btnSecondary|btnGhost|btnDanger)\b/

  /**
   * 测试文件分两处：`apps/web/src/**` 与 `tests/**`。
   * ⚠️ 本文件自身在 `tests/`（unit project 只收 `tests/`，见 vitest.config.ts），
   *   只扫 `apps/web/src` 会把自己漏掉 ⇒ 自证断言恒 0。
   */
  function testFiles(): { rel: string; text: string }[] {
    const roots = [
      { dir: resolve(__dirname, '../apps/web/src'), base: 'apps/web/src' },
      { dir: resolve(__dirname), base: 'tests' },
    ]
    const out: { rel: string; text: string }[] = []
    const walk = (dir: string, base: string): void => {
      let entries: ReturnType<typeof readdirSync>
      try {
        entries = readdirSync(dir, { withFileTypes: true }) as never
      } catch {
        return
      }
      for (const e of entries as unknown as { name: string; isDirectory(): boolean }[]) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        const full = join(dir, e.name)
        if (e.isDirectory()) {
          // tests/ 下的 golden/ 与 support/ 不是测试源码，跳过
          if (base === 'tests' && (e.name === 'golden' || e.name === 'support')) continue
          walk(full, base)
          continue
        }
        if (!/\.test\.tsx?$/.test(e.name)) continue
        out.push({
          rel: `${base}/${relative(dir, full)}`.split('\\').join('/'),
          text: readFileSync(full, 'utf8'),
        })
      }
    }
    for (const r of roots) walk(r.dir, r.base)
    return out
  }

  it('测试文件里 btnBase 必须与某个变体同现（只允许对比断言语境）', () => {
    const offenders: string[] = []
    for (const f of testFiles()) {
      if (!/\bbtnBase\b/.test(f.text)) continue
      if (!VARIANT_RE.test(f.text)) offenders.push(f.rel)
    }
    expect(
      offenders,
      `这些测试单独引用了 btnBase（应改为引用某个变体，或在同文件里对比两者）：${offenders.join('、')}`,
    ).toEqual([])
  })

  it('⚠️ 自证：扫描到了测试文件（否则上一条空转）', () => {
    const all = testFiles()
    expect(all.length, '扫到的测试文件数为 0').toBeGreaterThan(10)
    const referencing = all.filter((f) => /\bbtnBase\b/.test(f.text))
    expect(
      referencing.length,
      '没有任何测试引用 btnBase，本条约束当前无对象（应至少断言自己这个文件）',
    ).toBeGreaterThan(0)
  })
})

/**
 * 全文件核对：`styles.ts` 与 HEAD 的差异**恰为** DEV-0210 登记的三处。
 *
 * ## 为什么必须有这一条
 *
 * 前面所有闸断的都是**局部**：`btnBase` 里没有 display 类、四个变体自带 `inline-flex`、
 * 引用面闭合、形状合法。它们兜不住「有人在该文件里做**与按钮无关**的改动」——
 * 例如顺手调 `cardCls` 的圆角、改 `chipCls` 的内距、加一行注释。这类改动不违反任何
 * 局部规则，却会**静默进包**。
 *
 * DEV-0217 的核对只做了「拿 diff 与登记三处逐条对应」，那是**人工**动作、且只覆盖登记项。
 * 本条把它变成**常驻断言**：`git diff` 与 HEAD 比，新增/删除行必须与 DEV-0210 的登记**逐行等值**。
 *
 * ## 为什么断「逐行等值」而不是「diff 行数」
 *
 * 行数相同但内容变了（例如把 `rounded-md` 改成 `rounded-sm`）行数不会变 —— 那只验了
 * 「改动规模没超」，没验「改的是不是登记的那几处」。逐行等值才封住「同规模替换」。
 *
 * ⚠️ 本闸依赖 `git`，因此**只在仓库里跑**（vitest unit project）。
 *   `git` 不可用时**跳过而非报错** —— 但跳过要**出声**（`console.warn`），
 *   否则「闸恒绿」会被误读成「已核对」。
 */
describe('styles.ts · 全文件差异核对（DEV-0210 登记面）', () => {
  const STYLES_REL = 'apps/web/src/components/ui/styles.ts'

  it('styles.ts 与 HEAD 的差异恰为 DEV-0210 登记的三处（逐行等值）', () => {
    const diff = diffVsHead(STYLES_REL)
    // 工作树干净 = DEV-0210 的改动已提交 ⇒ 本闸不适用（提交后自然没有差异可核）
    if (diff === null) return
    const msg = diffMismatch(diff, STYLES_DEV0210_ADDED, STYLES_DEV0210_REMOVED)
    expect(msg, `styles.ts 的改动与 DEV-0210 登记不符：${msg ?? ''}`).toBeNull()
  })

  it('⚠️ 自证：git diff 确实跑到了（否则上一条是空转的）', () => {
    const diff = diffVsHead(STYLES_REL)
    if (diff === null) return // 工作树干净 ⇒ 上一条已跳过，本条无对象
    // 当前工作树必然有 DEV-0210 的改动 ⇒ 两侧都非空
    expect(
      diff.added.length,
      'git diff 没取到任何新增行（git 不可用？路径写错？）',
    ).toBeGreaterThan(0)
    expect(diff.removed.length, 'git diff 没取到任何删除行').toBeGreaterThan(0)
  })
})

/**
 * 全文快照核对：`styles.ts` 与 `layout.tsx` 必须与落盘快照**逐字一致**。
 *
 * ## 与 diff 判据的分工（两条不可互相替代）
 *
 * | 判据 | 何时成立 | 管什么 |
 * |---|---|---|
 * | `diffVsHead`（上一 describe） | 只在改动**未提交**时 | 「这一笔只含登记的改动」 |
 * | `snapshotMismatch`（本 describe） | **提交前后都成立** | 「文件此后不漂」 |
 *
 * diff 判据的盲区是**提交之后**：`git diff` 为空、闸跳过，此后任何改动都不再被约束。
 * 快照判据补上这一段 —— 它跟着提交走，改动即红。
 *
 * ## 为什么 `layout.tsx` 也要
 *
 * DEV-0208 引入的 `components/ui/layout.tsx` 同样是「类组合的单一出处」，
 * 被 62 个文件、299 处调用。它此前**没有任何**全文件核对 —— 与 `styles.ts`
 * 在 DEV-0217 之前的状态一样：只有局部规则（`ProBlock` 的显隐链路），
 * 没有「文件里其它地方被改了」的判据。
 *
 * ## 处置路径
 *
 * 改动是**刻意**的 ⇒ 跑 `pnpm ui:snapshot` 重新生成快照并同笔提交。
 * 改动是**误**的 ⇒ 还原文件。两者都由本闸区分不开（闸只负责喊人来看）。
 */
describe('类组合单一出处 · 全文快照核对', () => {
  const TARGETS = [
    {
      name: 'styles.ts',
      src: 'apps/web/src/components/ui/styles.ts',
      snap: 'tests/styles-ts.snapshot.txt',
    },
    {
      name: 'layout.tsx',
      src: 'apps/web/src/components/ui/layout.tsx',
      snap: 'tests/layout-tsx.snapshot.txt',
    },
  ]

  for (const t of TARGETS) {
    it(`${t.name} 与快照逐字一致（改动即红，刻意改动跑 pnpm ui:snapshot）`, () => {
      const msg = snapshotMismatch(repoPath(t.src), repoPath(t.snap))
      expect(msg, `${t.name} 与 ${t.snap} 不一致：\n${msg ?? ''}`).toBeNull()
    })
  }

  it('⚠️ 自证：快照文件非空（否则上一条是「空对空」的恒绿）', () => {
    for (const t of TARGETS) {
      const snap = readFileSync(repoPath(t.snap), 'utf8')
      expect(snap.length, `${t.snap} 为空文件`).toBeGreaterThan(100)
      expect(snap.endsWith('\n'), `${t.snap} 应以换行结尾（否则逐字比对会因末行差异恒红）`).toBe(
        true,
      )
    }
  })
})
