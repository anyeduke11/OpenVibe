import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { compareCodeUnit, type SkillScanReport } from '@openvibe/shared'
import { ServerUnreachable, type ApiClient } from '../client'

/**
 * `openvibe scan`（m6b FR-3 / FR-4）：扫描强依赖服务端 DB（解析、指纹、去重都在服务端），
 * 没有离线分支。CLI 的自主决定只有两处——探测到哪些文件、以什么 filename 上报，
 * 因此这两处是断言重心：filename 用项目内相对路径，换机器或换 cwd 都能重现去重。
 */

export class ScanError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ScanError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface ScanOptions {
  skills?: boolean
  project?: string
  roots?: string[]
}

export interface ScanDeps {
  client?: ApiClient
}

export interface PromptRow {
  title: string
  action: 'created' | 'skipped'
  reason?: string
}

export interface ScanOutcome {
  skills: SkillScanReport | null
  skillsRoots: string[]
  /** 探测到的规则文件（项目内相对路径，正斜杠，码点序） */
  probed: string[]
  prompts: PromptRow[]
  warnings: string[]
  hints: string[]
}

/** 服务端 importBatch 的 created 装的是新建项 id，只有长度是契约；逐条结论由探测集反推 */
interface ImportReport {
  created: string[]
  skipped: { title: string; reason: string }[]
}

const SKILL_SCAN_PATH = '/api/skills/scan'
const PROMPT_IMPORT_PATH = '/api/prompts/import'

/** FR-4.1 的四类探测点：顶层固定名 + `.cursor/rules` 一层内的 .mdc */
const TOP_LEVEL_RULES = ['.cursorrules', 'claude.md', 'agents.md']
const CURSOR_RULES_REL = '.cursor/rules'

function assertProjectDir(projectPath: string): string {
  const abs = resolve(projectPath)
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new ScanError('PROJECT_NOT_DIR', `项目路径不是目录：${abs}`)
  }
  return abs
}

function listDir(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile()
  } catch {
    return false
  }
}

function isDirectory(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

/**
 * 规则文件探测。node_modules / .git 永不进入结果——这里只列顶层与 `.cursor/rules` 一层，
 * 结构上就不递归，`node_modules/pkg/CLAUDE.md` 这类同名文件不可能被扫到。
 */
export function probeRuleFiles(projectPath: string): string[] {
  const entries = listDir(projectPath)
  const found = new Set<string>()
  for (const entry of entries) {
    if (!TOP_LEVEL_RULES.includes(entry.toLowerCase())) continue
    // 名字按磁盘原样上报：title 即 filename，大小写归一只用于匹配
    if (isFile(join(projectPath, entry))) found.add(entry)
  }
  const rulesDir = join(projectPath, CURSOR_RULES_REL)
  if (isDirectory(rulesDir)) {
    for (const entry of listDir(rulesDir)) {
      if (!entry.toLowerCase().endsWith('.mdc')) continue
      if (!isFile(join(rulesDir, entry))) continue
      found.add(`${CURSOR_RULES_REL}/${entry}`)
    }
  }
  return [...found].sort(compareCodeUnit)
}

export function dedupeRoots(roots: readonly string[] | undefined): string[] {
  const out: string[] = []
  for (const raw of roots ?? []) {
    const root = raw.trim()
    if (root && !out.includes(root)) out.push(root)
  }
  return out
}

/** 客户端只暴露两个方法，读文件留在 CLI（服务端不碰本地磁盘） */
function readRuleContents(
  projectPath: string,
  paths: readonly string[],
): { filename: string; content: string }[] {
  return paths.map((path) => {
    const abs = join(projectPath, ...path.split('/'))
    let content: string
    try {
      content = readFileSync(abs, 'utf8')
    } catch (e) {
      throw new ScanError('READ_FAILED', `读取 ${abs} 失败：${(e as Error).message}`)
    }
    return { filename: path, content }
  })
}

function unreachable(e: unknown): never {
  const detail = e instanceof Error ? e.message : String(e)
  throw new ScanError(
    'SERVER_UNREACHABLE',
    `${detail}。扫描没有离线模式，先运行 \`openvibe serve\` 起本地服务（或用 --server 指定地址）`,
  )
}

async function scanSkills(
  client: ApiClient,
  roots: readonly string[],
  out: ScanOutcome,
): Promise<void> {
  let report: SkillScanReport
  try {
    report = await client.postJson<SkillScanReport>(
      SKILL_SCAN_PATH,
      roots.length > 0 ? { roots } : {},
    )
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
  out.skills = report
  out.warnings.push(...report.warnings)
  out.hints.push(
    `skill 扫描：发现 ${report.discovered} 新增 ${report.created} 更新 ${report.updated} 跳过 ${report.skipped}`,
  )
}

async function importRules(
  client: ApiClient,
  projectPath: string,
  out: ScanOutcome,
): Promise<void> {
  const paths = probeRuleFiles(projectPath)
  out.probed = paths
  if (paths.length === 0) {
    out.warnings.push(
      `未发现规则文件（探测 .cursorrules / .cursor/rules/*.mdc / CLAUDE.md / AGENTS.md）：${projectPath}`,
    )
    return
  }
  const files = readRuleContents(projectPath, paths)
  let report: ImportReport
  try {
    report = await client.postJson<ImportReport>(PROMPT_IMPORT_PATH, { files })
  } catch (e) {
    if (e instanceof ServerUnreachable) unreachable(e)
    throw e
  }
  const reasons = new Map(report.skipped.map((s) => [s.title, s.reason]))
  out.prompts = paths.map((path) => {
    const reason = reasons.get(path)
    return reason === undefined
      ? { title: path, action: 'created' as const }
      : { title: path, action: 'skipped' as const, reason }
  })
  const created = out.prompts.filter((p) => p.action === 'created').length
  out.hints.push(`规则文件导入：新增 ${created} 跳过 ${out.prompts.length - created}`)
  if (report.created.length + report.skipped.length !== paths.length) {
    out.warnings.push(
      `服务端回执条数（${report.created.length + report.skipped.length}）与探测到的规则文件数（${paths.length}）不一致，逐条结论按探测清单给出`,
    )
  }
}

export async function scanAction(options: ScanOptions, deps: ScanDeps = {}): Promise<ScanOutcome> {
  const skills = options.skills === true
  const project = options.project
  if (!skills && !project) {
    throw new ScanError(
      'USAGE',
      'openvibe scan 需要 --skills 或 --project <path>（可同时给）。' +
        '用法：openvibe scan --skills [--roots <dir>...] | openvibe scan --project <path>',
    )
  }
  const client = deps.client
  if (!client) {
    throw new ScanError(
      'SERVER_REQUIRED',
      '扫描与导入依赖服务端数据库（解析、指纹、按 title+contentHash 去重），没有离线模式：' +
        '先运行 `openvibe serve`，或用 --server/--token 指定可用的服务端',
    )
  }
  const warnings: string[] = []
  const outcome: ScanOutcome = {
    skills: null,
    skillsRoots: [],
    probed: [],
    prompts: [],
    warnings,
    hints: [],
  }
  if (skills) {
    outcome.skillsRoots = dedupeRoots(options.roots)
    await scanSkills(client, outcome.skillsRoots, outcome)
  }
  if (project) await importRules(client, assertProjectDir(project), outcome)
  return outcome
}
