import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { LoopLedgerEntry } from '@openvibe/shared'
import { ApiError } from '../api/client'
import { useLedger } from '../hooks/useLedger'
import { useProjectList, type ProjectView } from '../hooks/useProjects'
import {
  useFlywheelStats,
  useOnboardingToggle,
  useSettings,
  useTelemetrySettings,
  useTelemetryToggle,
} from '../hooks/useSettings'
import { zh } from '../i18n/zh'
import { sys } from '../i18n/lane-system'
import { FlywheelBody } from '../components/onboarding/FlywheelCard'
import { OnboardingBar } from '../components/onboarding/OnboardingBar'
import { TelemetryAskCard } from '../components/onboarding/TelemetryAskCard'
import { btnGhost, btnPrimary, chipTone, rowCls } from '../components/ui/styles'
import { Card, EmptyState, PageHead, ProBlock, Skeleton } from '../components/ui/layout'
import { QueryError, QueryOffline, QuerySkeleton } from '../components/ui/QueryStates'
import { Icon, type IconName } from '../components/ui/icons'
import { LedgerCardHead } from '../components/ui/LedgerCardHead'
import { toast } from '../components/ui/Toaster'
import { readGrowthState, STAGES, STAGE_MODULES, type StageModule } from '../growth/stage'

/**
 * 飞轮全景（侧栏「飞轮全景」组，路由 `/`）。
 *
 * 首屏回答一个问题：**标准化飞轮走到哪一步了**。北极星是「完整走完的圈数」，
 * 五步环把它拆成可点的五段（沉淀 → 组包 → 注入 → 使用 → 回流），每段直达对应工作区。
 *
 * 首启/常驻内容（首启向导、遥测询问）在此页出镜，见 AppShell 纪律 2：
 * 它们是**落地页的内容**，不是每页都该顶着的横幅。
 */
export function HomePage() {
  const qc = useQueryClient()
  const settings = useSettings()
  const projects = useProjectList('all')
  const stats = useFlywheelStats()
  const telemetry = useTelemetrySettings()
  const ledger = useLedger()
  const markDone = useOnboardingToggle()
  const toggleTelemetry = useTelemetryToggle()
  const [step, setStep] = useState(1)
  // 手动重开向导：FR-2.1 的双条件是「自动出镜」的条件，不是「只有那时能打开」
  const [wizardOpen, setWizardOpen] = useState(false)

  const firstRun =
    settings.data !== undefined &&
    projects.data !== undefined &&
    !settings.data.onboardingDone &&
    projects.data.total === 0

  const finish = () =>
    markDone.mutate(true, {
      onSuccess: () => {
        setStep(1)
        setWizardOpen(false)
        void qc.invalidateQueries({ queryKey: ['stats'] })
      },
    })

  const choose = (enabled: boolean) =>
    toggleTelemetry.mutate(enabled, {
      onSuccess: () =>
        toast(
          zh.telemetryAsk.chose(enabled ? zh.settings.telemetry.on : zh.settings.telemetry.off),
        ),
    })

  const recent = (projects.data?.items ?? []).slice(0, 4)

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead
        title={zh.home.title}
        hint={zh.home.subtitle}
        actions={
          <>
            <button
              type="button"
              className={btnGhost}
              aria-pressed={firstRun || wizardOpen}
              onClick={() => setWizardOpen((v) => !v)}
            >
              <Icon name="flow" size={14} />
              {sys.workbench.action.wizard}
            </button>
            <Link to="/packs" className={btnPrimary}>
              <Icon name="plus" size={14} />
              {sys.workbench.action.newPack}
            </Link>
          </>
        }
      />

      {(firstRun || wizardOpen) && (
        <OnboardingBar step={step} onStepChange={setStep} onSkip={finish} onDone={finish} />
      )}
      {telemetry.data !== undefined && (stats.data?.injections ?? 0) > 0 && (
        <TelemetryAskCard askState={telemetry.data.askState} onChoose={choose} />
      )}

      <FlywheelBody stats={stats} />

      <FiveSteps assets={stats.data?.assets ?? 0} packs={stats.data?.packs ?? 0} />

      <LoopLedger items={stats.data?.loops_ledger ?? []} loading={stats.isLoading} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <StageVector />
          <NextSteps projects={recent} />
          <RecentProjects
            loading={projects.isLoading}
            error={projects.error}
            onRetry={() => void projects.refetch()}
            items={recent}
            total={projects.data?.total ?? 0}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <TodayCard />
          <LedgerCard state={ledger} />
        </div>
      </div>

      {/* 专家视图：飞轮「圈数」的判定口径 —— 五条 EXISTS 的合取。
          普通用户只需要那个数字；核对「为什么这项目不算一圈」时才需要这段。 */}
      <ProBlock>
        <section className="rounded-md border border-line bg-panel px-3.5 py-3 shadow-1">
          <h2 className="text-sm font-semibold text-ink">飞轮圈数的判定口径</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            圈数（<span className="mono">loops</span>）不是四个因子之和，而是**同一个项目**
            同时满足五条的计数：
          </p>
          <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12.5px] text-ink-muted">
            <li>
              项目登记了标准包（<span className="mono">standard_pack_id IS NOT NULL</span>）
            </li>
            <li>
              项目有本机路径（<span className="mono">local_path IS NOT NULL</span>）
            </li>
            <li>
              该包有导出（<span className="mono">pack_exports</span> 命中）
            </li>
            <li>
              该路径有注入记录，且<span className="mono">pack_id</span> 与包一致
            </li>
            <li>
              该项目有 <span className="mono">≥1</span> 条日志挂了资产（
              <span className="mono">linked_asset_ids</span> 非空）
            </li>
          </ol>
          <p className="mt-1.5 text-[12px] text-ink-faint">
            取数 <span className="mono">GET /api/stats</span>；逐条可复算，不用信界面。
          </p>
        </section>
      </ProBlock>
    </div>
  )
}

