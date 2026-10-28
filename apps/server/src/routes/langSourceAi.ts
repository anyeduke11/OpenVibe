import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, SourceInterpretSummary } from '@openvibe/shared'
import {
  capabilityOf,
  formatInterpretMarkdown,
  interpretSourceFindings,
  keychainAccount,
  providerCollectionView,
  readFindings,
  readProviderCollection,
  readProjectRoot,
  readSnippet,
  readSnippets,
  resolveProvider,
  resolveProviderRunner,
  writeProviderCollection,
  SourceServiceError,
  type SourceInterpretRunner,
  type SqliteDatabase,
} from '@openvibe/core'
import { KEYCHAIN_SERVICE, realKeychainStore, type KeychainStore } from '@openvibe/core'
import {
  InterpretProviderCollectionSave,
  type InterpretProviderEntry as InterpretProviderEntryType,
  type InterpretProviderKeyStorage,
} from '@openvibe/shared'

/**
 * M9「源码解读」（T2）端点（`m9-dev-language-roadmap.md` §3.8 / §5.5 / §7 DL-08 / DL-09 ·
 * dev-plan §6.11 P5.1 ~ P5.4）。
 *
 * 端点清单：
 * - `GET  /api/lang/snippet` —— 读命中行附近的**本地源码**（T1 硬要求：勾选前要看到全文）；
 * - `GET  /api/lang/interpret/capability` —— AI 是否可用（界面据此决定**要不要渲染 T2 区**）；
 * - `GET  /api/lang/interpret/providers` —— **多份** provider 配置（脱敏视图）；
 * - `PUT  /api/lang/interpret/providers` —— **整份覆盖**那多份配置；
 * - `POST /api/lang/interpret` —— 解读**勾选过的**片段。
 *
 * ## ⚠️ `/api/lang/snippet` 是**本地读**，不是出网
 *
 * 它读的是用户本机项目里的文件，显示在用户自己的屏幕上 ⇒ 不属于「出网」。
 * ⚠️ 但它**必须是受控的**：路径必须相对项目根、不许 `..`、不许越界（core 侧兜住）。
 *
 * ## ⚠️ runner 从**环境变量**解析（仓内不硬编任何 provider）
 *
 * `OPENVIBE_M9_INTERPRETER`（命令）＋ `OPENVIBE_M9_INTERPRETER_MODEL` ＋
 * `OPENVIBE_M9_INTERPRETER_PROVIDER`。
 * ⚠️ **没配 ⇒ AI 不可用** ⇒ 界面**不渲染** T2 区（DL-08），
 *   而不是渲染一个「失败」态 —— 「没配」与「跑挂了」是两件事。
 *
 * ## ⚠️ 增强 2：**多份 provider 配置并存**（owner 2026-10-22）
 *
 * - 端点从 `/api/lang/interpret/provider`（单数）改成 `/api/lang/interpret/providers`（复数）
 *   —— 出参/入参都是**集合**（`{ providers: [...], default_provider_id }`）。
 * - **选哪一份**（口径在 core 的 `selectProviderEntry`，此处只透传）：
 *   **显式 `provider_id` → 按 `project_id` 绑定 → 默认那一份**。
 * - **每份各有一把 key** ⇒ 钥匙串项**按配置 id 分账号**（`keychainAccount`）。
 */

export interface LangSourceAiRouteDeps {
  db: SqliteDatabase
  /** runner（**注入优先**；没注入则从环境变量解析） */
  runner?: SourceInterpretRunner | null
  /** 参照时刻（**注入测试用**） */
  now?: () => Date
  /**
   * **钥匙串后端**（**注入优先**；没注入则用真的 macOS `security`）。
   *
   * ⚠️ **单测必须注入内存实现** —— 否则测试会去动用户**真实的**系统钥匙串。
   */
  keychain?: KeychainStore
}

const SnippetQuery = z.object({
  project: z.string().min(1),
  finding_id: z.coerce.number().int().positive(),
})

const ProjectQuery = z.object({
  project: z.string().min(1),
})

/** 能力探测的查询参数（**两个都可选**）。 */
const CapabilityQuery = z.object({
  /** 显式探测哪一份（**优先级最高**） */
  provider_id: z.string().optional(),
  /** 按项目选（**次之**） */
  project_id: z.string().optional(),
})

