/**
 * seed:check —— content/seed 三文件门禁（seed-content FR-4 / §6，dev-plan §11.4）。
 * 校验：包络结构 + 条目 schema（复用 shared zod）+ 数量阈值 + 受控词表 + 附录 B 基线
 *      + 质量门槛（definition 长度、example 覆盖率、别名重复）+ TERMS.md 渲染后的表格完整性。
 * 阈值常量在下方 THRESHOLDS：T4 期 terms ≥60 / templates =3 / prompts =0；
 * T8 起为正式口径 terms ≥100 / templates =3 / prompts =20（dev-plan §11.4、DEV-0019）。
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CONTROLLED_TAG_VOCAB,
  FlowTemplateCreateInput,
  PromptCreateInput,
  TermCreateInput,
  TERMS_MD_DIVIDER,
  TERMS_MD_HEADER,
  renderTermsMdTable,
  utf8ByteLength,
} from '@openvibe/shared'

const THRESHOLDS = {
  termsMin: 100,
  templatesExact: 3,
  promptsExact: 20,
  /** seed-content §3.4 构成配额 */
  ruleMin: 6,
  platformMarkMin: 4,
  withVariablesMin: 8,
  /** §3.4 单条 content ≤2KB，严于 LIMITS.promptContentMaxBytes（512KB） */
  promptContentMaxBytes: 2048,
} as const
/** §3.4 有数量门槛的平台标记（codebuddy/trae/minicode 按内容酌情，不设门槛） */
const COUNTED_PLATFORM_MARKS = ['claude-code', 'cursor', 'generic'] as const
/** §6.3 种子提示词统一归属 */
const SEED_PROMPT_FOLDER = '/精选'
const SEED_PROMPT_TAG = '精选'
/** m1 FR-2.1 的变量提取正则（构成断言与运行期保持同一口径） */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_-]*)\s*\}\}/g

/** PRD 附录 B 的 10 条基线词条，首批必须含（dev-plan §11.1） */
const BASELINE_TERMS = [
  '氛围编程',
  '提示词',
  '技能',
  '规则文件',
  '上下文窗口',
  '规则漂移',
  '规格驱动开发',
  '幻觉',
  '检查点',
  '检索增强生成',
] as const

/** seed-content §3.3 冻结的三套模板与阶段名（逐字断言，防漂移） */
const FLOW_TEMPLATE_STAGES: Record<string, readonly string[]> = {
  个人轻量流: ['启动', '开发', '复盘'],
  'Spec 驱动流': ['需求澄清', 'PRD', 'Spec 规格', '计划', '实现', '审查', '复盘'],
  复盘流: ['收集', '分析', '决议', '回流'],
}

const TERM_ALLOWED_KEYS = ['zh', 'en', 'aliases', 'definition', 'example', 'tags'] as const
/** seed-content §7.3 的阶段数口径 */
const EXPECTED_STAGE_COUNTS: Record<string, number> = {
  个人轻量流: 3,
  'Spec 驱动流': 7,
  复盘流: 4,
}
/**
 * 只读覆盖口（T8g）：SCRIPT-SEED-01/02 要在临时副本上制造「删 5 条词条」「改一个阶段名」的负向样本，
 * 不能改仓库里的真种子。此处只读取，脚本全程不写 SEED_DIR。
 */
const SEED_DIR =
  process.env['OPENVIBE_SEED_DIR'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'seed')

const errors: string[] = []
const notes: string[] = []
const fail = (file: string, where: string, why: string): void => {
  errors.push(`${file} · ${where} — ${why}`)
}