/** 五步环：点任一步直达对应工作区（原型 home 的 flyring） */
function FiveSteps(props: { assets: number; packs: number }) {
  const steps: { to: string; label: string; note: string; icon: IconName }[] = [
    { to: '/library', label: '① 沉淀资产', note: `提示词 / 术语 / 技巧 / Skill`, icon: 'doc' },
    { to: '/packs', label: '② 组装标准包', note: `${String(props.packs)} 个包`, icon: 'pack' },
    { to: '/inject', label: '③ 注入项目', note: '覆盖前必备份', icon: 'pulse' },
    { to: '/projects', label: '④ 按流程使用', note: '阶段 / 清单 / 看板 / 日志', icon: 'folder' },
    { to: '/agent', label: '⑤ 复盘回流', note: '确认才落业务表', icon: 'flow' },
  ]
  return (
    <Card
      title={zh.home.ring.title}
      icon={<Icon name="refresh" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">{zh.home.ring.hint}</span>}
    >
      <div className="flex flex-col">
        {steps.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className={`${rowCls} flex items-center gap-3 px-3.5 py-2.5 transition-colors last:border-b-0`}
          >
            <Icon name={s.icon} size={15} className="shrink-0 text-ink-faint" />
            <span className="w-[104px] shrink-0 text-[13px] font-medium text-ink">{s.label}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-muted">{s.note}</span>
            <span className="shrink-0 text-accent">›</span>
          </Link>
        ))}
      </div>
    </Card>
  )
}

/**
 * 圈数台账（原型 home 的「圈数台账（飞轮怎么算一圈）」）。
 *
 * 数据源与顶栏「飞轮圈数」**同源**：`/api/stats` 的五条 EXISTS 判定逐项目求值，
 * 只是把「数项目」换成「列项目」。⚠️ 达成日 = 导出 / 注入 / 回流三条时间戳的**最大值**
 * （最后一条件达成之日），按达成日升序 ⇒ 圈 1 = 最早走完的那一圈。
 */
