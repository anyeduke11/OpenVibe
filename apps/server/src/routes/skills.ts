import type { FastifyInstance } from 'fastify'
import { homedir } from 'node:os'
import {
  AppError,
  SkillCleanupInput,
  SkillCreateInput,
  SkillDownloadInput,
  SkillLibraryInput,
  SkillMergeInput,
  SkillRemoteImportInput,
  SkillRemoteSearchInput,
  SkillRetrackInput,
  SkillRepairInput,
  SkillReviewInput,
  SkillScanInput,
  SkillScanRootsInput,
  SkillUpdateCheckInput,
  SkillUpdateInput,
  type SkillRemoteImportReport,
  type SkillRepairReport,
  type SkillRetrackReport,
  type SkillScanRoot,
} from '@openvibe/shared'
import {
  AppMetaRepo,
  APP_META_KEYS,
  SkillsRepo,
  SqliteSkillLibrary,
  defaultSkillRoots,
  expandKnownRoots,
  skillLibraryRoot,
  type SqliteDatabase,
} from '@openvibe/core'
import { parseOrThrow } from '../lib/validate'
import { reportRoute } from '../lib/route-source'
import {
  checkRemoteUpdates,
  importFromGithub,
  importFromSkillhub,
  retrackRemoteSkills,
  searchSkillhub,
} from '../lib/skill-remote'
import { defaultLibraryTarget, downloadSkillToDisk } from '../lib/skill-download'
import { assetEventInput, resolveLedger, type LedgerDeps } from '../lib/ledger'

export interface SkillRouteDeps extends LedgerDeps {
  db: SqliteDatabase
  /** 远程取数实现注入点（测试 mock 上游；缺省全局 fetch，出站走 http-guard 守卫） */
  fetchImpl?: typeof fetch
}