const InterpretBody = z.object({
  project_id: z.string().min(1),
  finding_ids: z.array(z.number().int().positive()),
  /**
   * 用户**动过**勾选没有（owner 2026-10-22）。
   *
   * ⚠️ **只影响台账的分类**，不影响「发了什么」——
   *   服务端仍然按**自己算出来的**勾选集合出网 ⇒ 这里撒谎最多让审计分类失真。
   */
  user_touched: z.boolean().optional(),
  /**
   * **用哪一份配置**（增强 2；**缺省** = 按项目选 → 默认那一份）。
   *
   * ⚠️ **选了哪一份是服务端的事实** ⇒ 台账里记的是**那一份的** provider/模型。
   */
  provider_id: z.string().optional(),
})

/** 导出请求（**只带结果**，不带片段正文 —— 那些压根没进这个形状）。 */
const InterpretExportBody = z.object({
  summary: SourceInterpretSummary,
})

/** 文件名里只留安全字符（项目 id 可能带斜杠等）。 */
function safeFileName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '')
  return cleaned === '' ? 'project' : cleaned
}

/**
 * **key 的三种情形**（**口径只留一处** —— 多份并存时每一份都走这一个函数）。
 *
 * | 客户端给的东西 | 落成什么 |
 * |---|---|
 * | **缺省**（字段没有） | **保持原值**（改一下模型名不该把 key 抹掉） |
 * | **空串** | **清除**（⇒ 钥匙串里那一项也要删，不然是「删了但还在」） |
 * | **新 key** | 先试**系统钥匙串** ⇒ 不成才**降级为明文**（降级必须如实标出来） |
 *
 * @param submitted 客户端提交的那把（`undefined` = 缺省）
 * @param current 这一份**当前**的配置（新的那份没有「原值」）
 * @param keychain 钥匙串后端
 */
async function applyKeyState(
  submitted: string | undefined,
  current: InterpretProviderEntryType,
  keychain: KeychainStore,
): Promise<{ api_key: string; api_key_storage: InterpretProviderKeyStorage }> {
  if (submitted === undefined) {
    return { api_key: current.api_key, api_key_storage: current.api_key_storage }
  }
  if (submitted.trim() === '') {
    await keychain.remove(KEYCHAIN_SERVICE, keychainAccount(current.id))
    return { api_key: '', api_key_storage: 'none' }
  }
  const secret = submitted.trim()
  const written = await keychain.store(KEYCHAIN_SERVICE, keychainAccount(current.id), secret)
  if (written.ok) {
    // ⚠️ **钥匙串模式：配置里**不留** key 本身**（只留一个标记）
    return { api_key: '', api_key_storage: 'keychain' }
  }
  // ⚠️ **降级**：本机没有可用的钥匙串 ⇒ key 只能明文存 ⇒ **必须如实标出来**
  return { api_key: secret, api_key_storage: 'inline' }
}

