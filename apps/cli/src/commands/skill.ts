import { ServerUnreachable, type ApiClient } from '../client'

/**
 * `openvibe skill get <name>`（2026-10-30）：从 OpenVibe 取回指定 skill。
 *
 * ## 语义（三态，按本机实况决定做什么）
 *
 * | 台账状态 | 动作 |
 * |---|---|
 * | 已有本机目录 | 不动，只报路径（已在手，不必再取） |
 * | 远程条目但本机无目录 | **调服务端下载落盘**（远程导入只建档，文件从不落盘） |
 * | 只有库内副本 | 报库内路径 |
 *
 * ## 为什么经服务端而不直连磁盘
 *
 * CLI 不读 SQLite（那是 core 的库），一切经本机 server 的 HTTP 面（m2 §5）。
 * 好处是下载走的是**服务端那条受守卫的出站通道**（https + 主机白名单 + DNS 公网校验，
 * 代理由服务端全局 dispatcher 接管）⇒ CLI 自己不需要出网能力。
 *
 * ⚠️ **CLI 侧零磁盘写**：文件由服务端写到 `~/.openvibe/skills/<name>/`，
 *   CLI 只负责发请求与报结果。
 */

export interface SkillGetOptions {
  /** skill 名（精确匹配，大小写不敏感） */
  name: string
}

export interface SkillGetOutcome {
  name: string
  /** 取回后的本机目录 */
  path: string
  /** 本次是否真的执行了下载（false = 本机已有，报的是现成位置） */
  downloaded: boolean
  /** 文件数 */
  fileCount: number
}

export class SkillGetError extends Error {
  readonly code: string
  readonly detail?: string
  constructor(code: string, message: string, detail?: string) {
    super(message)
    this.name = 'SkillGetError'
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

/** 台账里的一条 skill（只取本命令用得到的字段） */
interface SkillRow {
  id: string
  name: string
  skillDir: string | null
  libraryDir: string | null
  remoteRef: string | null
}

interface DownloadReport {
  targetDir: string
  fileCount: number
}

export async function skillGetAction(
  options: SkillGetOptions,
  deps: { client: ApiClient },
): Promise<SkillGetOutcome> {
  const name = options.name.trim()
  if (name === '') {
    throw new SkillGetError('VALIDATION_ERROR', '请给出 skill 名')
  }

  let items: SkillRow[]
  try {
    const res = await deps.client.getJson<{ items: SkillRow[] }>(
      `/api/skills?q=${encodeURIComponent(name)}`,
    )
    items = res.items
  } catch (e) {
    if (e instanceof ServerUnreachable) throw e
    throw new SkillGetError(
      'SKILL_LOOKUP_FAILED',
      `查询 skill 失败: ${name}`,
      e instanceof Error ? e.message : String(e),
    )
  }

  // ⚠️ **服务端 q 是子串匹配** ⇒ 必须客户端再精确一次，否则 "pdf" 会命中 "pdf-tool"
  const hit = items.find((s) => s.name.toLowerCase() === name.toLowerCase())
  if (hit === undefined) {
    throw new SkillGetError(
      'NOT_FOUND',
      `台账里没有名为「${name}」的 skill（先跑 openvibe scan --skills 登记）`,
    )
  }

  // 已有本机目录 ⇒ 不用取
  if (hit.skillDir !== null) {
    return { name: hit.name, path: hit.skillDir, downloaded: false, fileCount: 0 }
  }
  // 只有库内副本 ⇒ 报库内位置
  if (hit.libraryDir !== null) {
    return { name: hit.name, path: hit.libraryDir, downloaded: false, fileCount: 0 }
  }
  // 远程条目但本机无目录 ⇒ 让服务端下载落盘
  if (hit.remoteRef !== null && hit.remoteRef !== '') {
    let report: DownloadReport
    try {
      report = await deps.client.postJson<DownloadReport>(`/api/skills/${hit.id}/download`, {})
    } catch (e) {
      if (e instanceof ServerUnreachable) throw e
      throw new SkillGetError(
        'SKILL_DOWNLOAD_FAILED',
        `下载 skill 失败: ${hit.name}`,
        e instanceof Error ? e.message : String(e),
      )
    }
    return {
      name: hit.name,
      path: report.targetDir,
      downloaded: true,
      fileCount: report.fileCount,
    }
  }
  throw new SkillGetError('NOT_AVAILABLE', `「${hit.name}」没有本机目录、也没有远程来源，无法获取`)
}
