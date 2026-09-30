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

type FetchLike = typeof fetch

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
  const m = input.match(/github\.com\/([\w.-]+)\/([\w.-]+)/) ?? input.match(/^([\w.-]+)\/([\w.-]+)$/)
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
    throw new AppError('REMOTE_UNREACHABLE', `拉取目录树失败: ${tree.message ?? '未知错误'}`)
  }
  if (tree.truncated === true) {
    warnings.push('仓库文件过多，GitHub 返回的目录树被截断，本次只导入能看到的部分')
  }
  const allBlobs = (tree.tree ?? []).filter((t) => t.type === 'blob')
  // path 过滤（DEV-0068）：只保留子目录下的 blob（'/' 前缀保证不误命中同前缀名目录）
  const blobs = subPath === undefined ? allBlobs : allBlobs.filter((b) => b.path.startsWith(`${subPath}/`) || b.path === subPath)
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
    warnings.push(`仓库含 ${String(roots.length)} 个 skill，超出单次上限 ${String(CAPS.maxSkillsPerRepo)}，已截断`)
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
          const text = await guardedText(`${GH_RAW}/${repo}/${encodeURIComponent(branch)}/${f.path}`, [], fetchImpl)
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
    const fallbackName = root === '' ? repo.split('/')[1] ?? repo : root.split('/').at(-1) ?? root
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
  const fm = skillMd === null ? { ok: false } as const : parseSkillFrontmatter(skillMd)
  const version = files.version ?? detail.latestVersion?.version ?? '0'
  return {
    origin: `skillhub.cn/skills/${slug}@${version}`,
    entries: [
      {
        name: fm.ok === true && fm.name !== undefined ? fm.name : detail.name ?? slug,
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
      const remoteHash = hashSkillEntries(manifest.map((f) => ({ rel: f.path, sha256: f.sha256 }))).dirHash
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

/**
 * 解析版本线溯源串并重导。source 字段决定解析方式（不猜形态）：
 * github → `owner/repo@branch`；skillhub → `slug@version`（version 部分忽略，重导即最新）。
 * 解析失败/远端失败逐条报 failed，不影响其他条目。
 */
export async function retrackRemoteSkills(
  candidates: RetrackCandidate[],
  commit: (entry: RemoteSkillEntry) => void,
  fetchImpl: FetchLike = fetch,
): Promise<{ results: { skillId: string; name: string; status: 'retracked' | 'failed'; note?: string }[] }> {
  const results: { skillId: string; name: string; status: 'retracked' | 'failed'; note?: string }[] = []
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
