import { createHash } from 'node:crypto'
import {
  AppError,
  type SkillUpdateCheckItem,
  type SkillUpdateCheckReport,
  type SkillRemoteSearchItem,
  type SkillRemoteSearchReport,
} from '@openvibe/shared'
import { hashSkillEntries, parseSkillFrontmatter } from '@openvibe/core'
import { guardedJson, guardedText } from './http-guard'

/**
 * 远程 skill 源适配器（DEV-0067，DEV-0068 扩展检查更新）。两个源：
 * - GitHub：`owner/repo`（ref 缺省=默认分支，即最新；path 可选=只导该子目录）；git trees 一次
 *   拿全路径，任意层级下的 SKILL.md 所在目录视为一个 skill，逐文件走 raw.githubusercontent.com。
 * - SkillHub（skillhub.cn）：`/api/skills` 搜索、`/api/v1/skills/{slug}` 详情（含最新版本号）、
 *   `/files` 文件清单（**自带每个文件的 sha256**——指纹不必下载内容即可计算，与本地
 *   computeDirHash 同公式），`/file?path=` 302 到 COS，按后缀放行逐跳取 SKILL.md。
 *
 * 检查更新（DEV-0068）走**树指纹**：GitHub 树指纹 = 目录内文件 (相对路径, git blob sha)
 * 拼接 sha256——git blob sha 是内容寻址，同一内容恒同值，故 trees API 一次调用即可对比
 * 整仓 N 个 skill，零内容下载；SkillHub 树指纹 = 清单 (path, sha256) 按本地同公式（== dirHash）。
 *
 * 出站一律走 http-guard 的 guarded*（15s 超时）；fetchImpl 可注入（测试 mock 上游）。
 * 防失控上限：GitHub 一次 ≤50 个 skill、每个 ≤40 文件、单文件 ≤400KB。
 */

const GH_API = 'https://api.github.com'
const GH_RAW = 'https://raw.githubusercontent.com'
const SH_API = 'https://api.skillhub.cn'

const CAPS = {
  maxSkillsPerRepo: 50,
  maxFilesPerSkill: 40,
  maxFileBytes: 400_000,
  searchLimit: 10,
  fetchTimeoutMs: 15_000,
}

export interface RemoteSkillEntry {
  name: string
  description: string
  source: 'github' | 'skillhub'
  versionLabel: string
  dirHash: string
  fileCount: number
  /** 溯源 key（github:owner/repo@branch[:path] / skillhub:slug）与树级指纹 */
  remoteRef: string
  remoteTreeHash: string
}

export interface RemoteImportResult {
  origin: string
  entries: RemoteSkillEntry[]
  warnings: string[]
}

export type FetchLike = typeof fetch

function sha256HexOf(bytes: string): string {
  return createHash('sha256').update(bytes, 'utf8').digest('hex')
}

/** 树指纹（内容无关）：相对路径排序后 `${rel}:${blobSha}\n` 拼接整体 sha256 */
function treeFingerprint(entries: readonly { rel: string; blobSha: string }[]): string {
  const sorted = [...entries].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  return sha256HexOf(sorted.map((e) => `${e.rel}:${e.blobSha}\n`).join(''))
}

function repoRef(input: string): string {
  // 接受 owner/repo 或完整仓库 URL；归一到 owner/repo，拒绝 path traversal 形态
  const m =
    input.match(/github\.com\/([\w.-]+)\/([\w.-]+)/) ?? input.match(/^([\w.-]+)\/([\w.-]+)$/)
  if (m === null) {
    throw new AppError('VALIDATION_ERROR', `仓库格式应为 owner/repo 或 GitHub 仓库 URL: ${input}`)
  }
  return `${m[1]}/${(m[2] ?? '').replace(/\.git$/, '')}`
}

