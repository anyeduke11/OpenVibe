/**
 * M9 解读请求的**入参装配器**（`m9-dev-language-roadmap.md` §3.8 / §7 DL-18）。
 *
 * ⚠️ **本文件是 P0 的最小骨架** —— 真正的「送 AI」在 P5。这里**只**做两件事：
 *   1. **筛选**：只把**用户勾选过的**源码片段装入 `fragments`（未勾选的一律不进）。
 *   2. **路径剥离**：每个 fragment 的 `path` 是相对于 `projectRoot` 的相对路径；
 *      绝对路径 / 含 `..` 的越界路径**在这一步就被丢掉**，不进入入参。
 *
 * 这两步**写进代码而不是写进注释**（与 §3.13 同源 —— 源码证据封顶要靠代码不是靠注释，
 * 见 `m9-dev-language-roadmap.md` §3.13 写进代码而不是写进注释）。P5 调它、P5 的测试断言它。
 *
 * ## 故意「不」做
 *
 * - 不发起任何网络请求（`fetch` / `https` 都不引入）。
 * - 不读文件内容（传入的 `files` 已是 `{path, content}` 列表；扫描器在 P4 阶段把
 *   `path:content` 填好，这里只挑 + 改路径）。
 * - 不持久化任何东西。
 */
import { isAbsolute, relative, resolve, sep } from 'node:path'

/** 一个候选源码片段：路径（绝对或相对）+ 内容 */
export interface SourceFragment {
  path: string
  content: string
}

/** `assembleAiCallPayload` 的入参 */
export interface AssembleOpts {
  /** 项目根（绝对路径）—— 用于把片段的绝对路径改成「相对项目根」 */
  projectRoot: string
  /** 候选片段全集（来自 P4 扫描器） */
  files: readonly SourceFragment[]
  /** 用户勾选过的片段路径集合（相对项目根；用 `Set` 加速） */
  consentIds: ReadonlySet<string>
}

/** 装配结果 —— 这是会**实际送给 AI**的形状 */
export interface AiCallPayload {
  /** 相对项目根的路径（绝不出现 `..` 与绝对路径前缀） */
  fragments: { path: string; content: string }[]
}

export class PayloadAssemblyError extends Error {
  constructor(public readonly reason: 'projectRoot-not-absolute' | 'file-outside-project') {
    super(`装配失败：${reason}`)
    this.name = 'PayloadAssemblyError'
  }
}

/**
 * 把路径标准化为「相对 projectRoot」。**失败时抛错**而不是返回空数组：
 * 静默丢弃会让 P5 的捕获测试形不成「未勾选 ⇒ 整批出网失败」的可观察后果。
 *
 * @param projectRoot 绝对路径
 * @param filePath 任意路径
 * @returns `filePath` 相对 `projectRoot` 的相对路径；越界（含 `..`）抛错
 */
export function toRelativePath(projectRoot: string, filePath: string): string {
  if (!isAbsolute(projectRoot)) {
    throw new PayloadAssemblyError('projectRoot-not-absolute')
  }
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(projectRoot, filePath)
  const rel = relative(projectRoot, abs)
  // `relative` 在越界时返回以 `..` 开头的路径；**这是必须显式拦截**的。
  // 不许把越界片段送出去（即便它「在勾选列表里」）—— 越界意味着 caller 算错了根目录。
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !rel.startsWith('..'))) {
    return rel
  }
  throw new PayloadAssemblyError('file-outside-project')
}

/**
 * 装配 AI 解读请求的入参。
 *
 * 规则（**按这个顺序**短路）——
 * 1. `projectRoot` 必须是绝对路径，否则抛 `projectRoot-not-absolute`。
 * 2. 对每个 `files[i]`：若 `files[i].path` **不**在 `consentIds` 里 ⇒ 跳过（DL-18）。
 * 3. 对剩下的：路径改成相对 `projectRoot`；越界抛 `file-outside-project`。
 * 4. 全部改完后，按路径字典序排序（**让入参可被复现**；同输入 ⇒ 同输出，不依赖文件系统的遍历顺序）。
 */
export function assembleAiCallPayload(opts: AssembleOpts): AiCallPayload {
  if (!isAbsolute(opts.projectRoot)) {
    throw new PayloadAssemblyError('projectRoot-not-absolute')
  }
  const out: { path: string; content: string }[] = []
  for (const f of opts.files) {
    if (!opts.consentIds.has(f.path)) continue // DL-18 第一道
    out.push({ path: toRelativePath(opts.projectRoot, f.path), content: f.content })
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  return { fragments: out }
}
