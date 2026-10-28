import type { PackOut } from '@openvibe/shared'
import { usePackExports, usePackInjections, usePackPreview } from '../../hooks/usePacks'
import { useFlowTemplates } from '../../hooks/useFlows'
import { laneEngineering } from '../../i18n/lane-engineering'
import { zh } from '../../i18n/zh'
import { Icon } from '../ui/icons'
import {
  cardBodyCls,
  cardCls,
  cardHeadCls,
  chipTone,
  ledgerNumCls,
  noteCls,
  noteTitleCls,
  tagCls,
  tagMonoCls,
} from '../ui/styles'
import { PackDryRunPanel } from './PackDryRunPanel'
import { PackPreviewPane } from './PackPreviewPane'

/** 没有导出记录时按这个版本号现渲一份预览：与向导第 5 步同一入口、同一生成器 */
const PREVIEW_FALLBACK_VERSION = '1.0.0'

function Section(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className={cardCls}>
      <header className={cardHeadCls}>
        <h3 className="text-xs font-semibold text-ink-muted">{props.title}</h3>
        {props.right !== undefined && <span className="ml-auto">{props.right}</span>}
      </header>
      <div className={cardBodyCls}>{props.children}</div>
    </section>
  )
}

/** 兼容矩阵：六个 adapter 各自的主文件路径（design §8.2 映射，与向导第 4 步同一份字面量） */
const TARGET_PATH: Record<string, string> = {
  'claude-code': 'CLAUDE.md',
  cursor: '.cursor/rules/openvibe.mdc',
  'generic-agents': 'AGENTS.md',
  codebuddy: 'CODEBUDDY.md',
  trae: '.trae/rules/openvibe.md',
  minicode: 'MINI.md',
}

/**
 * 包详情（不是抽屉——主链要求一屏读全）：选集摘要 → 目标平台与兼容矩阵 → 指纹与最近导出
 * → 产物文件树与内容预览 → perTarget 成本条（预览面板内）→ 注入前干跑。
 */
