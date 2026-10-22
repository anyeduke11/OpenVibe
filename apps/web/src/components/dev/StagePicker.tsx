import { PROFILE_LABELS, type LangProfile } from '@openvibe/shared'
import { Icon } from '../ui/icons'
import { chipTone, noteCls, noteTitleCls } from '../ui/styles'
import type { EffectiveProfileOut } from '../../hooks/useLangRoadmap'

/**
 * `apps/web/src/components/dev/StagePicker.tsx` —— **当前阶段 ＋ 阶段推荐档**
 * （`m9-dev-language-roadmap.md` §3.21 · dev-plan §6.16）
 *
 * ## 它是什么
 *
 * §3.21 的正题：「模式在源文档里是有权威答案的，取决于用户处在成长路线的哪一阶段。
 * ⇒ **自选不该被删，而该降级为覆盖手段**：默认推荐值来自阶段，用户可改。」
 *
 * ⇒ 这一件把三件事摆到界面上：
 *   ① **选阶段**（用户处在哪一阶段）—— 落 `app_meta`，不进 `lang_*`；
 *   ② **看推荐**（这一阶段的推荐档是什么）—— 由 `recommendedProfileForStage` 现算；
 *   ③ **一键改用**（把推荐档写成自己的选择）—— 这是**另一次显式的模式选择**。
 *
 * ## ⚠️ 选阶段**不会**悄悄改掉用户已选的模式
 *
 * §3.21 原文是「用户可改」⇒ **用户自选优先**。
 * ⇒ 改了阶段之后，若用户已经自选过，生效模式**仍然是用户那一档** ⇒
 *   界面必须把这件事说出来（「你自选的是 X，与推荐不同」），否则用户会以为改了阶段就生效了。
 *
 * ## ⚠️ 「改用推荐档」是**一次新的模式选择**，不是「阶段自动生效」
 *
 * ⇒ 它走的是模式选择的写入（`POST /api/lang/modes/choice`），
 *   而**不是**改阶段 ⇒ 改完之后「来源」从「阶段推荐」变成「用户自选」，
 *   语义上是用户在表态，不是系统在替他决定。
 */
const L = {
  title: '当前阶段',
  hint: '阶段给出这一阶段的推荐档；你自己选过的档位优先，随时可以改。',
  noStage: '还没进阶段',
  recommendChip: (n: number, label: string): string => `阶段 ${String(n)} 推荐：${label}`,
  noStageHint: '还没进阶段 —— 选一个阶段，这里会给出这一阶段的推荐档。',
  noTrackHint: '这一阶段没有可推荐的主线轨道。',
  /** 当前生效模式的来源说明 */
  fromStage: (label: string): string => `当前生效：${label}（来自阶段推荐）`,
  fromUser: (label: string): string => `当前生效：${label}（你自己选的）`,
  unset: '当前生效：还没定档位。',
  overridden: (label: string): string => `你自选的是「${label}」，与这一阶段的推荐不同 —— 推荐不会自动改掉你的选择。`,
  sameAsRecommend: '当前用的就是这一阶段的推荐档。',
  useRecommended: '改用推荐档',
  recommendNoteTitle: '这一阶段的推荐口径',
} as const

export interface StagePickerProps {
  /** 当前阶段（`null` = 还没进阶段） */
  stageChoice: number | null
  /** 服务端算好的生效模式与推荐（**界面不自己算**） */
  effective: EffectiveProfileOut
  /**
   * 可选的阶段（来自 `lang_stage_tracks` 的实际值）。
   *
   * ⚠️ **带阶段名**（`stage_name` 逐字）—— 单选标签用**阶段名**而不是「阶段 N」：
   *   「阶段 N」这个说法在同一个面板里**已经有一处**（每个阶段的小标题）⇒
   *   两处都写「阶段 0」会让读屏与测试都得靠上下文分辨 ⇒ 用阶段名才区分得开。
   */
  stages: readonly { id: number; name: string }[]
  /** 选阶段 */
  onPickStage: (stage: number | null) => void
  /** 一键改用推荐档 */
  onUseRecommended: (profile: LangProfile) => void
  /** 写入进行中（禁掉交互） */
  pending?: boolean
}

export function StagePicker(props: StagePickerProps) {
  const { stageChoice, effective, stages, onPickStage, onUseRecommended, pending = false } = props
  const rec = effective.recommendation
  const currentLabel = effective.profile === null ? null : PROFILE_LABELS[effective.profile]

  return (
    <section aria-label={L.title} className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-ink-muted">{L.title}</h3>
      <p className="text-[11.5px] text-ink-faint">{L.hint}</p>

      <div role="radiogroup" aria-label={L.title} className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-[13.5px] text-ink-body">
          <input
            type="radio"
            name="m9-lang-stage"
            checked={stageChoice === null}
            disabled={pending}
            onChange={() => {
              onPickStage(null)
            }}
          />
          {L.noStage}
        </label>
        {stages.map((s) => (
          <label key={s.id} className="flex items-center gap-1.5 text-[13.5px] text-ink-body">
            <input
              type="radio"
              name="m9-lang-stage"
              checked={stageChoice === s.id}
              disabled={pending}
              onChange={() => {
                onPickStage(s.id)
              }}
            />
            {s.name}
          </label>
        ))}
      </div>

      {rec === null ? (
        <p className="text-[13.5px] text-ink-muted">
          {stageChoice === null ? L.noStageHint : L.noTrackHint}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <span className={chipTone('accent')}>
            <Icon name="sparkle" size={12} />
            {L.recommendChip(rec.stage_id, PROFILE_LABELS[rec.profile])}
          </span>

          {rec.note !== null && (
            <div className={noteCls('warn')}>
              <strong className={noteTitleCls}>{L.recommendNoteTitle}</strong>
              {rec.note}
            </div>
          )}

          {effective.source === 'unset' ? (
            <p className="text-[13.5px] text-ink-muted">{L.unset}</p>
          ) : effective.source === 'stage' ? (
            <p className="text-[13.5px] text-ink-muted">
              {currentLabel === null ? L.unset : L.fromStage(currentLabel)}
            </p>
          ) : effective.differs_from_recommendation ? (
            <div className={noteCls('info')}>
              <strong className={noteTitleCls}>你覆盖了阶段推荐</strong>
              {currentLabel === null ? L.unset : L.overridden(currentLabel)}
              <div className="mt-1.5">
                <button
                  type="button"
                  className="text-[12.5px] text-ink underline decoration-line-strong underline-offset-2"
                  disabled={pending}
                  onClick={() => {
                    onUseRecommended(rec.profile)
                  }}
                >
                  {L.useRecommended}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13.5px] text-ink-muted">
              {currentLabel === null ? L.unset : L.fromUser(currentLabel)}
              {' · '}
              {L.sameAsRecommend}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