/** 端点必须像 URL（配错的东西不该等到「真跑一次」才暴露）。 */
function endpointLooksLikeUrl(endpoint: string): boolean {
  try {
    const u = new URL(endpoint)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function registerLangSourceAiRoutes(
  app: FastifyInstance,
  deps: LangSourceAiRouteDeps,
): void {
  const now = deps.now ?? (() => new Date())
  const keychain = deps.keychain ?? realKeychainStore
  /**
   * runner 解析：**注入优先**；注入的 `null` 表示「明确没有」；
   * 没注入 ⇒ 看**设置页配的**（配置优先）⇒ 再回退环境变量（`resolveProviderRunner` 内）。
   *
   * ⚠️ **是异步的** —— key 可能在**系统钥匙串**里 ⇒ 读它要起子进程。
   *
   * @param sel 选哪一份（**显式 id → 按项目 → 默认**）
   */
  const resolveRunner = async (sel: {
    providerId?: string
    projectId?: string
  }): Promise<SourceInterpretRunner | null> =>
    deps.runner === undefined
      ? await resolveProviderRunner(deps.db, process.env, keychain, sel)
      : deps.runner

  app.get('/api/lang/snippet', async (req) => {
    const parsed = SnippetQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 与 finding_id 必填')
    }
    let root: string
    try {
      root = readProjectRoot(deps.db, parsed.data.project)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const hit = readFindings(deps.db, parsed.data.project).find(
      (f) => f.id === parsed.data.finding_id,
    )
    if (hit === undefined) {
      throw new AppError('NOT_FOUND', '这条命中不在最近一次扫描里')
    }
    const read = readSnippet(root, hit.file_rel_path, hit.line)
    if (read.window === null) {
      // ⚠️ **读不到就如实说读不到**（文件被删了 / 读不了）—— 不编内容，也不假装空
      //   ⇒ 并把**原因**带出去（界面要能区分「文件没了」与「行号越界」）
      throw new AppError('NOT_FOUND', '读不到这个片段（文件可能已删除或无法读取）', {
        reason: read.failure ?? 'unreadable',
      })
    }
    return {
      finding_id: hit.id,
      path: read.window.path,
      start_line: read.window.start_line,
      end_line: read.window.end_line,
      lines: read.window.lines,
      failure: null,
      topic_slug: hit.topic_slug,
      topic_title: hit.topic_title,
    }
  })

  app.get('/api/lang/snippets', async (req) => {
    const parsed = ProjectQuery.safeParse(req.query)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project 必填')
    }
    let root: string
    try {
      root = readProjectRoot(deps.db, parsed.data.project)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const findings = readFindings(deps.db, parsed.data.project)
    const windows = readSnippets(root, findings)
    return {
      snippets: findings.map((f) => {
        const read = windows.get(f.id)
        const w = read?.window
        return {
          finding_id: f.id,
          path: f.file_rel_path,
          start_line: w?.start_line ?? null,
          end_line: w?.end_line ?? null,
          lines: w?.lines ?? null,
          // ⚠️ **读不到的原因**（界面据此显示不同的提示，不是同一个兜底）
          failure: w === undefined ? null : (read?.failure ?? null),
          topic_slug: f.topic_slug,
          topic_title: f.topic_title,
        }
      }),
    }
  })

  app.get('/api/lang/interpret/capability', async (req) => {
    // ⚠️ **注入优先**（测试注入的 runner 直接算「可用」）；
    //   没注入 ⇒ 走配置层探测（**三档 ＋ 人话原因** —— 设置页要告诉用户「为什么不可用」）。
    if (deps.runner !== undefined) {
      return capabilityOf({
        runner: deps.runner,
        status: deps.runner === null ? 'unconfigured' : 'ready',
        detail: deps.runner === null ? 'AI 解读不可用' : 'AI 解读可用',
      })
    }
    const parsed = CapabilityQuery.safeParse(req.query ?? {})
    const sel = {
      providerId: parsed.success ? parsed.data.provider_id : undefined,
      projectId: parsed.success ? parsed.data.project_id : undefined,
    }
    return capabilityOf(await resolveProvider(deps.db, process.env, keychain, sel))
  })

  // ============ provider 配置（owner 2026-10-22 裁决一：手动调控 ＋ 增强 2：多份并存）============

  /**
   * 读 provider 配置集合（**脱敏视图** —— key 只给末 4 位）。
   *
   * ⚠️ **读端永不回显 key 全文**：视图形状里**装不下**全文
   *   ⇒ 这件事在类型上就发生不了。
   */
  app.get('/api/lang/interpret/providers', async () => {
    const { collection } = readProviderCollection(deps.db)
    // ⚠️ **每份的 key 各自解析**（各有各的钥匙串项）⇒ 视图要显示各自那一把的末 4 位
    return providerCollectionView(collection, keychain)
  })

  /**
   * 写 provider 配置集合（**整份覆盖**；`api_key` 除外）。
   *
   * ⚠️ **`api_key` 缺省 = 保持原值**，**空串 = 清除** ——
   *   因为读端**只回显末 4 位**（回显不了全文）⇒ 若「缺省」被当成「清空」，
   *   用户改一下模型名就会把 key 抹掉。
   *   ⇒ 想清 key 要**显式**传空串。
   */
  app.put('/api/lang/interpret/providers', async (req) => {
    const parsed = InterpretProviderCollectionSave.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'provider 配置不合法')
    }
    if (parsed.data.providers.length === 0) {
      throw new AppError('VALIDATION_ERROR', '至少要留一份 provider 配置')
    }

    const current = readProviderCollection(deps.db).collection
    const currentById = new Map(current.providers.map((p) => [p.id, p]))
    const usedIds = new Set<string>()

    const entries: InterpretProviderEntryType[] = []
    for (const item of parsed.data.providers) {
      // ---- id：空 ⇒ 服务端生成；重复 ⇒ 拒绝（id 是「哪一份」的锚）----
      let id = item.id.trim()
      if (id === '') {
        let n = 1
        id = `p-${String(n)}`
        while (usedIds.has(id)) {
          n += 1
          id = `p-${String(n)}`
        }
      }
      if (usedIds.has(id)) {
        throw new AppError('VALIDATION_ERROR', `provider 配置的 id 重复了（${id}）`)
      }
      usedIds.add(id)

      const prev = currentById.get(id)
      const base: InterpretProviderEntryType = {
        enabled: item.enabled,
        kind: item.kind,
        cmd: item.cmd,
        args: [...item.args],
        endpoint: item.endpoint,
        model: item.model,
        provider: item.provider,
        api_key: '',
        api_key_storage: 'none',
        timeout_ms: item.timeout_ms,
        id,
        name: item.name,
        projects: [...item.projects],
      }
      // ---- key 的三种情形（**口径只留一处**）----
      const keyState = await applyKeyState(item.api_key, prev ?? base, keychain)
      const next: InterpretProviderEntryType = { ...base, ...keyState }

      if (next.kind === 'openai_http' && next.endpoint.trim() !== '') {
        // ⚠️ **端点必须像 URL** —— 不校验的话，配错的东西会等到「真跑一次」才暴露
        if (!endpointLooksLikeUrl(next.endpoint.trim())) {
          throw new AppError('VALIDATION_ERROR', '端点必须是一个 http:// 或 https:// 地址')
        }
      }
      entries.push(next)
    }

    // ⚠️ **默认那一份必须存在** —— 不存在就落到第一份（**绝不指向空气**）
    const wantedDefault = parsed.data.default_provider_id.trim()
    const defaultProviderId =
      wantedDefault !== '' && entries.some((e) => e.id === wantedDefault)
        ? wantedDefault
        : (entries[0]?.id ?? '')

    writeProviderCollection(deps.db, {
      providers: entries,
      default_provider_id: defaultProviderId,
    })
    return providerCollectionView(
      { providers: entries, default_provider_id: defaultProviderId },
      keychain,
    )
  })

  app.post('/api/lang/interpret', async (req) => {
    const parsed = InterpretBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'project_id 与 finding_ids 必填')
    }
    try {
      return await interpretSourceFindings(deps.db, {
        projectId: parsed.data.project_id,
        findingIds: parsed.data.finding_ids,
        runner: await resolveRunner({
          providerId: parsed.data.provider_id,
          projectId: parsed.data.project_id,
        }),
        now,
        userTouched: parsed.data.user_touched === true,
      })
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
  })

  // ⚠️ **导出是用户主动动作**（增强 4）：结果**不写库**，产物落在用户自己的磁盘上。
  //   ⇒ 脱敏在**服务端**做（不采信客户端说「我已经脱敏了」）。
  app.post('/api/lang/interpret/export', async (req, reply) => {
    const parsed = InterpretExportBody.safeParse(req.body)
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', '解读结果不合法')
    }
    const summary = parsed.data.summary
    let root: string
    try {
      root = readProjectRoot(deps.db, summary.project_id)
    } catch (err) {
      if (err instanceof SourceServiceError) {
        throw new AppError('VALIDATION_ERROR', err.message, { reason: err.reason })
      }
      throw err
    }
    const text = formatInterpretMarkdown(summary, { projectRoot: root })
    const filename = `m9-interpret-${safeFileName(summary.project_id)}.md`
    return (
      reply
        .header('content-type', 'text/markdown; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        // ⚠️ **文件名由服务端给**（前端不重复实现清洗规则 ⇒ 口径只留一处）
        .header('x-m9-filename', filename)
        .send(text)
    )
  })
}
