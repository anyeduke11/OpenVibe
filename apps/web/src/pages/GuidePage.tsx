import { Link } from 'react-router-dom'
import { useProjectList } from '../hooks/useProjects'
import { zh } from '../i18n/zh'
import { btnPrimary } from '../components/ui/styles'
import { Card, EmptyState, PageHead } from '../components/ui/layout'
import { Icon, type IconName } from '../components/ui/icons'

/**
 * 今日下一步（侧栏「跟随 · F0」组，路由 `/guide`）。
 *
 * F0 跟随者视角：「别让我选，告诉我做什么」。每一步都解释**为什么**（红线 3：
 * 阶段可见可解释），且「查看全部」永远可达（红线 1：永不隐藏数据）。
 *
 * 步骤**由真实项目健康摘要推导**，不编造待办：未完检查项、未绑定包、未注入。
 * 没有可推的步就如实说「今天没有待办」——不拿假任务填满引导页。
 */
export function GuidePage() {
  const projects = useProjectList('active')
  const items = projects.data?.items ?? []

  const steps: {
    to: string
    title: string
    why: string
    tag: string
    icon: IconName
  }[] = []

  for (const p of items) {
    if (p.health.unchecked > 0) {
      steps.push({
        to: `/projects/${p.id}`,
        title: `勾完「${p.currentStage ?? zh.projects.title}」阶段清单`,
        why: `「${p.name}」当前阶段还有 ${String(p.health.unchecked)} 项未勾；勾满后阶段闸放行（可判前置，不是感觉）。`,
        tag: '随做随勾',
        icon: 'check',
      })
    }
    if (!p.standardPackId) {
      steps.push({
        to: `/projects/${p.id}`,
        title: `给「${p.name}」绑定标准包`,
        why: '没有标准包就没有可注入的规则与术语 —— 飞轮的第 ②③ 步无从开始。',
        tag: '5 分钟',
        icon: 'pack',
      })
    } else if (!p.standardPackVersion) {
      steps.push({
        to: `/inject`,
        title: `注入「${p.name}」的标准包`,
        why: '包已登记但项目目录里还没有 lock —— 注入后规则才真正进到你的工作区。',
        tag: '5 分钟',
        icon: 'pulse',
      })
    }
  }

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead title={zh.guide.title} hint={zh.guide.subtitle} />

      {projects.isLoading ? (
        <div className="grid gap-3.5 lg:grid-cols-2" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-md bg-panel-2" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <EmptyState
          hint={zh.guide.empty}
          action={
            <Link to="/projects" className={btnPrimary}>
              <Icon name="folder" size={13} />
              {zh.guide.allProjects}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3.5 lg:grid-cols-2">
          {steps.slice(0, 6).map((s, i) => (
            <Card key={`${s.to}-${String(i)}`}>
              <div className="flex items-center gap-2 border-b border-line-hair px-3.5 py-2.5">
                <span className="text-sm font-semibold text-ink">
                  {String(i + 1)}. {s.title}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-faint">{s.tag}</span>
              </div>
              <div className="flex flex-col gap-2.5 px-3.5 py-3">
                <div className="rounded-md border border-info-line bg-info-soft px-3 py-2 text-[13px]">
                  <b className="mb-0.5 block text-xs font-bold text-info">为什么</b>
                  <span className="text-ink-body">{s.why}</span>
                </div>
                <div>
                  <Link to={s.to} className={btnPrimary}>
                    <Icon name={s.icon} size={13} />
                    {zh.guide.go}
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="rounded-md border border-warn-line bg-warn-soft px-3.5 py-3 text-[13px]">
        <b className="mb-1 block text-xs font-bold text-warn">{zh.guide.redlineTitle}</b>
        <p className="text-ink-body">{zh.guide.redlineBody}</p>
      </div>
    </div>
  )
}