/** 限定路径形态：禁绝对路径/.. 段（仓库子目录，不是文件系统路径） */
function normalizeSubPath(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const p = raw.replace(/^\/+|\/+$/g, '')
  if (p === '' || p.split('/').includes('..')) {
    throw new AppError('VALIDATION_ERROR', `非法仓库子路径: ${raw}`)
  }
  return p
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

interface GhRepo {
  default_branch?: string
  message?: string
}
interface GhTree {
  truncated?: boolean
  tree?: { path: string; type: string; sha?: string; size?: number }[]
  message?: string
}

export async function importFromGithub(
  repoInput: string,
  ref: string | undefined,
  fetchImpl: FetchLike = fetch,
  pathInput?: string,
): Promise<RemoteImportResult> {
  const repo = repoRef(repoInput)
  const subPath = normalizeSubPath(pathInput)
  const warnings: string[] = []
  const headers = { accept: 'application/vnd.github+json' }

  const repoInfo = await guardedJson<GhRepo>(`${GH_API}/repos/${repo}`, fetchImpl, headers)
  if (typeof repoInfo.default_branch !== 'string' || repoInfo.default_branch === '') {
    throw new AppError('NOT_FOUND', `GitHub 仓库不存在或不可访问: ${repo}`)
  }
  const branch = ref ?? repoInfo.default_branch

  const tree = await guardedJson<GhTree>(
    `${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    fetchImpl,
    headers,
  )
  if (Array.isArray(tree.tree) === false) {
    // 英文诊断原文走 detail 位（中文 message 只说清哪里坏了）
    throw new AppError(
      'REMOTE_UNREACHABLE',
      '拉取目录树失败：响应不是合法目录树',
      undefined,
      tree.message,
    )
  }
  if (tree.truncated === true) {
    warnings.push('仓库文件过多，GitHub 返回的目录树被截断，本次只导入能看到的部分')
  }
  const allBlobs = (tree.tree ?? []).filter((t) => t.type === 'blob')
  // path 过滤（DEV-0068）：只保留子目录下的 blob（'/' 前缀保证不误命中同前缀名目录）
  const blobs =
    subPath === undefined
      ? allBlobs
      : allBlobs.filter((b) => b.path.startsWith(`${subPath}/`) || b.path === subPath)
  if (subPath !== undefined && blobs.length === 0) {
    throw new AppError('NOT_FOUND', `仓库 ${repo}@${branch} 中不存在路径 ${subPath}（或为空目录）`)
  }

  // skill 根目录 = 每个 SKILL.md 的所在目录（仓库根的 SKILL.md → 单 skill，以仓库名兜底命名）
  const skillMdPaths = blobs.filter((b) => b.path === 'SKILL.md' || b.path.endsWith('/SKILL.md'))
  const roots = [
    ...new Set(
      skillMdPaths.map((p) => {
        const idx = p.path.lastIndexOf('/SKILL.md')
        return idx <= 0 ? '' : p.path.slice(0, idx)
      }),
    ),
  ].sort()
  if (roots.length > CAPS.maxSkillsPerRepo) {
    warnings.push(
      `仓库含 ${String(roots.length)} 个 skill，超出单次上限 ${String(CAPS.maxSkillsPerRepo)}，已截断`,
    )
    roots.length = CAPS.maxSkillsPerRepo
  }

  const entries: RemoteSkillEntry[] = []
  for (const root of roots) {
    const prefix = root === '' ? '' : `${root}/`
    const inSkill = blobs.filter((b) => b.path.startsWith(prefix))
    // 超上限时保住 SKILL.md（元数据来源），其余按路径序截断
    const md = inSkill.filter((b) => b.path === `${prefix}SKILL.md`)
    const rest = inSkill.filter((b) => b.path !== `${prefix}SKILL.md`)
    const files = [...md, ...rest.slice(0, CAPS.maxFilesPerSkill - md.length)].filter(
      (b) => (b.size ?? 0) <= CAPS.maxFileBytes,
    )
    if (md.length === 0 || files.length === 0) continue
    // 树指纹（DEV-0068）：git blob sha 内容寻址，同内容恒同值；无需下载即可对比远端
    const treeHash = treeFingerprint(
      inSkill
        .filter((b) => typeof b.sha === 'string' && b.sha !== '')
        .map((b) => ({
          rel: prefix === '' ? b.path : b.path.slice(prefix.length),
          blobSha: b.sha ?? '',
        })),
    )
    const digests: { rel: string; sha256: string }[] = []
    let skillMd: string | null = null
    // 8 并发拉 raw；raw.githubusercontent.com 不占 GitHub API 的 60/h 配额
    const contents = new Map<string, string>()
    await Promise.all(
      files.map(async (f) => {
        try {
          const text = await guardedText(
            `${GH_RAW}/${repo}/${encodeURIComponent(branch)}/${f.path}`,
            [],
            fetchImpl,
          )
          contents.set(f.path, text)
        } catch {
          warnings.push(`跳过无法下载的文件: ${f.path}`)
        }
      }),
    )
    for (const f of files) {
      const text = contents.get(f.path)
      if (text === undefined) continue
      const rel = prefix === '' ? f.path : f.path.slice(prefix.length)
      digests.push({ rel, sha256: sha256HexOf(text) })
      if (f.path === `${prefix}SKILL.md`) skillMd = text
    }
    if (skillMd === null) continue
    const { dirHash, fileCount } = hashSkillEntries(digests)
    const fm = parseSkillFrontmatter(skillMd)
    const fallbackName =
      root === '' ? (repo.split('/')[1] ?? repo) : (root.split('/').at(-1) ?? root)
    entries.push({
      name: fm.name ?? fallbackName,
      description: fm.description ?? '',
      source: 'github',
      versionLabel: subPath === undefined ? `${repo}@${branch}` : `${repo}/${subPath}@${branch}`,
      dirHash,
      fileCount,
      // remoteRef 必须带 skill 自身的目录（root）：即使整仓导入，每个 skill 的子树地址
      // 各不相同——检查更新按子树对比，丢了目录就无法定位（DEV-0069 修正 DEV-0067 的形态）
      remoteRef: root === '' ? `github:${repo}@${branch}` : `github:${repo}@${branch}:${root}`,
      remoteTreeHash: treeHash,
    })
  }
  return {
    origin: subPath === undefined ? `${repo}@${branch}` : `${repo}/${subPath}@${branch}`,
    entries,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// SkillHub（skillhub.cn）
// ---------------------------------------------------------------------------

interface ShListResponse {
  code?: number
  data?: {
    skills?: {
      slug?: string
      name?: string
      description?: string
      description_zh?: string
      downloads?: number
      stars?: number
      updated_at?: number
      source?: string
    }[]
    total?: number
  }
}
interface ShDetail {
  latestVersion?: { version?: string }
  name?: string
  description?: string
  description_zh?: string
}
interface ShFiles {
  version?: string
  files?: { path?: string; sha256?: string; size?: number }[]
}

const SH_SUFFIXES = ['myqcloud.com']

export async function searchSkillhub(
  q: string,
  fetchImpl: FetchLike = fetch,
): Promise<SkillRemoteSearchReport> {
  const url = `${SH_API}/api/skills?q=${encodeURIComponent(q)}&page=1&pageSize=${String(CAPS.searchLimit)}`
  const payload = await guardedJson<ShListResponse>(url, fetchImpl)
  const skills = payload.data?.skills ?? []
  const items: SkillRemoteSearchItem[] = skills
    .filter((s) => typeof s.slug === 'string' && s.slug !== '')
    .map((s) => ({
      slug: s.slug ?? '',
      name: s.name ?? s.slug ?? '',
      description: s.description_zh ?? s.description ?? '',
      version: null, // 列表接口不带版本，导入时以详情接口为准
      downloads: s.downloads ?? 0,
      stars: s.stars ?? 0,
      updatedAt: typeof s.updated_at === 'number' ? new Date(s.updated_at).toISOString() : '',
    }))
  return { items, total: payload.data?.total ?? items.length }
}

export async function importFromSkillhub(
  slug: string,
  fetchImpl: FetchLike = fetch,
): Promise<RemoteImportResult> {
  const warnings: string[] = []
  const detail = await guardedJson<ShDetail>(
    `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}`,
    fetchImpl,
  )
  const files = await guardedJson<ShFiles>(
    `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}/files`,
    fetchImpl,
  )
  const manifest = (files.files ?? []).filter(
    (f): f is { path: string; sha256: string; size?: number } =>
      typeof f.path === 'string' && typeof f.sha256 === 'string',
  )
  if (manifest.length === 0) {
    throw new AppError('REMOTE_UNREACHABLE', `SkillHub 未返回文件清单: ${slug}`)
  }
  // 清单自带 sha256 → 与本地 computeDirHash 同公式，不下载内容即可算指纹（跨源去重的关键）；
  // 该指纹同时就是树指纹（内容寻址），检查更新复用同一值
  const { dirHash, fileCount } = hashSkillEntries(
    manifest.map((f) => ({ rel: f.path, sha256: f.sha256 })),
  )

  // SKILL.md 只为取 frontmatter 元数据；302 → COS 属预期，按后缀放行
  let skillMd: string | null = null
  try {
    skillMd = await guardedText(
      `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}/file?path=SKILL.md`,
      SH_SUFFIXES,
      fetchImpl,
    )
  } catch {
    warnings.push('SKILL.md 拉取失败，名称/描述回退到 SkillHub 元数据')
  }
  const fm = skillMd === null ? ({ ok: false } as const) : parseSkillFrontmatter(skillMd)
  const version = files.version ?? detail.latestVersion?.version ?? '0'
  return {
    origin: `skillhub.cn/skills/${slug}@${version}`,
    entries: [
      {
        name: fm.ok === true && fm.name !== undefined ? fm.name : (detail.name ?? slug),
        description:
          (fm.ok === true ? fm.description : undefined) ??
          detail.description_zh ??
          detail.description ??
          '',
        source: 'skillhub',
        versionLabel: `${slug}@${version}`,
        dirHash,
        fileCount,
        remoteRef: `skillhub:${slug}`,
        remoteTreeHash: dirHash,
      },
    ],
    warnings,
  }
}

// ---------------------------------------------------------------------------
// 检查更新（DEV-0068）：树指纹对比，零内容下载
// ---------------------------------------------------------------------------

interface TrackedSkill {
  skillId: string
  name: string
  source: string
  remoteRef: string | null
  remoteTreeHash: string | null
}

/** GitHub blob sha 相同 ⇒ 内容相同（git 内容寻址），树指纹不同 ⇒ 有变化 */
function githubTreeHashFromTree(
  tree: { path: string; sha?: string }[],
  prefix: string,
): string | null {
  const rels = tree
    .filter((b) => b.path.startsWith(prefix) && typeof b.sha === 'string' && b.sha !== '')
    .map((b) => ({ rel: b.path.slice(prefix.length), blobSha: b.sha ?? '' }))
  if (rels.length === 0) return null
  return treeFingerprint(rels)
}

/**
 * 对台账里 source=github/skillhub 的条目做更新检查。
 * GitHub：按 `owner/repo@branch` 分组，每组一次 trees API（path 后缀的树指纹按子目录切）；
 * SkillHub：逐 slug 一次 files 调用。本地无 remoteRef/remoteTreeHash 的存量条目标 notTracked
 * （重新导入一次即建档）；单个远端失败不影响其他条目（checkFailed）。
 */
export async function checkRemoteUpdates(
  tracked: TrackedSkill[],
  fetchImpl: FetchLike = fetch,
): Promise<SkillUpdateCheckReport> {
  const items: SkillUpdateCheckItem[] = []
  const summary = { upToDate: 0, remoteChanged: 0, notTracked: 0, checkFailed: 0 }

  // GitHub 按 repo@branch 分组共享一次 trees 调用
  const ghGroups = new Map<string, TrackedSkill[]>()
  const shSlugs: TrackedSkill[] = []
  for (const skill of tracked) {
    if (skill.remoteRef === null || skill.remoteTreeHash === null) {
      items.push({
        skillId: skill.skillId,
        name: skill.name,
        source: skill.source === 'skillhub' ? 'skillhub' : 'github',
        remoteRef: skill.remoteRef,
        status: 'notTracked',
        note: '该条目缺远程追踪指纹，重新导入一次即建档',
      })
      summary.notTracked += 1
      continue
    }
    if (skill.source === 'github' && skill.remoteRef.startsWith('github:')) {
      // remoteRef = github:owner/repo@branch[:path] → 组 key = owner/repo@branch
      const rest = skill.remoteRef.slice('github:'.length)
      const groupKey = rest.split(':')[0] ?? rest
      const bucket = ghGroups.get(groupKey) ?? []
      bucket.push(skill)
      ghGroups.set(groupKey, bucket)
    } else if (skill.source === 'skillhub' && skill.remoteRef.startsWith('skillhub:')) {
      shSlugs.push(skill)
    } else {
      items.push({
        skillId: skill.skillId,
        name: skill.name,
        source: skill.source === 'skillhub' ? 'skillhub' : 'github',
        remoteRef: skill.remoteRef,
        status: 'checkFailed',
        note: `无法解析的远程溯源 key: ${skill.remoteRef}`,
      })
      summary.checkFailed += 1
    }
  }

  // GitHub：每组（repo@branch）一次 trees，子路径按 remoteRef 的第三段切
  for (const [repoBranch, group] of ghGroups) {
    try {
      const [repo, branch] = repoBranch.split('@')
      if (repo === undefined || branch === undefined || repo === '' || branch === '') {
        throw new Error(`无法解析的仓库/分支: ${repoBranch}`)
      }
      const tree = await guardedJson<GhTree>(
        `${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        fetchImpl,
        { accept: 'application/vnd.github+json' },
      )
      const blobs = (tree.tree ?? []).filter((t) => t.type === 'blob')
      for (const skill of group) {
        // remoteRef 形如 github:owner/repo@branch[:path]；本组 key 已是 owner/repo@branch
        const parts = skill.remoteRef?.split(':') ?? []
        const subPath = parts.length > 2 ? parts.slice(2).join(':') : undefined
        const prefix = subPath === undefined ? '' : `${subPath}/`
        const remoteHash = githubTreeHashFromTree(blobs, prefix)
        if (remoteHash === null) {
          items.push({
            skillId: skill.skillId,
            name: skill.name,
            source: 'github',
            remoteRef: skill.remoteRef,
            status: 'checkFailed',
            note: '远端已找不到该 skill 目录（可能被删除或移动）',
          })
          summary.checkFailed += 1
        } else if (remoteHash === skill.remoteTreeHash) {
          items.push({
            skillId: skill.skillId,
            name: skill.name,
            source: 'github',
            remoteRef: skill.remoteRef,
            status: 'upToDate',
          })
          summary.upToDate += 1
        } else {
          items.push({
            skillId: skill.skillId,
            name: skill.name,
            source: 'github',
            remoteRef: skill.remoteRef,
            status: 'remoteChanged',
          })
          summary.remoteChanged += 1
        }
      }
    } catch (e) {
      const note = e instanceof Error ? e.message : String(e)
      for (const skill of group) {
        items.push({
          skillId: skill.skillId,
          name: skill.name,
          source: 'github',
          remoteRef: skill.remoteRef,
          status: 'checkFailed',
          note,
        })
        summary.checkFailed += 1
      }
    }
  }

  // SkillHub：逐 slug 一次 files 调用
  for (const skill of shSlugs) {
    const slug = skill.remoteRef?.slice('skillhub:'.length) ?? ''
    try {
      const files = await guardedJson<ShFiles>(
        `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}/files`,
        fetchImpl,
      )
      const manifest = (files.files ?? []).filter(
        (f): f is { path: string; sha256: string } =>
          typeof f.path === 'string' && typeof f.sha256 === 'string',
      )
      if (manifest.length === 0) throw new Error('远端未返回文件清单')
      const remoteHash = hashSkillEntries(
        manifest.map((f) => ({ rel: f.path, sha256: f.sha256 })),
      ).dirHash
      const same = remoteHash === skill.remoteTreeHash
      items.push({
        skillId: skill.skillId,
        name: skill.name,
        source: 'skillhub',
        remoteRef: skill.remoteRef,
        status: same ? 'upToDate' : 'remoteChanged',
      })
      summary[same ? 'upToDate' : 'remoteChanged'] += 1
    } catch (e) {
      items.push({
        skillId: skill.skillId,
        name: skill.name,
        source: 'skillhub',
        remoteRef: skill.remoteRef,
        status: 'checkFailed',
        note: e instanceof Error ? e.message : String(e),
      })
      summary.checkFailed += 1
    }
  }

  return { items, summary }
}

