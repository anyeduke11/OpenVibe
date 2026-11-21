// Characterization only: exit 0 means the documented observations reproduced, not safety.
// Run from repository root: TSX_DISABLE_CACHE=1 pnpm exec tsx docs/devlog-evidence/v025-framework-20261029/framework-probes.mts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADAPTER_IDS,
  ADAPTER_IDS_P1,
  PACK_FILE_PLAYBOOKS,
  PackManifestSchema,
  compareCodeUnit,
  type AdapterId,
  type PackSelection,
  type PlannedFile,
  type ResolvedPack,
} from '@openvibe/shared'
import { openDatabase, type SqliteDatabase } from '../../../packages/core/src/db/index.ts'
import { composePack, type RenderedPack } from '../../../packages/core/src/pack/composer.ts'
import { estimateBundle, estimateTokens } from '../../../packages/core/src/pack/size.ts'
import { resolvePack } from '../../../packages/core/src/pack/resolve.ts'
import { FlowTemplatesRepo } from '../../../packages/core/src/repos/flows.ts'
import { PlaybooksRepo } from '../../../packages/core/src/repos/playbooks.ts'
import { ProjectsRepo } from '../../../packages/core/src/repos/projects.ts'
import { PromptsRepo } from '../../../packages/core/src/repos/prompts.ts'
import { SkillsRepo } from '../../../packages/core/src/repos/skills.ts'
import { TermsRepo } from '../../../packages/core/src/repos/terms.ts'
import {
  ADAPTER_MAIN_PATH,
  coveredPlatforms,
  l1Capability,
  planMainFiles,
} from '../../../packages/adapters/src/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = realpathSync(join(HERE, '..', '..', '..'))
const FIXED_STAMP = '2026-10-29T00:00:00.000Z'
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

// ---- 外部依赖哨兵：本脚本一律不允许出网或读 Keychain ----
let fetchAttempts = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async () => {
  fetchAttempts += 1
  throw new Error('fetch_forbidden')
}) as typeof fetch

const scratchRoot = mkdtempSync(join(tmpdir(), 'ov-v025-'))
const removedDirs: string[] = []

function scratch(label: string) {
  const dir = mkdtempSync(join(scratchRoot, `${label}-`))
  return dir
}

/** 只读源码扫描：返回命中指定正则的文件（相对仓库根路径），排除测试与构建产物 */
function scanSources(rootRel: string, pattern: RegExp) {
  const rootAbs = join(ROOT, rootRel)
  const hits: string[] = []
  let files = 0
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' || entry === 'coverage')
        continue
      const abs = join(dir, entry)
      if (statSync(abs).isDirectory()) {
        walk(abs)
        continue
      }
      if (!['.ts', '.tsx', '.mts'].includes(extname(entry))) continue
      if (/\.test\.[cm]?tsx?$/u.test(entry)) continue
      files += 1
      if (pattern.test(readFileSync(abs, 'utf8'))) hits.push(relative(ROOT, abs))
    }
  }
  if (statSync(rootAbs).isDirectory()) walk(rootAbs)
  return { files, hits }
}

function tableInfo(db: SqliteDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
}

function tableNames(db: SqliteDatabase): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {
      name: string
    }[]
  ).map((r) => r.name)
}

type Check = (name: string, actual: unknown, expected: unknown) => void
// 词表沿用 v024 的 boundary-probes.mts。此处的 'observed_defect' 读作
// 「文档化的观察已复现」（断言全绿），不代表被 probe 的对象是产品缺陷（A/E/H 是结构与度量刻画）。
type Classification = 'not_completed' | 'observed_defect' | 'characterization_failed'
type Probe = {
  id: string
  question: string
  independent_variables: Record<string, unknown>
  inference_boundary: string
  observations: Record<string, unknown>
  assertions: { name: string; actual: unknown; expected: unknown; passed: boolean }[]
  classification: Classification
}
const probes: Probe[] = []

