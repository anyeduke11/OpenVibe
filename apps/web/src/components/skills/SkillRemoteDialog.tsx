import { useState } from 'react'
import type { SkillRemoteImportReport, SkillRemoteSearchItem } from '@openvibe/shared'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { toast } from '../ui/Toaster'
import { btnGhost, btnPrimary, chipCls, inputCls, labelCls } from '../ui/styles'
import { useSkillRemote } from '../../hooks/useSkills'
import { zh } from '../../i18n/zh'

type RemoteSource = 'github' | 'skillhub'

/** 远程导入（DEV-0067）：GitHub 整仓（ref 缺省=默认分支）；SkillHub 搜索 → 选 slug 导入 */
export function SkillRemoteDialog(props: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState<RemoteSource>('github')
  const [repo, setRepo] = useState('')
  const [ref, setRef] = useState('')
  const [subPath, setSubPath] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<SkillRemoteSearchItem | null>(null)
  const [report, setReport] = useState<SkillRemoteImportReport | null>(null)
  const { search, importSkill } = useSkillRemote()

  const canImport =
    source === 'github' ? repo.trim() !== '' : picked !== null

  const runImport = () => {
    const body =
      source === 'github'
        ? {
            source: 'github' as const,
            repo: repo.trim(),
            ref: ref.trim() === '' ? undefined : ref.trim(),
            path: subPath.trim() === '' ? undefined : subPath.trim(),
          }
        : { source: 'skillhub' as const, slug: picked?.slug ?? '' }
    importSkill.mutate(body, {
      onSuccess: (r) => {
        setReport(r)
        toast(zh.skills.remote.done)
      },
      onError: (e: Error) => toast(e.message, 'error'),
    })
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={zh.skills.remote.title}
        footer={
          <>
            <button className={btnGhost} onClick={props.onClose}>
              {zh.editor.close}
            </button>
            <button
              className={btnPrimary}
              disabled={!canImport || importSkill.isPending}
              onClick={runImport}
            >
              {importSkill.isPending ? zh.skills.remote.importing : zh.skills.remote.importBtn}
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div>
            <span className={labelCls}>{zh.skills.remote.sourceLabel}</span>
            <div className="flex gap-2">
              {(['github', 'skillhub'] as const).map((s) => (
                <button
                  key={s}
                  className={`${chipCls} ${
                    source === s
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line bg-panel text-ink-muted'
                  }`}
                  onClick={() => setSource(s)}
                >
                  {zh.skills.sources[s]}
                </button>
              ))}
            </div>
          </div>

          {source === 'github' ? (
            <div className="space-y-2">
              <input
                className={`${inputCls} w-full font-mono text-xs`}
                placeholder={zh.skills.remote.repoPlaceholder}
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
              />
              <input
                className={`${inputCls} w-full font-mono text-xs`}
                placeholder={zh.skills.remote.refPlaceholder}
                value={ref}
                onChange={(e) => setRef(e.target.value)}
              />
              <input
                className={`${inputCls} w-full font-mono text-xs`}
                placeholder={zh.skills.remote.pathPlaceholder}
                value={subPath}
                onChange={(e) => setSubPath(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  placeholder={zh.skills.remote.searchPlaceholder}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && q.trim() !== '')
                      search.mutate(q.trim(), { onError: (e2: Error) => toast(e2.message, 'error') })
                  }}
                />
                <button
                  className={btnGhost}
                  disabled={q.trim() === '' || search.isPending}
                  onClick={() =>
                    search.mutate(q.trim(), { onError: (e: Error) => toast(e.message, 'error') })
                  }
                >
                  {search.isPending ? zh.skills.remote.searching : zh.skills.remote.search}
                </button>
              </div>
              {picked !== null && (
                <p className="text-xs text-ink-subtle">
                  {zh.skills.remote.picked}
                  <span className="mono">{picked.slug}</span>
                </p>
              )}
              {search.data !== undefined && (
                <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-line p-2">
                  {search.data.items.length === 0 && (
                    <p className="p-2 text-xs text-ink-faint">{zh.skills.remote.searchHint}</p>
                  )}
                  {search.data.items.map((item) => (
                    <label
                      key={item.slug}
                      className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-fill-soft"
                    >
                      <input
                        type="radio"
                        name="skillhub-slug"
                        className="mt-1"
                        checked={picked?.slug === item.slug}
                        onChange={() => setPicked(item)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-ink">{item.name}</span>
                        <span className="block truncate text-[11px] text-ink-faint">
                          {item.slug} · {zh.skills.remote.downloads(item.downloads)} · {item.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {report !== null && (
            <div className="space-y-1 rounded-md border border-line bg-fill-soft p-3 text-xs">
              <p className="font-medium">{zh.skills.remote.reportTitle}</p>
              <p className="text-ink-subtle">
                {zh.skills.remote.origin}: <span className="mono">{report.origin}</span>
              </p>
              <p>
                {zh.skills.scanReport.summary(
                  report.discovered,
                  report.created,
                  report.updated,
                  report.skipped,
                )}
              </p>
              {report.warnings.map((w) => (
                <p key={w} className="text-warn-800">
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      </DialogPanel>
    </Dialog>
  )
}