// ---------------------------------------------------------------------------
// 补档（DEV-0069）：DEV-0067 时代导入的远程条目没有树指纹，从版本线溯源串反推重导一次
// （同内容 skipped 但 recordVersion 会写入 remote_ref/remote_tree_hash → 建档完成）
// ---------------------------------------------------------------------------

export interface RetrackCandidate {
  skillId: string
  name: string
  source: string
  /** 最新版本线的溯源串：`owner/repo@branch`（DEV-0067 无 path）或 `slug@version` */
  versionLabel: string | null
}

// ---------------------------------------------------------------------------
// 下载落盘（2026-10-30）：远程 skill 真正下到本地
// ---------------------------------------------------------------------------

/**
 * 下载结果：**文件内容**（不只是指纹）。
 *
 * ⚠️ 与 `importFromGithub` 的区别：那里只把内容当算指纹的中间物用完就丢，
 *   落盘这一支要的是内容本身（写到磁盘）。
 */
export interface DownloadedSkill {
  /** 溯源串（与 remoteRef 同形） */
  origin: string
  /** 相对路径 → 文件内容 */
  files: { rel: string; content: string }[]
  /** 内容指纹（与本地 computeDirHash 同公式） */
  dirHash: string
  fileCount: number
  warnings: string[]
}

