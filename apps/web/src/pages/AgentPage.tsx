import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ProjectContextOut } from '@openvibe/shared'
import { apiJson } from '../api/client'
import { useProject, useProjectList } from '../hooks/useProjects'
import { useAgentIngests } from '../hooks/useAgentIngests'
import { PendingIngestList } from '../components/agent/PendingIngestList'
import { InstallGuide } from '../components/agent/InstallGuide'
import { zh } from '../i18n/zh'
import { chipTone, inputCls } from '../components/ui/styles'
import { Card, PageHead } from '../components/ui/layout'
import { Icon } from '../components/ui/icons'

/**
 * Agent 接入（侧栏「实践 · F1」组，路由 `/agent`）。
 *
 * agent 帮的是**回流和取上下文**，不是替人做决定：能读、能写（一律先 pending）、
 * 不能删、不能自己裁决幂等冲突、不能扩充闭集。
 *
 * 数据源：`GET /api/projects/:id/agent-ingests`（待确认队列）+
 * `GET /api/projects/:id/context`（上下文端点，fields 裁段 / budget 预算 / truncated 不静默截断）。
 */
export function AgentPage() {
  const projects = useProjectList('all')
  const items = projects.data?.items ?? []
  const [selected, setSelected] = useState<string>('')
  const activeId = selected !== '' ? selected : (items[0]?.id ?? null)
  // 空态 CTA「让 agent 接入」滚到接入指引（本页的「怎么接上」落点）
  const installRef = useRef<HTMLDivElement>(null)
  const goToInstall = (): void => {
    installRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
  const project = useProject(activeId)

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead title={zh.agent.title} hint={zh.agent.subtitle} />

      <div className="rounded-md border border-info-line bg-info-soft px-3.5 py-3 text-[13px]">
        <b className="mb-0.5 block text-xs font-bold text-info">{zh.agent.rulesTitle}</b>
        <p className="text-ink-body">{zh.agent.rulesBody}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-muted" htmlFor="agent-project">
          {zh.agent.projectLabel}
        </label>
        <select
          id="agent-project"
          className={`${inputCls} h-8 w-auto! py-0 text-xs`}
          value={activeId ?? ''}
          onChange={(e) => setSelected(e.target.value)}
          disabled={items.length === 0}
        >
          {items.length === 0 && <option value="">{zh.agent.noProjects}</option>}
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <PendingQueue projectId={activeId} onGoToInstall={goToInstall} />

      <ContextDemo projectId={activeId} />

      <div ref={installRef}>
        <McpTools />
        <div className="mt-4">
          <Card
            title={zh.agent.installTitle}
            icon={<Icon name="flow" size={15} className="text-ink-faint" />}
          >
            <InstallGuide projectPath={project.data?.localPath ?? null} />
          </Card>
        </div>
      </div>
    </div>
  )
}

/**
 * 待确认队列：**直接复用** `PendingIngestList`（M8-E 的裁决控件唯一出处）。
 *
 * ⚠️ 本页此前另写了一份内联队列（含 pending 确认 / conflict chip），与
 *   `components/agent/PendingIngestList.tsx` 是**同一套裁决逻辑的两份实现** ——
 *   第二真源。现在只保留 Card 外壳（标题 / 计数），列表与裁决全部交给共享组件。
 */
function PendingQueue(props: { projectId: string | null; onGoToInstall: () => void }) {
  const query = useAgentIngests(props.projectId)
  const items = query.data?.items ?? []
  return (
    <Card
      title={zh.agent.queueTitle}
      icon={<Icon name="flow" size={15} className="text-ink-faint" />}
      headRight={
        <span className="text-[11.5px] text-ink-faint">{zh.agent.queueHint(items.length)}</span>
      }
    >
      <PendingIngestList projectId={props.projectId} onGoToInstall={props.onGoToInstall} />
    </Card>
  )
}

const CONTEXT_FIELDS = ['stage', 'checklist', 'tasks', 'logs', 'pack', 'assets'] as const

/** 上下文端点演示：fields 裁段 + budget 预算 + truncated 不静默截断 */
function ContextDemo(props: { projectId: string | null }) {
  const [fields, setFields] = useState<string[]>([...CONTEXT_FIELDS])
  const [budget, setBudget] = useState(6000)
  const query = useQuery({
    queryKey: ['agent-context', props.projectId, fields, budget],
    queryFn: () =>
      apiJson<ProjectContextOut>(
        `/api/projects/${props.projectId ?? ''}/context?fields=${fields.join(',')}&budget=${String(budget)}`,
      ),
    enabled: props.projectId !== null,
  })
  const d = query.data
  return (
    <Card
      title={zh.agent.contextTitle}
      icon={<Icon name="term" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">{zh.agent.contextHint}</span>}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {CONTEXT_FIELDS.map((f) => (
          <label key={f} className="flex items-center gap-1.5 text-[13px] text-ink-body">
            <input
              type="checkbox"
              checked={fields.includes(f)}
              onChange={(e) =>
                setFields((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)))
              }
            />
            <span className="mono">{f}</span>
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-[13px] text-ink-body">
          budget
          <input
            type="number"
            className={`${inputCls} ml-1 h-7 w-24 px-2 py-0 text-xs`}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
          />
        </label>
      </div>
      <div className="mt-3">
        {query.isLoading ? (
          <p className="text-[12.5px] text-ink-faint">{zh.agent.contextLoading}</p>
        ) : query.error ? (
          <p className="text-[12.5px] text-ink-muted">{zh.agent.contextError}</p>
        ) : d === undefined ? null : (
          <>
            <p className="text-[12.5px] text-ink-muted">
              {zh.agent.contextTruncated}
              <span className="mono ml-1 text-ink-body">
                [{d.truncated.map((t) => `${t.section}（${String(t.dropped)}）`).join(', ')}]
              </span>
            </p>
            <p className="mt-1 text-[11.5px] text-ink-faint">{zh.agent.contextFooter}</p>
          </>
        )}
      </div>
    </Card>
  )
}

const MCP_TOOLS = [
  { name: 'project_context', desc: '全项目上下文（阶段 / 清单 / 任务 / 日志 / 漂移 / 资产）' },
  { name: 'search_assets', desc: 'FTS 搜索库内资产' },
  { name: 'pack_diff', desc: '包内容 vs 项目产物比对' },
]

function McpTools() {
  return (
    <Card
      title={zh.agent.mcpTitle}
      icon={<Icon name="box" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">{zh.agent.mcpHint}</span>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {MCP_TOOLS.map((t) => (
          <div key={t.name} className="rounded-md border border-line bg-panel-2 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="mono text-[12.5px] font-medium text-ink">{t.name}</span>
              <span className={`${chipTone('ok')} ml-auto`}>{zh.agent.readonly}</span>
            </div>
            <p className="mt-1.5 text-[12px] text-ink-muted">{t.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">{zh.agent.mcpFooter}</p>
    </Card>
  )
}
