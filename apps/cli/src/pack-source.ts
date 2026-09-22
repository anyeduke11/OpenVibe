import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileSha256, fingerprintOf, type PackFileWithHash } from '@openvibe/core'
import {
  PACK_FILE_MANIFEST,
  PACK_FILES_SUBDIR,
  PackBundleSchema,
  PackManifestSchema,
  SCHEMA_VERSION,
  compareCodeUnit,
  compareSemver,
  type PackExportOut,
  type PackManifest,
  type PackOut,
  type ProjectOut,
} from '@openvibe/shared'
import { ApiError, type ApiClient } from './client'

/**
 * 包来源解析（m6b FR-2.1）：--pack（在线 bundle）/ --file（离线单文件）/ --dir（离线导出目录）
 * 三选一，外加「缺省取项目登记包」。三条通道在验签后汇成同一个 LoadedPack，
 * 因此篡改与不兼容 schemaVersion 只需在这一处防（design §7.6 CLI 侧重算校验）。
 */

export type SourceErrorCode =
  | 'SOURCE_CONFLICT'
  | 'SOURCE_READ'
  | 'BAD_JSON'
  | 'SCHEMA_UNSUPPORTED'
  | 'BUNDLE_INVALID'
  | 'MANIFEST_MISMATCH'
  | 'CONTENT_MODIFIED'
  | 'FINGERPRINT_MISMATCH'