function readBundle(file: string): Record<string, unknown> {
  const raw = readFileSync(join(SEED_DIR, file), 'utf8')
  const parsed = JSON.parse(raw) as unknown
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${file} 顶层不是对象`)
  }
  const envelope = parsed as Record<string, unknown>
  if (envelope['schemaVersion'] !== 1) {
    fail(file, '包络', `schemaVersion 期望 1，收到 ${String(envelope['schemaVersion'])}`)
  }
  if (!Array.isArray(envelope['items'])) fail(file, '包络', 'items 不是数组')
  return envelope
}

/** 一次读盘取条目；包络缺失或非数组时返回空（错误已由 readBundle 记入） */
function itemsOf(file: string): unknown[] {
  const items = readBundle(file)['items']
  return Array.isArray(items) ? items : []
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const stringArray = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((v) => typeof v === 'string') ? (value as string[]) : null

const noSpace = (value: string): string => value.replaceAll(/\s/g, '')

/** 表格单元内的裸 `|` 计数（`\|` 视为已转义） */
function countBarePipes(line: string): number {
  let count = 0
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] !== '|') continue
    let backslashes = 0
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j -= 1) backslashes += 1
    if (backslashes % 2 === 0) count += 1
  }
  return count
}

function checkTerms(): void {
  const file = 'terms.json'
  const items = itemsOf(file)
  if (items.length < THRESHOLDS.termsMin) {
    fail(file, '数量', `${items.length} 条 < 门槛 ${THRESHOLDS.termsMin} 条`)
  }

  const presentZh = new Set<string>()
  const naturalKeys = new Set<string>()
  const tagsVocab = new Set<string>(CONTROLLED_TAG_VOCAB)
  let withExample = 0

  items.forEach((raw, index) => {
    const where = `#${index + 1}`
    const item = asRecord(raw)
    if (!item) {
      fail(file, where, '条目不是对象')
      return
    }
    for (const key of Object.keys(item)) {
      if (!(TERM_ALLOWED_KEYS as readonly string[]).includes(key)) {
        fail(file, where, `种子文件不允许字段 ${key}（id/source/status 由导入器写入）`)
      }
    }
    const zh = typeof item['zh'] === 'string' ? item['zh'] : ''
    const en = typeof item['en'] === 'string' ? item['en'] : ''
    const aliases = stringArray(item['aliases']) ?? []
    const definition = typeof item['definition'] === 'string' ? item['definition'] : ''
    const example = typeof item['example'] === 'string' ? item['example'] : ''
    const tags = stringArray(item['tags']) ?? []

    const parsed = TermCreateInput.safeParse({
      zh: zh || undefined,
      en: en || undefined,
      aliases,
      definition,
      example,
      tags,
      source: 'openvibe-seed',
      status: 'active',
    })
    if (!parsed.success) {
      fail(file, `${where} ${zh || en}`, parsed.error.issues[0]?.message ?? 'schema 不通过')
    }
    if (!zh && !en) fail(file, where, 'zh 与 en 全空')
    if (noSpace(definition).length < 20) {
      fail(file, `${where} ${zh || en}`, `definition 去空白仅 ${String(noSpace(definition).length)} 字，门槛 20`)
    }
    if (aliases.length === 0) fail(file, `${where} ${zh || en}`, 'aliases 为空（缩写/误写覆盖门槛）')
    if (tags.length === 0 || tags.length > 2) {
      fail(file, `${where} ${zh || en}`, `tags 需 1-2 个，收到 ${tags.length}`)
    }
    for (const tag of tags) {
      if (!tagsVocab.has(tag)) fail(file, `${where} ${zh || en}`, `标签不在受控词表: ${tag}`)
    }
    if (definition.includes('\\|')) {
      fail(file, `${where} ${zh || en}`, 'definition 预转义了 \\|，渲染会二次转义（应存裸 |，由渲染处转义）')
    }
    if (example !== '') withExample += 1

    presentZh.add(zh)
    const naturalKey = `${zh}\u0000${en}`
    if (naturalKeys.has(naturalKey)) {
      fail(file, `${where} ${zh || en}`, '自然键 (zh,en) 重复，种子升级会互相覆盖')
    }
    naturalKeys.add(naturalKey)
  })

  for (const baseline of BASELINE_TERMS) {
    if (!presentZh.has(baseline)) fail(file, '基线', `缺 PRD 附录 B 词条「${baseline}」`)
  }
  const coverage = items.length === 0 ? 0 : withExample / items.length
  if (coverage < 0.6) {
    fail(file, '质量', `带 example 的条目 ${(coverage * 100).toFixed(0)}% < 60% 门槛`)
  } else {
    notes.push(`example 覆盖 ${(coverage * 100).toFixed(0)}%`)
  }

  const rows = items.flatMap((raw) => {
    const item = asRecord(raw)
    return item
      ? [
          {
            zh: typeof item['zh'] === 'string' ? item['zh'] : '',
            en: typeof item['en'] === 'string' ? item['en'] : '',
            aliases: stringArray(item['aliases']) ?? [],
            definition: typeof item['definition'] === 'string' ? item['definition'] : '',
          },
        ]
      : []
  })
  // TERMS.md 表格完整性：表头逐字固定 + 每行恰 5 个裸 `|`（六列）。
  // 种子存裸 `|`、渲染处转义一次，因此出现 6 个及以上说明有预转义或断列。
  const lines = renderTermsMdTable('选集', rows).split('\n')
  if (lines[4] !== TERMS_MD_HEADER || lines[5] !== TERMS_MD_DIVIDER) {
    fail(file, '渲染', 'TERMS.md 表头与 shared 契约不一致')
  }
  const dataLines = lines.slice(6, 6 + rows.length)
  dataLines.forEach((line, index) => {
    const bare = countBarePipes(line)
    if (bare !== 5) {
      fail(file, `渲染 #${index + 1}`, `表格列数错位（裸 | 计 ${String(bare)}，期望 5）`)
    }
  })
  notes.push(`TERMS.md 渲染 ${rows.length} 行，表头/列数一致`)
}

