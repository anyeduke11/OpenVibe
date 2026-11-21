/**
 * context:check —— 上下文治理闸（`docs/specs/context-governance.md` §7）。
 *
 * 只管「上下文约定的单一出处与分层边界」，不重复 `docs:check` 已有的文档判据。
 * 六条判据：C-1 标记单一出处、C-2 清单单一出处、C-3 分层纪律、C-4 兼容矩阵一致、
 * C-5 规格上下游闭合（只报数，历史单向登记不因它判红）、
 * C-6 CM ↔ FR 追溯闭合（需求清单 ↔ 双向追溯表 ↔ 规格实存三者一致）。
 *
 * 纯静态扫描 ＋ 一次常量 import：不读网络。写盘仅一处：`test-results/context-check.json`
 * 的结论落盘（证据不是闸，写失败不改退出码）。扫描面限定在 `packages/*\/src`、`apps/*\/src`。
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADAPTER_MAIN_PATH, COMPAT_MATRIX } from '@openvibe/adapters'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN_DIRS = [
  'packages/shared/src',
  'packages/core/src',
  'packages/adapters/src',
  'apps/server/src',
  'apps/cli/src',
  'apps/web/src',
]

/** 契约层：标记与文件名的唯一合法定义处 */
const CONTRACT_FILE = 'packages/shared/src/pack-contract.ts'

/** 判据 C-3 的三条禁止依赖：包 → 不允许 import 的包 */
const FORBIDDEN_IMPORTS: { dir: string; forbidden: string[] }[] = [
  { dir: 'packages/core/src', forbidden: ['@openvibe/adapters'] },
  { dir: 'packages/shared/src', forbidden: ['@openvibe/core', '@openvibe/adapters'] },
  { dir: 'packages/adapters/src', forbidden: ['@openvibe/core'] },
]

interface Issue {
  rule: string
  where: string
  message: string
}

function listFiles(dir: string): string[] {
  const abs = join(ROOT, dir)
  const out: string[] = []
  let entries: string[]
  try {
    entries = readdirSync(abs)
  } catch {
    return out
  }
  for (const name of entries) {
    // 统一用 POSIX 分隔符：判据按 `packages/core/src` 这类前缀比对，
    // Windows 下 `join` 会给出反斜杠 ⇒ C-3 会假绿。
    const rel = `${dir}/${name}`
    const full = join(ROOT, rel)
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(rel))
      continue
    }
    if (!/\.(ts|tsx)$/.test(name)) continue
    // 测试自带夹具，允许出现裸字面量
    if (/\.test\.(ts|tsx)$/.test(name)) continue
    out.push(rel)
  }
  return out
}

/** 只保留「不是注释行」的代码行：JSDoc 里举例说明标记形状是正当的。 */
function codeLines(text: string): { line: number; body: string }[] {
  return text
    .split('\n')
    .map((body, i) => ({ line: i + 1, body }))
    .filter(({ body }) => {
      const t = body.trim()
      return !(t.startsWith('*') || t.startsWith('//') || t.startsWith('/*'))
    })
}

function scanFiles(): Map<string, string> {
  const files = new Map<string, string>()
  for (const dir of SCAN_DIRS) {
    for (const rel of listFiles(dir)) files.set(rel, readFileSync(join(ROOT, rel), 'utf8'))
  }
  return files
}

const AUX_NAMES = ['TERMS.md', 'CHECKLIST.md', 'SKILLS.md', 'PLAYBOOKS.md']

