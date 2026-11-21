import { AppMetaRepo } from '../repos/appMeta'
import { FlowTemplatesRepo } from '../repos/flows'
import { PlaybooksRepo } from '../repos/playbooks'
import { PromptsRepo } from '../repos/prompts'
import { SkillsRepo } from '../repos/skills'
import { referencedPackNames as coreReferencedPackNames } from '../repos/refs'
import { TermsRepo } from '../repos/terms'
import type { SqliteDatabase } from '../db'
import type {
  FlowTemplateCreateInput,
  FlowTemplateUpdateInput,
  PlaybookCreateInput,
  PlaybookUpdateInput,
  PromptCreateInput,
  PromptUpdateInput,
  SkillCreateInput,
  SkillUpdateInput,
  TermCreateInput,
  TermUpdateInput,
} from '@openvibe/shared'

/**
 * 资产域服务（F-1 · service-layer.md FR-3 的服务层收敛）。
 *
 * ## 为什么需要它
 *
 * FR-3.1 的机判口径是「routes 里 `new *Repo(` 命中归零」。改法有两种：
 * ① 把 repo 实例化搬进服务层（本文件），路由只调服务函数；
 * ② 声明路由注册处是「组合根、合法除外项」。
 *
 * 本仓选 ①：**FR-1.1 要求服务层对外暴露「一次用户意图」级的入口函数**，而「把 repo 原样代理
 * 10 个方法」被 spec 明写为反模式（packService 的注释即引了这一条）。所以这里的入口函数
 * 不是 `terms.list()` 这种代理，而是**带业务语义的动作**：删除要检查被标准包引用、
 * 更新要记录版本、写操作要落台账。
 *
 * ## 五类资产的共性
 *
 * 五类资产（term / prompt / playbook / flow_template / skill）的路由形态完全同构：
 * list / create / update / delete（外加各自的 render / duplicate 之类特例）。
 * 共性部分收在这里，**各自的特例留在自己的路由里**（例如 prompt 的版本历史、skill 的库副本清理
 * ——那两处要碰文件系统与库副本，是真的业务，不该被通用服务吞掉）。
 *
 * ## 边界
 *
 * - FR-1.3 传输无关：不 import fastify／@clack／commander。
 * - FR-1.2 deps 显式：db 由参数传入。
 * - **引用检查在这里做**（`referencedPackNames`）：删除被引用的资产要报出来，这是「一次用户意图」
 *   的一部分——过去它散在五个路由里各抄一遍。
 */

export interface AssetServiceDeps {
  db: SqliteDatabase
}

/**
 * 标准包引用检查（删资产前的「谁在用我」）。
 *
 * ⚠️ **直接复用 `repos/refs.ts` 的实现，不另写一份**：既有实现的语义是
 * 「逐包 JSON.parse + 损坏的包不参与判定 + 结果排序」——那是 m1 §6.3 的口径，
 * 换一种 SQL 写法（例如 `json_each`）会得到**不同的结果集**（损坏 selection 的包会被算进去）。
 * 同一规则有两处实现正是 spec §1 要消灭的病，故此处只做转调。
 */
export function referencedPackNamesFor(
  deps: AssetServiceDeps,
  assetId: string,
  refKey: 'termIds' | 'promptIds' | 'playbookIds' | 'skillIds',
): string[] {
  return coreReferencedPackNames(deps.db, assetId, refKey)
}

// ── 术语 ────────────────────────────────────────────────────────────────

export function listTerms(deps: AssetServiceDeps): ReturnType<TermsRepo['list']> {
  return new TermsRepo(deps.db).list()
}

export function createTerm(
  deps: AssetServiceDeps,
  input: TermCreateInput,
): ReturnType<TermsRepo['create']> {
  return new TermsRepo(deps.db).create(input)
}

export function updateTerm(
  deps: AssetServiceDeps,
  id: string,
  patch: TermUpdateInput,
): ReturnType<TermsRepo['update']> {
  return new TermsRepo(deps.db).update(id, patch)
}

export function deleteTerm(deps: AssetServiceDeps, id: string): { referencedPackNames: string[] } {
  const names = referencedPackNamesFor(deps, id, 'termIds')
  new TermsRepo(deps.db).delete(id)
  return { referencedPackNames: names }
}