function LoopLedger(props: { items: LoopLedgerEntry[]; loading: boolean }) {
  return (
    <Card
      title="圈数台账（飞轮怎么算一圈）"
      icon={<Icon name="list" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">同项目去重 · 按达成日</span>}
      foot={
        <span className="text-[11.5px] text-ink-muted">
          口径：同一项目「有导出包 → 有注入记录 → ≥1 条回流资产」记 1 圈（FR-3.2）
        </span>
      }
    >
      {props.loading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : props.items.length === 0 ? (
        <p className="text-[13px] text-ink-muted">还没有完整走完的圈。</p>
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-ink-faint">
              <th className="py-1.5 pr-3 font-medium">圈</th>
              <th className="py-1.5 pr-3 font-medium">项目</th>
              <th className="py-1.5 pr-3 font-medium">口径</th>
              <th className="py-1.5 text-right font-medium">达成日</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((it, i) => (
              <tr key={it.projectId} className="border-b border-line-hair last:border-b-0">
                <td className="num py-1.5 pr-3 text-[12.5px] text-ink-muted">{String(i + 1)}</td>
                <td className="py-1.5 pr-3 text-ink">{it.projectName}</td>
                <td className="mono py-1.5 pr-3 text-[12px] text-ink-muted">
                  {it.packName}@{it.packVersion}
                </td>
                <td className="num py-1.5 text-right text-[12.5px] text-ink-muted">
                  {it.completedAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}

/** 阶段向量速览：五模块 × 当前阶段（数据取自 localStorage，不进服务端） */
function StageVector() {
  const growth = readGrowthState()
  const moduleLabel: Record<StageModule, string> = {
    prompts: zh.nav.library,
    terms: zh.nav.terms,
    skills: zh.nav.skills,
    flows: zh.nav.flows,
    packs: zh.nav.packs,
  }
  return (
    <Card
      title={zh.home.vector.title}
      icon={<Icon name="chart" size={15} className="text-ink-faint" />}
      headRight={
        <Link
          to="/growth"
          className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          {zh.home.vector.more} ›
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        {STAGE_MODULES.map((m) => {
          const stage = STAGES[growth.stages[m]] ?? STAGES[0]
          if (stage === undefined) return null
          return (
            <div
              key={m}
              className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-center"
            >
              <div className="truncate text-[11.5px] text-ink-faint">{moduleLabel[m]}</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">F{stage.code}</div>
              <div className="text-[11px] text-ink-muted">{stage.name}</div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** 你的下一步：按真实项目健康摘要推导（未完项 / 未绑定包），不编造待办 */
function NextSteps(props: { projects: ProjectView[] }) {
  const steps: { to: string; label: string; note: string; icon: IconName }[] = []
  for (const p of props.projects) {
    if (p.health.unchecked > 0) {
      steps.push({
        to: `/projects/${p.id}`,
        label: `勾完「${p.currentStage ?? zh.workbench.projects.title}」阶段清单`,
        note: `${String(p.health.unchecked)} 项待办`,
        icon: 'check',
      })
    }
    if (!p.standardPackId) {
      steps.push({
        to: `/projects/${p.id}`,
        label: `给「${p.name}」绑定标准包`,
        note: zh.workbench.projects.noPack,
        icon: 'pack',
      })
    }
  }
  return (
    <Card
      title={zh.home.next.title}
      icon={<Icon name="target" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">{zh.home.next.hint}</span>}
    >
      {steps.length === 0 ? (
        <p className="text-[13px] text-ink-muted">{zh.home.next.empty}</p>
      ) : (
        <div className="flex flex-col">
          {steps.slice(0, 6).map((s, i) => (
            <Link
              key={`${s.to}-${String(i)}`}
              to={s.to}
              className={`${rowCls} flex items-center gap-3 px-3.5 py-2 transition-colors last:border-b-0`}
            >
              <Icon name={s.icon} size={14} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{s.label}</span>
              <span className="shrink-0 text-[12px] text-ink-muted">{s.note}</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}

/** 最近项目卡四态：加载骨架 / 错误可重试 / 空态引导 / 列表；底部附健康摘要口径说明 */
function RecentProjects(props: {
  loading: boolean
  error: unknown
  onRetry: () => void
  items: ProjectView[]
  total: number
}) {
  return (
    <Card
      className="min-w-0"
      title={zh.workbench.projects.title}
      icon={<Icon name="folder" size={15} className="text-ink-faint" />}
      headRight={
        <Link
          to="/projects"
          className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          {zh.workbench.projects.all} ›
        </Link>
      }
      foot={
        props.items.length > 0 ? (
          <span className="text-[11.5px] text-ink-muted">
            健康摘要 = 所处阶段 + 未完检查项 + 最近日志
          </span>
        ) : undefined
      }
    >
      {props.loading ? (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : props.error !== null && props.error !== undefined ? (
        <EmptyState
          hint={sys.state.error(errText(props.error))}
          action={
            <button type="button" className={btnGhost} onClick={props.onRetry}>
              <Icon name="refresh" size={13} />
              {sys.state.retry}
            </button>
          }
        />
      ) : props.items.length === 0 ? (
        <EmptyState
          hint={
            <>
              {sys.workbench.projects.emptyTitle}
              <br />
              {sys.workbench.projects.emptyHint}
            </>
          }
          action={
            <Link to="/projects" className={btnGhost}>
              <Icon name="plus" size={13} />
              {sys.workbench.projects.emptyCta}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {props.items.map((p) => (
            <li key={p.id}>
              <Link
                to={`/projects/${p.id}`}
                className={`${rowCls} flex items-center gap-3 px-3.5 py-2 transition-colors last:border-b-0`}
              >
                <span className="min-w-0 grow">
                  <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
                  <span className="mono block truncate text-[11.5px] text-ink-muted">
                    {p.localPath ?? sys.workbench.projects.noPath}
                    {p.currentStage ? ` · ${zh.workbench.projects.stage(p.currentStage)}` : ''}
                    {p.health.total > 0
                      ? ` · ${sys.workbench.projects.checkNote(
                          p.health.total - p.health.unchecked,
                          p.health.total,
                        )}`
                      : ''}
                  </span>
                </span>
                {p.standardPackId && p.standardPackVersion ? (
                  <span className={`${chipTone('ok')} shrink-0`}>
                    <Icon name="check" size={12} />
                    {zh.workbench.projects.pack(p.standardPackVersion)}
                  </span>
                ) : (
                  <span className="shrink-0 text-[11.5px] text-ink-muted">
                    {zh.workbench.projects.noPack}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function TodayCard() {
  const rows: { to: string; label: string; icon: 'search' | 'check' | 'doc' }[] = [
    { to: '/library', label: zh.workbench.today.findPrompt, icon: 'search' },
    { to: '/projects', label: zh.workbench.today.checkList, icon: 'check' },
    { to: '/projects', label: zh.workbench.today.appendLog, icon: 'doc' },
  ]
  return (
    <Card
      title={zh.workbench.today.title}
      icon={<Icon name="list" size={15} className="text-ink-faint" />}
    >
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <Link key={r.label} to={r.to} className={`${btnGhost} justify-start`}>
            <Icon name={r.icon} size={13} />
            {r.label}
          </Link>
        ))}
        <p className="mt-0.5 text-[11.5px] text-ink-muted">{sys.workbench.today.note}</p>
      </div>
    </Card>
  )
}

/**
 * 本机自证层（MT 层）在首页的落点：只读、只留本机、不出网。
 * 四态齐全，且把「端点未上线」与「真出错」分开说。
 */
function LedgerCard(props: { state: ReturnType<typeof useLedger> }) {
  const { state } = props
  const missing = state.error instanceof ApiError && state.error.status === 404
  const items = state.data?.items ?? []

  return (
    <Card
      head={<LedgerCardHead />}
      foot={
        <>
          <span className="text-[11px] text-ink-muted">{sys.workbench.ledger.orthogonal}</span>
          <Link to="/growth" className="ml-auto shrink-0 text-xs text-ink-muted hover:text-ink">
            {zh.workbench.ledger.open} ›
          </Link>
        </>
      }
    >
      {state.isLoading ? (
        <QuerySkeleton wrap="" />
      ) : missing ? (
        <QueryOffline wrap="" />
      ) : state.error ? (
        <QueryError wrap="" error={state.error} onRetry={() => void state.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          hint={
            <>
              {zh.workbench.ledger.empty}
              <br />
              {zh.workbench.ledger.emptyHint}
            </>
          }
          action={
            <Link to="/packs" className={btnGhost}>
              <Icon name="pack" size={13} />
              {sys.workbench.action.newPack}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {items.slice(0, 5).map((e) => (
            <li key={e.id} className={`${rowCls} flex items-center gap-2 px-3.5 py-1.5`}>
              <span className="mono min-w-0 grow truncate text-[12px] text-ink-body">{e.name}</span>
              <span className="num shrink-0 text-[11px] text-ink-muted">
                {new Date(e.ts).toLocaleString('zh-CN', { hour12: false })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : ''
}
