import type { SkillScanReport } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

/** 扫描摘要条（m2 FR-1.5）：四项计数 + 扫描根清单 + warnings 明细（DEV-0063 起含根覆盖） */
export function SkillScanReportView(props: { report: SkillScanReport }) {
  const { report } = props
  const cells: { label: string; value: number }[] = [
    { label: zh.skills.scanReport.discovered, value: report.discovered },
    { label: zh.skills.scanReport.created, value: report.created },
    { label: zh.skills.scanReport.updated, value: report.updated },
    { label: zh.skills.scanReport.skipped, value: report.skipped },
  ]
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-ink-muted">{zh.skills.scanReport.rootsHint}</p>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-md border border-line px-3 py-2 text-center">
            <div className="num text-lg font-semibold">{String(c.value)}</div>
            <div className="text-[11px] text-ink-muted">{c.label}</div>
          </div>
        ))}
      </div>
      <div>
        <details>
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            {zh.skills.scanReport.rootsScanned(report.scannedRoots.length)}
            {report.missingRoots.length > 0 &&
              ` · ${zh.skills.scanReport.rootsMissing(report.missingRoots.length)}`}
          </summary>
          <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto pl-4">
            {report.scannedRoots.map((r) => (
              <li key={r} className="mono text-[11px] text-ink-muted">
                {r}
              </li>
            ))}
            {report.missingRoots.map((r) => (
              <li key={r} className="mono text-[11px] text-warn">
                {r}
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div>
        <h3 className="mb-1 text-xs font-medium text-ink-muted">{zh.skills.scanReport.warnings}</h3>
        {report.warnings.length === 0 ? (
          <p className="text-xs text-ink-faint">{zh.skills.scanReport.noWarnings}</p>
        ) : (
          <ul className="max-h-52 space-y-1 overflow-auto">
            {report.warnings.map((w) => (
              <li
                key={w}
                className="inline-flex w-full items-start gap-1.5 rounded-full border border-warn-line bg-warn-soft px-2 py-0.5 text-[11px] text-warn"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="mt-0.5 shrink-0">
                  <path d="M8 1.5L1 14h14L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                <span className="mono">{w}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
