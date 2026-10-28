// `tests/support/m9-state-shape.ts` —— M9 P2 的**类型层结构守卫**（DL-28 / DL-34）
//
// ## 它是什么
//
// 用 TypeScript 编译器 API 直接看 `m9-state.ts` 的**语法树**，断三件事：
//
// ① `MasteryInput` / `TopicEvidence` / `TopicNode` 三个接口的**成员集合**必须逐字等于
//    登记的那几个 —— **多一个字段就红**（资源字段、模式字段一旦混进入参即红）；
// ② `computeState` / `computeStates` 的**参数表**必须逐字是登记的那几个 ——
//    「加一个模式参数」这种改法也会红；
// ③ `EvidenceKind` 的**取值闭集**必须逐字是那四个 —— 「新增一种证据种类」也红。
//
// ## ⚠️ 为什么不用「运行时闭集」那一道就够了
//
// 运行时那道（`assertMasteryInput`）能挡住**调用时**多传字段，
// 但挡不住「**类型声明里**长出了字段」—— 声明长出来时它还没有被传进来，
// 而下一位同事会照着类型写调用。
//
// ⇒ 两道都要：**类型层**挡住「长出来」，**运行时**挡住「传进来」。
//
// ## ⚠️ 为什么用编译器 API 而不是正则
//
// 正则只能认「文本长得像」—— 改个写法（`readonly required?: boolean`）就绕过去了。
// 语法树认的是**声明本身** ⇒ 绕过不了。
import ts from 'typescript'

/** 一处结构违规。 */
export interface ShapeViolation {
  /** 规则名 */
  rule: string
  /** 说明 */
  detail: string
}

/** 接口成员的登记口径（**多一个少一个都红**）。 */
export const EXPECTED_INTERFACE_MEMBERS: Record<string, readonly string[]> = {
  MasteryInput: ['nodes', 'byTopic'],
  TopicEvidence: ['kind', 'ref', 'count'],
  TopicNode: ['id', 'prereqTopicIds'],
}

/** 函数参数表的登记口径。 */
export const EXPECTED_FUNCTION_PARAMS: Record<string, readonly string[]> = {
  computeState: ['topic', 'input'],
  computeStates: ['topics', 'input'],
}

/** `EvidenceKind` 的取值闭集。 */
export const EXPECTED_EVIDENCE_KINDS: readonly string[] = [
  'checklist',
  'skill',
  'task',
  'source_hit',
]

/**
 * 入参里**不许出现**的标识符（DL-28 资源层 / DL-34 模式层）—— **按子串判**。
 *
 * ⚠️ **大小写敏感** —— `MasteryInput` 里含「Master」但那是类型名，不是模式名。
 * ⚠️ **「master」不在这一张表里**（它按**整词**判，见下一张）：
 *   本模块有 `masteryLabel` 这个函数名，它含「master」子串 ⇒ 放在子串表里会误伤。
 */
export const FORBIDDEN_IDENTIFIERS: readonly string[] = [
  'resource',
  'tier',
  'profile',
  'required',
  'rank',
  'mode',
  'phase',
  'stage',
  'familiar',
  'vibe',
]

/**
 * **整词**判的禁用标识符 —— 只有「整个标识符就是它」才算违规。
 *
 * ⚠️ 「master」是三档模式之一（精通），但它是常见词根（mastery / masterKey …），
 *   按子串判会误伤 ⇒ 只能整词判。⚠️ 代价：写成 `masterProfile` 这种拼法**躲得过**
 *   这一道 —— 但它**躲不过**接口成员那道（多出来的成员会红）。
 */
export const FORBIDDEN_EXACT_IDENTIFIERS: readonly string[] = ['master']

/** 收集源码里出现的全部标识符（**不含注释与字符串字面量**）。 */
function collectIdentifiers(sourceFile: ts.SourceFile): string[] {
  const out: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) out.push(node.text)
    // ⚠️ **属性名不算标识符引用** —— 但它们仍然是「字段名」，
    //   所以照样收（`e.resourceId` 里的 `resourceId` 就是要挡的东西）
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return out
}

/** 取接口声明的成员名。 */
function interfaceMembers(sourceFile: ts.SourceFile, name: string): string[] | null {
  for (const stmt of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue
    if (stmt.name.text !== name) continue
    return stmt.members.map((m) => {
      if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name)) return m.name.text
      if (ts.isMethodSignature(m) && m.name && ts.isIdentifier(m.name)) return m.name.text
      return m.getText(sourceFile)
    })
  }
  return null
}

