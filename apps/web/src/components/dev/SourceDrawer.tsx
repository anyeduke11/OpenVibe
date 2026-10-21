import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, noteCls, noteTitleCls, tagCls } from '../ui/styles'
import {
  useLangConsent,
  useLangConsentMutations,
  useLangFindings,
  useLangInterpret,
  useLangInterpretCapability,
  useLangInterpretExport,
  useLangScan,
  useLangSnippets,
} from '../../hooks/useLangSource'
import { describeScannerMode } from '@openvibe/shared'
import { snippetFailureText } from './sourceFailureText'
import { toast } from '../ui/Toaster'
import type {
  LangScanSummary,
  SourceFindingRow,
  SourceInterpretSummary,
  SourceSnippet,
} from '@openvibe/shared'

/**
 * M9 v1.6 **P4.4 · 源码识别抽屉**（`m9-dev-language-roadmap.md` §3.8 / §3.10 · dev-plan §6.10 P4.4）
 *
 * ## 它是什么
 *
 * 一个项目里「**你的代码在哪儿用了这个知识点**」的清单 ＋
 * **逐条勾选**（T1：只有勾过的片段才允许出网）＋ **导出可自查的清单**（DL-22）。
 *
 * ## ⚠️ DL-20：扫描模式**必须显示在界面上**
 *
 * §3.8.2 第 1 条：「当前路径必须显式可见 —— 不许静默回退」。
 * ⇒ 每一门语言都有一行模式说明（解析器 / 启发式 ＋ 工具链版本 ＋ 显式告警）。
 * ⇒ 变异腿：把这一行去掉 ⇒ DL-20 立刻变红。
 *
 * ## ⚠️ 默认**全不勾**（DL-18 的上游）
 *
 * §3.8 的 T1 行：「默认开，**默认全不勾**」——
 * 「不勾 = 不发」这条保护只有在**默认全不勾**时才成立。
 *
 * ## ⚠️ 两档**不混**（§3.8.2 第 2 条）
 *
 * 「已确认」（解析器）与「**可能**」（启发式）分两个小节，
 * 不混在一个列表里 —— 混起来等于把「可能」显示成「已确认」。
 */
const L = {
  title: '源码里的用法',
  scan: '扫描这个项目',
  scanning: '扫描中…',
  noProject: '先选一个项目 —— 源码扫描按项目走（扫的是项目自己的目录）。',
  noHit: '这次没扫到命中。',
  noScan: '还没扫过。',
  confirmed: '已确认',
  possible: '可能',
  consent: '授权',
  consentHint: '默认全不勾 —— 只有你勾过的片段才允许出网。',
  remember: '记住',
  rememberNone: '不记',
  rememberAll: '记住「全发」',
  rememberNoneAll: '记住「全不发」',
  clear: '清除记忆',
  export: '导出清单',
  exportHint: '清单里的每一条都能用 grep 复现。',
  ticked: (n: number, total: number) => `已勾 ${String(n)} / ${String(total)} 条`,
  // ── T1 硬要求：勾选前要看到「将要发送的确切内容」────────────────────────
  sending: '将要发送的内容',
  // ⚠️ **「读不到」的原因文案不在这里** —— 它在 `sourceFailureText.ts`
  //   （口径只留一处：每种原因有各自的文案，塌成一个兜底就是缺陷）。
  // ── T2（AI 解读）────────────────────────────────────────────────────
  interpretTitle: 'AI 解读',
  interpretHint: '只把你勾过的片段发出去；解读结果只显示，不留存。',
  interpretRun: '解读勾选的片段',
  interpretRunning: '解读中…',
  interpretNone: '还没有勾选任何片段。',
  interpretFailed: '解读失败',
  interpretUnavailable: '解读不可用',
  interpretOk: '已解读',
  divergenceTitle: '与确定性层的分歧',
  divergenceNone: '没有分歧：AI 的说法与判定层一致。',
  riskTitle: '风险点',
  risksNone: '没有指出风险点。',
  // ── 导出（增强 4）──────────────────────────────────────────────────
  exportInterpret: '保存这次解读',
  exporting: '保存中…',
  exportInterpretHint: '保存成 Markdown 文件（不进数据库）。',
  exportDone: '已保存到你的下载目录。',
  exportFailed: '保存失败。',
} as const

