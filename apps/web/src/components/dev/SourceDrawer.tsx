import { useMemo, useState } from 'react'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, noteCls, noteTitleCls, tagCls } from '../ui/styles'
import { useLangConsent, useLangConsentMutations, useLangFindings, useLangScan } from '../../hooks/useLangSource'
import { describeScannerMode } from '@openvibe/shared'
import type { LangScanSummary, SourceFindingRow } from '@openvibe/shared'

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
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set())

  const rows: SourceFindingRow[] = findings.data?.findings ?? []
  const summary: LangScanSummary | undefined = scan.data

  const confirmed = useMemo(
    () => rows.filter((r) => r.confidence === 'confirmed'),
    [rows],
  )
  const possible = useMemo(() => rows.filter((r) => r.confidence === 'possible'), [rows])

  const toggle = (key: string): void => {
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const rememberAll = consent.data?.remember_all ?? false
  const remembered = consent.data?.remembered_at !== null && consent.data?.remembered_at !== undefined

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
                />
                {possible.length > 0 ? (
                  <FindingGroup
                    title={L.possible}
                    rows={possible}
                    ticked={ticked}
                    onToggle={toggle}
                  />
                ) : null}
              </>
            )}
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
}) {
  const { title, rows, ticked, onToggle } = props
  if (rows.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5" aria-label={title}>
      <h3 className="text-xs font-medium text-ink-muted">
        {`${title}（${String(rows.length)}）`}
      </h3>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => {
          const key = `${r.id}`
          return (
            <li
              key={key}
              className="flex items-start gap-2 rounded-md border border-line bg-panel px-2.5 py-2"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={ticked.has(key)}
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
            </li>
          )
        })}
      </ul>
    </section>
  )
}
