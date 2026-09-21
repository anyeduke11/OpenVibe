import type { SkillScanReport } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

/** 扫描摘要条（m2 FR-1.5）：四项计数 + warnings 明细 */
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
      <p className="text-xs text-zinc-500">{zh.skills.scanReport.rootsHint}</p>
      <div className="grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="rounded-md border border-zinc-200 px-3 py-2 text-center">
            <div className="text-lg font-semibold">{String(c.value)}</div>
            <div className="text-[11px] text-zinc-500">{c.label}</div>
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-1 text-xs font-medium text-zinc-500">{zh.skills.scanReport.warnings}</h3>
        {report.warnings.length === 0 ? (
          <p className="text-xs text-zinc-400">{zh.skills.scanReport.noWarnings}</p>
        ) : (
          <ul className="max-h-52 list-disc space-y-1 overflow-auto pl-5 text-xs text-amber-800">
            {report.warnings.map((w) => (
              <li key={w} className="mono">
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