async function probe(
  id: string,
  question: string,
  variables: Record<string, unknown>,
  boundary: string,
  body: (o: Record<string, unknown>, check: Check) => Promise<void> | void,
): Promise<void> {
  const observations: Record<string, unknown> = {}
  const assertions: Probe['assertions'] = []
  const check: Check = (name, actual, expected) => {
    let passed = true
    try {
      assert.deepEqual(actual, expected)
    } catch {
      passed = false
    }
    assertions.push({ name, actual, expected, passed })
  }
  try {
    await body(observations, check)
  } catch (error) {
    const e = error as Error
    observations.fatal = `${e.name}: ${e.message}`
    assertions.push({ name: 'no_fatal', actual: 'thrown', expected: 'none', passed: false })
  }
  const done = assertions.length > 0 && assertions.every((a) => a.passed)
  probes.push({
    id,
    question,
    independent_variables: variables,
    inference_boundary: boundary,
    observations,
    assertions,
    classification: done ? 'observed_defect' : 'characterization_failed',
  })
}

/** 用一组既有 prompt id 组包并渲染（同一 selection 可反复渲染，用于「只改正文」的对照） */
function composeRulePack(db: SqliteDatabase, ids: string[]): RenderedPack {
  const definition = {
    id: 'pk_probe',
    name: 'probe-pack',
    description: '',
    targets: [...ADAPTER_IDS] as AdapterId[],
  }
  const selection: PackSelection = {
    promptIds: ids,
    termIds: [],
    skillIds: [],
    playbookIds: [],
    flowTemplateId: null,
  }
  const resolved: ResolvedPack = resolvePack(definition, selection, '1.0.0', {
    prompts: new PromptsRepo(db),
    terms: new TermsRepo(db),
    skills: new SkillsRepo(db),
    playbooks: new PlaybooksRepo(db),
    flows: new FlowTemplatesRepo(db),
  })
  return composePack(resolved, {
    adapters: { planMainFiles, coveredPlatforms, l1Capability },
    exportedAt: FIXED_STAMP,
  })
}

/** 造一条只含 N 条规则的包；返回渲染产物与本次新建的 prompt id */
function renderRulePack(db: SqliteDatabase, ruleCount: number) {
  const prompts = new PromptsRepo(db)
  const ids: string[] = []
  for (let index = 0; index < ruleCount; index += 1) {
    const body = `规则 ${index}：${'约定内容按项目实际执行，不得绕过既有实现。'.repeat(6)}`
    ids.push(prompts.create({ title: `rule-${index}`, content: body, useAs: 'rule' }).prompt.id)
  }
  return { rendered: composeRulePack(db, ids), ids }
}