function checkSingleSource(files: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  const markerRe = /(['"`])<!-- openvibe:(?:end|pack=)/

  for (const [path, text] of files) {
    if (path === CONTRACT_FILE) continue
    for (const { line, body } of codeLines(text)) {
      if (markerRe.test(body)) {
        issues.push({
          rule: 'C-1',
          where: `${path}:${line}`,
          message: '注入标记字面量必须引用 shared 的 PACK_MARKER_*，不得本地重写',
        })
      }
      // C-2：辅助产物文件名在契约层之外出现裸字面量，等于第二份清单
      for (const name of AUX_NAMES) {
        if (body.includes(`'${name}'`) || body.includes(`"${name}"`)) {
          issues.push({
            rule: 'C-2',
            where: `${path}:${line}`,
            message: `${name} 必须由 PACK_FILE_* 常量引用，不得写裸字面量`,
          })
        }
      }
    }
  }
  return issues
}

function checkLayering(files: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  for (const { dir, forbidden } of FORBIDDEN_IMPORTS) {
    for (const [path, text] of files) {
      if (!path.startsWith(`${dir}/`)) continue
      for (const { line, body } of codeLines(text)) {
        for (const pkg of forbidden) {
          if (new RegExp(`from\\s+['"]${pkg}['"]`).test(body)) {
            issues.push({ rule: 'C-3', where: `${path}:${line}`, message: `禁止 import ${pkg}` })
          }
        }
      }
    }
  }
  return issues
}

function checkCompatMatrix(): Issue[] {
  const allowed = new Set(Object.values(ADAPTER_MAIN_PATH))
  return COMPAT_MATRIX.filter((row) => !allowed.has(row.reads)).map((row) => ({
    rule: 'C-4',
    where: 'packages/adapters/src/compat.ts',
    message: `兼容矩阵 ${row.platform} 的 reads=${row.reads} 不是任何 adapter 的产物路径`,
  }))
}

/* ------------------------------------------------------------------ *
 * C-6 · CM ↔ FR 追溯闭合
 *
 * 「需求编号（CM-*）↔ 规格条目（FR-*）」是双向的：需求清单（§4）列需求，
 * 双向追溯表（§10）列需求 ↔ 规格的对应。这条判据断的是**两张表与规格实存
 * 三者是否一致**：
 *
 *   ① 需求清单里的每个 CM 编号在追溯表里恰好出现一次（缺＝需求没落地登记，
 *      多＝追溯表指向了不存在的需求）；
 *   ② 追溯表里引用的 FR 在它指向的规格文件里真实存在（按 FR 家族号匹配：
 *      引用 FR-5.1 只要目标文件有 FR-5 就算命中——子编号在本仓常是节内有序
 *      列表条目而非独立标识，判它必假红，与 docs 闸 FR-11.2.1 同一条纪律）；
 *   ③ 追溯表里引用的治理判据（C-*）在目标文件里真实登记；
 *   ④ 追溯表里引用的验收编号（UT-/IT-/SRV-/BND-…）在规格里真实存在；
 *   ⑤ 反向：规格标题里声明了「（CM-*）」的条目，其 CM 必须在需求清单里，
 *      且追溯表里那一行必须指回这个 FR 与这个文件。
 *
 * ⚠️ 追溯源文档只有一处（`TRACE_DOC`）；文档闸 FR-3.4 已管「链接目标存在」，
 *   本判据不重复，只断「被引用的标识在目标文件里是否真实存在」。
 * ------------------------------------------------------------------ */

/** 追溯源文档：CM 需求清单（§4）与双向追溯表（§10）的唯一出处 */
const TRACE_DOC = 'docs/context-management-requirements-20261103.md'
/** 文档目录（追溯源文档所在处；表内相对链接以它为基准解析） */
const DOCS_DIR = 'docs'
/** 规格目录 */
const SPECS_DIR = 'docs/specs'
/**
 * 追溯源文档里的两处**锚点**（HTML 注释）。
 *
 * ⚠️ **为什么用锚点而不是节标题**：节标题是给人看的，措辞随时会改
 * （「需求清单」改成「需求条目」是常事）⇒ 定位一旦押在标题文字上，
 * 改一次标题就要同步改一次脚本正则，而漏改的后果是「该节被当成空表 ⇒ 报红」
 * ——报错信息还会指向错误的行，比不报错更费时间。锚点是**给机器的**，不随措辞变。
 */
const ANCHOR_REQS = '<!-- c6:reqs -->'
const ANCHOR_TRACE = '<!-- c6:trace -->'
/** 两个锚点的全集（用于「别处也放了锚点」的唯一性判定） */
const TRACE_ANCHORS = [ANCHOR_REQS, ANCHOR_TRACE]

/** 结论落盘路径（`test-results/` 已在 .gitignore，无 git 噪音；与 preflight／orphans 同目录） */
const REPORT_FILE = 'test-results/context-check.json'

const CM_ROW_RE = /^\|\s*(CM-[A-Z]\d+)\s*\|/

export interface TraceRow {
  cm: string
  /** 单元格：0=CM 编号，1=归属，2=验收编号，3=状态 */
  cells: string[]
  /** 该行在追溯源文档里的**绝对行号**（报错时的「受影响的行」要用它） */
  line: number
}

/** 追溯源文档的全部引用对象 */
export interface TraceSources {
  /** 追溯源文档全文 */
  traceDoc: string
  /** 仓库相对路径 → 全文（docs/ 与 docs/specs/ 下全部 .md） */
  targets: Map<string, string>
  /** 规格文件路径集合（docs/specs/ 下） */
  specPaths: string[]
}

/**
 * 拆表格行。
 *
 * 只按**未被转义**的竖线切：Markdown 表格里单元格内的竖线写成 `\|`，
 * 那不是分隔符。切完再把 `\|` 还原成 `|`。
 */
function splitRow(line: string): string[] {
  return line
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
    .slice(1, -1)
}

/**
 * 取某个锚点之后的 CM 行（到下一个二级节为止）。
 *
 * 锚点是**给机器的定位标记**，节标题是**给人看的措辞** ⇒ 定位押在锚点上，
 * 改节标题不必改脚本（改锚点才需要，那是刻意的行为变更）。
 *
 * @returns 锚点后的 CM 行；锚点不存在时返回 `null`（区别于「锚点在但表是空的」）
 */
export function traceRowsFromAnchor(text: string, anchor: string): TraceRow[] | null {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.trim() === anchor)
  if (start < 0) return null
  const rows: TraceRow[] = []
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (/^##\s/.test(line)) break
    const m = CM_ROW_RE.exec(line)
    if (!m) continue
    rows.push({ cm: m[1] ?? '', cells: splitRow(line), line: i + 1 })
  }
  return rows
}

/** 表内相对链接 → 仓库相对路径（相对 docs/ 目录解析） */
function resolveDocTarget(target: string): string {
  const t = target.trim()
  if (t === '' || /^[a-z]+:\/\//i.test(t)) return ''
  const out: string[] = []
  for (const part of `${DOCS_DIR}/${t.replace(/^\.\//, '')}`.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  return out.join('/')
}

interface AttribRefs {
  /** FR 引用（连同它归属的文件；`name` 为条款指针的名锚 `FR-N.M:关键词`） */
  frs: { file: string | null; id: string; name?: string }[]
  /** 治理判据引用 */
  crits: { file: string | null; id: string }[]
}

/**
 * 从「归属」单元格里按出现顺序抽出链接与标识；标识归属到它前面的那个链接。
 *
 * 条款名锚 `FR-N.M:关键词` 随标识一起抽取：关键词到 `、`／`（` 即止
 * （单元格里指针后面天然接散文，分隔符选错会把散文吞进关键词）；
 * **允许空格**——名锚要能等值命中带空格的粗体短语（如「不改变任何既有 adapter 的默认行为」）。
 * 存入前 `trim`（表格单元格的填充空格不算名字的一部分）。
 */
function parseAttribution(cell: string): AttribRefs {
  const re = /\]\(([^)]+)\)|\b(FR-\d+(?:\.\d+)?)(?::([^、（]+))?|\b(C-\d+)\b/g
  let file: string | null = null
  const frs: { file: string | null; id: string; name?: string }[] = []
  const crits: { file: string | null; id: string }[] = []
  for (const m of cell.matchAll(re)) {
    if (m[1] !== undefined) {
      file = resolveDocTarget(m[1])
      continue
    }
    if (m[2] !== undefined) {
      const name = m[3]?.trim()
      frs.push({ file, id: m[2], ...(name ? { name } : {}) })
      continue
    }
    if (m[4] !== undefined) crits.push({ file, id: m[4] })
  }
  return { frs, crits }
}

/** 目标文件里真实存在的 FR 标识（含家族号：FR-11.2 同时让 FR-11 命中） */
function frIdsOf(text: string): Set<string> {
  const ids = new Set<string>()
  for (const m of text.matchAll(/^#{2,4}\s+(FR-\d+(?:\.\d+)?)/gm)) {
    const id = m[1] ?? ''
    ids.add(id)
    ids.add(id.split('.')[0] ?? id)
  }
  return ids
}

/** 目标文件里真实登记的治理判据编号 */
function critIdsOf(text: string): Set<string> {
  const ids = new Set<string>()
  for (const m of text.matchAll(/^\s*[-*]\s+(C-\d+)\b/gm)) ids.add(m[1] ?? '')
  return ids
}

/** 规格里真实存在的验收编号（表格行首列） */
function acceptanceIdsOf(text: string): Set<string> {
  const ids = new Set<string>()
  for (const m of text.matchAll(/^\|\s*`?([A-Z]{2,4}-[A-Z0-9]+-\d+)`?\s*\|/gm)) ids.add(m[1] ?? '')
  return ids
}

/** 某 FR 标识在目标文件的 FR 集合里是否命中（家族号口径） */
function frHit(ids: Set<string>, ref: string): boolean {
  if (ids.has(ref)) return true
  return ids.has(ref.split('.')[0] ?? ref)
}

/** 任一级标题——条款计数的边界判定 */
const isHeading = (line: string): boolean => /^#{1,4}\s/.test(line)

/** 一行里的粗体短语集合（`**…**`） */
function boldSpans(line: string): string[] {
  return [...line.matchAll(/\*\*([^*]+)\*\*/g)]
    .map((m) => (m[1] ?? '').trim())
    .filter((s) => s.length > 0)
}

/**
 * 名锚判定：**等值匹配条款首行的粗体短语**（首行无粗体短语时退化为「首行包含」）。
 *
 * 为什么等值而不是包含：包含会让「共同子串」在别的地方碰巧命中——
 * 关键词是要认出「那一条」的，认的是它的标题短语本身，不是它的某段文字。
 * 为什么首行无粗体时退回包含：本仓两种行写法并存（有 `**标题短语**` 的、
 * 裸编号无粗体的，如 m11 FR-1.1），等值在裸编号行上无对象，
 * 首行本身就是次强可得的口径（首行 ≠ 条款区域：区域还含续行与嵌套内容）。
 */
function nameMatches(firstLine: string, name: string): boolean {
  const spans = boldSpans(firstLine)
  if (spans.length === 0) return firstLine.includes(name)
  return spans.includes(name)
}

/** 名锚失败的报错（带首行短语清单，便于照着改指针） */
function nameMismatch(
  ref: string,
  name: string,
  firstLine: string,
  where: string,
): {
  ok: false
  message: string
} {
  const spans = boldSpans(firstLine)
  const detail =
    spans.length === 0
      ? '该首行是裸编号行，行内没有'
      : `首行的粗体短语是 ${spans.map((s) => `「${s}」`).join('')}，其中没有`
  return { ok: false, message: `${ref} ${where}内容已不匹配：${detail}「${name}」` }
}

/**
 * 校验一个 `FR-*` 指针在目标文件里的**语义落点**（C-6 的粒度收紧 ＋ 名锚等值）。
 *
 * 普通 `FR-N`：精确标题 / 家族子标题（`FR-N.M`）任一命中即过（CM-C4 指 `FR-11`，
 * 目标文件只有 `FR-11.2` 标题，家族口径是它的正当形态）。
 *
 * 条款指针 `FR-N.M`（「FR-N 的第 M 条」）——**不许只靠家族号过关**，逐层解析：
 * ① 精确标题 `### FR-N.M`；② 显式标签 `- FR-N.M`（`docs-governance-check.md` 的写法）；
 * ③ 父标题 `### FR-N` 下的第 M 条有序条目（m11／context-management 的裸编号写法）；
 * ④ 只有子标题无父标题 ⇒ 明说「无法定位」而非放过。
 *
 * **名锚（`FR-N.M:关键词`）是条款指针的必填项**，判定分三步：
 * 缺名锚 ⇒ 红（只给序号时规格增删条目后序号会静默漂到另一条款）；
 * 条款解析不到 ⇒ 红；名锚必须**等值命中该条款首行的粗体短语**
 * （首行无粗体时按首行包含）——匹配目标是**首行**，不是整个条款区域：
 * 区域含续行与嵌套内容，关键词只在续行里出现会假绿。
 */
function verifyFrRef(
  text: string,
  ref: string,
  file: string,
  name?: string,
): { ok: boolean; message?: string } {
  const lines = text.split('\n')
  const clause = /^FR-(\d+)\.(\d+)$/.exec(ref)

  if (clause === null) {
    // 普通 FR-N：家族口径；带了名锚就按标题行校验（名锚对普通指针不强制）
    if (!frHit(frIdsOf(text), ref)) {
      return { ok: false, message: `${ref} 在 ${file} 里不存在（该文件的 FR 标题集合里没有它）` }
    }
    if (name) {
      const idx = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${ref}(?![\\d.])`).test(l))
      const alt = idx >= 0 ? idx : lines.findIndex((l) => /^#{2,4}\s+/.test(l) && l.includes(ref))
      if (alt >= 0 && !nameMatches(lines[alt] ?? '', name)) {
        return nameMismatch(ref, name, lines[alt] ?? '', '标题行')
      }
    }
    return { ok: true }
  }

  if (name === undefined) {
    return {
      ok: false,
      message: `${ref} 缺名锚：条款指针须写 \`${ref}:关键词\`——只给序号时，规格增删条目后序号会静默漂到另一条款`,
    }
  }
  const parent = `FR-${clause[1] ?? ''}`
  const target = Number(clause[2])
  const where = `第 ${String(target)} 条`

  // ① 精确标题
  const exactIdx = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${ref}(?![\\d.])`).test(l))
  if (exactIdx >= 0) {
    const first = lines[exactIdx] ?? ''
    return nameMatches(first, name) ? { ok: true } : nameMismatch(ref, name, first, where)
  }
  // ② 显式标签
  const labelIdx = lines.findIndex((l) => new RegExp(`^\\s*[-*]\\s+${ref}\\b`).test(l))
  if (labelIdx >= 0) {
    const first = lines[labelIdx] ?? ''
    return nameMatches(first, name) ? { ok: true } : nameMismatch(ref, name, first, where)
  }
  // ③ 父标题下的第 M 条有序条目
  const head = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+${parent}(?![\\d.])`).test(l))
  if (head >= 0) {
    let seen = 0
    let itemIdx = -1
    for (let i = head + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      if (isHeading(line)) break
      if (/^\d+\.\s/.test(line)) {
        seen += 1
        if (seen === target) {
          itemIdx = i
          break
        }
      }
    }
    if (itemIdx < 0) {
      return {
        ok: false,
        message: `${ref} 解析不到条款（${parent} 下只有 ${String(seen)} 条，没有第 ${String(target)} 条）`,
      }
    }
    const first = lines[itemIdx] ?? ''
    return nameMatches(first, name) ? { ok: true } : nameMismatch(ref, name, first, where)
  }
  // ④ 只有子标题无父标题
  if (new RegExp(`^#{2,4}\\s+${parent}\\.\\d+`, 'm').test(text)) {
    return { ok: false, message: `${ref} 无法定位：${parent} 没有独立标题，只有子标题` }
  }
  return { ok: false, message: `${ref} 在目标文件里不存在` }
}