/** 取类型别名声明的字面量取值。 */
function typeAliasLiterals(
  sourceFile: ts.SourceFile,
  name: string,
): { found: boolean; literals: string[] | null } {
  for (const stmt of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(stmt)) continue
    if (stmt.name.text !== name) continue
    // ⚠️ **不是联合类型也算违规** —— 登记口径就是「四个字面量的联合」，
    //   塌成一个字面量（或塌成别的形状）同样是闭集被改坏。
    if (!ts.isUnionTypeNode(stmt.type)) return { found: true, literals: null }
    return {
      found: true,
      literals: stmt.type.types.map((t) => t.getText(sourceFile).replace(/^['"]|['"]$/g, '')),
    }
  }
  return { found: false, literals: null }
}

/** 取函数声明的参数名。 */
function functionParams(sourceFile: ts.SourceFile, name: string): string[] | null {
  for (const stmt of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt)) continue
    if (!stmt.name || stmt.name.text !== name) continue
    return stmt.parameters.map((p) => p.name.getText(sourceFile))
  }
  return null
}

/**
 * 断 `m9-state.ts` 的**类型形状**。
 *
 * @param source 该模块的源码文本
 * @returns 违规清单（空数组 = 通过）
 */
export function checkStateModuleShape(source: string): ShapeViolation[] {
  const out: ShapeViolation[] = []
  const sourceFile = ts.createSourceFile(
    'm9-state.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )

  for (const [name, expected] of Object.entries(EXPECTED_INTERFACE_MEMBERS)) {
    const actual = interfaceMembers(sourceFile, name)
    if (actual === null) {
      out.push({ rule: 'interface-missing', detail: `找不到接口 ${name}` })
      continue
    }
    const got = [...actual].sort()
    const want = [...expected].sort()
    if (got.length !== want.length || got.some((v, i) => v !== want[i])) {
      out.push({
        rule: 'interface-members',
        detail: `接口 ${name} 的成员是 [${got.join(', ')}]，登记口径是 [${want.join(', ')}]`,
      })
    }
  }

  for (const [name, expected] of Object.entries(EXPECTED_FUNCTION_PARAMS)) {
    const actual = functionParams(sourceFile, name)
    if (actual === null) {
      out.push({ rule: 'function-missing', detail: `找不到函数 ${name}` })
      continue
    }
    if (actual.length !== expected.length || actual.some((v, i) => v !== expected[i])) {
      out.push({
        rule: 'function-params',
        detail: `函数 ${name} 的参数表是 (${actual.join(', ')})，登记口径是 (${expected.join(', ')})`,
      })
    }
  }

  const kinds = typeAliasLiterals(sourceFile, 'EvidenceKind')
  if (!kinds.found) {
    out.push({ rule: 'evidence-kind-missing', detail: '找不到 EvidenceKind 的联合类型' })
  } else if (kinds.literals === null) {
    out.push({
      rule: 'evidence-kinds',
      detail: `EvidenceKind 不是字面量联合（登记口径是 [${EXPECTED_EVIDENCE_KINDS.join(', ')}]）`,
    })
  } else {
    const got = [...kinds.literals].sort()
    const want = [...EXPECTED_EVIDENCE_KINDS].sort()
    if (got.length !== want.length || got.some((v, i) => v !== want[i])) {
      out.push({
        rule: 'evidence-kinds',
        detail: `EvidenceKind 的取值是 [${got.join(', ')}]，登记口径是 [${want.join(', ')}]`,
      })
    }
  }

  // ⚠️ **标识符层**：入参形状之外，**任何地方**都不许出现资源层 / 模式层的标识符。
  //   这一道比接口成员那道更宽：它连「函数体里读了一个模式字段」都挡。
  const seen = new Set<string>()
  for (const id of collectIdentifiers(sourceFile)) {
    for (const forbidden of FORBIDDEN_IDENTIFIERS) {
      if (id.includes(forbidden)) seen.add(id)
    }
    if (FORBIDDEN_EXACT_IDENTIFIERS.includes(id)) seen.add(id)
  }
  if (seen.size > 0) {
    out.push({
      rule: 'forbidden-identifier',
      detail: `出现了资源层/模式层的标识符：${[...seen].sort().join(', ')}`,
    })
  }

  return out
}
