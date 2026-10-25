import { createHash } from 'node:crypto'
import {
  buildExtractPrompt,
  EXTRACT_SCHEMA_VERSION,
  type ExtractPromptLog,
} from '@openvibe/shared'
import { AppMetaRepo, APP_META_KEYS } from '../repos/appMeta'
import { AgentIngestRepo } from '../repos/agentIngest'
import { LocalEventsRepo } from '../repos/localEvents'
import type { SqliteDatabase } from '../db'
import { redactAbsolutePaths } from '../source-ai/redact'
import { stripJsonFence } from '@openvibe/shared'
import { anchorCandidates, type AnchorSource } from './anchor'
import { createExtractRunner, ExtractRunnerError, type ExtractRunner } from './runner'
import { extractCallsToday, readExtractConsent, setExtractConsent } from './consent'
import { deriveExtractConsent, recordExtractShare } from './consent-detail'

/**
 * 提取服务编排（v0.2.3 批次 D AN1，spec FR-2）：
 * 读日志 → 组装（脱敏）→ 出网 → 版本比对 → 解析 → **锚定校验** → 落 pending → 台账。
 *
 * 红线（spec §6）：AI 结果只进 pending（内部 AI 按外部 agent 待遇）；判定层零 AI；
 * 台账 9 键白名单无正文容器；出网前必须有过同意（逐项目，DL-21 清除=删行）。
 * **零业务表写入**：本服务除 agent_ingests / local_events / ai_extract_consent 外不触碰任何表。
 */

export class ExtractError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ExtractError'
    this.code = code
  }
}

/** 每日提取调用次数上限（预算 QG2 的 MVP 形态：次数制——9 键白名单无 token 位，见 DEV-0142 登记） */
export const DAILY_CALL_LIMIT = 20

export interface ExtractServiceDeps {
  /** 注入优先（测试）；缺省按 provider 配置现解析 */
  runner?: ExtractRunner | null
  now?: () => Date
  /** 每日调用上限（默认 DAILY_CALL_LIMIT） */
  dailyCallLimit?: number
}

export interface ExtractOutcome {
  status: 'ok' | 'error' | 'unavailable' | 'consent-required' | 'gate-closed' | 'budget-exhausted'
  provider: string | null
  candidateCount: number
  passedCount: number
  droppedCount: number
  ingested: { id: string; kind: string; title: string }[]
  dropped: { title: string; reason: string }[]
  warnings: string[]
}

interface LogRow {
  id: string
  title: string
  body: string
}

/** LLM 输出侧的行形状（extract-schema，版本比对先于字段校验） */
interface ParsedCandidate {
  kind: string
  title: string
  body: string
  quote: string
  log_index: number
}

const KIND_TO_INGEST: Record<string, 'term_candidate' | 'prompt_candidate' | 'playbook_candidate'> = {
  term: 'term_candidate',
  prompt: 'prompt_candidate',
  playbook: 'playbook_candidate',
}

export function extractGateOpen(db: SqliteDatabase): boolean {
  return new AppMetaRepo(db).read<boolean>(APP_META_KEYS.aiExtractEnabled, false) === true
}

