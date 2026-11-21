import { useState } from 'react'
import { zh } from '../i18n/zh'
import { btnDanger, btnPrimary, chipTone } from '../components/ui/styles'
import { Card, PageHead } from '../components/ui/layout'
import { DemoChip } from '../components/ui/DemoChip'
import { Icon } from '../components/ui/icons'
import { toast } from '../components/ui/Toaster'

/**
 * 团队协作（侧栏「定标 · F3」组，路由 `/team`）—— **设计稿**。
 *
 * 多用户与角色、PR 式变更评审、团队共享库。代码零实现（成长页文案是唯一出处）；
 * 本页为先行设计，不含可执行动作。
 *
 * ⚠️ 裁定不做的一侧（D-v25-7）：S8「团队级知识库、多项目复用与版本管理」已裁定永久不做
 * ——不改写「单用户本机」信任模型。本页设计不越过这条线。
 */

const MEMBERS = [
  { name: 'duke（你）', role: 'owner', note: '全部权限 · 遥测与出网裁定', state: '已加入' },
  { name: 'lin', role: 'member', note: '提交变更进评审队列', state: '已邀请' },
  { name: 'zhao', role: 'reviewer', note: '审核提示词 / 术语变更', state: '已加入' },
]

const REVIEWS = [
  {
    id: 'rv1',
    kind: '提示词变更',
    item: '规则遵守强化（防漂移） v3 → v4',
    by: 'lin',
    state: '待审',
    sum: '收紧只读边界措辞；新增 diff 后审步骤',
  },
  {
    id: 'rv2',
    kind: '术语变更',
    item: '门禁 gate · 补充验收要点',
    by: 'zhao',
    state: '已合入',
    sum: '补「硬拒 + 强制推进入口留痕」一句',
  },
]

const SHARED_STATS = [
  ['共享库', '提示词 32 · 术语 109 · 技巧 12（演示样例）'],
  ['本月被引用最多', '规则遵守强化（防漂移）· 14 次'],
  ['团队共用同一包的项目', '2 / 3（毕业信号 · 待采集）'],
]

const ROLE_TONE: Record<string, 'accent' | 'info' | 'default'> = {
  owner: 'accent',
  reviewer: 'info',
  member: 'default',
}

export function TeamPage() {
  const [reviews, setReviews] = useState(REVIEWS)
  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead
        title={zh.team.title}
        hint={zh.team.subtitle}
        actions={<DemoChip id="team-page" />}
      />

      <Card
        title={zh.team.membersTitle}
        icon={<Icon name="git" size={15} className="text-ink-faint" />}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {['成员', '角色', '权限说明', '状态'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-line px-2.5 py-1.5 text-left text-[11.5px] font-normal text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEMBERS.map((m) => (
                <tr key={m.name}>
                  <td className="border-b border-line-hair px-2.5 py-1.5 font-medium text-ink">
                    {m.name}
                  </td>
                  <td className="border-b border-line-hair px-2.5 py-1.5">
                    <span className={chipTone(ROLE_TONE[m.role] ?? 'default')}>{m.role}</span>
                  </td>
                  <td className="hidden border-b border-line-hair px-2.5 py-1.5 text-[12.5px] text-ink-muted sm:table-cell">
                    {m.note}
                  </td>
                  <td className="border-b border-line-hair px-2.5 py-1.5">
                    <span className={chipTone(m.state === '已加入' ? 'ok' : 'warn')}>
                      {m.state}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-faint">{zh.team.membersFooter}</p>
      </Card>

      <Card
        title={zh.team.reviewsTitle}
        icon={<Icon name="git" size={15} className="text-ink-faint" />}
        headRight={<span className="text-[11.5px] text-ink-faint">{zh.team.reviewsHint}</span>}
      >
        <div className="flex flex-col">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-2 border-b border-line-hair py-2.5 last:border-b-0"
            >
              <span className={chipTone('info')}>{r.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink">{r.item}</span>
                <span className="block text-[12px] text-ink-muted">
                  {r.sum} · {zh.team.submitterBy} {r.by}
                </span>
              </span>
              {r.state === '待审' ? (
                <span className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className={`${btnPrimary} px-2 py-1 text-xs`}
                    onClick={() => {
                      setReviews((prev) =>
                        prev.map((x) => (x.id === r.id ? { ...x, state: '已合入' } : x)),
                      )
                      toast(zh.team.mergeDone)
                    }}
                  >
                    {zh.team.merge}
                  </button>
                  <button
                    type="button"
                    className={`${btnDanger} px-2 py-1 text-xs`}
                    onClick={() => {
                      setReviews((prev) =>
                        prev.map((x) => (x.id === r.id ? { ...x, state: '已退回' } : x)),
                      )
                      toast(zh.team.rejectDone)
                    }}
                  >
                    {zh.team.reject}
                  </button>
                </span>
              ) : (
                <span className={chipTone(r.state === '已合入' ? 'ok' : 'default')}>{r.state}</span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md border border-info-line bg-info-soft px-3 py-2 text-[12.5px] text-ink-body">
          {zh.team.reviewsNote}
        </p>
      </Card>

      <Card
        title={zh.team.sharedTitle}
        icon={<Icon name="pack" size={15} className="text-ink-faint" />}
      >
        <div className="flex flex-col">
          {SHARED_STATS.map(([k, v]) => (
            <div
              key={k}
              className="flex items-baseline gap-3 border-b border-line-hair py-2 last:border-b-0"
            >
              <span className="w-40 shrink-0 text-[12.5px] text-ink-faint">{k}</span>
              <span className="min-w-0 flex-1 text-[13px] text-ink-body">{v}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-3 text-[13px]">
        <b className="mb-1 block text-xs font-bold text-danger">{zh.team.notDoTitle}</b>
        <p className="text-ink-body">{zh.team.notDoBody}</p>
      </div>
    </div>
  )
}