export function checkTraceability(src: TraceSources): Issue[] {
  const issues: Issue[] = []
  const reqRows = traceRowsFromAnchor(src.traceDoc, ANCHOR_REQS)
  const traceRows = traceRowsFromAnchor(src.traceDoc, ANCHOR_TRACE)

  if (reqRows === null) {
    issues.push({
      rule: 'C-6',
      where: TRACE_DOC,
      message: `未找到锚点 \`${ANCHOR_REQS}\`（需求清单的唯一出处缺失）`,
    })
  }
  if (traceRows === null) {
    issues.push({
      rule: 'C-6',
      where: TRACE_DOC,
      message: `未找到锚点 \`${ANCHOR_TRACE}\`（双向追溯表的唯一出处缺失）`,
    })
  }
  if (reqRows === null || traceRows === null) return issues

  // ① 需求清单 ↔ 追溯表：集合相等、无重复
  const reqIds = reqRows.map((r) => r.cm)
  const traceIds = traceRows.map((r) => r.cm)
  for (const id of new Set(reqIds)) {
    const n = reqIds.filter((x) => x === id).length
    if (n > 1) {
      issues.push({
        rule: 'C-6',
        where: `${TRACE_DOC} · ${id}`,
        message: `需求清单里 ${id} 出现 ${String(n)} 次（编号必须唯一）`,
      })
    }
    const m = traceIds.filter((x) => x === id).length
    if (m === 0) {
      issues.push({
        rule: 'C-6',
        where: `${TRACE_DOC} · ${id}`,
        message: `${id} 在需求清单里存在，但双向追溯表里没有对应行`,
      })
    } else if (m > 1) {
      issues.push({
        rule: 'C-6',
        where: `${TRACE_DOC} · ${id}`,
        message: `${id} 在双向追溯表里出现 ${String(m)} 次（一需求一行）`,
      })
    }
  }
  for (const id of new Set(traceIds)) {
    if (!reqIds.includes(id)) {
      issues.push({
        rule: 'C-6',
        where: `${TRACE_DOC} · ${id}`,
        message: `双向追溯表里的 ${id} 在需求清单里不存在`,
      })
    }
  }

  const specAcceptanceIds = new Set<string>()
  for (const p of src.specPaths) {
    const text = src.targets.get(p)
    if (!text) continue
    for (const id of acceptanceIdsOf(text)) specAcceptanceIds.add(id)
  }

  // 反向索引：`文件::FR 标识` → 锚定它的全部行（CM 编号 ＋ 追溯表行号）。
  //
  // 为什么要有它：一处指针失配往往**同时**废掉多行（同一条款被多条需求锚定），
  // 只报「哪一行坏了」会让人修一行红一行、直到修完才知道全貌——
  // 报错必须一次列全「要同步改哪几处」，这正是「短语清单反向索引」要给的东西。
  const clauseOwners = new Map<string, { cm: string; line: number }[]>()
  for (const row of traceRows) {
    for (const ref of parseAttribution(row.cells[1] ?? '').frs) {
      const key = `${ref.file ?? ''}::${ref.id}`
      const list = clauseOwners.get(key) ?? []
      // 同一行散文复述同一指针只算一行（否则清单里出现两行同名）
      if (!list.some((o) => o.cm === row.cm)) list.push({ cm: row.cm, line: row.line })
      clauseOwners.set(key, list)
    }
  }
  const affectedHint = (file: string | null, id: string): string => {
    const owners = clauseOwners.get(`${file ?? ''}::${id}`) ?? []
    if (owners.length === 0) return ''
    const list = owners.map((o) => `${o.cm} 第 ${String(o.line)} 行`).join('、')
    return `；受影响的行：${list}`
  }

  // ②③④ 逐行核对「归属」与「验收编号」列
  for (const row of traceRows) {
    const attrib = parseAttribution(row.cells[1] ?? '')

    // ② 归属列必须**至少有一个可机验锚点**（FR-* 或 C-*）。
    //
    // 为什么：只写散文（「见某文件的某节」）的归属**机器验不了** ⇒ 那行等于
    // 没有追溯 ⇒ 需求与规格脱节时无人报警 ⇒ 这正是本判据要消灭的形态。
    if (attrib.frs.length === 0 && attrib.crits.length === 0) {
      issues.push({
        rule: 'C-6',
        where: `${TRACE_DOC} · ${row.cm}`,
        message: '归属列没有可机验的锚点（须写明 `FR-*` 或判据 `C-*`）',
      })
    }

    for (const ref of attrib.frs) {
      if (ref.file === null) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `${ref.id} 没有绑定到任何文件（归属列须先给链接再给标识）`,
        })
        continue
      }
      const text = src.targets.get(ref.file)
      if (text === undefined) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `${ref.id} 指向的文件 ${ref.file} 不可读，无法核实该 FR 是否存在`,
        })
        continue
      }
      const verdict = verifyFrRef(text, ref.id, ref.file, ref.name)
      if (!verdict.ok) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `${verdict.message ?? `${ref.id} 在 ${ref.file} 里解析不到落点`}${affectedHint(ref.file, ref.id)}`,
        })
      }
    }
    for (const ref of attrib.crits) {
      if (ref.file === null) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `${ref.id} 没有绑定到任何文件`,
        })
        continue
      }
      const text = src.targets.get(ref.file)
      if (text === undefined) continue
      if (!critIdsOf(text).has(ref.id)) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `${ref.id} 在 ${ref.file} 里没有登记`,
        })
      }
    }

    for (const id of acceptanceIdsOfCell(row.cells[2] ?? '')) {
      if (!specAcceptanceIds.has(id)) {
        issues.push({
          rule: 'C-6',
          where: `${TRACE_DOC} · ${row.cm}`,
          message: `验收编号 ${id} 在规格里不存在`,
        })
      }
    }
  }

  // ⑤ 反向：规格标题声明的 CM 必须在需求清单里，且追溯表要指回来
  const traceByCm = new Map(traceRows.map((r) => [r.cm, r]))
  for (const p of src.specPaths) {
    const text = src.targets.get(p)
    if (!text) continue
    for (const m of text.matchAll(/^#{2,4}\s+(FR-\d+(?:\.\d+)?)[^\n]*（(CM-[A-Z]\d+)）/gm)) {
      const fr = m[1] ?? ''
      const cm = m[2] ?? ''
      if (!reqIds.includes(cm)) {
        issues.push({
          rule: 'C-6',
          where: `${p} · ${fr}`,
          message: `规格条目声明了 ${cm}，但需求清单里没有这个编号`,
        })
        continue
      }
      const row = traceByCm.get(cm)
      if (!row) continue
      const attrib = parseAttribution(row.cells[1] ?? '')
      const back = attrib.frs.some(
        (r) => r.file === p && frHit(new Set([fr.split('.')[0] ?? fr]), r.id),
      )
      if (!back) {
        issues.push({
          rule: 'C-6',
          where: `${p} · ${fr}`,
          message: `规格条目声明了 ${cm}，但追溯表里 ${cm} 那一行没有指回 ${fr}`,
        })
      }
    }
  }

  return issues
}

