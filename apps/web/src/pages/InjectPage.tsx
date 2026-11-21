import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CliCommandMeta, InjectionFileState } from '@openvibe/shared'
import { apiJson } from '../api/client'
import { useInjectionFiles, useInjectionStatus, useProjectList } from '../hooks/useProjects'
import { zh } from '../i18n/zh'
import { sys } from '../i18n/lane-system'
import { btnGhost, chipTone, inputCls } from '../components/ui/styles'
import { Card, EmptyState, PageHead } from '../components/ui/layout'
import { DemoChip } from '../components/ui/DemoChip'
import { Icon } from '../components/ui/icons'
import { toast } from '../components/ui/Toaster'

/**
 * 注入与漂移（侧栏「定标 · F3」组，路由 `/inject`）。
 *
 * 回答一个问题：**标准包注入到项目后，磁盘上的东西还对得上吗**。
 * 写盘边界（Web 只读、CLI 唯一写通道）在页头就说清，不让人误以为这里能改文件。
 *
 * 数据源：`GET /api/projects/:id/injection-status`（只读解析 lock）+
 * `GET /api/cli/commands`（命令元数据）。冲突处置 / 一致性六态是**设计稿**，
 * 页面如实标注，不伪装成已上线。
 */
export function InjectPage() {
  const projects = useProjectList('all')
  const items = projects.data?.items ?? []
  const [selected, setSelected] = useState<string>('')
  const activeId = selected !== '' ? selected : (items[0]?.id ?? null)
  const injection = useInjectionStatus(activeId)
  const files = useInjectionFiles(activeId)

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead title={zh.inject.title} hint={zh.inject.subtitle} />

      <div className="rounded-md border border-info-line bg-info-soft px-3.5 py-3 text-[13px]">
        <b className="mb-0.5 block text-xs font-bold text-info">{zh.inject.writeBoundaryTitle}</b>
        <p className="text-ink-body">{zh.inject.writeBoundaryBody}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-muted" htmlFor="inject-project">
          {zh.inject.projectLabel}
        </label>
        <select
          id="inject-project"
          className={`${inputCls} h-8 w-auto! py-0 text-xs`}
          value={activeId ?? ''}
          onChange={(e) => setSelected(e.target.value)}
          disabled={items.length === 0}
        >
          {items.length === 0 && <option value="">{zh.inject.noProjects}</option>}
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <InjectionCard state={injection} />

      <InjectionFilesCard state={files} />

      <CliCommands />

      <div className="grid gap-4 lg:grid-cols-2">
        <ConflictCard />
        <ConsistencyCard />
      </div>

      <DesignNote />
    </div>
  )
}

/** 注入状态卡：lock / 包 / 版本 / 指纹 / 一致性 */
function InjectionCard(props: { state: ReturnType<typeof useInjectionStatus> }) {
  const { state } = props
  if (state.isLoading) {
    return (
      <Card title={zh.inject.statusTitle}>
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded-sm bg-panel-2" />
          ))}
        </div>
      </Card>
    )
  }
  if (state.error) {
    return (
      <Card title={zh.inject.statusTitle}>
        <EmptyState
          hint={sys.state.error(state.error instanceof Error ? state.error.message : '')}
          action={
            <button type="button" className={btnGhost} onClick={() => void state.refetch()}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          }
        />
      </Card>
    )
  }
  const d = state.data
  if (d === undefined) {
    return (
      <Card title={zh.inject.statusTitle}>
        <p className="text-[13px] text-ink-muted">{zh.inject.noStatus}</p>
      </Card>
    )
  }
  const consistent =
    d.upToDate === true
      ? chipTone('ok')
      : d.upToDate === false
        ? chipTone('warn')
        : chipTone('default')
  return (
    <Card
      title={zh.inject.statusTitle}
      icon={<Icon name="pulse" size={15} className="text-ink-faint" />}
      headRight={
        <span className={consistent}>
          <Icon name={d.upToDate === true ? 'check' : 'warn'} size={11} />
          {d.upToDate === true
            ? zh.projects.injection.consistent
            : d.upToDate === false
              ? zh.projects.injection.inconsistent(
                  d.pack?.version ?? '?',
                  d.registered?.version ?? '?',
                )
              : zh.projects.injection.notRegistered}
        </span>
      }
    >
      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <Field label={zh.projects.injection.pack}>
          {d.pack
            ? zh.projects.injected(d.pack.name, d.pack.version)
            : zh.projects.injection.absent}
        </Field>
        <Field label={zh.projects.injection.fingerprint}>
          <span className="mono text-[12px]">{d.pack?.fingerprint.slice(0, 12) ?? '—'}</span>
        </Field>
        <Field label={zh.projects.injection.lockPresent}>
          {d.lockPresent ? zh.projects.injection.present : zh.projects.injection.absent}
        </Field>
        <Field label={zh.projects.injection.injectedAt}>
          <span className="mono text-[12px]">{d.injectedAt ?? '—'}</span>
        </Field>
      </dl>
      {d.error !== undefined && (
        <p className="mt-2 text-xs text-danger">{`${zh.projects.injection.error}：${d.error}`}</p>
      )}
      {d.suggestedCommand !== undefined && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="mono min-w-0 flex-1 truncate rounded-sm border border-line bg-panel-2 px-2 py-1 text-[12px]">
            {d.suggestedCommand}
          </code>
          <button
            type="button"
            className={btnGhost}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(d.suggestedCommand ?? '')
                .then(() => toast(zh.projects.injection.copied))
                .catch(() => toast(zh.projects.injection.copyFailed, 'error'))
            }}
          >
            <Icon name="copy" size={13} />
            {zh.projects.injection.copy}
          </button>
        </div>
      )}
    </Card>
  )
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-[11.5px] text-ink-muted">{props.label}</dt>
      <dd className="min-w-0 flex-1 text-ink-body">{props.children}</dd>
    </div>
  )
}