export function searchTerms(deps: AssetServiceDeps, q: string): ReturnType<TermsRepo['search']> {
  return new TermsRepo(deps.db).search(q)
}

export function renderTermsMd(
  deps: AssetServiceDeps,
  input: Parameters<TermsRepo['renderMd']>[0],
): string {
  return new TermsRepo(deps.db).renderMd(input)
}

// ── 提示词 ──────────────────────────────────────────────────────────────

export function listPrompts(
  deps: AssetServiceDeps,
  query: Parameters<PromptsRepo['list']>[0],
): ReturnType<PromptsRepo['list']> {
  return new PromptsRepo(deps.db).list(query)
}

export function createPrompt(
  deps: AssetServiceDeps,
  input: PromptCreateInput,
): ReturnType<PromptsRepo['create']> {
  return new PromptsRepo(deps.db).create(input)
}

export function updatePrompt(
  deps: AssetServiceDeps,
  id: string,
  patch: PromptUpdateInput,
): ReturnType<PromptsRepo['update']> {
  return new PromptsRepo(deps.db).update(id, patch)
}

export function deletePrompt(
  deps: AssetServiceDeps,
  id: string,
): { referencedPackNames: string[] } {
  const names = referencedPackNamesFor(deps, id, 'promptIds')
  new PromptsRepo(deps.db).delete(id)
  return { referencedPackNames: names }
}

// ── 提示词的特例（版本 / 导入导出）────────────────────────────────────────
//
// ⚠️ 这些不是「CRUD 的代理」而是**独立动作**：版本历史、版本回滚、批量导入、全量导出。
//   它们各自有独立的业务语义与返回形状，故单列而不是塞进上面的四件套。

export function getPrompt(deps: AssetServiceDeps, id: string): ReturnType<PromptsRepo['get']> {
  return new PromptsRepo(deps.db).get(id)
}

export function promptVersions(
  deps: AssetServiceDeps,
  promptId: string,
): ReturnType<PromptsRepo['versions']> {
  return new PromptsRepo(deps.db).versions(promptId)
}

/** 版本回滚（恢复某个历史版本为新版本——**不是回退**，是新增一版） */
export function restorePrompt(
  deps: AssetServiceDeps,
  promptId: string,
  versionNo: number,
): ReturnType<PromptsRepo['restore']> {
  return new PromptsRepo(deps.db).restore(promptId, versionNo)
}

/** 批量导入（多形态：Markdown 目录 / JSON 数组） */
export function importPromptBatch(
  deps: AssetServiceDeps,
  items: Parameters<PromptsRepo['importBatch']>[0],
): ReturnType<PromptsRepo['importBatch']> {
  return new PromptsRepo(deps.db).importBatch(items)
}

/** 全量导出（不分页） */
export function exportAllPrompts(
  deps: AssetServiceDeps,
  query?: Parameters<PromptsRepo['exportAll']>[0],
): ReturnType<PromptsRepo['exportAll']> {
  return new PromptsRepo(deps.db).exportAll(query)
}

// ── 技巧 ────────────────────────────────────────────────────────────────

export function listPlaybooks(deps: AssetServiceDeps): ReturnType<PlaybooksRepo['list']> {
  return new PlaybooksRepo(deps.db).list()
}

export function getPlaybook(deps: AssetServiceDeps, id: string): ReturnType<PlaybooksRepo['get']> {
  return new PlaybooksRepo(deps.db).get(id)
}

export function searchPlaybooks(
  deps: AssetServiceDeps,
  q: string,
): ReturnType<PlaybooksRepo['search']> {
  return new PlaybooksRepo(deps.db).search(q)
}

export function renderPlaybooksMd(
  deps: AssetServiceDeps,
  input: Parameters<PlaybooksRepo['renderMd']>[0],
): string {
  return new PlaybooksRepo(deps.db).renderMd(input)
}

export function createPlaybook(
  deps: AssetServiceDeps,
  input: PlaybookCreateInput,
): ReturnType<PlaybooksRepo['create']> {
  return new PlaybooksRepo(deps.db).create(input)
}