/**
 * 「多处定义」：追溯源文档只能有一处。
 *
 * 两条判据，**都不依赖节标题文字**：
 * ① 锚点重复：别处也放了 `<!-- c6:trace -->`／`<!-- c6:reqs -->` ⇒ 机器会认错出处；
 * ② 表形重复：别处有**以 `CM-xx` 开头的表格行** ⇒ 那就是第二张追溯表，
 *    不管它把这一节叫什么名字。
 */
export function checkTraceDocUniqueness(docs: Map<string, string>): Issue[] {
  const issues: Issue[] = []
  for (const [path, text] of docs) {
    if (path === TRACE_DOC) continue
    for (const anchor of TRACE_ANCHORS) {
      if (text.split('\n').some((l) => l.trim() === anchor)) {
        issues.push({
          rule: 'C-6',
          where: path,
          message: `此处也放了锚点 \`${anchor}\` —— 追溯源文档只能有一处`,
        })
      }
    }
    const dup = text.split('\n').find((l) => CM_ROW_RE.test(l))
    if (dup !== undefined) {
      issues.push({
        rule: 'C-6',
        where: path,
        message: '此处也有一张以 CM 编号开头的表 —— 追溯源文档只能有一处',
      })
    }
  }
  return issues
}

/** 读取追溯源文档与全部引用对象 */
export function loadTraceSources(): TraceSources {
  const targets = new Map<string, string>()
  const specPaths: string[] = []
  for (const dir of [DOCS_DIR, SPECS_DIR]) {
    let names: string[]
    try {
      names = readdirSync(join(ROOT, dir)).filter((n) => n.endsWith('.md'))
    } catch {
      continue
    }
    for (const name of names) {
      const rel = `${dir}/${name}`
      try {
        targets.set(rel, readFileSync(join(ROOT, rel), 'utf8'))
      } catch {
        continue
      }
      if (dir === SPECS_DIR) specPaths.push(rel)
    }
  }
  let traceDoc = ''
  try {
    traceDoc = readFileSync(join(ROOT, TRACE_DOC), 'utf8')
  } catch {
    traceDoc = ''
  }
  return { traceDoc, targets, specPaths }
}