/** 产物台账的五态 → chip 语气与说明（口径与 core 的 CONSISTENCY_STATES 逐字一致） */
const FILE_STATE_META: Record<
  InjectionFileState,
  { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'default' }
> = {
  IN_SYNC: { label: 'IN_SYNC 一致', tone: 'ok' },
  DRIFT: { label: 'DRIFT 漂移', tone: 'warn' },
  ABSENT: { label: 'ABSENT 缺失', tone: 'danger' },
  FOREIGN: { label: 'FOREIGN 未纳管', tone: 'default' },
  LOCK: { label: 'LOCK 台账', tone: 'info' },
}

/**
 * 产物台账（原型 inject「产物台账（九文件 + lock）」）。
 *
 * 数据源 `GET /api/projects/:id/injection-files`：只读扫描 lock 与每个登记文件的实算哈希，
 * **不写盘**。⚠️ 与上面的「注入状态」卡分工：那张答「注入过没有、版本对不对」，
 * 本表答「每个文件现在对不对得上」。
 */
function InjectionFilesCard(props: { state: ReturnType<typeof useInjectionFiles> }) {
  const { state } = props
  if (state.isLoading) {
    return (
      <Card title={zh.inject.filesTitle}>
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded-sm bg-panel-2" />
          ))}
        </div>
      </Card>
    )
  }
  if (state.error) {
    return (
      <Card title={zh.inject.filesTitle}>
        <EmptyState
          hint={sys.state.error(state.error instanceof Error ? state.error.message : '')}
          action={
            <button type="button" className={btnGhost} onClick={() => void state.refetch()}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          }
        />
      </Card>
    )
  }
  const d = state.data
  if (d === undefined || !d.lockPresent) {
    return (
      <Card title={zh.inject.filesTitle}>
        <p className="text-[13px] text-ink-muted">{zh.inject.filesEmpty}</p>
      </Card>
    )
  }
  return (
    <Card
      title={zh.inject.filesTitle}
      icon={<Icon name="doc" size={15} className="text-ink-faint" />}
      headRight={
        <span className="text-[11.5px] text-ink-faint">
          {zh.inject.filesHint(d.files.length, d.pack?.name ?? '', d.pack?.version ?? '')}
        </span>
      }
      foot={<span className="text-[11.5px] text-ink-muted">{zh.inject.filesFooter}</span>}
    >
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] text-ink-faint">
            <th className="py-1.5 pr-3 font-medium">文件</th>
            <th className="py-1.5 pr-3 font-medium">状态</th>
            <th className="py-1.5 font-medium">说明</th>
          </tr>
        </thead>
        <tbody>
          {d.files.map((f) => {
            const meta = FILE_STATE_META[f.state]
            return (
              <tr key={f.path} className="border-b border-line-hair last:border-b-0">
                <td className="mono py-1.5 pr-3 text-[12px] text-ink-body">{f.path}</td>
                <td className="py-1.5 pr-3">
                  <span className={chipTone(meta.tone)}>{meta.label}</span>
                </td>
                <td className="py-1.5 text-[12.5px] text-ink-muted">
                  {fileNote(f, d.pack?.name ?? null, d.pack?.version ?? null)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

function fileNote(
  row: { path: string; state: InjectionFileState; managed: boolean },
  packName: string | null,
  packVersion: string | null,
): string {
  switch (row.state) {
    case 'DRIFT':
      return '受管文件，磁盘内容与 lock 登记不一致（多为本地手改）'
    case 'ABSENT':
      return '磁盘上不存在'
    case 'FOREIGN':
      return row.path.startsWith('.openvibe/')
        ? '`.openvibe/` 内部条目，非包产物'
        : '未受本包管辖，clean 不会删它'
    case 'LOCK':
      return packName === null ? '注入登记（lock）' : `${packName}@${packVersion} · 注入登记`
    case 'IN_SYNC':
    default:
      return ''
  }
}

/** CLI 命令参考：写盘唯一通道（元数据来自 GET /api/cli/commands） */
function CliCommands() {
  const query = useQuery({
    queryKey: ['cli-commands'],
    queryFn: () => apiJson<{ items: CliCommandMeta[] }>('/api/cli/commands'),
    staleTime: 60_000,
  })
  const items = query.data?.items ?? []
  return (
    <Card
      title={zh.inject.cliTitle}
      icon={<Icon name="term" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">{zh.inject.cliHint}</span>}
    >
      {query.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded-sm bg-panel-2" />
          ))}
        </div>
      ) : query.error ? (
        <p className="text-[13px] text-ink-muted">{zh.growth.cli.missing}</p>
      ) : (
        <div className="flex flex-col">
          {items.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-2.5 border-b border-line-hair py-1.5 last:border-b-0"
            >
              <code className="mono min-w-0 flex-1 truncate text-[12px] text-ink-body">
                {c.name}
              </code>
              <span className="hidden shrink-0 text-[11.5px] text-ink-faint sm:block">
                {c.summary}
              </span>
              <button
                type="button"
                className={btnGhost}
                aria-label={`${zh.projects.injection.copy} ${c.name}`}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(c.name)
                    .then(() => toast(zh.projects.injection.copied))
                    .catch(() => toast(zh.projects.injection.copyFailed, 'error'))
                }}
              >
                <Icon name="copy" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** 冲突处置（设计稿）：DRIFT 三选一 / CONFLICT 两档 */
function ConflictCard() {
  const [scenario, setScenario] = useState<'DRIFT' | 'CONFLICT'>('DRIFT')
  const [choice, setChoice] = useState('以包为准')
  const options = scenario === 'DRIFT' ? ['以包为准', '保留本地', '跳过'] : ['以包为准', '跳过']
  return (
    <Card
      title={zh.inject.conflictTitle}
      icon={<Icon name="warn" size={15} className="text-ink-faint" />}
      headRight={<DemoChip id="inject-conflict" />}
    >
      <div className="flex flex-col gap-3">
        <div className="inline-flex flex-wrap gap-0.5 self-start rounded-sm border border-line bg-panel-2 p-0.5">
          {(['DRIFT', 'CONFLICT'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scenario === s}
              onClick={() => {
                setScenario(s)
                setChoice('以包为准')
              }}
              className={`rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                scenario === s ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="inline-flex flex-wrap gap-0.5 self-start rounded-sm border border-line bg-panel-2 p-0.5">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={choice === o}
              onClick={() => setChoice(o)}
              className={`rounded-[4px] px-2.5 py-1 text-xs transition-colors ${
                choice === o ? 'bg-panel font-medium text-ink shadow-1' : 'text-ink-muted'
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <p className="text-[12.5px] text-ink-muted">
          {scenario === 'DRIFT' ? zh.inject.conflictDriftNote : zh.inject.conflictConflictNote}
        </p>
        <p className="text-[11.5px] text-ink-faint">{zh.inject.conflictFooter}</p>
      </div>
    </Card>
  )
}

/** 一致性核验六态（设计稿）：verify / clean 的口径 */
function ConsistencyCard() {
  const states: { tone: 'ok' | 'warn' | 'info' | 'default'; label: string }[] = [
    { tone: 'ok', label: 'CONSISTENT 三方一致' },
    { tone: 'warn', label: 'PARTIAL 疑似中断' },
    { tone: 'info', label: 'ORPHAN 有包无 lock' },
    { tone: 'warn', label: 'DISK_DRIFT 磁盘漂移' },
    { tone: 'warn', label: 'STALE_LOCK lock 过期' },
    { tone: 'default', label: 'UNMANAGED 未纳管' },
  ]
  return (
    <Card
      title={zh.inject.consistencyTitle}
      icon={<Icon name="check" size={15} className="text-ink-faint" />}
      headRight={<DemoChip id="inject-consistency" />}
    >
      <div className="flex flex-wrap gap-1.5">
        {states.map((s) => (
          <span key={s.label} className={chipTone(s.tone)}>
            {s.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12.5px] text-ink-muted">{zh.inject.consistencyNote}</p>
      <p className="mt-2 text-[11.5px] text-ink-faint">{zh.inject.consistencyFooter}</p>
    </Card>
  )
}

/** 设计稿边界说明：本页哪些是已上线、哪些是先行设计 */
function DesignNote() {
  return (
    <div className="rounded-md border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px]">
      <b className="mb-1 block text-xs font-bold text-warn">{zh.inject.designTitle}</b>
      <p className="text-ink-body">{zh.inject.designBody}</p>
    </div>
  )
}