/**
 * 相对路径是否安全：非空、不以 `/` 开头、不含 `..` 段。
 *
 * ⚠️ 远端给的路径**不可信**：仓库里可以放 `skills/pdf/../../evil.md`，
 *   切前缀后仍是 `../evil.md` ⇒ 落盘时会写到目标目录之外。
 */
export function isSafeRelPath(rel: string): boolean {
  if (rel === '' || rel.startsWith('/') || rel.includes('\\')) return false
  return !rel.split('/').includes('..')
}

/**
 * 按 remoteRef 下载一个 skill 的全部文件内容。
 *
 * 溯源串两种形态（与 `recordVersion` 写入的一致）：
 *  - `github:owner/repo@branch[:path]` —— path 段是该 skill 自己的目录（DEV-0069 修正过）。
 *  - `skillhub:slug`。
 *
 * ⚠️ **只支持 https 且走 http-guard**：出站不经裸 fetch，代理由全局 dispatcher 接管
 *   （server 启动时 `installProxyDispatcher` 装 `EnvHttpProxyAgent`；
 *   实测 Node 26 内置 fetch 受 `setGlobalDispatcher` 管辖 ⇒ 代理与直连同一套代码）。
 */
export async function downloadSkillFiles(
  remoteRef: string,
  fetchImpl: FetchLike = fetch,
): Promise<DownloadedSkill> {
  if (remoteRef.startsWith('github:')) {
    const rest = remoteRef.slice('github:'.length)
    const colon = rest.indexOf(':')
    const repoBranch = colon >= 0 ? rest.slice(0, colon) : rest
    const subPath = colon >= 0 ? rest.slice(colon + 1) : undefined
    const at = repoBranch.lastIndexOf('@')
    if (at <= 0) {
      throw new AppError('VALIDATION_ERROR', `远程溯源串不可解析: ${remoteRef}`)
    }
    const repo = repoBranch.slice(0, at)
    const branch = repoBranch.slice(at + 1)
    return await downloadGithubFiles(repo, branch, subPath, fetchImpl)
  }
  if (remoteRef.startsWith('skillhub:')) {
    const slug = remoteRef.slice('skillhub:'.length)
    if (slug === '') throw new AppError('VALIDATION_ERROR', `远程溯源串缺少 slug: ${remoteRef}`)
    return await downloadSkillhubFiles(slug, fetchImpl)
  }
  throw new AppError('VALIDATION_ERROR', `无法识别的远程溯源串: ${remoteRef}`)
}