// ============================================================
// A · 全量内联 vs 索引+引用：主文件的膨胀曲线
// ============================================================
await probe(
  'A_context_inline_vs_index',
  '规则条数增长时，IDE 每次必读的主文件如何变化？把规则改成「主文档索引 + 引用层文件」能省下多少必读字节？',
  { ruleCounts: [8, 32, 128], selfVariable: '主文档是否内联规则全文' },
  '对照臂（索引+引用）是**设计模拟**，由本脚本按 composer 的既有引用行样式渲染，不是产品已实现的产物形态；因此它证明的是「可省多少」，不证明「改了就没问题」。token 数为产品自带估算函数。',
  async (o, check) => {
    const dir = scratch('A')
    const db = openDatabase(join(dir, 'a.sqlite'))
    const arms: { n: number; inlineMain: number; inlineTotal: number; indexMain: number }[] = []
    let at128: { main: string; all: string[] } | null = null
    for (const n of [8, 32, 128]) {
      const { rendered, ids } = renderRulePack(db, n)
      const mainPath = ADAPTER_MAIN_PATH['claude-code']
      const mainFile = rendered.files.find((f) => f.path === mainPath)
      assert.ok(mainFile, '主文件必须存在')
      const inlineMainBytes = Buffer.byteLength(mainFile.content, 'utf8')
      const inlineTotalBytes = rendered.files.reduce(
        (sum, f) => sum + Buffer.byteLength(f.content, 'utf8'),
        0,
      )
      // 模拟臂：主文档该节只留一行引用，规则全文进 RULES.md（沿用 TERMS.md 的既有样式）。
      // 拼装律与 composer 同源：同一批 prompt、同一个排序键，因此下面的 replace 命中即证明模拟忠实。
      const bodies: string[] = []
      const promptsRepo = new PromptsRepo(db)
      for (const id of ids) {
        const prompt = promptsRepo.get(id)
        assert.ok(prompt, `提示词必须存在：${id}`)
        if (prompt.useAs === 'rule')
          bodies.push(`#### ${prompt.title}\n${prompt.content.trimEnd()}`)
      }
      bodies.sort((a, b) => compareCodeUnit(a, b))
      const inlineRuleSection = bodies.join('\n\n')
      check(
        `A${n}_模拟臂与产物字节同源（规则块可定位）`,
        mainFile.content.includes(inlineRuleSection),
        true,
      )
      const indexMain = mainFile.content.replace(
        inlineRuleSection,
        `见 RULES.md（${bodies.length} 条）`,
      )
      check(`A${n}_主文档可被索引化改写`, indexMain !== mainFile.content, true)
      arms.push({
        n,
        inlineMain: inlineMainBytes,
        inlineTotal: inlineTotalBytes,
        indexMain: Buffer.byteLength(indexMain, 'utf8'),
      })
      if (n === 128) at128 = { main: mainFile.content, all: rendered.files.map((f) => f.content) }
    }
    o.arms = arms
    o.mainTokens_at128 = estimateTokens(at128!.main).approxTokens
    o.bundleTokens_at128 = estimateBundle(at128!.all)
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)

    const nondecreasing = arms.every((a, i) => i === 0 || arms[i - 1].inlineMain <= a.inlineMain)
    check('A_主文档字节随规则数单调增', nondecreasing, true)
    check(
      'A_索引臂主文档字节与规则数无关（近常数）',
      arms.every((a) => a.indexMain < 1200),
      true,
    )
    check('A_128 条时索引臂必读体积远小于内联臂', arms[2].indexMain < arms[2].inlineMain / 4, true)
    check(
      'A_全量内联从 8 条到 128 条放大超过 10 倍',
      arms[2].inlineMain / arms[0].inlineMain > 10,
      true,
    )
  },
)