/** 验收 ID 单元格里的编号集合（与行校验同一个正则口径，抽取后共用） */
function acceptanceIdsOfCell(cell: string): string[] {
  return cell.match(/\b[A-Z]{2,4}-[A-Z0-9]+-\d+\b/g) ?? []
}

/**
 * 共锚自检（**只报数，不判红**，C-6 之下的报告面）：
 * 同一指针（文件 ＋ FR 标识）被多行锚定、而**名锚写得不一样**时列出。
 *
 * 为什么只报数：同一条款的两个侧面分别锚定（如 `FR-3.1:布尔` 与 `FR-3.1:未声明`）
 * 可能是**正当多面**，也可能是**语义分叉**（表里看着像指了两个东西，实际同一条款）
 * —— 两种都是人读的问题，机器只负责把分叉摆出来，判定留给人。
 *
 * 为什么值得单开一面：失效判据只在失配时报警，**全绿时**这种分叉无人看见；
 * 而「名字不同、指针相同」正是分叉的结构指纹。
 *
 * **分级**：行尾带「验收 ID 有交集」的**优先看**——两行共用同一验收结论却写两个名字，
 * 更像分叉；不带的即各行验收 ID 互不重叠，更像正当多面。
 */
export function reportCoAnchors(traceRows: TraceRow[]): string[] {
  const byKey = new Map<string, { name: string; cm: string; line: number; acc: string[] }[]>()
  for (const row of traceRows) {
    for (const ref of parseAttribution(row.cells[1] ?? '').frs) {
      if (!ref.name) continue // 普通指针名锚可选，不参与共锚判定
      const key = `${ref.file ?? '(无文件绑定)'} ${ref.id}`
      const list = byKey.get(key) ?? []
      list.push({
        name: ref.name,
        cm: row.cm,
        line: row.line,
        acc: acceptanceIdsOfCell(row.cells[2] ?? ''),
      })
      byKey.set(key, list)
    }
  }
  const out: string[] = []
  for (const [key, entries] of byKey) {
    if (new Set(entries.map((e) => e.name)).size <= 1) continue
    const list = entries.map((e) => `${e.cm} 第 ${String(e.line)} 行（${e.name}）`).join('、')
    // 分级：验收 ID 在各行间重复出现 ⇒ 同一验收结论挂两个名字，更像分叉
    const times = new Map<string, number>()
    for (const e of entries) for (const id of e.acc) times.set(id, (times.get(id) ?? 0) + 1)
    const overlap = [...times].filter(([, n]) => n > 1).map(([id]) => id)
    const grade = overlap.length > 0 ? `；验收 ID 有交集：${overlap.join('、')}` : ''
    out.push(`${key} 被不同名锚锚定：${list}${grade}`)
  }
  return out
}

/**
 * `test-results/context-check.json` 的**字段闭集**（趋势对比只认这些字段名）。
 *
 * `coAnchorItems` 是当轮真值——含绝对行号，文档上移即漂 ⇒ **趋势只比 `coAnchors`
 * 计数**，明细只作当轮排障（行号漂移只降定位价值，不造成误判）。
 */
export interface ContextCheckReport {
  /** ISO 时间戳 */
  at: string
  /** 判红数（C-1～C-4 ＋ C-6 ＋ C-5 棘轮） */
  errors: number
  /** C-5 上下游未回指（本轮计数） */
  c5: number
  /** C-5 上界（棘轮）；基线缺失时 `null` */
  c5UpperBound: number | null
  /** C-5 超出上界的条数（0 = 未超） */
  c5OverBy: number
  /**
   * C-5 上界的**下调建议**：本轮计数低于上界时给目标值（`null` = 无须下调）。
   *
   * ⚠️ **只是建议，闸不自动改基线**（只报不写）：改基线是显式动作且必须追加留痕。
   * 落盘的理由是「终端那一行会被 CI 日志淹掉」——写进 JSON 后面板可直接展示。
   */
  c5SuggestLowerBound: number | null
  /** 共锚自检条数（只报数，趋势主指标） */
  coAnchors: number
  /** 共锚明细（当轮真值） */
  coAnchorItems: string[]
}

/** 结论落盘：失败返回 `null`（**不阻断判定**——落盘是证据不是闸） */
export function writeContextReport(report: ContextCheckReport, path: string): string | null {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
    return path
  } catch {
    return null
  }
}

/* ════════════════════════════════════════════════════════ 本机多轮历史 */

/**
 * 每轮快照（历史只存**计数**）。
 *
 * ⚠️ **不存 `coAnchorItems`**：那是当轮明细、含绝对行号（文档上移即漂），
 * 且体积随共锚数增长 ⇒ 存进历史只会让历史文件变成一堆过期行号。
 * 趋势要看的是「数在往哪走」，明细回当轮 `context-check.json`。
 */
export interface ContextCheckRun {
  at: string
  /**
   * 产出这一轮的机器：本机为 `local`，CI 为 `ci-<平台>`（如 `ci-Linux`）。
   *
   * **为什么需要它**：跨机器合并后，同一张趋势表里会有多台机器的轮次；
   * 不标来源就分不清「这台机器在恶化」还是「另一台本来就更严」。
   */
  source?: string
  errors: number
  c5: number
  c5UpperBound: number | null
  c5OverBy: number
  c5SuggestLowerBound: number | null
  coAnchors: number
}

/** 一次合并动作的留痕（`context:history:merge` 写入 `History.merges`） */
export interface MergeRecord {
  /** 合并发生时间（ISO） */
  at: string
  /** 来源文件名（basename；如 `ci-history.json`） */
  from: string
  /** 从该文件读入的合格轮次 */
  accepted: number
  /** 该文件里不合格、被丢弃的项 */
  dropped: number
  /** 去重后**净增**的轮次（已在本机历史里的 `at` 不计数） */
  added: number
}

/** 本机历史文件形状（schema 版本号让未来加字段可兼容校验） */
export interface ContextCheckHistory {
  schema: 1
  runs: ContextCheckRun[]
  /**
   * 合并动作的可追溯清单（只由 `context:history:merge` 追加；`context:check` 追加轮次时**必须保留**）。
   *
   * **为什么需要它**：合并之后同一张表里有本机与多台 CI 的轮次，若不留痕，
   * 事后无法判断「某几轮数据是不是从错的文件合进来的」。清单记来源文件名与净增数。
   */
  merges?: MergeRecord[]
}

