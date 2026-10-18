import { useRef, useState } from 'react'
import { lane } from '../../i18n/lane-assets'
import { zh } from '../../i18n/zh'
import { Dialog, DialogPanel } from '../ui/Dialog'
import { Icon } from '../ui/icons'
import { btnGhost, btnPrimary, labelCls, inputCls } from '../ui/styles'

/** 空格 / 中西文逗号分隔；空输入即回落默认扫描 */
export function parseRoots(raw: string): string[] {
  return raw
    .split(/[\s,，、]+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * 工具箱（低频动作的落点）。
 *
 * 为什么要抽屉而不是继续堆页头：改造前 Skill 页头是一行八个控件（两个输入框 + 六个
 * 按钮），在 1280 宽下必然换行，把台账压到折叠线以下。按 DESIGN.md「常用动作一步可达、
 * 次要动作进抽屉」，这里只保留两个高频入口（默认扫描 / 手动登记），其余四个连同
 * 自定义扫描目录一起收进这里。
 */
export function SkillToolsDialog(props: {
  open: boolean
  onClose: () => void
  onScanRoots: (roots: string[]) => void
  onOpenRemote: () => void
  onOpenUpdates: () => void
  onOpenCleanup: () => void
  onOpenReview: () => void
}) {
  const [roots, setRoots] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const parsed = parseRoots(roots)

  return (
    <Dialog open={props.open} onOpenChange={(o) => (o ? undefined : props.onClose())}>
      <DialogPanel
        title={lane.skills.tools}
        footer={
          <button className={btnGhost} onClick={props.onClose}>
            {zh.editor.close}
          </button>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="proseCls text-xs text-ink-muted">{lane.skills.toolsHint}</p>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={`${labelCls} mb-0`} htmlFor="skill-scan-roots">
                {zh.skills.customScanPlaceholder}
              </label>
              <button
                className="text-[11px] text-ink-faint transition-colors hover:text-ink-body"
                onClick={() => inputRef.current?.focus()}
              >
                {zh.skills.scanCustomHint}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                id="skill-scan-roots"
                className={`${inputCls} mono flex-1 text-xs`}
                value={roots}
                placeholder={zh.skills.customScanPlaceholder}
                onChange={(e) => setRoots(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && parsed.length > 0) props.onScanRoots(parsed)
                }}
              />
              <button
                className={btnPrimary}
                disabled={parsed.length === 0}
                onClick={() => props.onScanRoots(parsed)}
              >
                <Icon name="search" size={12} />
                {zh.skills.scanCustom}
              </button>
            </div>
          </div>

          <div className="border-t border-line-hair pt-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">{lane.skills.tools}</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { icon: 'dl' as const, label: zh.skills.remoteImport, run: props.onOpenRemote },
                  { icon: 'refresh' as const, label: zh.skills.checkUpdates, run: props.onOpenUpdates },
                  { icon: 'layers' as const, label: zh.skills.cleanup, run: props.onOpenCleanup },
                  { icon: 'target' as const, label: zh.skills.review, run: props.onOpenReview },
                ] as const
              ).map((a) => (
                <button key={a.label} className={btnGhost} onClick={a.run}>
                  <Icon name={a.icon} size={12} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
