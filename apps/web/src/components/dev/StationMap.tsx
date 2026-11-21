import { LANG_CODES, languageMastery, type LangCode } from '@openvibe/shared'
import { useLangRoadmap } from '../../hooks/useLangRoadmap'
import { MasteryChip } from './MasteryChip'
import { Card, EmptyState } from '../ui/layout'
import { Icon } from '../ui/icons'

/**
 * 语言站位图（原型 learn「站位图」页签，`灵典-全功能Demo-成长视角-20261107.html`）。
 *
 * ## 它是什么
 *
 * 一页回答「**这门语言你用到哪一步了**」：每门语言一行，给出掌握度三态、
 * 已点亮 / 总知识点数、当前站。
 *
 * ## ⚠️ 掌握度口径只留一处
 *
 * 语言掌握度 = 该门全部知识点三态的**最高档**（`languageMastery`，shared）——
 * 文案取自 `MASTERY_STATE_LABELS`、语气取自 `MASTERY_STATE_TONE`，本文件不另写。
 * ⚠️ 这套推断**只认得出「用过」** ⇒ 界面上不出现「你已掌握」（§3.3 / DL-05）。
 *
 * ## ⚠️ 不指定项目 = 全库汇总
 *
 * 与「开发能力」页的项目筛选不同，本站位图是**本机汇总视图**（§2.2 的
 * 「掌握度永远是某个项目的行为证据」在这里的落法：不选项目 ⇒ 跨项目取最高档，
 * 与 `readStates` 同一条纪律）。
 */
const LANG_NAMES: Record<LangCode, string> = { python: 'Python', go: 'Go' }

export function StationMap() {
  const views: Record<LangCode, ReturnType<typeof useLangRoadmap>> = {
    python: useLangRoadmap('python'),
    go: useLangRoadmap('go'),
  }
  const failed = LANG_CODES.find((c) => views[c].isError)

  return (
    <Card
      title="语言站位图"
      icon={<Icon name="compass" size={15} className="text-ink-faint" />}
      headRight={<span className="text-[11.5px] text-ink-faint">全库汇总 · 跨项目取最高档</span>}
      foot={
        <span className="text-[11.5px] text-ink-muted">
          掌握度三态口径：本项目未涉及（中性）· 本项目用到过（强调）· 掌握（松绿）——
          这套推断只认得出「用过」，不给「学完」的结论。
        </span>
      }
    >
      {failed !== undefined ? (
        <EmptyState
          hint={`路线读不出来——先确认本机库已播种 M9 知识点。（${LANG_NAMES[failed]}）`}
          action={
            <button
              type="button"
              className="rounded-sm border border-line-strong bg-panel px-2 py-1 text-xs text-ink"
              onClick={() => void views[failed].refetch()}
            >
              <Icon name="refresh" size={12} />
              重试
            </button>
          }
        />
      ) : (
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11.5px] text-ink-faint">
              <th className="py-1.5 pr-3 font-medium">语言</th>
              <th className="py-1.5 pr-3 font-medium">掌握度</th>
              <th className="py-1.5 pr-3 text-right font-medium">已点亮</th>
              <th className="py-1.5 pr-3 text-right font-medium">知识点</th>
              <th className="py-1.5 text-right font-medium">当前站</th>
            </tr>
          </thead>
          <tbody>
            {LANG_CODES.map((code) => {
              const v = views[code].data
              if (v === undefined) {
                return (
                  <tr key={code} className="border-b border-line-hair last:border-b-0">
                    <td className="py-2 pr-3 text-ink">{LANG_NAMES[code]}</td>
                    <td colSpan={4} className="py-2 text-[12.5px] text-ink-faint">
                      读取中…
                    </td>
                  </tr>
                )
              }
              const topics = v.stations.flatMap((s) => s.topics)
              const m = languageMastery(topics)
              return (
                <tr key={code} className="border-b border-line-hair last:border-b-0">
                  <td className="py-2 pr-3 text-ink">{LANG_NAMES[code]}</td>
                  <td className="py-2 pr-3">
                    <MasteryChip state={m.state} />
                  </td>
                  <td className="num py-2 pr-3 text-right text-[12.5px] text-ink-muted">
                    {String(m.lit)}
                  </td>
                  <td className="num py-2 pr-3 text-right text-[12.5px] text-ink-muted">
                    {String(m.total)}
                  </td>
                  <td className="num py-2 text-right text-[12.5px] text-ink-muted">
                    第 {String(v.current_stage)} 站
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Card>
  )
}