async function downloadGithubFiles(
  repo: string,
  branch: string,
  subPath: string | undefined,
  fetchImpl: FetchLike,
): Promise<DownloadedSkill> {
  // ⚠️ **先确认仓库存在**（与 `importFromGithub` 同款）：仓库不存在 ⇒ 报 NOT_FOUND
  //   「仓库不存在或不可访问」，而不是让 trees 的 404 变成笼统的「远端不可达」。
  //   多一次 API 调用换来可判定的错误类型，值得（下载是用户显式动作，不是批量作业）。
  const repoInfo = await guardedJson<GhRepo>(`${GH_API}/repos/${repo}`, fetchImpl, {
    accept: 'application/vnd.github+json',
  })
  if (typeof repoInfo.default_branch !== 'string' || repoInfo.default_branch === '') {
    throw new AppError('NOT_FOUND', `GitHub 仓库不存在或不可访问: ${repo}`)
  }
  const tree = await guardedJson<GhTree>(
    `${GH_API}/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    fetchImpl,
    { accept: 'application/vnd.github+json' },
  )
  if (Array.isArray(tree.tree) === false) {
    throw new AppError('REMOTE_UNREACHABLE', '拉取目录树失败：响应不是合法目录树')
  }
  const prefix = subPath === undefined || subPath === '' ? '' : `${subPath}/`
  const blobs = (tree.tree ?? []).filter(
    (t) => t.type === 'blob' && t.path.startsWith(prefix) && t.path !== prefix,
  )
  if (blobs.length === 0) {
    throw new AppError('NOT_FOUND', `远端已找不到该 skill 的文件: ${repo}@${branch}`)
  }
  const capped = blobs.slice(0, CAPS.maxFilesPerSkill)
  const warnings: string[] = []
  if (blobs.length > CAPS.maxFilesPerSkill) {
    warnings.push(
      `远端含 ${String(blobs.length)} 个文件，超出单次上限 ${String(CAPS.maxFilesPerSkill)}，已截断`,
    )
  }
  const files: { rel: string; content: string }[] = []
  await Promise.all(
    capped.map(async (b) => {
      const rel = b.path.slice(prefix.length)
      // ⚠️ **远端路径不可信**：切前缀后仍可能带 `..` 或绝对路径
      //   （如仓库里有 `skills/pdf/../../evil.md`）⇒ 在这里就拒掉，
      //   别等落盘时才发现（那时可能已经写到了目标目录之外）。
      if (!isSafeRelPath(rel)) {
        warnings.push(`跳过路径非法的远端文件: ${b.path}`)
        return
      }
      // ① 先试 raw（不限速、免 base64）
      try {
        const content = await guardedText(
          `${GH_RAW}/${repo}/${encodeURIComponent(branch)}/${b.path}`,
          [],
          fetchImpl,
        )
        if (content.length > CAPS.maxFileBytes) return
        files.push({ rel, content })
        return
      } catch {
        /* 落到 ② */
      }
      // ② 回退：走 api.github.com 的 contents 端点取内容（base64）
      //
      // ⚠️ **为什么要有这条回退**：`raw.githubusercontent.com` 在部分网络环境里
      //   **不可达**（本机实测：api.github.com 200/0.7s，raw 直接超时），
      //   而 `api.github.com` 往往是可达的 ⇒ 只走 raw 的话下载功能等于没有。
      //   用户要的是「能通过代理和直连下载」，这条回退让**直连**也能成。
      try {
        const content = await githubFileViaApi(repo, branch, b.path, fetchImpl)
        if (content.length > CAPS.maxFileBytes) return
        files.push({ rel, content })
      } catch {
        warnings.push(`跳过无法下载的文件: ${b.path}`)
      }
    }),
  )
  if (files.length === 0) {
    throw new AppError('REMOTE_UNREACHABLE', `远端文件全部下载失败: ${repo}@${branch}`)
  }
  // ⚠️ **SKILL.md 是硬要求**：没有它就不是一个 skill（m2 FR-1.1 的判定依据）。
  //   缺了它却报「下载成功」⇒ 台账指向一个扫不到、也用不了的目录。
  if (!files.some((f) => f.rel === 'SKILL.md')) {
    throw new AppError(
      'REMOTE_UNREACHABLE',
      `远端未取到 SKILL.md，不是可用的 skill（已取到 ${String(files.length)} 个其它文件）：${repo}@${branch}`,
      undefined,
      warnings.join('\n'),
    )
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const { dirHash } = hashSkillEntries(
    files.map((f) => ({ rel: f.rel, sha256: sha256HexOf(f.content) })),
  )
  return {
    origin: remoteRefOfGithub(repo, branch, subPath),
    files,
    dirHash,
    fileCount: files.length,
    warnings,
  }
}

async function downloadSkillhubFiles(slug: string, fetchImpl: FetchLike): Promise<DownloadedSkill> {
  const filesResp = await guardedJson<ShFiles>(
    `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}/files`,
    fetchImpl,
  )
  const manifest = (filesResp.files ?? []).filter(
    (f): f is { path: string; sha256: string; size?: number } =>
      typeof f.path === 'string' && typeof f.sha256 === 'string',
  )
  if (manifest.length === 0) {
    throw new AppError('REMOTE_UNREACHABLE', `SkillHub 未返回文件清单: ${slug}`)
  }
  const warnings: string[] = []
  const files: { rel: string; content: string }[] = []
  // 逐个文件取内容（SkillHub 的 /file 会 302 到 COS，按后缀放行）
  for (const f of manifest.slice(0, CAPS.maxFilesPerSkill)) {
    if (!isSafeRelPath(f.path)) {
      warnings.push(`跳过路径非法的远端文件: ${f.path}`)
      continue
    }
    try {
      const content = await guardedText(
        `${SH_API}/api/v1/skills/${encodeURIComponent(slug)}/file?path=${encodeURIComponent(f.path)}`,
        SH_SUFFIXES,
        fetchImpl,
      )
      files.push({ rel: f.path, content })
    } catch {
      warnings.push(`跳过无法下载的文件: ${f.path}`)
    }
  }
  if (files.length === 0) {
    throw new AppError('REMOTE_UNREACHABLE', `SkillHub 文件全部下载失败: ${slug}`)
  }
  // ⚠️ **SKILL.md 是硬要求**（同 GitHub 那条）：缺了它就不是一个 skill。
  if (!files.some((f) => f.rel === 'SKILL.md')) {
    throw new AppError(
      'REMOTE_UNREACHABLE',
      `远端未取到 SKILL.md，不是可用的 skill（已取到 ${String(files.length)} 个其它文件）：${slug}`,
      undefined,
      warnings.join('\n'),
    )
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
  const { dirHash } = hashSkillEntries(
    files.map((f) => ({ rel: f.rel, sha256: sha256HexOf(f.content) })),
  )
  return {
    origin: `skillhub.cn/skills/${slug}`,
    files,
    dirHash,
    fileCount: files.length,
    warnings,
  }
}

function remoteRefOfGithub(repo: string, branch: string, subPath: string | undefined): string {
  return subPath === undefined || subPath === ''
    ? `github:${repo}@${branch}`
    : `github:${repo}@${branch}:${subPath}`
}

/** `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}` 的响应（只取要的字段） */
interface GhContents {
  content?: string
  encoding?: string
  message?: string
}

/**
 * 经 **api.github.com** 的 contents 端点取文件内容（base64）。
 *
 * ## 为什么需要它
 *
 * `raw.githubusercontent.com` 在部分网络环境里不可达（本机实测：api 200/0.7s，
 * raw 直接超时），而 `api.github.com` 往往可达 ⇒ 只走 raw 的话下载功能等于没有。
 * 用户的要求是「能通过代理**和直连**下载」⇒ 需要一条不经 raw 的取数路径。
 *
 * ## 代价
 *
 * - **API 配额**：未认证 60 次/小时。单个 skill ≤40 文件 ⇒ 一次下载一轮配额。
 *   这也是「先试 raw、失败才回退」的原因（raw 不限速，命中就不耗配额）。
 * - **只支持文本**：base64 解码后按 utf8 还原 ⇒ 二进制文件会损坏。
 *   skill 的内容是 md / py / 文本配置，不含二进制；真遇上了，raw 那条路能拿到原始字节。
 */
async function githubFileViaApi(
  repo: string,
  branch: string,
  path: string,
  fetchImpl: FetchLike,
): Promise<string> {
  const payload = await guardedJson<GhContents>(
    `${GH_API}/repos/${repo}/contents/${path
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/')}?ref=${encodeURIComponent(branch)}`,
    fetchImpl,
    { accept: 'application/vnd.github+json' },
  )
  if (typeof payload.content !== 'string') {
    throw new AppError('REMOTE_UNREACHABLE', `GitHub 未返回文件内容: ${path}`)
  }
  if (payload.encoding !== 'base64') {
    throw new AppError(
      'REMOTE_UNREACHABLE',
      `GitHub 返回了不支持的编码: ${payload.encoding ?? '（空）'}`,
    )
  }
  return Buffer.from(payload.content, 'base64').toString('utf8')
}