/** `merges` 的保留条数（防清单比轮次表还长） */
export const MERGE_LOG_MAX = 50

/**
 * 本机多轮历史文件（`test-results/` 已 gitignore；每轮追加、同名覆盖的日报只留最近一轮）。
 *
 * **为什么需要它**：单轮结论回答不了「这几轮是收敛还是在恶化」——
 * `context-check.json` 每轮覆盖，跨轮只能靠历史文件；CI 侧另有 artifact 归档（按 run）。
 */
const HISTORY_FILE = 'test-results/context-check-history.json'

/** 保留最近多少轮（防无限膨胀）；合并脚本（`context-history-merge.ts`）共用此上限 */
export const HISTORY_MAX_RUNS = 50

/** 读历史；不存在／非法 JSON／schema 不匹配 ⇒ null（视作空历史，从头记） */
export function readContextHistory(path: string): ContextCheckHistory | null {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<ContextCheckHistory>
    if (raw?.schema !== 1 || !Array.isArray(raw.runs)) return null
    return raw as ContextCheckHistory
  } catch {
    return null
  }
}

/** 追加一轮；超限截断到最近 N 轮（纯函数，可测）。
 *  ⚠️ **必须保留 `merges`**：否则下一次 `context:check` 就会把合并清单清空。 */
export function appendContextHistory(
  history: ContextCheckHistory | null,
  run: ContextCheckRun,
): ContextCheckHistory {
  const runs = [...(history?.runs ?? []), run].slice(-HISTORY_MAX_RUNS)
  return history?.merges === undefined
    ? { schema: 1, runs }
    : { schema: 1, runs, merges: history.merges }
}