/** 量小（本地 skill 台账），name/description 过滤在内存做，不引入 SQL LIKE 分支 */
function matchQuery(query: string, text: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

/** dev-plan §3.2 五端点 + 扫描（Web 按钮与 CLI `scan --skills` 打同一入口，m2 §5） */
export function registerSkillRoutes(app: FastifyInstance, deps: SkillRouteDeps): void {
  const skills = new SkillsRepo(deps.db)
  const library = new SqliteSkillLibrary(deps.db)
  const meta = new AppMetaRepo(deps.db)
  const ledger = resolveLedger(deps)

  app.get('/api/skills', reportRoute('/api/skills', 'db'), async (req) => {
    const { q } = req.query as { q?: unknown }
    // 列表要显示版本数（m2 FR-3.1）：台账量小，逐条 count 比新增端点划算
    const all = skills.list().map((s) => ({ ...s, versionCount: skills.versions(s.id).length }))
    const items =
      typeof q === 'string' && q.trim() !== ''
        ? all.filter((s) => matchQuery(q.trim(), s.name) || matchQuery(q.trim(), s.description))
        : all
    return { items, total: items.length }
  })

  app.post('/api/skills', async (req, reply) => {
    const input = parseOrThrow(SkillCreateInput, req.body)
    const created = skills.create(input)
    ledger(assetEventInput('asset_created', 'skill', created.id))
    return reply.code(201).send(created)
  })

  // 静态段先于 :id 匹配（find-my-way 优先级）
  app.post('/api/skills/scan', async (req) => {
    const { roots } = parseOrThrow(SkillScanInput, req.body ?? {})
    // ⚠️ **roots 显式传入时不回落默认**（m2 FR-1.1：空数组即不扫）。
    //   但「没传 roots」≠「不扫」——那是「按配置清单扫」：
    //   用户在设置页配了清单，扫描就该按清单走，而不是每次都扫全盘约定根。
    if (roots !== undefined) return skills.scan(roots)
    const configured = meta.read<SkillScanRoot[] | null>(APP_META_KEYS.skillScanRoots, null)
    if (configured === null) return skills.scan() // 未配置 ⇒ 出厂默认清单
    return skills.scan(configured.filter((r) => r.enabled !== false).map((r) => r.path))
  })

  // 远程源（DEV-0067）：SkillHub 搜索 → 选 slug 导入；GitHub 整仓导入（ref 缺省=默认分支）
  app.post('/api/skills/remote/search', async (req) => {
    const input = parseOrThrow(SkillRemoteSearchInput, req.body)
    if (input.source !== 'skillhub') {
      throw new AppError('VALIDATION_ERROR', '远程搜索当前仅支持 skillhub 源')
    }
    return searchSkillhub(input.q, deps.fetchImpl)
  })

  app.post('/api/skills/remote/import', async (req) => {
    const input = parseOrThrow(SkillRemoteImportInput, req.body)
    const fetched =
      input.source === 'github'
        ? await importFromGithub(input.repo, input.ref, deps.fetchImpl, input.path)
        : await importFromSkillhub(input.slug, deps.fetchImpl)
    const report: SkillRemoteImportReport = {
      source: input.source,
      origin: fetched.origin,
      discovered: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      warnings: [...fetched.warnings],
    }
    for (const entry of fetched.entries) {
      report.discovered += 1
      report[skills.upsertRemote(entry)] += 1
    }
    return report
  })

  // 检查更新（DEV-0068）：树指纹对比，GitHub 整仓一次 trees 调用；ids 缺省=全部远程条目
  app.post('/api/skills/remote/check-updates', async (req) => {
    const { ids } = parseOrThrow(SkillUpdateCheckInput, req.body ?? {})
    const all = skills.list()
    const tracked = all
      .filter(
        (s) =>
          (s.source === 'github' || s.source === 'skillhub') &&
          (ids === undefined || ids.includes(s.id)),
      )
      .map((s) => ({
        skillId: s.id,
        name: s.name,
        source: s.source,
        remoteRef: s.remoteRef,
        remoteTreeHash: s.remoteTreeHash,
      }))
    return checkRemoteUpdates(tracked, deps.fetchImpl)
  })

  // 补档（DEV-0069）：未建档的存量远程条目按版本线溯源串重导一次，写树指纹
  app.post('/api/skills/remote/retrack', async (req) => {
    const { ids } = parseOrThrow(SkillRetrackInput, req.body ?? {})
    const candidates = skills
      .list()
      .filter(
        (s) =>
          (s.source === 'github' || s.source === 'skillhub') &&
          s.remoteRef === null &&
          (ids === undefined || ids.includes(s.id)),
      )
      .map((s) => {
        const versions = skills.versions(s.id)
        return {
          skillId: s.id,
          name: s.name,
          source: s.source,
          versionLabel: versions.at(-1)?.versionLabel ?? null,
        }
      })
    const report: SkillRetrackReport = { items: [], summary: { retracked: 0, failed: 0 } }
    const { results } = await retrackRemoteSkills(
      candidates,
      (entry) => {
        skills.upsertRemote(entry)
      },
      deps.fetchImpl,
    )
    for (const r of results) {
      report.items.push(r)
      report.summary[r.status] += 1
    }
    return report
  })

  // 整合（DEV-0073）：同内容组选保留项，其余被吸收（版本线搬移、目标并集、目录继承）
  app.post('/api/skills/merge', async (req) => {
    const { keepId, absorbIds } = parseOrThrow(SkillMergeInput, req.body)
    const merged = skills.mergeSkills(keepId, absorbIds)
    return { keptId: keepId, ...merged }
  })

  // 名称修复（DEV-0073）：quoted 去引号改名；convention 规范化改名并重写 SKILL.md；
  // 建议名撞已有条目时自动并入。逐条独立结算，单条失败不影响其余。
  app.post('/api/skills/repair', async (req) => {
    const { ids } = parseOrThrow(SkillRepairInput, req.body)
    const report: SkillRepairReport = {
      items: [],
      summary: { renamed: 0, merged: 0, notApplicable: 0, failed: 0 },
    }
    for (const id of [...new Set(ids)]) {
      const skill = skills.get(id)
      if (skill === null) {
        report.items.push({ id, name: '', status: 'failed', note: `skill 不存在: ${id}` })
        report.summary.failed += 1
        continue
      }
      const r = skills.repairName(id)
      report.items.push({ id, name: skill.name, ...r })
      if (r.status === 'not-applicable') report.summary.notApplicable += 1
      else report.summary[r.status] += 1
    }
    return report
  })

  // 重复整理报告（DEV-0067）：只报告不删，删除由客户端按 id 走既有 DELETE 逐条确认
  app.get(
    '/api/skills/duplicates',
    // ⚠️ 磁盘态：报告里的「失效目录」一段判「本地目录还在不在」⇒ 目录随时会消失。
    reportRoute(
      '/api/skills/duplicates',
      'filesystem',
      '报告里的「失效目录」一段逐条判本地 skill 目录还在不在 ⇒ 目录被删即变',
    ),
    async () => {
      return skills.duplicates()
    },
  )

  // 内置审查（DEV-0067）：ids 缺省=全量；无本地目录的条目仅元数据审查
  app.post('/api/skills/review', async (req) => {
    const { ids } = parseOrThrow(SkillReviewInput, req.body ?? {})
    return skills.review(ids)
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 扫描根配置（2026-10-30：改成可配置清单，覆盖国内主流 agent）
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 读扫描根清单。
   *
   * ⚠️ **键不存在 ≠ 空数组**：键不存在 ⇒ `configured=false` ⇒ 扫描走出厂默认清单
   *   （约定式发现 ∪ 已知 agent 路径）；用户显式清空（值为 `[]`）才是「真的不扫」。
   *   两者必须能区分，否则「清空清单」会被当成「没配置过」而回落默认。
   */
  app.get(
    '/api/skills/scan-roots',
    // ⚠️ 混合态：**已配置**时结论全在库表（app_meta 的清单）；
    //   **未配置**时走 `defaultSkillRoots()` —— 那是一次磁盘发现（home 下的约定目录）。
    //   ⇒ 两种状态的结论来源不同 ⇒ 标 mixed（按磁盘态处理，前端现算）。
    reportRoute(
      '/api/skills/scan-roots',
      'mixed',
      '已配置时结论在库表；未配置时走 defaultSkillRoots() —— 那是一次磁盘发现（home 下的约定目录）',
    ),
    async () => {
      const raw = meta.read<SkillScanRoot[] | null>(APP_META_KEYS.skillScanRoots, null)
      if (raw === null) {
        // 未配置 ⇒ 出厂默认清单（只给存在的那些，避免清单里塞一堆死路径）
        const items = defaultSkillRoots().map((path) => ({ path, enabled: true }))
        return { roots: items.map((i) => i.path), items, configured: false }
      }
      const items = raw.map((r) => ({ path: r.path, enabled: r.enabled !== false }))
      return {
        roots: items.filter((i) => i.enabled).map((i) => i.path),
        items,
        configured: true,
      }
    },
  )

  /**
   * 写扫描根清单（整份覆盖）。空数组 = 显式清空 = 之后扫描不扫任何根。
   *
   * ⚠️ **停用的根仍留在清单里**：用户「暂时不扫这个目录」不该把它从清单里抹掉
   *   ——抹掉就再也找不回来了。停用只影响「这次扫不扫」。
   */
  app.post('/api/skills/scan-roots', async (req) => {
    const { roots } = parseOrThrow(SkillScanRootsInput, req.body ?? {})
    const seen = new Set<string>()
    const items = roots
      .filter((r) => {
        if (seen.has(r.path)) return false
        seen.add(r.path)
        return true
      })
      .map((r) => ({ path: r.path, enabled: r.enabled !== false }))
    meta.write(APP_META_KEYS.skillScanRoots, items)
    return {
      roots: items.filter((i) => i.enabled).map((i) => i.path),
      items,
      configured: true,
    }
  })

  /** 出厂默认清单（相对 home 的已知 agent 路径，含「本机是否存在」标记） */
  app.get(
    '/api/skills/scan-roots/defaults',
    // ⚠️ 磁盘态：`expandKnownRoots` 逐条判「这个目录在本机存在吗」⇒ 装了/删了 agent 即变。
    reportRoute(
      '/api/skills/scan-roots/defaults',
      'filesystem',
      'expandKnownRoots 逐条判「这个 agent 目录在本机存在吗」⇒ 装了或删了 agent 即变',
    ),
    async () => ({
      items: expandKnownRoots(homedir()),
      /** 库根：OpenVibe 自己的 skill 存放处 */
      libraryRoot: skillLibraryRoot(),
    }),
  )

  // ───────────────────────────────────────────────────────────────────────────
  // Skill 库（2026-10-30：独立于其他 agent 的备份与生命周期）
  // ───────────────────────────────────────────────────────────────────────────

  /** 备份到库：把 skill 的文件复制一份到 ~/.openvibe/skills/<name>/ */
  app.post('/api/skills/:id/library/backup', async (req) => {
    const { id } = req.params as { id: string }
    const skill = skills.get(id)
    if (skill === null) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    const r = library.backup(id)
    return { skillId: id, name: skill.name, ...r }
  })

  /** 从库恢复：把库内副本写回原 skill 目录（或指定目标目录） */
  app.post('/api/skills/:id/library/restore', async (req) => {
    const { id } = req.params as { id: string }
    const skill = skills.get(id)
    if (skill === null) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    const { targetDir } = parseOrThrow(SkillLibraryInput, req.body ?? {})
    const r = library.restore(id, targetDir)
    return { skillId: id, name: skill.name, targetDir: r.targetDir, fileCount: r.fileCount }
  })

  /** 移出库：删副本并清空台账列（原 skill 目录不动） */
  app.post('/api/skills/:id/library/remove', async (req) => {
    const { id } = req.params as { id: string }
    const skill = skills.get(id)
    if (skill === null) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    library.remove(id)
    return { skillId: id, name: skill.name }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 下载落盘（2026-10-30：远程 skill 真正下到本地）
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 下载远程 skill 并落盘。
   *
   * ⚠️ 落点缺省 = OpenVibe 的 skill 库目录 —— 与任何 agent 的目录无关。
   *   出站走 http-guard（https + 主机白名单 + DNS 公网校验），
   *   代理由 server 启动时的全局 dispatcher 接管（代理与直连同一套代码）。
   */
  app.post('/api/skills/:id/download', async (req) => {
    const { id } = req.params as { id: string }
    const skill = skills.get(id)
    if (skill === null) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
    const input = parseOrThrow(SkillDownloadInput, req.body ?? {})
    const remoteRef = input.remoteRef ?? skill.remoteRef
    if (remoteRef === null || remoteRef === '') {
      throw new AppError('VALIDATION_ERROR', `该 skill 没有远程溯源串，无法下载: ${skill.name}`)
    }
    const targetDir = input.targetDir ?? defaultLibraryTarget(skill.name)
    const r = await downloadSkillToDisk({
      remoteRef,
      targetDir,
      ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }),
    })
    // 落盘后把台账指到落点：skillDir 有了值，这条 skill 从「仅建档」变成「本机可用」
    //
    // ⚠️ **remote_ref 必须一并写回**：它是「检查更新」与「重新下载」的唯一依据。
    //   不写回 ⇒ 台账里这条仍像本地条目 ⇒ 界面不给下载按钮、也查不了更新。
    //   只在原来为空时写（已有溯源串的条目保留自己的，别被本次参数覆盖）。
    deps.db
      .prepare(
        `UPDATE skills SET skill_dir = ?, library_dir = ?,
           remote_ref = COALESCE(remote_ref, ?), updated_at = ? WHERE id = ?`,
      )
      .run(r.targetDir, r.targetDir, remoteRef, new Date().toISOString(), id)
    return {
      skillId: id,
      name: skill.name,
      targetDir: r.targetDir,
      fileCount: r.fileCount,
      dirHash: r.dirHash,
      origin: r.origin,
      warnings: r.warnings,
    }
  })

  // ───────────────────────────────────────────────────────────────────────────
  // 失效条目清理（2026-10-30：一键批量清理）
  // ───────────────────────────────────────────────────────────────────────────

  /** 清理预检：只报告，不删 */
  app.get(
    '/api/skills/cleanup',
    // ⚠️ 磁盘态：逐条判「skill 目录还在不在」⇒ 目录随时会消失。
    // （真机实测 2026-10-30 踩到过：走 query 缓存 ⇒ 服务端 2 条 / 界面 0 条。）
    reportRoute(
      '/api/skills/cleanup',
      'filesystem',
      '逐条判「skill 目录还在不在」⇒ 目录被删即变（真机实测 2026-10-30 踩到过：走 query 缓存 ⇒ 服务端 2 条 / 界面 0 条）',
    ),
    async () => {
      return skills.cleanupPreview()
    },
  )

  /** 一键批量清理：删「路径已消失 ∧ 不可下载 ∧ 无副本」的台账条目 */
  app.post('/api/skills/cleanup', async (req) => {
    const input = parseOrThrow(SkillCleanupInput, req.body ?? {})
    return skills.cleanup({
      ...(input.ids === undefined ? {} : { ids: input.ids }),
      includeBackedUp: input.includeBackedUp,
      // 副本的文件由库自己清（它是唯一知道「库根怎么解析」的地方）
      onRemove: (items) => library.removeCopies(items.map((i) => i.id)),
    })
  })

  app.get(
    '/api/skills/:id/versions',
    reportRoute('/api/skills/:id/versions', 'db'),
    async (req) => {
      const { id } = req.params as { id: string }
      if (!skills.get(id)) throw new AppError('NOT_FOUND', `skill 不存在: ${id}`)
      const items = skills.versions(id)
      return { items, total: items.length }
    },
  )

  app.patch('/api/skills/:id', async (req) => {
    const { id } = req.params as { id: string }
    const patch = parseOrThrow(SkillUpdateInput, req.body)
    const updated = skills.update(id, patch)
    ledger(assetEventInput('asset_updated', 'skill', id))
    return updated
  })

  app.delete('/api/skills/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    // ⚠️ **先移出库再删台账**：库内副本的文件由 library 独占管理（它是唯一知道
    //   「库根怎么解析」的地方）。顺序反了 ⇒ 台账行没了就查不到副本路径 ⇒ 孤儿目录。
    library.remove(id)
    skills.delete(id)
    return reply.code(204).send()
  })
}
