import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * 错误文案中文化闸（方案 3.1 · 2026-10-28；2026-10-28 扩到 server + `.message` 判据）。
 *
 * **为什么要有这一支**：真机手测在 `/projects/:id` 看到错误态印着
 * 「请求失败：Failed to fetch」——中文界面里漏出了浏览器的英文机器串。
 * 根因在 `api/client.ts` 的边界（已修），但那只堵住了一个洞；下一个页面
 * 写 `String(e)`、或直接渲染 `query.error.message`，同样的洞就再开一次。
 *
 * **这条闸防的是复发，不是复检**：
 *  - 断言的是「**用户可见文案里不得出现英文机器串**」这一**意图**，
 *    而不是「某几处代码长什么样」——实现换了写法也照样红。
 *  - 判据用 **AST** 而不是正则：正则分不清注释里的 `String(e)` 字样、
 *    字符串字面量、还有真正插值到 JSX/模板串里的调用——分不清就会误报，
 *    误报的闸会被绕开（加豁免），于是闸就死了。
 *
 * **覆盖三个应用层**（server 也要扫）：
 *  - `apps/web/src`：界面文案直出的地方（JSX 文本、模板串、toast）。
 *  - `apps/cli/src`：终端文案直出的地方。
 *  - `apps/server/src`：**错误体是 server 造的**——`{code, message}` 里的 message
 *    最终会印在界面上（`api/client.ts` 原样透出）。server 侧一个英文 message
 *    ⇒ 界面上就是英文。所以 server 必须在扫。
 *    `packages/core` 不扫：它抛的 `AppError` message 是**业务中文**（实测 61 处
 *    全是「中文句子 + 内嵌英文技术词」，如 `非法 URL: ${raw}`），且 core 是库层、
 *    不该管文案口径。
 */
const ROOTS = ['apps/web/src', 'apps/cli/src', 'apps/server/src']

/** 会被判成「英文机器串」的典型形态（用于在失败信息里指名道姓） */
const MACHINE_STRINGS = [
  'Failed to fetch',
  'Internal Server Error',
  'NetworkError',
  'Load failed',
  'TypeError:',
  'Error:',
]

/**
 * 错误变量名：只有这些名字上的 `String(...)` 才算「把异常转成字符串」。
 *
 * 为什么按名字收窄：`String(n)` / `String(url)` 是完全正常的用法（仓内上百处），
 * 把它们一起禁掉等于把闸变成噪声 —— 噪声闸必然被豁免，豁免多了就等于没闸。
 */
const ERROR_NAMES = new Set(['e', 'err', 'error', 'e1', 'e2', 'ex', 'cause', 'cause2', 'lastError'])

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(entry.name)) out.push(p)
  }
  return out.sort()
}

const files = ROOTS.flatMap((r) => sources(join(process.cwd(), r)))

/**
 * 本仓自有的错误类：它们的 message 由**本仓代码构造** ⇒ 必为中文。
 *
 * ⚠️ **这份清单是现算的，不是硬编码的**：
 * 新增一个 `class XxxError extends Error` 时，它的 message 天然是本仓文案；
 * 若把名单写死，新类不在名单里 ⇒ 闸会误报 ⇒ 有人会去加豁免 ⇒ 闸就死了。
 * 现算保证「凡是本仓的错误类都受信」，新增类自动进名单。
 */