function checkTemplates(): void {
  const file = 'flow-templates.json'
  const items = itemsOf(file)
  if (items.length !== THRESHOLDS.templatesExact) {
    fail(file, '数量', `${items.length} 套 ≠ ${THRESHOLDS.templatesExact} 套`)
  }
  const names = items.map((raw) => (asRecord(raw)?.['name'] ?? '')) as string[]
  for (const expected of Object.keys(FLOW_TEMPLATE_STAGES)) {
    if (!names.includes(expected)) fail(file, '基线', `缺模板「${expected}」`)
  }
  const stageCounts = new Map<string, number>()
  items.forEach((raw, index) => {
    const item = asRecord(raw)
    const name = typeof item?.['name'] === 'string' ? item['name'] : `#${index + 1}`
    const parsed = FlowTemplateCreateInput.safeParse(item)
    if (!parsed.success) {
      fail(file, name, parsed.error.issues[0]?.message ?? 'schema 不通过')
      return
    }
    const expected = FLOW_TEMPLATE_STAGES[name]
    if (!expected) {
      fail(file, name, '模板名不在 seed-content §3.3 冻结清单内')
      return
    }
    const actual = parsed.data.stages.map((s) => s.name)
    if (actual.join('\u0001') !== expected.join('\u0001')) {
      fail(file, name, `阶段名需逐字一致，收到 ${actual.join(' / ')}`)
    }
    const ids = parsed.data.stages.flatMap((s) => s.checklist.map((c) => c.id))
    if (new Set(ids).size !== ids.length) fail(file, name, '检查项 id 重复')
    if (parsed.data.stages.some((s) => s.checklist.length === 0)) {
      fail(file, name, '存在无检查项的阶段')
    }
    stageCounts.set(name, parsed.data.stages.length)
  })
  for (const [name, minCount] of Object.entries(EXPECTED_STAGE_COUNTS)) {
    const got = stageCounts.get(name)
    if (got !== minCount) fail(file, name, `阶段数期望 ${String(minCount)}，收到 ${String(got)}`)
  }
  notes.push(
    `模板阶段数 ${Object.keys(EXPECTED_STAGE_COUNTS)
      .map((n) => `${n}=${String(stageCounts.get(n) ?? 0)}`)
      .join(' / ')}`,
  )
}