// ============================================================
// B · 交付阶段有没有闸：spec_driven 模板能否被空清单直接跳到「实现」
// ============================================================
await probe(
  'B_stage_gate',
  '用仓库自带的「Spec 驱动流」模板建项目，前置阶段清单零完成时能否直接推进到「实现」乃至「复盘」？',
  { template: 'Spec 驱动流', selfVariable: 'check_states 是否为空' },
  '测的是仓储层的阶段推进判定（路由只做参数校验后转调它）。不测前端是否另有遮挡，也不测团队实际流程习惯。',
  async (o, check) => {
    const dir = scratch('B')
    const db = openDatabase(join(dir, 'b.sqlite'))
    const seed = JSON.parse(
      readFileSync(join(ROOT, 'content/seed/flow-templates.json'), 'utf8'),
    ) as {
      items?: { name: string; kind: string; stages: unknown }[]
    }
    const raw = (seed.items ?? (seed as unknown as { name: string }[])) as {
      name: string
      kind: string
      stages: { name: string; checklist: { id: string; text: string }[] }[]
    }[]
    const specFlow = raw.find((t) => t.kind === 'spec_driven' && t.name === 'Spec 驱动流')
    assert.ok(specFlow, '种子模板里应存在 Spec 驱动流')
    const flow = new FlowTemplatesRepo(db).create({
      name: specFlow.name,
      // 走仓储的合法枚举，种子里的 kind 字面量与之同值
      kind: 'spec_driven',
      stages: specFlow.stages as never,
    })
    const projects = new ProjectsRepo(db)
    const project = projects.create({ name: '闸探针项目', flowTemplateId: flow.id })
    const stageNames = project.stagesSnapshot.map((s) => s.name)
    const totalItems = specFlow.stages.reduce((sum, s) => sum + s.checklist.length, 0)
    o.templateStages = stageNames
    o.checklistItemsTotal = totalItems

    const jumpToImpl = (() => {
      try {
        projects.switchStage(project.id, '实现')
        return { ok: true, stage: projects.get(project.id)!.currentStage }
      } catch (error) {
        return { ok: false, error: (error as Error).name }
      }
    })()
    const jumpToLast = (() => {
      try {
        projects.switchStage(project.id, '复盘')
        return { ok: true, stage: projects.get(project.id)!.currentStage }
      } catch (error) {
        return { ok: false, error: (error as Error).name }
      }
    })()
    const jumpBackward = (() => {
      try {
        projects.switchStage(project.id, '需求澄清')
        return { ok: true, stage: projects.get(project.id)!.currentStage }
      } catch (error) {
        return { ok: false, error: error.name }
      }
    })()
    o.jumpToImpl = jumpToImpl
    o.jumpToLast = jumpToLast
    o.jumpBackward = jumpBackward
    o.checkStatesAfter = projects.listCheckStates(project.id).length
    o.health = projects.healthSummary(project.id)

    check('B_清单零完成可直跳实现', jumpToImpl, { ok: true, stage: '实现' })
    check('B_可继续直跳末段复盘', jumpToLast, { ok: true, stage: '复盘' })
    check('B_可任意回跳需求澄清', jumpBackward, { ok: true, stage: '需求澄清' })
    check('B_推进过程不写任何勾选', o.checkStatesAfter, 0)

    const bogus = (() => {
      try {
        projects.switchStage(project.id, '不存在的阶段')
        return { ok: true }
      } catch (error) {
        return { ok: false, error: (error as Error & { code?: string }).code }
      }
    })()
    o.onlyGate = bogus
    check('B_唯一存在的校验是阶段名在快照内', bogus, { ok: false, error: 'VALIDATION_ERROR' })
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
// C · 规格↔任务追溯：断链在哪、禁区是什么、加表是否可行
// ============================================================
await probe(
  'C_spec_trace',
  '需求（requirements）与任务（tasks）之间能否建立追溯？禁区条款具体禁的是什么？新增关联表是否触碰它？',
  { selfVariable: '关联方式（同表外键列 vs 新增关联表）' },
  '证明的是 schema 层能力与既有 owner 裁定的边界，不证明加表后业务上一定会用；也不测历史数据回填。',
  async (o, check) => {
    const dir = scratch('C')
    const db = openDatabase(join(dir, 'c.sqlite'))
    o.tasksColumns = tableInfo(db, 'tasks')
    o.requirementsColumns = tableInfo(db, 'requirements')
    o.tablesMatchingRequirement = tableNames(db).filter((n) => n.includes('requirement'))
    const migration = readFileSync(
      join(ROOT, 'packages/core/src/db/migrations/0007_local_events_and_agent_bridge.sql'),
      'utf8',
    )
    const lines = migration.split('\n')
    o.bannedLine = lines.findIndex((l) => l.includes('禁区')) + 1
    o.bannedText = lines[o.bannedLine - 1]?.trim() ?? null

    check('C_tasks 表没有 requirement 外键列', o.tasksColumns.includes('requirement_id'), false)
    check('C_除 requirements 外没有关联表', o.tablesMatchingRequirement, ['requirements'])
    check(
      'C_requirements 无评审/验收结构字段',
      ['accepted_at', 'reviewed_by', 'acceptance', 'spec_body', 'verified_at'].filter((c) =>
        (o.requirementsColumns as string[]).includes(c),
      ),
      [],
    )
    check('C_禁区原文可定位', o.bannedLine > 0, true)

    // 加表路线：不改既有表列，因此与禁区不冲突
    const additive = (() => {
      try {
        db.exec(
          `CREATE TABLE requirement_links (
             id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, task_id TEXT NOT NULL,
             created_at TEXT NOT NULL)`,
        )
        return { ok: true }
      } catch (error) {
        return { ok: false, error: (error as Error).name }
      }
    })()
    o.additiveLinkTable = additive
    check('C_新增关联表可行（禁区只挡就地扩列）', additive, { ok: true })
    check('C_加表后 tasks 列未变', tableInfo(db, 'tasks'), o.tasksColumns)
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
// D · requirements 是不是半接线对象
// ============================================================
await probe(
  'D_requirements_wiring',
  '需求对象有哪些入口、缺哪些环节？（写入方 / HTTP 面 / UI 面 / 状态推进）',
  { selfVariable: '扫描目录（服务端路由层、Web、core 仓储层、CLI）' },
  '静态断言：命中数为「该目录下读过的文件里含该词的文件数」，为 0 即该层无引用。不证明运行时一定无需求（agent 通道可直接写库），也不证明加 UI 就够用。',
  async (_o, check) => {
    const server = scanSources('apps/server/src', /requirement/i)
    const web = scanSources('apps/web/src', /requirement/i)
    const coreRepos = scanSources('packages/core/src/repos', /requirement/i)
    const coreServices = scanSources('packages/core/src/services', /requirement/i)
    const cli = scanSources('apps/cli/src', /requirement/i)
    const writes = scanSources('packages/core/src', /INSERT INTO requirements/u)
    _o.scan = { server, web, coreRepos, coreServices, cli, writes }
    check('D_服务端路由层零引用（无 HTTP 面）', server.files > 0 && server.hits.length, 0)
    check('D_Web 零引用（无 UI 面）', web.files > 0 && web.hits.length, 0)
    check(
      'D_core 仓储层零引用（无 RequirementsRepo）',
      coreRepos.files > 0 && coreRepos.hits.length,
      0,
    )
    check('D_写入只发生在服务层的裸 SQL', writes.hits, [
      'packages/core/src/services/agentService.ts',
    ])
    check('D_CLI 有入口', cli.hits.length > 0, true)
  },
)

// ============================================================
// E · 资产↔代码新鲜度：数据形状存不存在
// ============================================================
await probe(
  'E_asset_code_freshness',
  '现有 schema 能否回答「这条资产描述的代码变了」？注入侧与库内侧分别能测到什么？',
  { selfVariable: '变更位置（注入文件 / 资产正文 / 项目源码）' },
  '测的是数据模型是否有锚点列，属结构性证据。不测「加锚点后新鲜度判断有多准」——那需要真实项目与真实改动样本。',
  async (o, check) => {
    const dir = scratch('E')
    const db = openDatabase(join(dir, 'e.sqlite'))
    const assetTables = ['prompts', 'terms', 'playbooks', 'skills']
    const anchorShape =
      /^(file|file_path|file_rel_path|rel_path|path|anchor|code_path|source_file)$/u
    const assetFkShape = /^(prompt_id|term_id|skill_id|playbook_id|asset_id|asset_type)$/u
    o.assetAnchorColumns = assetTables.map((t) => ({
      table: t,
      columns: tableInfo(db, t),
      anchored: tableInfo(db, t).filter((c) => anchorShape.test(c)),
    }))
    // 全库找「同时带 project_id 与某条路径列」的表，再看它挂的是资产外键还是注入文件
    o.anchorTables = tableNames(db)
      .filter((t) => !t.startsWith('sqlite_'))
      .filter((t) => {
        const cols = tableInfo(db, t)
        return cols.includes('project_id') && cols.some((c) => anchorShape.test(c))
      })
      .map((t) => {
        const cols = tableInfo(db, t)
        return {
          table: t,
          pathCols: cols.filter((c) => anchorShape.test(c)),
          assetFks: cols.filter((c) => assetFkShape.test(c)),
        }
      })
    o.langFindingsColumns = tableInfo(db, 'lang_topic_findings')

    // 资产正文变更 ⇒ 包指纹变更（同一 selection、同一 ids，只改正文；变量只有正文）
    const created = renderRulePack(db, 2)
    o.fingerprintBefore = created.rendered.fingerprint.slice(0, 12)
    const prompts = new PromptsRepo(db)
    prompts.update(created.ids[0], { content: '改过的规则正文，与原文完全不同。' })
    o.fingerprintAfter = composeRulePack(db, created.ids).fingerprint.slice(0, 12)
    mkdirSync(join(dir, 'src'), { recursive: true })
    const projectSrc = join(dir, 'src', 'entry.ts')
    writeFileSync(projectSrc, 'export const changed = 1\n')
    o.sourceFileWritten = relative(dir, projectSrc)

    check(
      'E_资产表一律没有代码锚点列',
      o.assetAnchorColumns.map((a: { table: string; anchored: string[] }) => a.anchored),
      [[], [], [], []],
    )
    check(
      'E_带「项目+路径」列的表没有一张同时挂资产外键',
      o.anchorTables.every((t: { assetFks: string[] }) => (t.assetFks as string[]).length === 0),
      true,
    )
    check(
      'E_锚点数据形态在库内已有先例（lang_topic_findings 带 file_rel_path + line）',
      [o.langFindingsColumns.includes('file_rel_path'), o.langFindingsColumns.includes('line')],
      [true, true],
    )
    check('E_资产正文变更会让包指纹变化', o.fingerprintBefore !== o.fingerprintAfter, true)
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
// F · 扩展能力是否保留：加第 7 个 adapter 会不会扰动既有产物
// ============================================================
await probe(
  'F_adapter_extension',
  '新增一个 IDE 适配时，既有六个平台的产物字节是否不变？唯一的收口点在哪？',
  { selfVariable: 'AdapterBundle 是否多返回一个主文件' },
  '合成 adapter 只活在脚本内（不落 registry），证明的是渲染层的可加性与冻结枚举的挡位；不证明真实第 7 平台适配质量。',
  async (o, check) => {
    const dir = scratch('F')
    const db = openDatabase(join(dir, 'f.sqlite'))
    const coreImportsAdapters = scanSources('packages/core/src', /@openvibe\/adapters/u)
    o.coreImportHits = coreImportsAdapters.hits
    o.adapterIds = [...ADAPTER_IDS]
    o.reservedP1 = [...ADAPTER_IDS_P1]

    const base = renderRulePack(db, 4).rendered
    const extraBundle = {
      planMainFiles: (pack: ResolvedPack): PlannedFile[] => [
        ...planMainFiles(pack),
        { path: 'NEWIDE.md' },
      ],
      coveredPlatforms: (targets: AdapterId[]) => coveredPlatforms(targets),
      l1Capability: (id: AdapterId) => l1Capability(id),
    }
    const definition = {
      id: 'pk_probe',
      name: 'probe-pack',
      description: '',
      targets: [...ADAPTER_IDS] as AdapterId[],
    }
    const selection: PackSelection = {
      promptIds: [],
      termIds: [],
      skillIds: [],
      playbookIds: [],
      flowTemplateId: null,
    }
    void definition
    void selection
    const resolved = resolvePack(
      definition,
      { ...selection, promptIds: renderRulePack(db, 4).ids },
      '1.0.0',
      {
        prompts: new PromptsRepo(db),
        terms: new TermsRepo(db),
        skills: new SkillsRepo(db),
        playbooks: new PlaybooksRepo(db),
        flows: new FlowTemplatesRepo(db),
      },
    )
    const withExtra = composePack(resolved, { adapters: extraBundle, exportedAt: FIXED_STAMP })

    const six = (files: { path: string; sha256: string }[]) =>
      Object.fromEntries(files.filter((f) => f.path !== 'NEWIDE.md').map((f) => [f.path, f.sha256]))
    o.sixPathsBase = Object.keys(six(base.files)).sort()
    o.sixPathsExtra = Object.keys(six(withExtra.files)).sort()
    o.extraPathAdded = withExtra.files.some((f) => f.path === 'NEWIDE.md')
    o.fingerprintChanged = base.fingerprint !== withExtra.fingerprint

    const manifestLike = PackManifestSchema.safeParse({
      ...withExtra.manifest,
      targets: [...ADAPTER_IDS, 'new-ide'],
    })
    o.unknownAdapterRejected = !manifestLike.success
    o.unknownAdapterIssue = manifestLike.success ? null : manifestLike.error.issues[0]?.code

    check('F_core 不 import adapters（R2 成立）', coreImportsAdapters.hits, [])
    check('F_既有六平台产物字节完全不变', six(withExtra.files), six(base.files))
    check('F_新路径只是追加，不改六者清单', o.extraPathAdded, true)
    check('F_指纹因追加而变（可核验）', o.fingerprintChanged, true)
    check('F_targets 闭集挡住未登记平台（扩展须显式改枚举）', o.unknownAdapterRejected, true)
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
// G · 负向约束的真实通路
// ============================================================
await probe(
  'G_negative_constraint',
  '反例（antiPractice）能否进包？它落在哪一层？AI 回写能不能产出它？',
  { selfVariable: '反例文本是否存在于技巧条目' },
  '测的是渲染落点与字段来源，不测「反例写进包后 AI 是否真的遵守」——那需要真实 IDE 会话样本。',
  async (o, check) => {
    const dir = scratch('G')
    const db = openDatabase(join(dir, 'g.sqlite'))
    const banned = '禁止删邮件后立刻格式化重装并上报已处置'
    const playbook = new PlaybooksRepo(db).create({
      scenario: '邮件类告警处置',
      problem: '无法判断单点还是批量投递',
      practice: '先留证再处置，处置后记录来源与时间窗',
      antiPractice: banned,
      status: 'published',
    })
    const prompts = new PromptsRepo(db)
    const promptId = prompts.create({
      title: 'rule-anchor',
      content: '锚点规则：处置任何告警前先确认证据留存策略。',
      useAs: 'rule',
    }).prompt.id
    const resolved = resolvePack(
      { id: 'pk_g', name: 'g-pack', description: '', targets: ['claude-code'] },
      {
        promptIds: [promptId],
        termIds: [],
        skillIds: [],
        playbookIds: [playbook.id],
        flowTemplateId: null,
      },
      '1.0.0',
      {
        prompts,
        terms: new TermsRepo(db),
        skills: new SkillsRepo(db),
        playbooks: new PlaybooksRepo(db),
        flows: new FlowTemplatesRepo(db),
      },
    )
    const rendered = composePack(resolved, {
      adapters: { planMainFiles, coveredPlatforms, l1Capability },
      exportedAt: FIXED_STAMP,
    })
    const main = rendered.files.find((f) => f.path === ADAPTER_MAIN_PATH['claude-code'])!
    const playbooksMd = rendered.files.find((f) => f.path === PACK_FILE_PLAYBOOKS)!
    o.mainHasPointer = main.content.includes('见 PLAYBOOKS.md（1 条）')
    o.mainCarriesBan = main.content.includes(banned)
    o.secondaryCarriesBan = playbooksMd.content.includes(banned)
    o.secondaryHeader = playbooksMd.content.split('\n')[4] ?? null
    const aiFields = scanSources('packages/core/src/source-ai', /antiPractice/u).hits.concat(
      scanSources('packages/core/src/extract', /antiPractice/u).hits,
    )
    const candidateKinds = readFileSync(
      join(ROOT, 'packages/shared/src/schemas/extract.ts'),
      'utf8',
    ).match(/EXTRACT_CANDIDATE_KINDS = \[[^\]]*\]/u)?.[0]
    o.aiWritesAntiPractice = aiFields
    o.candidateKinds = candidateKinds ?? null

    check('G_主文档只带一行指针', o.mainHasPointer, true)
    check('G_主文档不携带禁止条目本身', o.mainCarriesBan, false)
    check('G_反例落在二级文件表格里', o.secondaryCarriesBan, true)
    check('G_二级文件表头含反例列', o.secondaryHeader?.includes('反例'), true)
    check('G_AI 提取侧无 antiPractice 字段来源', aiFields, [])
    check(
      'G_候选类型里有 playbook（字段需人工补）',
      String(o.candidateKinds).includes('playbook'),
      true,
    )
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
// H · 量化评估的可算上限
// ============================================================
await probe(
  'H_metric_ceiling',
  '文章要的工时/缺陷率/返工率，现有数据面能算出什么、缺什么？',
  { selfVariable: '无（结构清点）' },
  '结构证据：列与 kind 闭集决定「可聚合的下界」。不计算任何真实指标值，也不证明加字段后指标一定可信。',
  async (o, check) => {
    const dir = scratch('H')
    const db = openDatabase(join(dir, 'h.sqlite'))
    const kindsSql = (
      db
        .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='local_events'")
        .get() as {
        sql: string
      }
    ).sql
    const kindsClause = kindsSql.match(/kind IN \(([\s\S]*?)\)/u)?.[1] ?? ''
    // 建表 SQL 里 kind 清单被 SQL 注释分段（台账/M8/M3/M10/M9），先把注释行剔掉再取带引号的枚举值
    const kindsBody = kindsClause
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
    o.localEventKinds = [...kindsBody.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map((m) => m[1])
    o.localEventKindCount = o.localEventKinds.length
    o.localEventColumns = tableInfo(db, 'local_events')
    o.telemetryColumns = tableInfo(db, 'telemetry_events')
    o.adoptionColumns = tableInfo(db, 'adoption_snapshots')
    o.estMinutesTables = tableNames(db).filter((t) => tableInfo(db, t).includes('est_minutes'))
    const numericMetricCols = ['minutes', 'hours', 'defect', 'rework', 'bug', 'effort'].filter(
      (needle) =>
        ['local_events', 'telemetry_events', 'adoption_snapshots', 'tasks', 'dev_log_entries'].some(
          (t) => tableInfo(db, t).some((c) => c.includes(needle)),
        ),
    )
    o.numericMetricColumnsFound = numericMetricCols

    check(
      'H_事件时间序列可聚合（有 created_at 与 project_id）',
      o.localEventColumns.includes('created_at') && o.localEventColumns.includes('project_id'),
      true,
    )
    check(
      'H_阶段与清单事件在 kind 闭集里',
      o.localEventKinds.includes('checklist_item_checked'),
      true,
    )
    check('H_无工时/缺陷/返工数值列', numericMetricCols, [])
    check('H_唯一时长字段只在 M9 画像表（est_minutes）', o.estMinutesTables, [
      'lang_topic_profiles',
    ])
    db.close()
    rmSync(dir, { recursive: true, force: true })
    removedDirs.push(dir)
  },
)

// ============================================================
globalThis.fetch = realFetch
const scriptSource = readFileSync(join(HERE, 'framework-probes.mts'), 'utf8')
const out = {
  generatedAtNote: '固定时钟 2026-10-29T00:00:00.000Z；本文件是现状刻画，不是安全结论',
  environment: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    script_sha256: sha256(scriptSource),
  },
  safety: {
    fetch_attempts: fetchAttempts,
    fetch_restored: globalThis.fetch === realFetch,
    // 出网/Keychain 靠「没有引入相应模块」保证，故直接公布本脚本的 node: 依赖清单
    node_modules_imported: [
      ...new Set([...scriptSource.matchAll(/from '(node:[a-z/]+)'/gu).map((m) => m[1])]),
    ].sort(),
    scratch_dirs: removedDirs.length,
    scratch_root_removed: (() => {
      rmSync(scratchRoot, { recursive: true, force: true })
      return true
    })(),
  },
  probes,
  not_run: [
    '真实 IDE 会话内规则是否被读取（需人工/IDE 侧证据）',
    '反例写进包后 AI 是否真的规避（需真实模型样本）',
    '第 7 个真实平台适配的产物质量（脚本只验可加性与不变性）',
    '阶段闸落地后的返工率变化（闸本身未实现）',
    '真实项目的资产↔代码锚点命中率（需真实仓库样本）',
    '工时/缺陷/返工指标的实际数值（本次只做结构清点）',
  ],
}

const failing = probes.filter((p) => p.classification === 'characterization_failed')
writeFileSync(join(HERE, 'framework-probes.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      probes: probes.map((p) => ({
        id: p.id,
        classification: p.classification,
        assertions: p.assertions.length,
        failed: p.assertions.filter((a) => !a.passed).map((a) => a.name),
      })),
      failing: failing.length,
      json: 'framework-probes.json',
    },
    null,
    2,
  ),
)
process.exitCode = failing.length === 0 ? 0 : 1
