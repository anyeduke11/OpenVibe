import { useState } from 'react'
import { utf8ByteLength, type PreviewOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import { chipTone, emptyHintCls, ledgerNumCls, rowCls } from '../ui/styles'

/**
 * 产物预览（m6a FR-1.5）：左文件树（每行 kB · ≈tok）+ 右等宽内容。
 *
 * 字节来自服务端同一生成器，前端不做任何再加工（加工即破坏「预览即产物」）。
 * V1 的「验印章」（`.seal-badge`）在本组件随 DESIGN.md Migration 退场，换成一枚 `ok` chip——
 * 印章是装饰，这枚 chip 是状态（图标 + 文字 + 颜色三通道）。
 */
export function PackPreviewPane(props: { preview: PreviewOut | undefined }) {
  const { preview } = props
  const [active, setActive] = useState(0)
  if (preview === undefined)
    return (
      <div className={emptyHintCls}>
        <p>{zh.packs.preview.noFiles}</p>
      </div>
    )

  const files = preview.files
  const current = files[Math.min(active, files.length - 1)]

  const tokFor = (path: string): number =>
    preview.sizeEstimate?.footprint.files.find((s) => s.path === path)?.approxTokens ?? 0
  const sizeFor = (path: string, content: string): string => {
    const kB = (utf8ByteLength(content) / 1024).toFixed(1)
    return zh.packs.preview.sizeRow(kB, tokFor(path))
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-ink-muted">{zh.packs.preview.fingerprint}</span>
        <span className="mono break-all text-ink-body">{preview.fingerprint}</span>
        <span className={chipTone('ok')}>
          <Icon name="check" size={11} />
          {zh.packs.preview.sealed}
        </span>
      </div>

      {preview.coveredPlatforms.length > 0 && (
        <p className="text-xs text-ink-muted">
          {`${zh.packs.preview.covered}: `}
          <span className="text-ink-body">{preview.coveredPlatforms.join(' / ')}</span>
        </p>
      )}

      {/* perTarget 上下文成本：warn 只提示不阻断（阈值口径在 core，文案不抄数字） */}
      {preview.sizeEstimate !== undefined && preview.sizeEstimate.perTarget.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-ink-muted">
            {`${zh.packs.preview.perTargetTitle} · ${zh.packs.preview.sizeBasis}`}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {preview.sizeEstimate.perTarget.map((p) => (
              <li
                key={p.adapter}
                className={`${chipTone(p.warn ? 'warn' : 'default')} ${ledgerNumCls}`}
              >
                {p.warn && <Icon name="warn" size={11} />}
                {`${p.adapter} ≈${String(p.approxTokens)}`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-muted">
            {`${zh.packs.preview.footprintTitle} ≈${String(
              preview.sizeEstimate.footprint.approxTokens,
            )} · ${zh.packs.preview.fileCount(preview.sizeEstimate.footprint.files.length)}`}
          </p>
          {preview.sizeEstimate.perTarget
            .filter((p) => p.warn)
            .map((p) => (
              <p key={`warn-${p.adapter}`} className="text-xs text-warn">
                {zh.packs.preview.overBudget(p.adapter, p.approxTokens)}
              </p>
            ))}
        </div>
      )}

      {preview.warnings.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-warn">
          {preview.warnings.map((w) => (
            <li key={w}>{`· ${w}`}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-faint">{zh.packs.preview.noWarnings}</p>
      )}

      <p className="text-xs font-medium text-ink-muted">
        {`${zh.packs.preview.files}${
          preview.sizeEstimate !== undefined ? ` · ${zh.packs.preview.sizeBasis}` : ''
        }`}
      </p>

      <div className="flex min-h-0 gap-2 lg:h-[34vh]">
        <ul className="w-56 shrink-0 overflow-auto rounded-md border border-line bg-panel lg:py-0.5">
          {files.map((f, i) => {
            const on = i === Math.min(active, files.length - 1)
            return (
              <li key={f.path} className={rowCls} aria-selected={on}>
                <button
                  type="button"
                  className={`block w-full px-2.5 py-1.5 text-left text-xs ${
                    on ? 'bg-accent-soft text-accent-deep' : 'text-ink-muted'
                  }`}
                  onClick={() => setActive(i)}
                >
                  <span className="mono block truncate" title={f.path}>
                    {f.path}
                  </span>
                  {/* 无 sizeEstimate 时整段不渲染：宁可无量，也不印「≈0」这种假零断言 */}
                  {preview.sizeEstimate !== undefined && (
                    <span className="block truncate text-[11px] text-ink-faint">
                      {sizeFor(f.path, f.content)}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {current !== undefined && (
            <p className="truncate text-[11px] text-ink-faint">
              {`${current.path} · ${zh.packs.preview.sha256} ${current.sha256.slice(0, 12)}`}
            </p>
          )}
          <pre className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-panel-sunk p-2.5 text-[12px] leading-relaxed text-ink-body">
            {current?.content ?? ''}
          </pre>
        </div>
      </div>
    </div>
  )
}