function checkPrompts(): void {
  const file = 'prompts.json'
  const items = itemsOf(file)
  if (items.length !== THRESHOLDS.promptsExact) {
    fail(file, '数量', `${items.length} 条 ≠ seed-content §2 的 ${THRESHOLDS.promptsExact} 条精选`)
  }

  const titles = new Set<string>()
  let ruleCount = 0
  let withVariables = 0
  const markCounts = new Map<string, number>(COUNTED_PLATFORM_MARKS.map((m) => [m, 0]))

  items.forEach((raw, index) => {
    const item = asRecord(raw)
    const where = `#${index + 1}`
    const parsed = PromptCreateInput.safeParse({ ...(item ?? {}), status: 'active' })
    if (!parsed.success) {
      fail(file, where, parsed.error.issues[0]?.message ?? 'schema 不通过')
      return
    }
    const p = parsed.data
    const label = p.title

    if (titles.has(p.title)) fail(file, where, `title「${p.title}」重复（种子按 title 匹配升级）`)
    titles.add(p.title)

    const bytes = utf8ByteLength(p.content)
    if (bytes > THRESHOLDS.promptContentMaxBytes) {
      fail(file, `${where} ${label}`, `content ${bytes}B > §3.4 单条 ${THRESHOLDS.promptContentMaxBytes}B`)
    }

    const vars = new Set<string>()
    for (const match of p.content.matchAll(VARIABLE_PATTERN)) {
      if (match[1]) vars.add(match[1])
    }
    if (vars.size > 0) withVariables += 1
    if (p.useAs === 'rule') {
      ruleCount += 1
      if (vars.size > 0) {
        fail(file, `${where} ${label}`, `rule 类含未填充变量 {{${[...vars][0]}}}（m1 FR-2.4 注入后不会填充）`)
      }
    }

    if (p.folderPath !== SEED_PROMPT_FOLDER) {
      fail(file, `${where} ${label}`, `folderPath 需为 ${SEED_PROMPT_FOLDER}（§6.3），收到 ${p.folderPath}`)
    }
    if (!p.tags.includes(SEED_PROMPT_TAG)) {
      fail(file, `${where} ${label}`, `tags 需含「${SEED_PROMPT_TAG}」（§6.3）`)
    }
    for (const mark of p.platformMarks) {
      const hit = markCounts.get(mark)
      if (hit !== undefined) markCounts.set(mark, hit + 1)
    }
  })

  if (ruleCount < THRESHOLDS.ruleMin) {
    fail(file, '构成', `useAs=rule ${ruleCount} 条 < §3.4 门槛 ${THRESHOLDS.ruleMin} 条`)
  }
  for (const mark of COUNTED_PLATFORM_MARKS) {
    const got = markCounts.get(mark) ?? 0
    if (got < THRESHOLDS.platformMarkMin) {
      fail(file, '构成', `平台标记 ${mark} ${got} 条 < §3.4 门槛 ${THRESHOLDS.platformMarkMin} 条`)
    }
  }
  if (withVariables < THRESHOLDS.withVariablesMin) {
    fail(file, '构成', `含 {{变量}} 的条目 ${withVariables} 条 < §3.4 门槛 ${THRESHOLDS.withVariablesMin} 条`)
  }
  notes.push(
    `prompts ${titles.size} 条唯一 title / rule=${ruleCount} / 含变量=${withVariables} / ` +
      COUNTED_PLATFORM_MARKS.map((m) => `${m}=${String(markCounts.get(m) ?? 0)}`).join(' '),
  )
}

function main(): void {
  try {
    checkTerms()
    checkTemplates()
    checkPrompts()
  } catch (err) {
    errors.push(`读取/解析失败: ${String(err)}`)
  }

  if (errors.length > 0) {
    console.error(`[seed:check] 未通过（${errors.length} 项）`)
    for (const line of errors) console.error(`  ✗ ${line}`)
    process.exit(1)
  }
  console.log(
    `[seed:check] 通过 — terms ≥${THRESHOLDS.termsMin} / templates=${THRESHOLDS.templatesExact} / prompts=${THRESHOLDS.promptsExact}`,
  )
  for (const note of notes) console.log(`  · ${note}`)
}

main()