const OWN_ERROR_CLASSES = (() => {
  const names = new Set<string>()
  for (const f of files) {
    const source = readFileSync(f, 'utf8')
    const sf = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node): void => {
      if (
        ts.isClassDeclaration(node) &&
        node.name !== undefined &&
        node.heritageClauses?.some((h) => h.types.some((t) => t.expression.getText() === 'Error'))
      ) {
        names.add(node.name.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return names
})()

/** 一处「错误文案可能漏出英文机器串」的用法 */
interface Leak {
  file: string
  line: number
  /** 命中的表达式原文（截断） */
  snippet: string
  /** 为什么判它是漏出 */
  why: string
}

// ─────────────────────────────────────────────────────────────────────────────
// 判据一：`String(错误变量)` 未守卫地转字符串
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 判断一个 `String(x)` 调用是否会把异常**直接印给用户看**。
 *
 * 两种判为「安全」的情形（都不是靠人眼扫，是靠 AST 关系）：
 *  1. 三元守卫：`e instanceof Error ? e.message : String(e)`
 *     —— 错误走 `.message` 分支，`String(e)` 只在**非** Error 时兜底，
 *        而非 Error 没有 `.message`，此时 `String(e)` 是该值的本来面目。
 *  2. `??` 兜底：`err.message ?? String(e)`
 *     —— 同理，`.message` 有值时不会走到右边。
 *
 * 反过来，**裸插值**（`${String(e)}` / `{String(e)}` / `String(e)` 直接作为实参
 * 传给打印类函数）判为漏出：此时 `e` 是 Error 时会得到 `"Error: 原始信息"`，
 * 那个 `"Error: "` 前缀与英文原始信息一起进了界面。
 */
function inspectCall(file: string, source: string, call: ts.CallExpression): Leak | null {
  // ⚠️ **必须确认被调用者就是全局 `String`**：
  // 只看实参会误判——`detailOf(e)`（仓里真实存在，`telemetry.ts`）的实参也是 `e`，
  // 但它不是 `String()`，而是本仓自己的归一化函数。误报会让闸被无谓地豁免。
  const callee = call.expression
  if (!ts.isIdentifier(callee) || callee.text !== 'String') return null

  const arg = call.arguments[0]
  if (arg === undefined || !ts.isIdentifier(arg)) return null
  if (!ERROR_NAMES.has(arg.text)) return null

  const line = source.slice(0, call.getStart()).split('\n').length
  const snippet = source.slice(call.getStart(), call.getEnd()).replace(/\s+/g, ' ').slice(0, 60)

  const parent = call.parent

  // 情形 1：三元守卫 —— 条件是 `x instanceof Error`，且本调用在 false 分支
  if (ts.isConditionalExpression(parent) && parent.whenFalse === call) {
    const cond = parent.condition
    if (
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      cond.left.getText() === arg.text
    ) {
      return null
    }
  }

  // 情形 2：`??` 兜底 —— 左边是 `.message` 读取
  //
  // ⚠️ **左支的变量名不必与 `String(x)` 的实参同名**：
  // 仓里真实形态是 `err.message ?? String(e)`——`err` 是 `e` 的窄化视图，
  // 两者不同名。判据只认「左支读的是 `.message`」这一件事：
  // `??` 右侧本就是「左支为 null/undefined 时才走」的兜底位，
  // 走到时 `.message` 已不可用，`String(e)` 给的是该值的本来面目。
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
    parent.right === call
  ) {
    const left = parent.left
    if (ts.isPropertyAccessExpression(left) && left.name.text === 'message') {
      return null
    }
  }

  return {
    file: relative(process.cwd(), file),
    line,
    snippet,
    why: `String(${arg.text}) 未守卫地转字符串，Error 实例会带上 "Error: " 前缀`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 判据二：直接渲染 `.message`（未经归一化边界）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 哪些 `.message` 读取是**受信**的（值已经过归一化边界，message 必为中文）。
 *
 * ⚠️ **这不是「值看起来安全」，而是「值的来源可判定」**：
 *  1. **`instanceof ApiError` 收窄**：`ApiError.message` 由 `api/client.ts` 写死为
 *     server 的 `{code,message}` 或链路层中文 ⇒ 必为中文。
 *  2. **`instanceof Error` 收窄**：只在**三元守卫**里算受信——那种写法
 *     本仓的约定是「拿不到就退中文兜底」。
 *  3. **react-query 槽位**（`query.error` / `list.error` 等）：这些 error 全部
 *     由 `apiJson`/`apiRaw` 抛出 ⇒ 是 `ApiError` ⇒ message 已归一化。
 *  4. **本仓自有错误类**（`BootError` / `CleanError` / `ApiError` …）：
 *     message 由本仓代码构造 ⇒ 必为中文。判据是「该变量的类型标注是
 *     本仓错误类」或「`instanceof` 本仓错误类」。
 *
 * 其余（`catch` 到的 `e`、mutation 的 `onError(e)` 参数等）**来源不可判定**：
 * 它们可能是任何 `Error`，其 `.message` 是英文机器串 ⇒ 判为漏出。
 */
function isTrustedMessageRead(
  receiver: ts.Expression,
  prop: ts.PropertyAccessExpression,
): { trusted: boolean; why: string } {
  // 形态 1/2：三元守卫的 true 分支里读 `.message`
  const parent = prop.parent
  if (ts.isConditionalExpression(parent) && parent.whenTrue === prop) {
    const cond = parent.condition
    if (
      ts.isBinaryExpression(cond) &&
      cond.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword
    ) {
      const typeName = cond.right.getText()
      if (typeName === 'ApiError') {
        return { trusted: true, why: 'instanceof ApiError 收窄' }
      }
      if (typeName === 'Error') {
        return { trusted: true, why: 'instanceof Error 三元守卫' }
      }
      if (OWN_ERROR_CLASSES.has(typeName)) {
        return { trusted: true, why: `instanceof ${typeName}（本仓错误类）` }
      }
    }
  }

  // 形态 3：react-query 槽位（`<x>.error.message`）
  //
  // ⚠️ **`props.error` / `this.error` 不算**：那是「外部塞进来的任意错误」，
  // 没有任何边界为它担保。组件收到的 error prop 可能是调用方 `throw` 的任意 Error
  //（其 message 是英文机器串）。只有 hook 结果对象（`query` / `list` / `active` …）
  // 上的 `.error` 才有「由 apiJson/apiRaw 抛出 ⇒ 是 ApiError」这条保证。
  if (
    ts.isPropertyAccessExpression(receiver) &&
    receiver.name.text === 'error' &&
    !['props', 'this'].includes(receiver.expression.getText())
  ) {
    return { trusted: true, why: 'react-query 槽位（经 api/client 边界）' }
  }

  // 形态 4：接收者的**类型标注**是本仓错误类
  //（`onError: (e: ApiError) => ...` —— 声明即契约，值必是那个类）
  const declared = declaredTypeOf(receiver)
  if (declared !== null && OWN_ERROR_CLASSES.has(declared)) {
    return { trusted: true, why: `接收者类型标注为 ${declared}（本仓错误类）` }
  }

  // 形态 5：被外层 `if` 守卫收窄过
  //
  // `if (error instanceof ApiError) { toast(error.message) }` —— 条件里的
  // `instanceof` 已把类型收窄到这个分支内，和三元守卫是同一件事的另一种写法。
  // 只认 `thenStatement` 里的读取：`else` 分支恰恰是「不是该类」的那一支。
  const narrow = enclosingIfNarrowing(prop)
  if (narrow !== null && OWN_ERROR_CLASSES.has(narrow)) {
    return { trusted: true, why: `外层 if 以 instanceof ${narrow} 收窄` }
  }

  // 形态 7：`catch` 包住的是网络调用
  //
  // `try { await apiJson(...) } catch (e) { toast(e.message) }` —— try 块里只有取数，
  // 能抛出来的就是 `ApiError`（前提同样由「网络出口唯一」那条钉住；本地 throw
  // 只白名单两处，都不在这些 try 块里）。
  const netTry = networkTryHelper(prop)
  if (netTry !== null) {
    return { trusted: true, why: `catch 包住 ${netTry}（错误来自 api/client 归一化边界）` }
  }

  // 其余：来源不可判定
  return { trusted: false, why: '来源不可判定（可能是任意 Error，message 未必中文）' }
}

/**
 * 若本节点位于某个 `try` 块内、且该 try 块里有网络调用，返回那个调用的名字。
 *
 * 只认三种真实出现的入口：`apiJson` / `apiRaw` / `.mutate(Async)`。
 * 不认「有 try 就算」——那会把本地解析、DOM 操作等一切 try 都放行。
 */
function networkTryHelper(prop: ts.PropertyAccessExpression): string | null {
  let node: ts.Node = prop
  for (;;) {
    const parent = node.parent
    if (parent === undefined) return null
    if (ts.isFunctionLike(parent)) return null
    if (ts.isTryStatement(parent)) {
      // ⚠️ 读取发生在 **catch 块**里（`catch (e) { toast(e.message) }`），
      // 要检视的却是 **try 块**有没有网络调用——两者不能搞混。
      // 早先要求「读取落在 try 块内」，于是这条判据一处都没命中。
      const inCatch =
        parent.catchClause !== undefined &&
        parent.catchClause.block.getStart() <= prop.getStart() &&
        prop.getEnd() <= parent.catchClause.block.getEnd()
      if (inCatch) {
        // `e` 必须就是这个 catch 绑定的那个变量
        const bound = parent.catchClause?.variableDeclaration?.name
        if (bound !== undefined && bound.getText() === unwrap(prop.expression).getText()) {
          const text = parent.tryBlock.getText()
          for (const helper of ['apiJson', 'apiRaw']) {
            // ⚠️ 要容许**泛型实参**：本仓大量写 `apiJson<{ x: number }>(...)`，
            // 名字后面跟的是 `<` 而不是 `(`。只认 `(` 会把这类调用整片漏掉。
            if (new RegExp(`\\b${helper}\\s*[<(]`).test(text)) return helper
          }
          if (/\.mutateAsync\s*\(/.test(text)) return '.mutateAsync'
          if (/\.mutate\s*\(/.test(text)) return '.mutate'
        }
      }
      return null
    }
    node = parent
  }
}

/** 剥掉注释（行注释与块注释），只留代码 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

/**
 * 若本节点位于某个 `if (x instanceof T)` 的 then 分支内，返回 T。
 *
 * 条件可以是复合式（`status === 'error' && error instanceof ApiError`），
 * 只要其中出现 `x instanceof T` 且 x 就是本节点读 `.message` 的那个变量，即算收窄。
 */
function enclosingIfNarrowing(prop: ts.PropertyAccessExpression): string | null {
  const receiverName = unwrap(prop.expression).getText()
  let node: ts.Node = prop
  for (;;) {
    const parent = node.parent
    if (parent === undefined) return null
    if (ts.isIfStatement(parent)) {
      // 只有落在 then 分支里才算收窄
      if (
        parent.thenStatement.getStart() <= prop.getStart() &&
        prop.getEnd() <= parent.thenStatement.getEnd()
      ) {
        const found = findInstanceOf(parent.expression, receiverName)
        if (found !== null) return found
      }
    }
    // 不跨函数边界：函数体内的 if 不收窄调用方
    if (ts.isFunctionLike(parent)) return null
    node = parent
  }
}

/** 在条件表达式里找 `x instanceof T`，返回 T */
function findInstanceOf(cond: ts.Expression, name: string): string | null {
  if (
    ts.isBinaryExpression(cond) &&
    cond.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
    cond.left.getText() === name
  ) {
    return cond.right.getText()
  }
  if (ts.isBinaryExpression(cond)) {
    return findInstanceOf(cond.left, name) ?? findInstanceOf(cond.right, name)
  }
  if (ts.isParenthesizedExpression(cond)) return findInstanceOf(cond.expression, name)
  return null
}

/**
 * 取接收者的**类型标注**——即「代码自己声明了这个值是什么类」。
 *
 * 三种本仓真实写法都要认得，否则会把有据可查的来源当成「来源不明」：
 *  1. 形参标注：`onError: (e: ApiError) => ...`
 *  2. 变量标注：`const err: ApiError = ...`
 *  3. `as` 断言：`const err = e as ApiError`（catch 里的惯用写法）
 *
 * 只认「本仓错误类」这一种用途，因为它同时是「声明即契约」的证据：
 * 断言成本仓错误类 ⇒ 值的 message 由本仓构造 ⇒ 必为中文。
 *
 * ⚠️ 早先的实现只认形参、且从 `e.message` 往上找形参——方向是错的
 * （形参是标识符的**父节点**，不是属性访问的祖先）。本版按「先拿标识符、
 * 再找它的声明节点」重写。
 */
function declaredTypeOf(receiver: ts.Expression): string | null {
  if (!ts.isIdentifier(receiver)) return null
  const name = receiver.text

  // 1. 形参：标识符**就是**参数的 name ⇒ 直接读它自己的类型标注
  const parent = receiver.parent
  if (ts.isParameter(parent) && parent.name === receiver) {
    return parent.type?.getText() ?? null
  }

  // 2/3. 变量：按**作用域**找同名的 `const err = ...`，读标注或 initializer 的 as 断言。
  //
  // ⚠️ 不能从使用点往上「顺着父节点走」再找——那会把 `\`...\${err.message}\`` 这类
  // 表达式（父节点是模板串片段，不是变量声明）整条断掉，于是有据可查的来源被当成
  // 「来源不明」。按作用域搜声明才是同构的：不管用在哪，都回到它的定义处。
  let scope: ts.Node | undefined = receiver
  while (scope !== undefined) {
    const p: ts.Node | undefined = scope.parent
    if (p === undefined) return null
    if (ts.isFunctionLike(p)) {
      const param = p.parameters.find((pm) => ts.isIdentifier(pm.name) && pm.name.text === name)
      if (param !== undefined) return param.type?.getText() ?? null
    }
    if (ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p)) {
      const found = varDeclTypeIn(p.statements, name)
      if (found !== null) return found.type
    }
    scope = p
  }
  return null
}

/** 在本层语句里找同名变量声明，返回它的类型（标注优先，其次 initializer 的 as 断言） */
function varDeclTypeIn(
  statements: ts.NodeArray<ts.Statement>,
  name: string,
): { type: string | null } | null {
  for (const stmt of statements) {
    if (!ts.isVariableStatement(stmt)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || decl.name.text !== name) continue
      if (decl.type !== undefined) return { type: decl.type.getText() }
      const init = decl.initializer
      if (init !== undefined && ts.isAsExpression(init)) return { type: init.type.getText() }
      return { type: null }
    }
  }
  return null
}

/**
 * 找出「直接渲染 `.message`」的地方。
 *
 * **判的是「读 `.message` 且直接渲染进 JSX」**，具体形态：
 *  - JSX 表达式容器里的 `.message`（`{query.error.message}`）
 *  - 模板串插值里的 `.message`（`` {`${e.message}`} ``）
 *
 * 排除：对象属性赋值（`{ message: e.message }` 只是搬运）、
 * 非 JSX 通道（`toast(...)` 由判据一管）、已被 `String()` 覆盖的形态。
 */
function inspectMessageRead(
  file: string,
  source: string,
  prop: ts.PropertyAccessExpression,
): Leak | null {
  // 只看「错误语义」的接收者：名字像错误，或形如 `x.error`。
  //
  // ⚠️ **先剥掉 `as` 断言与括号**：本仓大量写作
  // `(list.error as Error).message`——不断言拆开，就会把「来自 react-query 槽位」
  // 看成「来源不明的未知表达式」，白白漏掉受信判定。
  const receiver = unwrap(prop.expression)
  const receiverIsErrorish =
    (ts.isIdentifier(receiver) && ERROR_NAMES.has(receiver.text)) ||
    (ts.isPropertyAccessExpression(receiver) && receiver.name.text === 'error')
  if (!receiverIsErrorish) return null

  // 已交给本仓的归一化函数 ⇒ 出口保证中文（如 `splitArgs(e.message)`）。
  // 这是**有据可查的裁剪**：函数本体在 apps/cli/src/output.ts，测试覆盖其行为。
  if (isNormalizerPass(prop)) return null

  // 是否直接渲染进 JSX
  if (!isUserVisibleSink(prop)) return null

  const { trusted, why } = isTrustedMessageRead(receiver, prop)
  if (trusted) return null

  const lines = source.split('\n')
  const line = source.slice(0, prop.getStart()).split('\n').length
  const snippet = source.slice(prop.getStart(), prop.getEnd()).replace(/\s+/g, ' ').slice(0, 70)

  // 豁免标记：本行或上一行带 `error-text-exempt: <理由>` ⇒ 记入豁免清单，不算漏出。
  //
  // **为什么要有豁免而不是放宽判据**：仓里有一类**有意保留英文原文**的通道。
  // 最硬的证据是 `apps/cli/test/native-failure.test.ts` 断言 `NODE_MODULE_VERSION`
  // 必须原样出现在输出里（v0.2.3 FR-3 的诊断三要素）——把英文抹掉**会破坏已测契约**。
  // 放宽判据 = 把所有同类通道一起放行且不留痕；豁免标记 = 逐处留下理由与位置，
  // 新增一处就得再写一个标记，增长是可见的。
  const exemptReason = exemptReasonAt(lines, line)
  if (exemptReason !== null) {
    exemptions.push({ file: relative(process.cwd(), file), line, reason: exemptReason })
    return null
  }

  return {
    file: relative(process.cwd(), file),
    line,
    snippet,
    why: `直接渲染 .message 且${why}——未经 api/client 归一化边界的 Error.message 可能是英文机器串`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 判据三：中文 message 模板里内嵌 `.message` 读取（英文诊断混进人话）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 判断一个 `new XxxError(...)` 的 **message 实参**是否内嵌了 `.message` 读取。
 *
 * ## 为什么要有这一条
 *
 * 判据一与判据二盯的是「错误**流到界面**的那一刻」。但还有一条更早的漏出路径：
 * **本仓错误类在构造时就把英文诊断拼进了中文 message**。
 *
 * 典型形态（`apps/server/src/lib/skill-remote.ts:127` 的真实写法）：
 * ```ts
 * throw new AppError('REMOTE_UNREACHABLE', `拉取目录树失败: ${tree.message ?? '未知错误'}`)
 * ```
 * `tree.message` 是第三方库的英文原文 ⇒ 错误体的 `message` 字段里就是
 * 「中文 + 英文机器串」的混合物 ⇒ 经 `api/client.ts` 原样透出 ⇒ 界面漏英文。
 *
 * ## 为什么这类必须改
 *
 * 本仓的纪律是「错误说明的唯一权威来源是 `{code, message}`，message 必为中文；
 * 英文诊断原文走独立的 `detail` 字段」。把 `.message` 拼进中文 message，
 * 等于**在源头就把两个通道合成一个** ⇒ 下游再怎么归一化都救不回来。
 *
 * ## 判据
 *
 * 只看**错误类构造调用的 message 位**（第二个实参，或第一个实参——取决于
 * 构造器签名，见 `MESSAGE_ARG_INDEX`），且该实参是**含插值的模板串**，
 * 插值里有 `.message` 读取。
 *
 * ⚠️ 刻意**不判**：
 *  - `.message` 出现在 `detail` 位（构造器最后一个实参）——那正是纪律要求的去处；
 *  - `.message` 出现在 `details` 位（结构化数据）——那是机器读的数据；
 *  - 模板里没有插值（纯字面量）——中文文案没有英文可混。
 */
function inspectErrorMessageTemplate(
  file: string,
  source: string,
  call: ts.NewExpression,
): Leak | null {
  // 只看 `new XxxError(...)`；`new Error(...)` 的 message 是 Node 的机器串，
  // 由判据一/二在它流到界面时管。
  if (!ts.isIdentifier(call.expression) || !/Error$/.test(call.expression.text)) return null

  const args = call.arguments ?? []
  const className = call.expression.text
  const msgIndex = MESSAGE_ARG_INDEX.get(className)
  // 类不在名单里 ⇒ 不知道 message 在第几位 ⇒ 不判（宁漏不误报）
  if (msgIndex === undefined) return null
  const msgArg = args[msgIndex]
  if (msgArg === undefined) return null
  if (!ts.isTemplateExpression(msgArg)) return null

  // 模板的插值里有没有 `.message` 读取
  //
  // ⚠️ **用数组收集而不是闭包里的 `let` 赋值**：TypeScript 的控制流分析
  // 不认闭包内的赋值，会把 `hit` 在闭包返回后收窄成 `never`
  // （`hit.expression` 报 TS2339）。
  const hits: ts.PropertyAccessExpression[] = []
  const scan = (node: ts.Node): void => {
    if (hits.length > 0) return
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
      hits.push(node)
      return
    }
    ts.forEachChild(node, scan)
  }
  for (const span of msgArg.templateSpans) scan(span.expression)
  const hit = hits[0]
  if (hit === undefined) return null

  // ⚠️ **接收者是本仓错误类 ⇒ 它的 message 必为中文** ⇒ 拼进中文 message 没问题。
  //
  // 这条不是推测：`packages/shared/src/schemas/pack.ts` 里的 zod 自定义校验文案
  // 就是中文（「非法相对路径（design §7.7：…）」），拼进 message 是**要保留**的
  // （apps/cli/test/sync.test.ts 的 CLI-SEC-01 断言它必须出现在 message 里）。
  //
  // 反过来，未知来源的 `.message`（第三方库、Node 原生）可能是英文机器串 ⇒ 判漏出。
  // ⚠️ zod 的 `issue.message` 属于「未知来源」：本仓自定义的可能是中文，
  // zod 内置默认是英文（`Expected string, received number`）——静态判不出，
  // 所以它**要写豁免并说明理由**，而不是默认放行。
  const receiver = unwrap(hit.expression)
  if (ts.isIdentifier(receiver) && OWN_ERROR_CLASSES.has(receiver.text)) return null

  const lines = source.split('\n')
  // ⚠️ **判定行取 message 实参那一行**（不是 `new XxxError(` 那一行）：
  // 构造调用常被 prettier 拆成多行，豁免标记通常贴在实参末尾。
  // 取 `new` 那一行会让标记落到窗口外，豁免静默失效。
  const line = source.slice(0, msgArg.getStart()).split('\n').length
  const snippet = source.slice(call.getStart(), call.getEnd()).replace(/\s+/g, ' ').slice(0, 70)

  const exemptReason = exemptReasonAt(lines, line)
  if (exemptReason !== null) {
    exemptions.push({ file: relative(process.cwd(), file), line, reason: exemptReason })
    return null
  }

  return {
    file: relative(process.cwd(), file),
    line,
    snippet,
    why: `错误类的 message 里内嵌了 .message 读取——英文诊断原文会混进中文 message（应改走独立的 detail 字段）`,
  }
}

/**
 * message 实参在构造器里的位置。
 *
 * ⚠️ 各错误类的构造器签名**不统一**：
 *  - `AskError(code, message, details?, detail?)` → 第 1 位（0 基）
 *  - `SourceError(code, message, details?, detail?)` → 第 1 位
 *  - `AppError(code, message, details?)` → 第 1 位
 *  - `ConfigError(message, detail?)` → 第 0 位
 *  - `BootError(code, message, detail?)` → 第 1 位
 *
 * 两类签名混着，按固定下标取会取错位（把 `code` 当 message）。**现算**每个
 * 类的构造器签名来定位 message 位——签名变了就跟着变，不会漏判。
 */
const MESSAGE_ARG_INDEX = (() => {
  const indexByClass = new Map<string, number>()
  // ⚠️ **除了 ROOTS，还要扫 `packages/shared`**：`AppError` 定义在那里
  // （packages/shared/src/errors.ts），但它在 apps/server/src 里被大量构造。
  // 只扫 ROOTS 会让 server 侧的 `new AppError(code, \`...${e.message}\`)` 逃过判据。
  const classRoots = [...ROOTS, 'packages/shared/src']
  for (const root of classRoots) {
    let rootFiles: string[]
    try {
      rootFiles = sources(join(process.cwd(), root))
    } catch {
      continue
    }
    for (const f of rootFiles) {
      const source = readFileSync(f, 'utf8')
      const sf = ts.createSourceFile(f, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node): void => {
        if (
          ts.isClassDeclaration(node) &&
          node.name !== undefined &&
          node.heritageClauses?.some((h) => h.types.some((t) => t.expression.getText() === 'Error'))
        ) {
          const ctor = node.members.find(
            (m): m is ts.ConstructorDeclaration =>
              ts.isConstructorDeclaration(m) && m.parameters.length > 0,
          )
          if (ctor !== undefined) {
            // 构造器的第一个参数是 code、第二个是 message；只有一个参数时它就是 message
            const firstParam = ctor.parameters[0]?.name.getText() ?? ''
            const isCodeFirst = /^(code|errCode|status)$/.test(firstParam)
            indexByClass.set(node.name.text, isCodeFirst ? 1 : 0)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(sf)
    }
  }
  return indexByClass
})()

/** 读豁免标记；返回其理由（无标记返回 null）。
 *
 * ⚠️ **窗口取 ±2 行**，因为 prettier 会把超长的调用拆行：
 * `printer.fail(code, err.message ?? String(e) ...)` 常被拆成
 * 「实参行 + 右括号行」，标记于是落在被判定行的**下面**一行。
 * 只查本行/上一行会让豁免静默失效——那种失效的表现是「闸红了但标记明明在」。
 * 代价是相邻语句的标记可能串到本语句上；这一层由豁免总数的棘轮断言兜住。
 */
function exemptReasonAt(lines: string[], lineNo: number): string | null {
  for (let i = lineNo - 2; i <= lineNo + 2; i += 1) {
    const text = lines[i]
    if (text === undefined) continue
    const reason = reasonOf(text)
    if (reason !== null) return reason
  }
  return null
}

function reasonOf(text: string): string | null {
  const m = /error-text-exempt:\s*(.+?)\s*(?:\*\/|$)/.exec(text)
  if (m === null) return null
  const reason = m[1] ?? ''
  return reason.trim() === '' ? null : reason.trim()
}

/** 剥掉 `as` 断言、非空断言与括号，拿到真正承载值的表达式 */
function unwrap(expr: ts.Expression): ts.Expression {
  let cur = expr
  for (;;) {
    if (ts.isParenthesizedExpression(cur)) {
      cur = cur.expression
      continue
    }
    if (ts.isAsExpression(cur)) {
      cur = cur.expression
      continue
    }
    if (ts.isNonNullExpression(cur)) {
      cur = cur.expression
      continue
    }
    return cur
  }
}

/**
 * 这份 `.message` 是否交给了本仓的归一化函数。
 *
 * 归一化函数自己保证「出口必是中文」（不含中文的原文降级为 detail），
 * 因此它在判据里等价于一道边界，不算漏出。
 *
 * ⚠️ 名单必须**短且有据**：每加一个名字，就等于给一处旁路开绿灯。
 * 当前只有 `output.ts` 的 `splitMessage` / `splitArgs` 两个。
 */
const NORMALIZERS = new Set(['splitMessage', 'splitArgs'])

function isNormalizerPass(prop: ts.PropertyAccessExpression): boolean {
  let node: ts.Node = prop
  for (;;) {
    const parent = node.parent
    if (parent === undefined) return false
    if (ts.isCallExpression(parent) && ts.isIdentifier(parent.expression)) {
      return (
        NORMALIZERS.has(parent.expression.text) && parent.arguments.includes(node as ts.Expression)
      )
    }
    // 只在「把值往下传」的结构里上溯
    if (
      ts.isBinaryExpression(parent) ||
      ts.isTemplateSpan(parent) ||
      ts.isTemplateExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent)
    ) {
      node = parent
      continue
    }
    return false
  }
}

/**
 * 这个 `.message` 读取是否**直接进入用户可见文案**。
 *
 * 判据是「读到的字符串**就是**给人看的那句话」，通道分两类：
 *  - **JSX 渲染**：`{e.message}`、`` {`前缀 ${e.message}`} ``
 *  - **打印通道**：`toast(e.message, 'error')`、`console.error(...)`、
 *    `printer.fail(...)`、`write`/`writeErr` —— 浮层与终端同样是人读的
 *
 * 排除在外的是「到达界面前还有一层处理」的写法：搬运（`{ message: e.message }`）、
 * 判断（`e.message.includes('X')`）、`??` 兜底（`err.message ?? String(e)`）。
 * 把它们算作漏出只会制造豁免——豁免多了，闸就等于不存在。
 *
 * 判定方式：从属性访问往上走，穿透模板串/二元/括号/断言，直到碰到 JSX 表达式容器
 * 或某个打印函数的实参位；碰到别的节点（语句、对象字面量、其他调用）即停。
 */
function isUserVisibleSink(prop: ts.PropertyAccessExpression): boolean {
  let node: ts.Node = prop
  for (;;) {
    const parent = node.parent
    if (parent === undefined) return false

    // 到达 JSX 表达式容器 ⇒ 是直接渲染
    if (ts.isJsxExpression(parent)) return true

    // 到达打印调用、且本节点是实参 ⇒ 是直接打印
    if (ts.isCallExpression(parent) && isPrintCall(parent)) {
      return parent.arguments.includes(node as ts.Expression)
    }

    // 穿透这些结构继续往上找：模板串、二元、括号、断言
    if (
      ts.isTemplateSpan(parent) ||
      ts.isTemplateExpression(parent) ||
      ts.isBinaryExpression(parent) ||
      ts.isParenthesizedExpression(parent) ||
      ts.isAsExpression(parent) ||
      ts.isNonNullExpression(parent) ||
      ts.isConditionalExpression(parent)
    ) {
      node = parent
      continue
    }

    // 碰到别的节点（语句、对象字面量、其他调用…）⇒ 不在这条通道上
    return false
  }
}

/**
 * 是不是「把字符串印给人看」的调用。
 *
 * 名单按通道列，不按品牌：本项目只有三个出口——
 * 界面浮层（`toast`）、终端（`console.*` / `printer.fail` / `write` / `writeErr`）。
 * 只加本仓真实存在的通道，不预置将来可能出现的名字（预置等于给自己开旁路）。
 */
function isPrintCall(call: ts.CallExpression): boolean {
  const callee = call.expression
  if (ts.isIdentifier(callee)) {
    return ['toast', 'write', 'writeErr'].includes(callee.text)
  }
  // `console.error(...)` / `printer.fail(...)` / `printer.warn(...)`
  if (ts.isPropertyAccessExpression(callee)) {
    const owner = callee.expression.getText()
    const fn = callee.name.text
    if (owner === 'console') return ['log', 'error', 'warn', 'info'].includes(fn)
    if (owner === 'printer') return ['fail', 'warn', 'result'].includes(fn)
  }
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// 扫描
// ─────────────────────────────────────────────────────────────────────────────

/** 被豁免标记放行的位置（理由必填，见 `exemptReasonAt`） */
const exemptions: { file: string; line: number; reason: string }[] = []

/** 扫一个文件里的所有漏出 */
function scanFile(file: string): Leak[] {
  const source = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const leaks: Leak[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const leak = inspectCall(file, source, node)
      if (leak !== null) leaks.push(leak)
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
      const leak = inspectMessageRead(file, source, node)
      if (leak !== null) leaks.push(leak)
    }
    if (ts.isNewExpression(node)) {
      const leak = inspectErrorMessageTemplate(file, source, node)
      if (leak !== null) leaks.push(leak)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return leaks
}

const allLeaks = files.flatMap((f) => scanFile(f))

/** 把一段夹具源码喂进同一套判定逻辑（用于「闸有牙齿」的自检） */
function scanFixture(code: string, kind: ts.ScriptKind = ts.ScriptKind.TSX): string[] {
  const sf = ts.createSourceFile('fixture.tsx', code, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const leak = inspectCall('fixture.tsx', code, node)
      if (leak !== null) found.push(leak.snippet)
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'message') {
      const leak = inspectMessageRead('fixture.tsx', code, node)
      if (leak !== null) found.push(leak.snippet)
    }
    if (ts.isNewExpression(node)) {
      const leak = inspectErrorMessageTemplate('fixture.tsx', code, node)
      if (leak !== null) found.push(leak.snippet)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

describe('错误文案的中文化闸', () => {
  it('⚠️ 用户可见文案里不得裸转异常（String(e) 会被判成英文机器串）', () => {
    expect(allLeaks.map((l) => `${l.file}:${l.line} ${l.snippet} —— ${l.why}`)).toEqual([])
  })

  it('⚠️ 覆盖到 server（错误体是 server 造的，英文 message 会直达界面）', () => {
    expect(ROOTS).toContain('apps/server/src')
    const serverFiles = files.filter((f) => f.includes('/apps/server/src/'))
    expect(serverFiles.length).toBeGreaterThan(0)
  })

  it('⚠️ 扫描本身不是空转：裸转异常必须被抓到', () => {
    // 这条钉的是「闸有牙齿」：若将来扫描逻辑退化成空数组，本条即红。
    // 不去改真实源码（那是污染），改用同一套判定逻辑喂一段夹具。
    const found = scanFixture(`
      const a = \`前缀 \${String(e)}\`
      const b = <p>{String(err)}</p>
      const c = String(error)
    `)
    expect(found).toHaveLength(3)
  })

  it('⚠️ 已守卫的两形态不得被误判（三元 instanceof 与 ?? 兜底）', () => {
    const found = scanFixture(
      `
      const a = e instanceof Error ? e.message : String(e)
      const b = err.message ?? String(e)
    `,
      ts.ScriptKind.TS,
    )
    expect(found).toEqual([])
  })

  it('⚠️ 受信的 .message 读取不得被误判（ApiError 收窄 / Error 三元 / react-query 槽位）', () => {
    const found = scanFixture(`
      const a = <p>{e instanceof ApiError ? e.message : '兜底'}</p>
      const b = <p>{e instanceof Error ? e.message : '兜底'}</p>
      const c = <p>{query.error.message}</p>
      const d = <p>{list.error?.message}</p>
      const f = <p>{(list.error as Error).message}</p>
    `)
    expect(found).toEqual([])
  })

  it('⚠️ 未经边界归一化的 .message 直接渲染必须被抓到（判据二有牙齿）', () => {
    const found = scanFixture(`
      const a = <p>{e.message}</p>
      const b = <p>{\`\${e.message}\`}</p>
      const c = <p>{props.error.message}</p>
      const d = <pre>{(err as Error).message}</pre>
    `)
    expect(found).toHaveLength(4)
  })

  it('⚠️ 错误类的 message 里内嵌 .message 必须被抓到（判据三有牙齿）', () => {
    // 这是「源头就把两个通道合成一个」的形态：英文诊断原文会直接进中文 message，
    // 下游再怎么归一化都救不回来。
    const found = scanFixture(`
      throw new AppError('REMOTE_UNREACHABLE', \`拉取目录树失败: \${tree.message ?? '未知错误'}\`)
      throw new AskError('X', \`读取失败：\${e.message}\`)
    `)
    expect(found).toHaveLength(2)
  })

  it('⚠️ 判据三不得误判：.message 走 detail 位或 details 位是纪律要求的去处', () => {
    // `.message` 在 detail 位（构造器最后一个实参）⇒ 正是纪律要求的通道；
    // 在 details 位（结构化数据）⇒ 机器读的数据，不在判据范围。
    const found = scanFixture(`
      throw new SourceError('READ_FAILED', \`读取 \${abs} 失败\`, undefined, e.message)
      throw new SourceError('READ_FAILED', \`读取 \${abs} 失败\`, { raw: e.message })
      throw new AppError('X', \`读取失败\`, undefined, e.message)
    `)
    expect(found).toEqual([])
  })

  it('⚠️ 判据三不得误判：纯字面量 message（无插值）与非错误类构造', () => {
    const found = scanFixture(`
      throw new AppError('NOT_FOUND', '项目不存在')
      throw new AppError('NOT_FOUND', \`项目不存在：\${id}\`)
      const x = { message: e.message }
    `)
    expect(found).toEqual([])
  })

  it('⚠️ 非泄漏写法不归本判据管（搬运与判断在到达界面前还有一层处理）', () => {
    // 判据盯的是「读到的字符串**就是**屏幕上那句话」。搬运与判断不是：
    // 判成漏出只会让人去加豁免，而豁免多了闸就死了。
    const found = scanFixture(`
      const b = { message: e.message }
      const c = e.message.includes('NAME_CONFLICT')
    `)
    expect(found).toEqual([])
  })

  it('⚠️ 形态 7 的前提：web 网络出口唯一，且本地抛错只有白名单两处（都写中文）', () => {
    // 「catch 里的错误必是 ApiError」这条不是假设，是这里强制的前提：
    //  ① apps/web 里能发请求的只有 api/client.ts 一处 `fetch(`；
    //  ② 非 ApiError 的本地抛错只有白名单两处，且这两处的 message 本身就是中文。
    // 任意一条破了，形态 7 的受信就失去依据 ⇒ 先红这一条，再去收窄那条判据。
    const webFiles = files.filter((f) => f.includes('/apps/web/src/'))
    const rel = (f: string): string => relative(process.cwd(), f)

    // 只认**独立标识符** fetch（前面不是字母/数字/下划线）
    //
    // ⚠️ **必须剥掉注释**：注释里写「`fetch(` 唯一出现在 api/client.ts」这句话
    // 本身就会命中正则——把封装层的注释也判成网络出口。判「代码做了什么」
    // 就不能看注释。
    const fetchers = webFiles.filter((f) =>
      /(?<![A-Za-z0-9_$])fetch\s*\(/.test(stripComments(readFileSync(f, 'utf8'))),
    )
    expect(fetchers.map(rel)).toEqual(['apps/web/src/api/client.ts'])

    const throwers = webFiles.filter((f) => {
      const src = readFileSync(f, 'utf8')
      return /throw\s+new\s+(Error|RangeError)\s*\(/.test(src)
    })
    expect(throwers.map(rel).sort()).toEqual([
      'apps/web/src/growth/stage.ts',
      'apps/web/src/index.tsx',
    ])
  })

  it('⚠️ 所有 mutation 都用 useApiMutation 封装（TError 因而是 ApiError）', () => {
    // 这条是「onError 形参标成 ApiError」这条契约的**地基**：
    // 若有人直接调 `useMutation`，`onError` 的 `e` 又会退回 `Error` 类型，
    // 而判据会因「来源不可判定」把它判红——闸会指出来，但更好的做法是提前拦住。
    const webFiles = files.filter((f) => f.includes('/apps/web/src/'))
    const rel = (f: string): string => relative(process.cwd(), f)
    const direct = webFiles.filter((f) => {
      if (rel(f) === 'apps/web/src/hooks/useApiMutation.ts') return false // 封装层自身
      return /(?<![A-Za-z0-9_$])useMutation\s*\(/.test(readFileSync(f, 'utf8'))
    })
    expect(direct.map(rel)).toEqual([])
  })

  it('⚠️ 豁免必须写清理由，且总数受棘轮约束（新增豁免必须显式改这个数）', () => {
    // 棘轮（ratchet）的作用：判据靠豁免标记才能放行某些位置，若豁免可以随手加，
    // 闸就会被一处一处地豁免掉——**闸不会红，但它已经不设防了**。
    // 这里把总数钉成一个必须手动改的常量，改它的人会被迫看一眼理由。
    //
    // 当前为 **2**：判据三（中文 message 里内嵌 `.message`）新增后，两处 zod
    // `issue.message` 的写法需要豁免——zod 的 issue 文案语言不定（本仓自定义的是
    // 中文「非法相对路径（design §7.7：…）」，zod 内置默认是英文），静态判不出，
    // 而中文那部分**必须**留在 message 里（CLI-SEC-01 断言它必须出现）。
    // 两处都写了「英文走 detail 位」的处置，不是单纯放行。
    expect(exemptions).toHaveLength(2)
    const weak = exemptions.filter((x) => x.reason.length < 8)
    expect(weak).toEqual([])
  })

  it('⚠️ 英文机器串清单非空（闸自身要认得这些形态）', () => {
    expect(MACHINE_STRINGS.length).toBeGreaterThan(0)
  })
})