export function updatePlaybook(
  deps: AssetServiceDeps,
  id: string,
  patch: PlaybookUpdateInput,
): ReturnType<PlaybooksRepo['update']> {
  return new PlaybooksRepo(deps.db).update(id, patch)
}

export function deletePlaybook(
  deps: AssetServiceDeps,
  id: string,
): { referencedPackNames: string[] } {
  const names = referencedPackNamesFor(deps, id, 'playbookIds')
  new PlaybooksRepo(deps.db).delete(id)
  return { referencedPackNames: names }
}

// ── 流程模板 ────────────────────────────────────────────────────────────

export function listFlowTemplates(deps: AssetServiceDeps): ReturnType<FlowTemplatesRepo['list']> {
  return new FlowTemplatesRepo(deps.db).list()
}

export function createFlowTemplate(
  deps: AssetServiceDeps,
  input: FlowTemplateCreateInput,
): ReturnType<FlowTemplatesRepo['create']> {
  return new FlowTemplatesRepo(deps.db).create(input)
}

export function updateFlowTemplate(
  deps: AssetServiceDeps,
  id: string,
  patch: FlowTemplateUpdateInput,
): ReturnType<FlowTemplatesRepo['update']> {
  return new FlowTemplatesRepo(deps.db).update(id, patch)
}

/**
 * 流程模板的删除。
 *
 * ⚠️ 与其它四类不同：builtin 模板**不可删**（删除由 repo 内部抛 403 BUILTIN_IMMUTABLE），
 * 因此这里不做引用检查（模板不是被「选中」进包的，它被流程实例引用）。
 */
export function deleteFlowTemplate(deps: AssetServiceDeps, id: string): void {
  new FlowTemplatesRepo(deps.db).delete(id)
}

export function duplicateFlowTemplate(
  deps: AssetServiceDeps,
  id: string,
): ReturnType<FlowTemplatesRepo['duplicate']> {
  return new FlowTemplatesRepo(deps.db).duplicate(id)
}

// ── Skill ───────────────────────────────────────────────────────────────

export function listSkills(deps: AssetServiceDeps): ReturnType<SkillsRepo['list']> {
  return new SkillsRepo(deps.db).list()
}

export function createSkill(
  deps: AssetServiceDeps,
  input: SkillCreateInput,
): ReturnType<SkillsRepo['create']> {
  return new SkillsRepo(deps.db).create(input)
}

export function updateSkill(
  deps: AssetServiceDeps,
  id: string,
  patch: SkillUpdateInput,
): ReturnType<SkillsRepo['update']> {
  return new SkillsRepo(deps.db).update(id, patch)
}

/**
 * Skill 的删除。
 *
 * ⚠️ **库副本的清理不在这里**：那一步要碰文件系统（库根解析由 skillLibrary 独占管理），
 * 属于「文件系统副作用」，留在路由层由 server 的 lib 承担——服务层只管库内的那一行。
 */
export function deleteSkillRow(
  deps: AssetServiceDeps,
  id: string,
): { referencedPackNames: string[] } {
  const names = referencedPackNamesFor(deps, id, 'skillIds')
  new SkillsRepo(deps.db).delete(id)
  return { referencedPackNames: names }
}

// ── 跨域的设置键（skills 与 extract 两处用到 app_meta）──────────────────

/** AI 提取总闸（M10/D；与遥测总闸正交，缺省关） */
export function setAiExtractGate(deps: AssetServiceDeps, enabled: boolean): void {
  new AppMetaRepo(deps.db).write('aiExtractEnabled', enabled)
}

/** 读 app_meta 的布尔键 */
export function readMetaBoolean(deps: AssetServiceDeps, key: string, fallback: boolean): boolean {
  return new AppMetaRepo(deps.db).read<boolean>(key, fallback)
}

/** 读 app_meta 的任意 JSON 值（skill 扫描根清单等非布尔设置项） */
export function readMetaJson<T>(deps: AssetServiceDeps, key: string, fallback: T): T {
  return new AppMetaRepo(deps.db).read<T>(key, fallback)
}

/** 写 app_meta 的任意 JSON 值 */
export function writeMetaJson(deps: AssetServiceDeps, key: string, value: unknown): void {
  new AppMetaRepo(deps.db).write(key, value)
}