export class SourceError extends Error {
  readonly code: SourceErrorCode
  readonly details?: unknown
  constructor(code: SourceErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'SourceError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export interface LoadedPack {
  manifest: PackManifest
  /** 码点序 + 已按 manifest 重算核对过的内容 */
  files: PackFileWithHash[]
  fingerprint: string
  origin: string
}

export interface SourceFlags {
  pack?: string
  file?: string
  dir?: string
}

/** `name[@version]`：版本段可选，semver 字面量由调用方校验 */
export function parsePackRef(ref: string): { name: string; version: string | null } {
  const at = ref.lastIndexOf('@')
  if (at <= 0) return { name: ref, version: null }
  return { name: ref.slice(0, at), version: ref.slice(at + 1) || null }
}

export function assertSourceExclusive(flags: SourceFlags): void {
  const given = [flags.pack, flags.file, flags.dir].filter((v) => v !== undefined).length
  if (given > 1) {
    throw new SourceError(
      'SOURCE_CONFLICT',
      '--pack / --file / --dir 三选一（离线模式不访问服务端），当前同时给了 ' +
        [
          flags.pack !== undefined ? '--pack' : null,
          flags.file !== undefined ? '--file' : null,
          flags.dir !== undefined ? '--dir' : null,
        ]
          .filter((s): s is string => s !== null)
          .join(' / '),
    )
  }
}

function readJsonFile(path: string, label: string): unknown {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new SourceError('SOURCE_READ', `读不到${label}：${path}（${(e as Error).message}）`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new SourceError('BAD_JSON', `${label} 不是合法 JSON：${path}（${(e as Error).message}）`)
  }
}

/** §6.7：契约版本不兼容必须先于 zod 报出来，否则用户只看到一句字段错误 */
function assertContractVersion(raw: unknown, origin: string): void {
  // 合法 JSON、非法包体（`null`、一个数字）在这里先挡下：下面的属性读取否则会变成 TypeError
  if (raw === null || typeof raw !== 'object') {
    throw new SourceError(
      'BUNDLE_INVALID',
      `${origin} 顶层不是 JSON 对象，无法按标准包契约校验（design §7.1）`,
    )
  }
  const obj = raw as { bundleSchemaVersion?: unknown; schemaVersion?: unknown; manifest?: unknown }
  const candidates: [string, unknown][] = [
    ['bundle schemaVersion', obj.bundleSchemaVersion],
    [
      'manifest schemaVersion',
      typeof obj.manifest === 'object' && obj.manifest
        ? (obj.manifest as { schemaVersion?: unknown }).schemaVersion
        : obj.schemaVersion,
    ],
  ]
  for (const [label, value] of candidates) {
    if (typeof value === 'number' && value !== SCHEMA_VERSION) {
      throw new SourceError(
        'SCHEMA_UNSUPPORTED',
        `${origin} 的 ${label} 为 ${value}，本 CLI 只支持 ${SCHEMA_VERSION}——请升级 CLI（npx openvibe-cli@latest）后重试`,
        { schemaVersion: value, supported: SCHEMA_VERSION },
      )
    }
  }
}

/**
 * 三条通道共用的验签：manifest 与内容互相对齐（路径集、逐文件哈希、整体指纹）。
 * 任何一步不过都整包拒绝——CLI 从此不再触碰磁盘。
 */
export function verifyPack(
  raw: unknown,
  contents: Readonly<Record<string, string | undefined>>,
  origin: string,
): LoadedPack {
  const manifestResult = PackManifestSchema.safeParse(
    (raw as { manifest?: unknown }).manifest ?? raw,
  )
  if (!manifestResult.success) {
    const issue = manifestResult.error.issues[0]
    throw new SourceError(
      'BUNDLE_INVALID',
      `${origin} 不符合标准包契约（design §7.2）：${issue ? `${issue.path.join('.')} ${issue.message}` : '未知字段错误'}`,
      { issues: manifestResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    )
  }
  const manifest = manifestResult.data

  const wanted = manifest.files.map((f) => f.path).sort(compareCodeUnit)
  const provided = Object.keys(contents).sort(compareCodeUnit)
  const missing = wanted.filter((p) => contents[p] === undefined)
  const extra = provided.filter((p) => !wanted.includes(p))
  if (missing.length > 0 || extra.length > 0) {
    throw new SourceError(
      'MANIFEST_MISMATCH',
      `${origin} 的文件清单与内容不一致：缺 ${missing.length} 个、多 ${extra.length} 个（整包拒绝）`,
      { missing, extra },
    )
  }

  const modified: string[] = []
  const files: PackFileWithHash[] = []
  for (const path of wanted) {
    const content = contents[path]
    if (content === undefined) {
      throw new SourceError('MANIFEST_MISMATCH', `${origin} 缺少文件内容：${path}`, { path })
    }
    const actual = fileSha256(content)
    if (actual !== declaredSha(manifest, path)) modified.push(path)
    files.push({ path, content, sha256: actual })
  }
  if (modified.length > 0) {
    throw new SourceError(
      'CONTENT_MODIFIED',
      `${modified.length} 个文件内容与 manifest 声明的哈希不符（传输损坏或被篡改），整包拒绝：${modified.join('、')}`,
      { modified },
    )
  }

  const fingerprint = fingerprintOf(files)
  if (fingerprint !== manifest.fingerprint) {
    throw new SourceError(
      'FINGERPRINT_MISMATCH',
      `包指纹校验失败：期望 ${manifest.fingerprint}，实算 ${fingerprint}（整包拒绝，零写入）`,
      { expected: manifest.fingerprint, actual: fingerprint },
    )
  }
  return { manifest, files, fingerprint, origin }
}

function declaredSha(manifest: PackManifest, path: string): string {
  const entry = manifest.files.find((f) => f.path === path)
  return entry ? entry.sha256 : ''
}

/** --file / API 返回的单文件 bundle */
export function loadBundleJson(raw: unknown, origin: string): LoadedPack {
  assertContractVersion(raw, origin)
  const bundleResult = PackBundleSchema.safeParse(raw)
  if (!bundleResult.success) {
    const issue = bundleResult.error.issues[0]
    throw new SourceError(
      'BUNDLE_INVALID',
      `${origin} 不是合法 bundle（design §7.1）：${issue ? `${issue.path.join('.')} ${issue.message}` : '未知字段错误'}`,
    )
  }
  const contents: Record<string, string> = {}
  for (const file of bundleResult.data.files) contents[file.path] = file.content
  return verifyPack(bundleResult.data, contents, origin)
}

/** --dir：`<dir>/openvibe.pack.json` + `<dir>/files/<相对路径>`（design §7.1 目录形态） */
export function loadPackDir(dir: string): LoadedPack {
  const manifestPath = join(dir, PACK_FILE_MANIFEST)
  const raw = readJsonFile(manifestPath, '目录导出的 manifest')
  assertContractVersion(raw, dir)
  const contents: Record<string, string> = {}
  const manifest = PackManifestSchema.safeParse(raw)
  if (manifest.success) {
    for (const entry of manifest.data.files) {
      const file = join(dir, PACK_FILES_SUBDIR, entry.path)
      if (!existsSync(file)) {
        throw new SourceError('SOURCE_READ', `目录导出缺少文件：${file}`, { path: entry.path })
      }
      contents[entry.path] = readFileSync(file, 'utf8')
    }
  }
  return verifyPack(raw, contents, dir)
}

/** 在线：packName（可带 @version）→ 最新/指定导出的 bundle */
export async function loadPackFromServer(client: ApiClient, ref: string): Promise<LoadedPack> {
  const { name, version } = parsePackRef(ref)
  const list = await client.getJson<{ items: PackOut[] }>('/api/packs')
  const pack = list.items.find((p) => p.name === name)
  if (!pack) {
    throw new ApiError(
      404,
      'NOT_FOUND',
      `服务端没有名为 ${name} 的标准包`,
      '先在 Web /packs 建包并导出一个版本',
    )
  }
  const exports = await client.getJson<{ items: PackExportOut[] }>(`/api/packs/${pack.id}/exports`)
  const chosen = pickExport(exports.items, version)
  const bundle = await client.getJson<unknown>(`/api/packs/${pack.id}/exports/${chosen.id}/bundle`)
  return loadBundleJson(bundle, `服务端 ${pack.name}@${chosen.version}`)
}

/** 导出清单顺序由服务端决定（且已知按 exported_at 而非 semver），故 CLI 自己按版本号取最新 */
export function pickExport(items: readonly PackExportOut[], version: string | null): PackExportOut {
  if (version) {
    const exact = items.find((e) => e.version === version)
    if (!exact) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        `标准包没有 ${version} 版本的导出：现有导出 ${items.map((e) => e.version).join('、') || '(无)'}`,
      )
    }
    return exact
  }
  if (items.length === 0) {
    throw new ApiError(404, 'NOT_FOUND', '该标准包尚未导出任何版本，无法注入')
  }
  return items.reduce((best, cur) => (compareSemver(cur.version, best.version) > 0 ? cur : best))
}

/** 缺省来源：项目登记包（m6b FR-2.1），按 localPath 精确匹配 */
export async function findRegisteredPack(
  client: ApiClient,
  projectPath: string,
): Promise<{ packId: string; name: string; version: string | null } | null> {
  const list = await client.getJson<{ items: (ProjectOut & { localPath: string | null })[] }>(
    '/api/projects?status=all',
  )
  const target = resolve(projectPath)
  const project = list.items.find((p) => p.localPath && resolve(p.localPath) === target)
  if (!project || !project.standardPackId) return null
  const packs = await client.getJson<{ items: PackOut[] }>('/api/packs')
  const pack = packs.items.find((p) => p.id === project.standardPackId)
  if (!pack) return null
  return { packId: pack.id, name: pack.name, version: project.standardPackVersion }
}

/** --target adapter 子集 → 本次写入路径集（m6b FR-2.7） */
export function targetPathsFor(
  paths: readonly string[],
  adapterPaths: ReadonlySet<string>,
  auxPaths: ReadonlySet<string>,
): string[] {
  return paths.filter((p) => adapterPaths.has(p) || auxPaths.has(p))
}