export function PackDetailPane(props: { pack: PackOut; onOpenHistory: () => void }) {
  const { pack } = props
  const flows = useFlowTemplates()
  const exports = usePackExports(pack.id)
  const injections = usePackInjections(pack.id)
  const latest = exports.data?.items[0]
  // rev 是「定义保存代次」，只对向导有意义（m6a FR-2.3）；详情页是只读预览，给固定 0。
  // 版本号进查询键：导出了新版本，预览自然跟着换一代。
  const preview = usePackPreview(pack.id, latest?.version ?? PREVIEW_FALLBACK_VERSION, 0)

  const selection = pack.selection
  const flowName = flows.data?.items.find((t) => t.id === selection.flowTemplateId)?.name
  // 选集四栏的列名直接取向导第 3 步的 key，避免两处各写一份列名
  const selectionTags = [
    { label: zh.packs.wizard.promptsCol, n: selection.promptIds.length },
    { label: zh.packs.wizard.termsCol, n: selection.termIds.length },
    { label: zh.packs.wizard.skillsCol, n: selection.skillIds.length },
    { label: zh.packs.wizard.playbooksCol, n: selection.playbookIds.length },
  ]

  return (
    <div className="space-y-3">
      <Section
        title={zh.packs.detail.definition}
        right={
          <span className="mono text-[11px] text-ink-faint">
            {pack.name}@{latest?.version ?? PREVIEW_FALLBACK_VERSION}
          </span>
        }
      >
        <p className="proseCls text-sm text-ink-body">
          {pack.description === '' ? zh.common.none : pack.description}
        </p>

        <dl className="mt-2.5 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 text-ink-muted">{zh.packs.columns.assets}</dt>
            <dd className="flex min-w-0 flex-wrap gap-1">
              {selectionTags.map((s) => (
                <span key={s.label} className={tagCls}>
                  {`${s.label} ${String(s.n)}`}
                </span>
              ))}
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-16 shrink-0 text-ink-muted">{zh.flows.title}</dt>
            <dd className="min-w-0 truncate text-ink-body">
              {flowName === undefined ? zh.packs.noFlow : zh.packs.flowOf(flowName)}
            </dd>
          </div>
        </dl>

        <div className="mt-2.5">
          <p className="mb-1 text-[11px] text-ink-muted">{zh.packs.columns.targets}</p>
          <ul className="flex flex-wrap gap-1">
            {pack.targets.map((t) => (
              <li key={t} className="flex items-center gap-1">
                <span className={chipTone('default')}>{zh.packs.targetLabels[t] ?? t}</span>
                <span className={tagMonoCls}>{TARGET_PATH[t] ?? '—'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-ink-faint">{zh.packs.wizard.compatNote}</p>
        </div>
      </Section>

      <Section
        title={zh.packs.detail.exports}
        right={
          <span className="flex items-center gap-2">
            <span className="tabular-nums text-[11px] text-ink-faint">
              {`${String(exports.data?.total ?? 0)}`}
            </span>
            {/* 全量导出历史是台账（可回放下载），放抽屉；同屏只留最近一次，省一屏高度 */}
            <button
              type="button"
              className="text-[11px] text-accent hover:underline"
              onClick={props.onOpenHistory}
            >
              {laneEngineering.packs.allExports}
            </button>
          </span>
        }
      >
        {exports.isLoading && (
          <p className="text-xs text-ink-faint">{laneEngineering.state.loading}</p>
        )}
        {exports.isError && (
          <div className={noteCls('danger')}>
            <span className={`${noteTitleCls} text-danger`}>
              {zh.common.failed((exports.error as Error).message)}
            </span>
            <button
              type="button"
              className="mt-1.5 text-accent hover:underline"
              onClick={() => void exports.refetch()}
            >
              {laneEngineering.state.retry}
            </button>
          </div>
        )}
        {!exports.isLoading && !exports.isError && latest === undefined && (
          <p className="text-xs text-ink-muted">{zh.packs.detail.noExports}</p>
        )}
        {latest !== undefined && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className={`inline-flex items-center gap-1 ${chipTone('ok')}`}>
              <Icon name="check" size={11} />
              {`v${latest.version}`}
            </span>
            <span className="text-ink-muted">{zh.packs.exports.channels[latest.channel]}</span>
            <span className="mono text-ink-body" title={latest.fingerprint}>
              {`${zh.packs.exports.fingerprint} ${latest.fingerprint.slice(0, 12)}`}
            </span>
            <span className={`${ledgerNumCls} text-[11px] text-ink-faint`}>
              {latest.exportedAt}
            </span>
            <a
              className="ml-auto text-accent hover:underline"
              href={`/api/packs/${pack.id}/exports/${latest.id}/bundle`}
              download
            >
              {zh.packs.exports.download}
            </a>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-ink-faint">{laneEngineering.dryRun.baselineHint}</p>
      </Section>

      <Section title={zh.packs.preview.files}>
        {preview.isError ? (
          <div className={noteCls('danger')}>
            <span className={`${noteTitleCls} text-danger`}>
              {zh.common.failed((preview.error as Error).message)}
            </span>
            <button
              type="button"
              className="mt-1.5 text-accent hover:underline"
              onClick={() => void preview.refetch()}
            >
              {laneEngineering.state.retry}
            </button>
          </div>
        ) : (
          <PackPreviewPane preview={preview.data} />
        )}
      </Section>

      <Section title={zh.packs.detail.injections}>
        {(injections.data?.items.length ?? 0) === 0 ? (
          <p className="text-xs text-ink-muted">{zh.packs.detail.noInjections}</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {injections.data?.items.map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <span className="mono truncate text-ink-body">{row.projectPath}</span>
                <span className={`${ledgerNumCls} ml-auto shrink-0 text-[11px] text-ink-faint`}>
                  {row.injectedAt}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <PackDryRunPanel pack={pack} />
    </div>
  )
}