export interface SourceDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 项目 id（`null` = 还没选项目） */
  projectId: string | null
}

export function SourceDrawer({ open, onOpenChange, projectId }: SourceDrawerProps) {
  const findings = useLangFindings()
  const consent = useLangConsent(projectId)
  const scan = useLangScan()
  const consentMutations = useLangConsentMutations(projectId ?? '')
  // ⚠️ T1 硬要求：勾选前要看到「将要发送的确切内容」⇒ 片段**一次读完**并常驻显示
  const snippets = useLangSnippets(projectId)
  // ⚠️ DL-08：**不可用就不渲染 T2 区**（不是渲染一个失败态）
  const capability = useLangInterpretCapability()
  const interpret = useLangInterpret(projectId)
  // ⚠️ 增强 4：导出是**用户主动动作**（结果不写库，产物落在用户自己的磁盘上）
  const exportInterpret = useLangInterpretExport()
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())
  // ⚠️ **用户动过没有** —— 用来分辨「这次是记忆带过去的」与「用户自己勾的」（§3.9 的二分）
  const [touched, setTouched] = useState(false)

  const rows: SourceFindingRow[] = findings.data?.findings ?? []
  const summary: LangScanSummary | undefined = scan.data

  const snippetById = useMemo(() => {
    const map = new Map<number, SourceSnippet>()
    for (const s of snippets.data?.snippets ?? []) map.set(s.finding_id, s)
    return map
  }, [snippets.data])

  const confirmed = useMemo(
    () => rows.filter((r) => r.confidence === 'confirmed'),
    [rows],
  )
  const possible = useMemo(() => rows.filter((r) => r.confidence === 'possible'), [rows])

  const toggle = (key: string): void => {
    setTouched(true)
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rememberAll = consent.data?.remember_all ?? false
  const remembered = consent.data?.remembered_at !== null && consent.data?.remembered_at !== undefined

  // ⚠️ §3.9：「记住全发」要**真的**预勾选（否则记忆只是台账里的一行字，没有行为）
  //   ⇒ 「记住全不发」＝ 保持全不勾（默认就是）⇒ 两者都在这一处落地。
  useEffect(() => {
    if (touched) return
    if (!remembered || !rememberAll) return
    const readable = rows
      .filter((r) => {
        const sn = snippetById.get(r.id)
        return sn !== undefined && sn.lines !== null
      })
      .map((r) => `${r.id}`)
    if (readable.length === 0) return
    setTicked(new Set(readable))
  }, [remembered, rememberAll, rows, snippetById, touched])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPanel
        title={L.title}
        variant="sheet"
        footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[11.5px] text-ink-faint">{L.ticked(ticked.size, rows.length)}</span>
          <div className="flex items-center gap-2">
            {projectId !== null ? (
              <a
                className={btnGhost}
                href={`/api/lang/source/export?project=${encodeURIComponent(projectId)}`}
                download
              >
                <Icon name="dl" size={13} />
                {L.export}
              </a>
            ) : null}
            <button className={btnPrimary} type="button" onClick={() => onOpenChange(false)}>
              关闭
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {projectId === null ? (
          <p className="text-sm text-ink-muted">{L.noProject}</p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                className={btnPrimary}
                type="button"
                disabled={scan.isPending}
                onClick={() => {
                  scan.mutate(projectId)
                }}
              >
                <Icon name="refresh" size={13} />
                {scan.isPending ? L.scanning : L.scan}
              </button>
              <span className="text-[11.5px] text-ink-faint">{L.exportHint}</span>
            </div>

            {/* ⚠️ DL-20：扫描模式必须显式可见 */}
            {summary !== undefined ? (
              <ul className="flex flex-col gap-1" aria-label="扫描模式">
                {summary.languages.map((info) => (
                  <li key={info.lang} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm text-ink">{info.lang}</span>
                    <span className={tagCls}>{describeScannerMode(info)}</span>
                    <span className="text-[11.5px] text-ink-faint">
                      {`文件 ${String(info.file_count)} 个 · 命中 ${String(info.hit_count)} 条`}
                    </span>
                    {info.notice !== null ? (
                      <span className="text-[11.5px] text-warn">{info.notice}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}

            {summary !== undefined && summary.warnings.length > 0 ? (
              <div className={noteCls('warn')}>
                <strong className={noteTitleCls}>扫描提示</strong>
                <ul className="flex flex-col gap-0.5">
                  {summary.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* 授权：默认全不勾 */}
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-ink-muted">{L.consent}</h3>
              <p className="text-[11.5px] text-ink-faint">{L.consentHint}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-[13.5px] text-ink-body">
                  <input
                    type="radio"
                    name="m9-consent"
                    checked={!remembered}
                    onChange={() => {
                      consentMutations.clear.mutate()
                    }}
                  />
                  {L.rememberNone}
                </label>
                <label className="flex items-center gap-1.5 text-[13.5px] text-ink-body">
                  <input
                    type="radio"
                    name="m9-consent"
                    checked={remembered && rememberAll}
                    onChange={() => {
                      consentMutations.set.mutate(true)
                    }}
                  />
                  {L.rememberAll}
                </label>
                <label className="flex items-center gap-1.5 text-[13.5px] text-ink-body">
                  <input
                    type="radio"
                    name="m9-consent"
                    checked={remembered && !rememberAll}
                    onChange={() => {
                      consentMutations.set.mutate(false)
                    }}
                  />
                  {L.rememberNoneAll}
                </label>
                <button
                  className={btnGhost}
                  type="button"
                  onClick={() => {
                    consentMutations.clear.mutate()
                  }}
                >
                  {L.clear}
                </button>
              </div>
            </div>

            {/* 两档不混 */}
            {rows.length === 0 ? (
              <p className="text-sm text-ink-muted">{summary === undefined ? L.noScan : L.noHit}</p>
            ) : (
              <>
                <FindingGroup
                  title={L.confirmed}
                  rows={confirmed}
                  ticked={ticked}
                  onToggle={toggle}
                  snippets={snippetById}
                />
                {possible.length > 0 ? (
                  <FindingGroup
                    title={L.possible}
                    rows={possible}
                    ticked={ticked}
                    onToggle={toggle}
                    snippets={snippetById}
                  />
                ) : null}
              </>
            )}

            {/* ⚠️ T2（AI 解读）—— **不可用就不渲染**（DL-08） */}
            {capability.data?.available === true ? (
              <InterpretPanel
                tickedCount={ticked.size}
                pending={interpret.isPending}
                onRun={() => {
                  interpret.mutate([...ticked].map((k) => Number(k)))
                }}
                result={interpret.data}
                exporting={exportInterpret.isPending}
                onExport={() => {
                  const result = interpret.data
                  if (result === undefined) return
                  exportInterpret.mutate(result, {
                    onSuccess: () => {
                      toast(L.exportDone)
                    },
                    onError: () => {
                      toast(L.exportFailed)
                    },
                  })
                }}
              />
            ) : null}
          </>
        )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}

function FindingGroup(props: {
  title: string
  rows: readonly SourceFindingRow[]
  ticked: ReadonlySet<string>
  onToggle: (key: string) => void
  /** 命中 id → 本地片段（**T1 硬要求**：内容常驻在勾选框旁边） */
  snippets: ReadonlyMap<number, SourceSnippet>
}) {
  const { title, rows, ticked, onToggle, snippets } = props
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-xs font-medium text-ink-muted">
        {`${title}（${String(rows.length)}）`}
      </h3>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => {
          const key = `${r.id}`
          const snippet = snippets.get(r.id)
          // ⚠️ **读不到内容 ⇒ 不许勾**（§3.8 T1 硬要求：用户要在**看到全文**的前提下勾选）
          const readable = snippet !== undefined && snippet.lines !== null
          return (
            <li
              key={key}
              className="flex flex-col gap-1.5 rounded-md border border-line bg-panel px-2.5 py-2"
            >
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={ticked.has(key)}
                  disabled={!readable}
                  onChange={() => {
                    onToggle(key)
                  }}
                  aria-label={`${r.file_rel_path}:${String(r.line)}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink">
                    {`${r.file_rel_path}:${String(r.line)}:${String(r.col)}`}
                  </span>
                  <span className="block text-[11.5px] text-ink-muted">
                    {`${r.topic_title} · «${r.matched_pattern}»`}
                  </span>
                </span>
              </div>
              {/* ⚠️ T1 硬要求：显示「将要发送的确切内容」 */}
              {readable ? (
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-ink-faint">{L.sending}</span>
                  <pre className="mono overflow-x-auto rounded bg-panel-sunk px-2 py-1 text-[11.5px] text-ink-body">
                    {(snippet.lines ?? []).map((line, i) => `${String((snippet.start_line ?? 1) + i)}: ${line}`).join('\n')}
                  </pre>
                </div>
              ) : (
                // ⚠️ 增强 2：**说清为什么读不到**（不是一句「读不到」）
                <span className="text-[11.5px] text-warn">
                  {snippetFailureText(snippet?.failure)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * T2 · **AI 解读区**（P5.1 / P5.3 · DL-09 / DL-16 / DL-18）
 *
 * ## ⚠️ **只在 AI 可用时才渲染**
 *
 * DL-08：「AI 不可用时确定性层照常工作」⇒ 不可用时**整个区不出现**
 * （不是出现一个「解读失败」—— 「没配 AI」与「跑挂了」是两件事）。
 *
 * ## ⚠️ 分歧必须**两处并列**（DL-09）
 *
 * 确定性层的判定 ＋ AI 的声称**同时显示**。只说「有分歧」是不够的 ——
 * 用户要能自己看出差在哪。
 */
function InterpretPanel(props: {
  tickedCount: number
  pending: boolean
  onRun: () => void
  result: SourceInterpretSummary | undefined
  /** 导出（增强 4） */
  exporting: boolean
  onExport: () => void
}) {
  const { tickedCount, pending, onRun, result, exporting, onExport } = props
  return (
    <section className="flex flex-col gap-1.5" aria-label={L.interpretTitle}>
      <h3 className="text-xs font-medium text-ink-muted">{L.interpretTitle}</h3>
      <p className="text-[11.5px] text-ink-faint">{L.interpretHint}</p>
      <div className="flex items-center gap-2">
        <button
          className={btnPrimary}
          type="button"
          disabled={pending || tickedCount === 0}
          onClick={onRun}
        >
          <Icon name="sparkle" size={13} />
          {pending ? L.interpretRunning : L.interpretRun}
        </button>
        {tickedCount === 0 ? (
          <span className="text-[11.5px] text-ink-faint">{L.interpretNone}</span>
        ) : null}
      </div>

      {result !== undefined ? (
        <div className="flex flex-col gap-1.5">
          {result.status === 'failed' ? (
            <div className={noteCls('warn')}>
              <strong className={noteTitleCls}>{L.interpretFailed}</strong>
              <p className="text-[11.5px]">{result.failure_reason ?? ''}</p>
            </div>
          ) : null}

          {result.items.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {result.items.map((item, i) => (
                <li
                  key={`${item.topic_slug}-${String(i)}`}
                  className="flex flex-col gap-0.5 rounded-md border border-line bg-panel px-2.5 py-2"
                >
                  <span className="text-sm text-ink">{item.summary}</span>
                  <span className="text-[11.5px] text-ink-muted">
                    {`${item.topic_slug}`}
                  </span>
                  <span className="text-[11.5px] text-ink-muted">
                    {`${L.riskTitle}：${
                      item.risks.length > 0 ? item.risks.join('；') : L.risksNone
                    }`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {/* ⚠️ DL-09：分歧**为 0 也要显示**（P5 出口：分歧标注为 0 时仍能显示） */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11.5px] text-ink-muted">
              {`${L.divergenceTitle}（${String(result.divergence_count)}）`}
            </span>
            {result.divergences.length === 0 ? (
              <span className="text-[11.5px] text-ink-faint">{L.divergenceNone}</span>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {result.divergences.map((d) => (
                  <li key={d.topic_slug} className="text-[11.5px] text-warn">
                    {`${d.topic_slug} —— 确定性层：${d.deterministic_state}；AI 声称：${d.ai_state}`}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ⚠️ 增强 4：**保存这次解读**（用户主动动作；结果不写库） */}
          <div className="flex items-center gap-2">
            <button
              className={btnGhost}
              type="button"
              disabled={exporting}
              onClick={onExport}
            >
              <Icon name="dl" size={13} />
              {exporting ? L.exporting : L.exportInterpret}
            </button>
            <span className="text-[11.5px] text-ink-faint">{L.exportInterpretHint}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