// ── Skill 域（skills 路由的 14 个动作）────────────────────────────────────
//
// ⚠️ 这一组是**透传**，但透传在这里是合理的：每个方法都是一个独立的用户意图
// （扫目录 / 建 / 改 / 删 / 清理 / 查重 / 评审 / 合并 / 修名），彼此没有共享的编排；
// 把它们强行合成一个「大入口」反而会让调用方传一堆可选参数来决定做哪件事。
// 这与 packService 的 CRUD 同形制：**函数 + deps，不建 class**。

/** 扫本机 skill 目录并登记（roots 缺省 = 出厂清单） */
export function scanSkills(
  deps: AssetServiceDeps,
  roots?: Parameters<SkillsRepo['scan']>[0],
): ReturnType<SkillsRepo['scan']> {
  return new SkillsRepo(deps.db).scan(roots)
}

/** 远端条目落库 */
export function upsertRemoteSkill(
  deps: AssetServiceDeps,
  input: Parameters<SkillsRepo['upsertRemote']>[0],
): ReturnType<SkillsRepo['upsertRemote']> {
  return new SkillsRepo(deps.db).upsertRemote(input)
}

/** 新建 skill */
export function createSkillRow(
  deps: AssetServiceDeps,
  input: Parameters<SkillsRepo['create']>[0],
): ReturnType<SkillsRepo['create']> {
  return new SkillsRepo(deps.db).create(input)
}

/** 改 skill（描述 / 安装目标） */
export function updateSkillRow(
  deps: AssetServiceDeps,
  id: string,
  patch: Parameters<SkillsRepo['update']>[1],
): ReturnType<SkillsRepo['update']> {
  return new SkillsRepo(deps.db).update(id, patch)
}

/** 删 skill 行（库副本清理由调用方另行处理） */
export function deleteSkill(deps: AssetServiceDeps, id: string): void {
  new SkillsRepo(deps.db).delete(id)
}

/** 取单条 skill */
export function getSkill(deps: AssetServiceDeps, id: string): ReturnType<SkillsRepo['get']> {
  return new SkillsRepo(deps.db).get(id)
}

/** 清理预演（只读：列出会被清掉的东西） */
export function skillCleanupPreview(
  deps: AssetServiceDeps,
  ids?: Parameters<SkillsRepo['cleanupPreview']>[0],
): ReturnType<SkillsRepo['cleanupPreview']> {
  return new SkillsRepo(deps.db).cleanupPreview(ids)
}

/** 执行清理 */
export function cleanupSkills(
  deps: AssetServiceDeps,
  input: Parameters<SkillsRepo['cleanup']>[0],
): ReturnType<SkillsRepo['cleanup']> {
  return new SkillsRepo(deps.db).cleanup(input)
}

/** 全部 skill 行 */
export function listSkillRows(deps: AssetServiceDeps): ReturnType<SkillsRepo['list']> {
  return new SkillsRepo(deps.db).list()
}

/** 某 skill 的版本历史 */
export function skillVersions(
  deps: AssetServiceDeps,
  skillId: string,
): ReturnType<SkillsRepo['versions']> {
  return new SkillsRepo(deps.db).versions(skillId)
}

/** 重复检测报告 */
export function skillDuplicates(deps: AssetServiceDeps): ReturnType<SkillsRepo['duplicates']> {
  return new SkillsRepo(deps.db).duplicates()
}

/** 评审报告 */
export function reviewSkills(
  deps: AssetServiceDeps,
  ids?: Parameters<SkillsRepo['review']>[0],
): ReturnType<SkillsRepo['review']> {
  return new SkillsRepo(deps.db).review(ids)
}

/** 合并 skill 行（保留 keepId，吸收 absorbIds） */
export function mergeSkillRows(
  deps: AssetServiceDeps,
  keepId: string,
  absorbIds: readonly string[],
): ReturnType<SkillsRepo['mergeSkills']> {
  return new SkillsRepo(deps.db).mergeSkills(keepId, absorbIds)
}

/** 修 skill 名（历史脏数据的修复入口） */
export function repairSkillName(
  deps: AssetServiceDeps,
  id: string,
): ReturnType<SkillsRepo['repairName']> {
  return new SkillsRepo(deps.db).repairName(id)
}