/**
 * 解析版本线溯源串并重导。source 字段决定解析方式（不猜形态）：
 * github → `owner/repo@branch`；skillhub → `slug@version`（version 部分忽略，重导即最新）。
 * 解析失败/远端失败逐条报 failed，不影响其他条目。
 */
export async function retrackRemoteSkills(
  candidates: RetrackCandidate[],
  commit: (entry: RemoteSkillEntry) => void,
  fetchImpl: FetchLike = fetch,
): Promise<{
  results: { skillId: string; name: string; status: 'retracked' | 'failed'; note?: string }[]
}> {
  const results: {
    skillId: string
    name: string
    status: 'retracked' | 'failed'
    note?: string
  }[] = []
  for (const candidate of candidates) {
    const label = candidate.versionLabel ?? ''
    const at = label.lastIndexOf('@')
    if (at <= 0 || at === label.length - 1) {
      results.push({
        skillId: candidate.skillId,
        name: candidate.name,
        status: 'failed',
        note: `版本线溯源串不可解析: ${label === '' ? '（空）' : label}`,
      })
      continue
    }
    const ident = label.slice(0, at)
    try {
      const fetched =
        candidate.source === 'skillhub'
          ? await importFromSkillhub(ident, fetchImpl)
          : await (async () => {
              const [repo, branch] = ident.split('@') as [string, string | undefined]
              return await importFromGithub(repo, branch, fetchImpl)
            })()
      if (fetched.entries.length === 0) {
        results.push({
          skillId: candidate.skillId,
          name: candidate.name,
          status: 'failed',
          note: '远端已找不到该 skill 的内容',
        })
        continue
      }
      // 与 import 端点同一条落账路径：同内容 skipped，但 recordVersion 写入追踪两列 → 建档
      for (const entry of fetched.entries) commit(entry)
      results.push({ skillId: candidate.skillId, name: candidate.name, status: 'retracked' })
    } catch (e) {
      results.push({
        skillId: candidate.skillId,
        name: candidate.name,
        status: 'failed',
        note: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return { results }
}