export function runExtraction(
  db: SqliteDatabase,
  input: { projectId: string; logIds: string[]; confirm?: boolean; remember?: boolean; providerId?: string },
  deps: ExtractServiceDeps = {},
): Promise<ExtractOutcome> {
  const now = deps.now ?? (() => new Date())
  const warnings: string[] = []
  const empty = (status: ExtractOutcome['status'], provider: string | null = null): ExtractOutcome => ({
    status,
    provider,
    candidateCount: 0,
    passedCount: 0,
    droppedCount: 0,
    ingested: [],
    dropped: [],
    warnings,
  })

  // ① 总闸（服务层拦截，不拦路由——防绕过，形态对齐 M8 agentWriteEnabled）
  if (!extractGateOpen(db)) return Promise.resolve(empty('gate-closed'))
  // ③ 同意：记忆在 ⇒ 放行；无记忆 ⇒ 必须本次显式确认（confirm）；确认 + remember ⇒ 写记忆
  const consent = readExtractConsent(db, input.projectId)
  if ((consent?.rememberAll ?? false) !== true && input.confirm !== true) {
    return Promise.resolve(empty('consent-required'))
  }

  // ④ 读日志（必须属于本项目；脱敏后即出网内容，锚定比对在同一份脱敏文本上进行）
  const placeholders = input.logIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT id, title, body FROM dev_log_entries WHERE project_id = ? AND id IN (${placeholders}) ORDER BY created_at, id`,
    )
    .all(input.projectId, ...input.logIds) as LogRow[]
  if (rows.length === 0) {
    return Promise.resolve(
      Object.assign(empty('error'), { warnings: ['没有命中任何开发日志（检查 log_ids 是否属于该项目）'] }),
    )
  }
  const missing = input.logIds.length - rows.length
  if (missing > 0) warnings.push(`${String(missing)} 条日志不在本项目或不存在，已跳过`)
  const logs: ExtractPromptLog[] = rows.map((r, i) => ({
    index: i,
    title: r.title,
    // 哨兵根：日志正文不属于单一项目树，项目根相对化不适用——
    // 只走「家目录占位 + 其余绝对路径占位」两级（redact 的 ②③ 步）
    body: redactAbsolutePaths(r.body, '\u0000sentinel'),
  }))
  const sources: AnchorSource[] = logs.map((l) => ({ index: l.index, text: l.body }))

  const started = Date.now()
  const runWith = async (runner: ExtractRunner): Promise<ExtractOutcome> => {
    const prompt = buildExtractPrompt(logs)
    const inputHash = createHash('sha256').update(prompt).digest('hex').slice(0, 16)
    const base = {
      aiModel: runner.model,
      aiProvider: runner.provider,
      inputHash,
      candidateCount: 0,
      passedCount: 0,
      droppedCount: 0,
      result: 'ok',
      failureReason: '',
      durationMs: 0,
    }
    const ledger = new LocalEventsRepo(db)
    const record = (over: Partial<typeof base>): void => {
      ledger.record(
        {
          kind: 'ai_extract_call',
          projectId: input.projectId,
          payload: { ...base, ...over, durationMs: Date.now() - started },
        },
        now(),
      )
    }

    try {
      const raw = await runner.run(prompt)
      // 契约先比版本再谈字段（source-ai 同款纪律）；解析失败 ⇒ 台账 error，不给部分结果
      let parsed: unknown
      try {
        parsed = JSON.parse(stripJsonFence(raw)) as unknown
      } catch {
        record({ result: 'error', failureReason: 'invalid-json' })
        return Object.assign(empty('error', runner.provider), {
          warnings: ['LLM 输出不是合法 JSON（已记台账，未产生任何候选）'],
        })
      }
      const obj = parsed as { schema_version?: unknown; candidates?: unknown }
      if (obj.schema_version !== EXTRACT_SCHEMA_VERSION || !Array.isArray(obj.candidates)) {
        record({ result: 'error', failureReason: 'schema-version-mismatch' })
        return Object.assign(empty('error', runner.provider), {
          warnings: [`LLM 输出的 schema_version 不是 ${String(EXTRACT_SCHEMA_VERSION)}（已记台账）`],
        })
      }
      const candidates = (obj.candidates as ParsedCandidate[]).filter(
        (c) =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as ParsedCandidate).title === 'string' &&
          typeof (c as ParsedCandidate).quote === 'string' &&
          typeof (c as ParsedCandidate).kind === 'string',
      )
      const candidateCount = candidates.length

      // ⑤ 锚定校验（确定性）：quote 未逐字命中源日志 ⇒ 丢弃，不进人工视野
      const { passed, dropped } = anchorCandidates(candidates as never[], sources)

      // ⑥ 落 pending（经 AgentIngestRepo：幂等三态 + UNIQUE(idempotency_key) 仲裁）
      const repo = new AgentIngestRepo(db)
      const ingested: ExtractOutcome['ingested'] = []
      for (const c of passed) {
        const ingestKind = KIND_TO_INGEST[c.kind]
        if (ingestKind === undefined) {
          dropped.push({ title: c.title, reason: `未知候选类别 ${c.kind}` })
          continue
        }
        const sourceLog = rows[c.log_index]
        if (sourceLog === undefined) continue
        const bodyHash = createHash('sha256').update(`${c.title}\n${c.body}`).digest('hex').slice(0, 16)
        try {
          const out = repo.ingest(
            {
              projectId: input.projectId,
              kind: ingestKind,
              idempotencyKey: `ai-extract:${sourceLog.id}:${bodyHash}`,
              payload: {
                kind: c.kind,
                title: c.title,
                body: c.body,
                quote: c.quote,
                source: 'ai-extract',
                source_log_id: sourceLog.id,
              },
              sourcePlatform: 'ai-extract',
            },
            now().toISOString(),
          )
          ingested.push({ id: out.id, kind: ingestKind, title: c.title })
        } catch (err) {
          warnings.push(`候选落库失败: ${c.title} — ${String(err)}`)
        }
      }

      record({
        candidateCount,
        passedCount: passed.length,
        droppedCount: dropped.length,
      })
      // 出网审计行（FR-7.2 补齐）：授权来源由服务端从「记忆 + 本次确认」推导，不采信客户端
      recordExtractShare(db, {
        projectId: input.projectId,
        provider: runner.provider,
        model: runner.model,
        candidateCount,
        passedCount: passed.length,
        droppedCount: dropped.length,
        consent: deriveExtractConsent((consent?.rememberAll ?? false) === true, input.confirm === true),
        createdAt: now().toISOString(),
      })
      if (input.confirm === true && input.remember === true) {
        setExtractConsent(db, input.projectId, true, now().toISOString())
      }
      return {
        status: 'ok',
        provider: runner.provider,
        candidateCount,
        passedCount: passed.length,
        droppedCount: dropped.length,
        ingested,
        dropped,
        warnings,
      }
    } catch (err) {
      const reason = err instanceof ExtractRunnerError ? err.reason : 'failed'
      record({ result: 'error', failureReason: reason })
      return Object.assign(empty('error', runner.provider), {
        warnings: [`提取失败（${reason}）：${String(err)}`],
      })
    }
  }

  const runnerPromise =
    deps.runner !== undefined ? Promise.resolve(deps.runner) : createExtractRunner(db, input.providerId)
  return runnerPromise.then((runner) => {
    if (runner === null) return empty('unavailable')
    // ② 预算熔断（次数制；**本机端点豁免**——spec §8.2②：本机推理零外联不占预算；
    //    检查在 runner 就绪后才能拿到 local 标记）
    const day = now().toISOString().slice(0, 10)
    const limit = deps.dailyCallLimit ?? DAILY_CALL_LIMIT
    if (!runner.local && extractCallsToday(db, day) >= limit) {
      return Object.assign(empty('budget-exhausted'), {
        warnings: [`今日提取调用已达上限（${String(limit)} 次）；本机推理端点不受此限`],
      })
    }
    return runWith(runner)
  })
}