/** 写历史；失败返回 `null`（与结论落盘同口径：证据写不出不阻断判定） */
export function writeContextHistory(history: ContextCheckHistory, path: string): string | null {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(history, null, 2)}\n`)
    return path
  } catch {
    return null
  }
}

/** C-5：只报数。历史规格存在单向登记，一次性判红会逼人改历史。 */
function reportHeaderClosure(): string[] {
  const dir = join(ROOT, 'docs/specs')
  const specs = readdirSync(dir).filter((n) => n.endsWith('.md'))
  const upstreamOf = new Map<string, Set<string>>()
  const downstreamOf = new Map<string, Set<string>>()

  for (const name of specs) {
    const text = readFileSync(join(dir, name), 'utf8')
    const upstream = new Set<string>()
    const downstream = new Set<string>()
    for (const line of text.split('\n').slice(0, 20)) {
      const refs = [...line.matchAll(/([a-z0-9-]+\.md)/g)].map((m) => m[1] ?? '')
      if (line.startsWith('| 上游')) refs.forEach((r) => upstream.add(r))
      if (line.startsWith('| 下游设计')) refs.forEach((r) => downstream.add(r))
    }
    upstreamOf.set(name, upstream)
    downstreamOf.set(name, downstream)
  }

  const open: string[] = []
  for (const [name, downstream] of downstreamOf) {
    for (const target of downstream) {
      const theirs = upstreamOf.get(target)
      if (theirs && !theirs.has(name)) open.push(`${name} → ${target}`)
    }
  }
  return open
}

/**
 * C-7 · 头部引用必须是**链接形态**（2026-11-07）。
 *
 * ## 它挡的是什么
 *
 * C-5 的条目抽取用 `/([a-z0-9-]+\.md)/g` 从头部前 20 行里**抓文本子串**，
 * 于是「引用」与「提及」不可分：
 *
 * - 裸名 `` `docs/specs/m6-standard-pack.md` `` —— 是引用，但**不构成链接**，
 *   读者在 Markdown 渲染后点不动，`docs:check` 的 FR-3.4（相对链接目标存在）也管不到它；
 * - 提到文件名作为**讨论对象**（「`xxx.md` 的头部写法不一致」）—— 不是引用，
 *   却被 C-5 记成上下游条目。
 *
 * ⇒ 本判据要求头部 `| 上游` / `| 下游设计` 两行里对 `docs/specs/` 内文件的**引用**
 *   一律写成 markdown 链接 `[xxx.md](./xxx.md)`；带路径的反引号（`` `docs/specs/xxx.md` ``）
 *   与裸名同样计入违规。
 *
 * ## 为什么不直接改 C-5 的抽取
 *
 * C-5 是**棘轮**（上界 23，只降不升）。把「只识别链接形态」塞进 C-5 会让 25 个用裸名的
 * spec 突然不再被计数 ⇒ 计数从 23 掉到个位数 ⇒ **棘轮被静默放宽**（上界不动、分母骤降）。
 * ⇒ 分开：C-5 继续数「有没有回指」，C-7 管「引用形不形态合规」，两条各自有基线。
 */
// ⚠️ 供 `scripts/batch-replace.ts` 复用：**改写器必须与判据同口径**，
//   否则「按自己的理解改完，判据按另一份理解判」⇒ 迁移看着成功、C-7 仍报红。
export const MD_LINK_RE = /\[[^\]]+\]\([^)]*\.md[^)]*\)/g
// ⚠️ 字符类里 `[` 放**首位**即可免转义（放别处会被当成字符类的闭合符）；
//   `(` 与 `)` 在字符类内本就是字面量，转义反而触发 no-useless-escape。
export const SPEC_FILE_RE = /(?<![[(])([a-z0-9-]+\.md)(?![\])])/g

export interface C7Hit {
  /** 违规所在文件 */
  file: string
  /** 违规所在行（1 起） */
  line: number
  /** 被裸引用的 specs 文件名 */
  target: string
  /** 该行原文（截断） */
  excerpt: string
}

/** C-7：头部两行里的非链接形态 specs 引用 */
export function reportNonLinkedRefs(specsDir: string, readFile: (p: string) => string): C7Hit[] {
  const names = new Set(
    readdirSync(specsDir)
      .filter((n) => n.endsWith('.md'))
      .map((n) => n),
  )
  const hits: C7Hit[] = []
  for (const name of [...names].sort()) {
    const lines = readFile(join(specsDir, name)).split('\n').slice(0, 20)
    lines.forEach((line, idx) => {
      if (!line.startsWith('| 上游') && !line.startsWith('| 下游设计')) return
      // 先剥掉合法的 markdown 链接，剩下的 specs 文件名就是「裸引用」
      const rest = line.replace(MD_LINK_RE, '')
      for (const m of rest.matchAll(SPEC_FILE_RE)) {
        const target = m[1] ?? ''
        if (!names.has(target)) continue
        hits.push({
          file: name,
          line: idx + 1,
          target,
          excerpt: line.trim().slice(0, 80),
        })
      }
    })
  }
  return hits
}

/** C-5 棘轮基线文件（入仓；缺失即判红 —— 删掉它等于拆掉棘轮） */
const C5_BASELINE_FILE = 'docs/context-check-baseline.json'

/** C-5 棘轮基线的字段闭集（见 docs/context-governance.md §7 的 C-5 口径） */
export interface C5RatchetBaseline {
  note: string
  /** 上界：本轮 C-5 计数不得超过它（只降不升） */
  c5UpperBound: number
  /** 上界对应的条目快照（用于精确列出「本轮新增的是哪几条」） */
  c5Items: string[]
  /** 上界变更留痕：末项的 `value` 必须等于 `c5UpperBound` */
  c5History: { at: string; value: number; reason: string }[]
}

/** 解析基线；字段不齐／类型不对 ⇒ null（由 checkC5Ratchet 报「不可解析」） */
export function parseC5RatchetBaseline(text: string): C5RatchetBaseline | null {
  try {
    const raw = JSON.parse(text) as Partial<C5RatchetBaseline>
    if (typeof raw.c5UpperBound !== 'number' || !Number.isInteger(raw.c5UpperBound)) return null
    if (!Array.isArray(raw.c5Items)) return null
    if (!Array.isArray(raw.c5History) || raw.c5History.length === 0) return null
    for (const h of raw.c5History) {
      if (
        typeof h?.at !== 'string' ||
        typeof h?.value !== 'number' ||
        typeof h?.reason !== 'string'
      ) {
        return null
      }
    }
    return raw as C5RatchetBaseline
  } catch {
    return null
  }
}

/**
 * FR-4 · C-5 棘轮判定（纯函数）。
 *
 * ## 它判什么（三条，全部可证伪）
 *
 * 1. **基线缺失/不可解析** ⇒ 红。删掉基线文件等于拆掉棘轮 ⇒ 不能静默放行；
 * 2. **基线自身不自洽** ⇒ 红：`c5UpperBound` 必须同时等于 `c5Items.length`
 *    与 `c5History` 末项的 `value`（上调/下调都必须往历史追加一条，含日期与理由）；
 * 3. **本轮计数 > 上界** ⇒ 红，并给出差值与前若干新增条目（精确到「哪几条」）。
 *
 * ## 为什么「下降」不判红、只给下调建议
 *
 * 上界的作用是防恶化，不是目标值（规格 FR-4 边界：降到 0 要逐条补上下游登记）。
 * 计数下降说明有人真去补了回指 ⇒ 闸**只提示**「上界可下调到 N」，
 * 不自动改基线（闸只报不写，与 docs:check 同精神；改基线是显式动作且要留痕）。
 */
export function checkC5Ratchet(
  open: string[],
  baseline: C5RatchetBaseline | null,
): { issues: Issue[]; suggestLowerBound: number | null } {
  const issues: Issue[] = []
  if (baseline === null) {
    issues.push({
      rule: 'C-5',
      where: C5_BASELINE_FILE,
      message: 'C-5 棘轮基线缺失或不可解析 —— 删掉基线等于拆掉棘轮，须恢复该文件',
    })
    return { issues, suggestLowerBound: null }
  }

  const last = baseline.c5History[baseline.c5History.length - 1]
  if (baseline.c5UpperBound !== baseline.c5Items.length) {
    issues.push({
      rule: 'C-5',
      where: C5_BASELINE_FILE,
      message: `基线上界 ${String(baseline.c5UpperBound)} 与条目数 ${String(baseline.c5Items.length)} 不一致 —— 改上界必须同步 c5Items`,
    })
  }
  if (last === undefined || last.value !== baseline.c5UpperBound) {
    issues.push({
      rule: 'C-5',
      where: C5_BASELINE_FILE,
      message: `基线上界 ${String(baseline.c5UpperBound)} 与留痕末项 ${String(last?.value ?? '无')} 不一致 —— 上调/下调必须往 c5History 追加一条（含日期与理由）`,
    })
  }

  if (open.length > baseline.c5UpperBound) {
    const known = new Set(baseline.c5Items)
    const fresh = open.filter((pair) => !known.has(pair))
    const delta = open.length - baseline.c5UpperBound
    issues.push({
      rule: 'C-5',
      where: C5_BASELINE_FILE,
      message: `C-5 上下游未回指 ${String(open.length)} 条 > 上界 ${String(baseline.c5UpperBound)}（新增 ${String(delta)} 条）：${fresh.slice(0, 5).join(' ｜ ') || '（新增条目与基线条目同集，见本轮清单）'}`,
    })
    return { issues, suggestLowerBound: null }
  }

  return {
    issues,
    suggestLowerBound: open.length < baseline.c5UpperBound ? open.length : null,
  }
}

/** 读棘轮基线；文件不存在 ⇒ null（由 checkC5Ratchet 报「缺失」） */
function readC5Baseline(): C5RatchetBaseline | null {
  try {
    return parseC5RatchetBaseline(readFileSync(join(ROOT, C5_BASELINE_FILE), 'utf8'))
  } catch {
    return null
  }
}

/** C-7 棘轮基线文件（入仓；缺失即判红，与 C-5 同精神） */
const C7_BASELINE_FILE = 'docs/context-check-c7-baseline.json'

interface C7RatchetBaseline {
  c7UpperBound: number
  c7Items: string[]
  c7History: { at: string; value: number; reason: string }[]
}

function parseC7Baseline(raw: string): C7RatchetBaseline | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    const bound = j.c7UpperBound
    const items = j.c7Items
    const hist = j.c7History
    if (typeof bound !== 'number' || !Number.isInteger(bound)) return null
    if (!Array.isArray(items)) return null
    if (!Array.isArray(hist) || hist.length === 0) return null
    for (const h of hist) {
      if (typeof h !== 'object' || h === null) return null
      const rec = h as Record<string, unknown>
      if (typeof rec.at !== 'string' || typeof rec.value !== 'number') return null
      if (typeof rec.reason !== 'string' || rec.reason.length === 0) return null
    }
    return {
      c7UpperBound: bound,
      c7Items: items.map(String),
      c7History: hist.map((h) => {
        const rec = h as Record<string, unknown>
        return { at: String(rec.at), value: Number(rec.value), reason: String(rec.reason) }
      }),
    }
  } catch {
    return null
  }
}

function readC7Baseline(): C7RatchetBaseline | null {
  try {
    return parseC7Baseline(readFileSync(join(ROOT, C7_BASELINE_FILE), 'utf8'))
  } catch {
    return null
  }
}

/**
 * C-7 棘轮判定（纯函数，三条判红，与 C-5 同形）。
 *
 * 1. 基线缺失/不可解析 ⇒ 红（删掉基线等于拆掉棘轮）；
 * 2. 基线自身不自洽 ⇒ 红（上界必须 == 条目数 == 留痕末项 value）；
 * 3. 本轮计数 > 上界 ⇒ 红，并给出差值与前若干新增条目。
 *
 * 下降不判红，只给下调建议（闸只报不写，与 C-5 / docs:check 同精神）。
 */
export function checkC7Ratchet(
  hits: C7Hit[],
  baseline: C7RatchetBaseline | null,
): { issues: Issue[]; suggestLowerBound: number | null } {
  const issues: Issue[] = []
  if (baseline === null) {
    issues.push({
      rule: 'C-7',
      where: C7_BASELINE_FILE,
      message: 'C-7 棘轮基线缺失或不可解析 —— 删掉基线等于拆掉棘轮，须恢复该文件',
    })
    return { issues, suggestLowerBound: null }
  }
  const last = baseline.c7History[baseline.c7History.length - 1]
  if (baseline.c7UpperBound !== baseline.c7Items.length) {
    issues.push({
      rule: 'C-7',
      where: C7_BASELINE_FILE,
      message: `C-7 基线上界 ${String(baseline.c7UpperBound)} 与条目数 ${String(baseline.c7Items.length)} 不一致 —— 改上界必须同步 c7Items`,
    })
  }
  if (last === undefined || last.value !== baseline.c7UpperBound) {
    issues.push({
      rule: 'C-7',
      where: C7_BASELINE_FILE,
      message: `C-7 基线上界 ${String(baseline.c7UpperBound)} 与留痕末项 ${String(last?.value ?? '无')} 不一致 —— 上调/下调必须往 c7History 追加一条（含日期与理由）`,
    })
  }
  if (hits.length > baseline.c7UpperBound) {
    const known = new Set(baseline.c7Items)
    const fresh = hits.map((h) => `${h.file}:${h.line} → ${h.target}`).filter((k) => !known.has(k))
    const delta = hits.length - baseline.c7UpperBound
    issues.push({
      rule: 'C-7',
      where: C7_BASELINE_FILE,
      message: `C-7 头部裸名引用 ${String(hits.length)} 处 > 上界 ${String(baseline.c7UpperBound)}（新增 ${String(delta)} 处）：${fresh.slice(0, 5).join(' ｜ ') || '（新增条目与基线条目同集，见本轮清单）'}`,
    })
    return { issues, suggestLowerBound: null }
  }
  return {
    issues,
    suggestLowerBound: hits.length < baseline.c7UpperBound ? hits.length : null,
  }
}

function main(): number {
  const files = scanFiles()
  const issues = [...checkSingleSource(files), ...checkLayering(files), ...checkCompatMatrix()]

  const open = reportHeaderClosure()
  // FR-4 棘轮：C-5 从「只报数」升级为「有上界」——超出上界即红，下降只给下调建议。
  const baseline = readC5Baseline()
  const ratchet = checkC5Ratchet(open, baseline)

  const traceSrc = loadTraceSources()
  const traceIssues = [...checkTraceability(traceSrc), ...checkTraceDocUniqueness(traceSrc.targets)]

  // C-7：头部引用形态（裸名 / 带路径反引号 ⇒ 违规；markdown 链接才合规）
  const c7Hits = reportNonLinkedRefs(join(ROOT, 'docs/specs'), (p) => readFileSync(p, 'utf8'))
  const c7 = checkC7Ratchet(c7Hits, readC7Baseline())

  const allIssues = [...issues, ...traceIssues, ...ratchet.issues, ...c7.issues]

  console.log(
    `扫描 ${String(files.size)} 个源文件；判据 C-1～C-4 共 ${String(issues.length)} 处违规。`,
  )
  for (const issue of issues) console.log(`  error [${issue.rule}] ${issue.where} ${issue.message}`)

  console.log(`判据 C-6（CM ↔ FR 追溯闭合）共 ${String(traceIssues.length)} 处违规。`)
  for (const issue of traceIssues)
    console.log(`  error [${issue.rule}] ${issue.where} ${issue.message}`)

  console.log(`\nC-5 上下游未回指：${String(open.length)} 处（下面只列前 10 条）`)
  for (const pair of open.slice(0, 10)) console.log(`  warn   ${pair}`)
  for (const issue of ratchet.issues)
    console.log(`  error [${issue.rule}] ${issue.where} ${issue.message}`)
  if (ratchet.issues.length === 0) console.log('  棘轮：未超出上界（只降不升）')
  if (ratchet.suggestLowerBound !== null) {
    console.log(
      `  提示：上界可下调到 ${String(ratchet.suggestLowerBound)} —— 改 ${C5_BASELINE_FILE} 时须往 c5History 追加一条（含日期与理由）`,
    )
  }

  const traceRows = traceRowsFromAnchor(traceSrc.traceDoc, ANCHOR_TRACE) ?? []
  const coAnchors = reportCoAnchors(traceRows)
  console.log(`\n共锚自检（只报数）：${String(coAnchors.length)} 处（下面只列前 10 条）`)
  for (const item of coAnchors.slice(0, 10)) console.log(`  warn   ${item}`)

  // 趋势落盘：每轮都写（0 也是有效趋势值），字段闭集见 ContextCheckReport。
  const upper = baseline?.c5UpperBound ?? null
  const at = new Date().toISOString()
  const report: ContextCheckReport = {
    at,
    errors: allIssues.length,
    c5: open.length,
    c5UpperBound: upper,
    c5OverBy: upper === null ? 0 : Math.max(0, open.length - upper),
    // 下调建议随结论落盘（终端那一行会淹在 CI 日志里；JSON 面板可直接读）
    c5SuggestLowerBound: ratchet.suggestLowerBound,
    coAnchors: coAnchors.length,
    coAnchorItems: coAnchors,
  }
  const saved = writeContextReport(report, join(ROOT, REPORT_FILE))
  if (saved !== null) console.log(`结论已落盘：${REPORT_FILE}`)

  // 本机多轮历史：日报每轮同名覆盖，跨轮趋势只能靠这份追加文件（字段闭集见 ContextCheckRun）。
  // `source` 标产出机器：跨机器合并后同一张表里会有多台机器的轮次，不标就分不清来源。
  const source =
    process.env.GITHUB_RUN_ID !== undefined ? `ci-${process.env.RUNNER_OS ?? 'unknown'}` : 'local'
  const run: ContextCheckRun = {
    at,
    source,
    errors: report.errors,
    c5: report.c5,
    c5UpperBound: report.c5UpperBound,
    c5OverBy: report.c5OverBy,
    c5SuggestLowerBound: report.c5SuggestLowerBound,
    coAnchors: report.coAnchors,
  }
  const historyPath = join(ROOT, HISTORY_FILE)
  const history = appendContextHistory(readContextHistory(historyPath), run)
  const histSaved = writeContextHistory(history, historyPath)
  if (histSaved !== null)
    console.log(`历史已追加：${HISTORY_FILE}（现 ${String(history.runs.length)} 轮）`)

  if (allIssues.length > 0) {
    console.error(
      `\ncontext:check 未通过（${String(allIssues.length)} 处）。处置见 docs/specs/context-governance.md`,
    )
    return 1
  }
  console.log('\ncontext:check 通过。')
  return 0
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('context-check.ts')) {
  process.exitCode = main()
}

// 供测试引用：判据函数为纯函数，便于用「改坏一处」的夹具验证能红。
// （C-6 的三个函数已在上方就地导出，此处不重复列出。）
export { checkCompatMatrix, checkLayering, checkSingleSource, reportHeaderClosure }
export type { Issue }
