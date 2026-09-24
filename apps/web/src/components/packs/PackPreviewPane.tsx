import { useState } from 'react'
import { utf8ByteLength, type PreviewOut } from '@openvibe/shared'
import { zh } from '../../i18n/zh'

/**
 * 步骤 5 的预览面板（m6a FR-1.5）：左文件树 + 右等宽内容，字节来自服务端同一生成器，
 * 前端不做任何再加工（加工即破坏「预览即产物」）。
 */
export function PackPreviewPane(props: { preview: PreviewOut | undefined }) {
  const { preview } = props
  const [active, setActive] = useState(0)
  if (preview === undefined) return <p className="text-sm text-zinc-400">{zh.packs.preview.noFiles}</p>

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
      <div className="flex items-center gap-3 text-xs">
        <span className="text-zinc-500">{zh.packs.preview.fingerprint}</span>
        <span className="mono text-zinc-700">{preview.fingerprint}</span>
      </div>

      {preview.coveredPlatforms.length > 0 && (
        <p className="text-xs text-zinc-500">
          {zh.packs.preview.covered}
          {': '}
          <span className="text-zinc-700">{preview.coveredPlatforms.join(' / ')}</span>
        </p>
      )}

      {preview.sizeEstimate !== undefined && preview.sizeEstimate.perTarget.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-zinc-500">
            {`${zh.packs.preview.perTargetTitle} · ${zh.packs.preview.sizeBasis}`}
          </p>
          <ul className="flex flex-wrap gap-2">
            {preview.sizeEstimate.perTarget.map((p) => (
              <li
                key={p.adapter}
                className={`rounded-md border px-2 py-1 text-xs ${
                  p.warn
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-zinc-200 bg-white text-zinc-700'
                }`}
              >
                {`${p.adapter} ≈${String(p.approxTokens)}`}
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            {`${zh.packs.preview.footprintTitle} ≈${String(
              preview.sizeEstimate.footprint.approxTokens,
            )} · ${zh.packs.preview.fileCount(preview.sizeEstimate.footprint.files.length)}`}
          </p>
          {preview.sizeEstimate.perTarget
            .filter((p) => p.warn)
            .map((p) => (
              <p key={`warn-${p.adapter}`} className="text-xs text-amber-700">
                {zh.packs.preview.overBudget(p.adapter, p.approxTokens)}
              </p>
            ))}
        </div>
      )}

      {preview.warnings.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-amber-700">
          {preview.warnings.map((w) => (
            <li key={w}>· {w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-zinc-400">{zh.packs.preview.noWarnings}</p>
      )}

      <p className="text-xs font-medium text-zinc-500">
        {`${zh.packs.preview.files}${
          preview.sizeEstimate !== undefined ? ` · ${zh.packs.preview.sizeBasis}` : ''
        }`}
      </p>
      <div className="flex h-[46vh] gap-3">
        <ul className="w-56 shrink-0 overflow-auto rounded-md border border-zinc-200 bg-white py-1">
          {files.map((f, i) => (
            <li key={f.path}>
              <button
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  i === Math.min(active, files.length - 1)
                    ? 'bg-brand-soft font-medium text-brand'
                    : 'text-zinc-600 hover:bg-zinc-50'
                }`}
                onClick={() => setActive(i)}
              >
                <span className="mono block truncate" title={f.path}>
                  {f.path}
                </span>
                {/* 无 sizeEstimate 时整段不渲染：宁可无量，也不印「≈0」这种假零断言 */}
                {preview.sizeEstimate !== undefined && (
                  <span className="block truncate text-[10px] text-zinc-400">
                    {sizeFor(f.path, f.content)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {current !== undefined && (
            <p className="text-[11px] text-zinc-400">
              {`${current.path} · ${zh.packs.preview.sha256} ${current.sha256.slice(0, 12)}`}
            </p>
          )}
          <pre className="mono min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-zinc-50 p-3 text-[12px] leading-relaxed text-zinc-800">
            {current?.content ?? ''}
          </pre>
        </div>
      </div>
    </div>
  )
}
