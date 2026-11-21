import { useSettings, useOnboardingToggle } from '../hooks/useSettings'
import {
  AiSection,
  AppearanceSection,
  CliSection,
  OmSection,
  PathsSection,
  ReadabilitySection,
  TelemetrySection,
} from '../components/settings/SettingsSections'
import { LocalLedgerSection } from '../components/settings/LocalLedgerSection'
import { AgentSettingsSection } from '../components/settings/AgentSettingsSection'
import { ContextGovernanceSection } from '../components/settings/ContextGovernanceSection'
import { SourceConsentSection } from '../components/settings/SourceConsentSection'
import { SourceShareSection } from '../components/settings/SourceShareSection'
import { InterpretProviderSection } from '../components/settings/InterpretProviderSection'
import { LangModeSection } from '../components/settings/LangModeSection'
import { SkillScanPathsSection } from '../components/settings/SkillScanPathsSection'
import { sys } from '../i18n/lane-system'
import { btnGhost, skelCls } from '../components/ui/styles'
import { PageHead, ProBlock } from '../components/ui/layout'
import { Icon } from '../components/ui/icons'

/**
 * 设置（`/settings`）：外观 / 匿名遥测 / 本机自证层台账 / 数据与路径 / CLI 命令参考 /
 * 第 7 区可读性量具。分节顺序按「外观 → 隐私 → 本机事实 → 参考资料」，
 * 与 DESIGN.md 的操作面密度一致：能一屏看清的就不翻页。
 */
export function SettingsPage() {
  const settings = useSettings()
  const wizard = useOnboardingToggle()

  return (
    <div className="flex flex-col gap-4 px-6 py-6 max-md:px-4">
      <PageHead
        title={sys.settings.title}
        hint={sys.settings.subtitle}
        actions={
          <button
            type="button"
            className={btnGhost}
            disabled={wizard.isPending}
            onClick={() => void wizard.mutate(false)}
          >
            <Icon name="flow" size={14} />
            {sys.settings.action.showWizard}
          </button>
        }
      />

      <div className="grid max-w-[1120px] gap-4 lg:grid-cols-2">
        {settings.data === undefined ? (
          // 骨架态：整页还在取 settings，四张卡先占位，避免「空设置页」看起来像没有设置
          <div className="contents" aria-busy>
            {[0, 1].map((i) => (
              <div key={i} className={`${skelCls} h-[180px] rounded-md`} />
            ))}
          </div>
        ) : (
          <>
            <AppearanceSection />
            <TelemetrySection />
            {/* 真·本机台账显式落在遥测节**正下方**（lg 两栏时同一列相邻，r1c2 → r2c2）：
                FR-5.1「两节同屏并列」是 D29 否证触发器的判定物——2026-11-21 屏摄实测发现
                纯 JSX 顺序（遥测第 2 项、台账第 3 项）在行优先填充下会错成斜对角
                （遥测 r1c2 / 台账 r2c1），并列形态不成立，故用网格定位钉死。 */}
            <div className="lg:col-start-2 lg:row-start-2">
              <LocalLedgerSection />
            </div>
            {/* OM（输出侧度量）与台账同排异列：数据同源（本机台账 + injections），同区呈现；
                显式定位同时填掉 col-start-2 造成的稀疏空洞（r2c1）。 */}
            <div className="lg:col-start-1 lg:row-start-2">
              <OmSection />
            </div>
            {/* AI 与出网（M10/D）：总闸/采纳率/同意——同为「本机状态归口」区 */}
            <AiSection />
          </>
        )}
      </div>

      <div className="flex max-w-[1120px] flex-col gap-4">
        {settings.data === undefined ? (
          <div className={`${skelCls} h-[220px] rounded-md`} aria-busy />
        ) : (
          <PathsSection settings={settings.data} />
        )}
        {/* Skill 扫描路径（2026-10-30：改成可配置清单，覆盖国内主流 agent） */}
        <SkillScanPathsSection />
        <CliSection />
        {/* 第 7 区（可读性与设计系统）的**同级**新一区，不并入其中（m8-agent-panel.md FR-5.5.1） */}
        <AgentSettingsSection />
        {/* M9 P1e：学习模式（§3.19 第 1 条的另一半 —— **可重选**，否则「答错」不可挽回） */}
        <LangModeSection />
        {/* M9 P4.5：源码授权记忆（DL-21 的清除入口在这里） */}
        <SourceConsentSection />
        {/* M9 增强 1：源码出网记录（**只读**；与记忆区相邻但语义不同 —— 记忆管「下次」，这里记「已发生」） */}
        <SourceShareSection />
        {/* M9（owner 2026-10-22 裁决一）：AI 解读 provider 的**手动调控**入口 */}
        <InterpretProviderSection />
        <ReadabilitySection />
        {/* 上下文治理（只读）：最近一次 context:check 的落盘结论 ＋ 棘轮上界 */}
        <ContextGovernanceSection />

        {/* 专家视图块（原型「渐进披露红线 4」）：客户端本地状态的键位清单。
            普通用户不需要它；排查「我的偏好没记住」时它是第一手线索。 */}
        <ProBlock>
          <section className="rounded-md border border-line bg-panel px-3.5 py-3 shadow-1">
            <h2 className="text-sm font-semibold text-ink">客户端本地状态键位</h2>
            <p className="mt-1 text-[13px] text-ink-muted">
              以下键存在浏览器 localStorage，**不进服务端**、不出网。删掉即回到默认。
            </p>
            <ul className="mono mt-2 flex flex-col gap-1 text-[12px] text-ink-body">
              <li>openvibe.theme —— 亮暗主题（paper / dark）</li>
              <li>openvibe:expert —— 专家视图（1 / 0）</li>
              <li>openvibe.growth.v1 —— 成长页阶段向量与越级选择</li>
              <li>terms.roadmap.order.v1 —— 术语站位图的自定义顺序</li>
            </ul>
          </section>
        </ProBlock>
      </div>
    </div>
  )
}
