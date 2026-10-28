import { useSettings, useOnboardingToggle } from '../hooks/useSettings'
import {
  AiSection,
  AppearanceSection,
  CliSection,
  LedgerSection,
  OmSection,
  PathsSection,
  ReadabilitySection,
  TelemetrySection,
} from '../components/settings/SettingsSections'
import { LocalLedgerSection } from '../components/settings/LocalLedgerSection'
import { AgentSettingsSection } from '../components/settings/AgentSettingsSection'
import { SourceConsentSection } from '../components/settings/SourceConsentSection'
import { SourceShareSection } from '../components/settings/SourceShareSection'
import { InterpretProviderSection } from '../components/settings/InterpretProviderSection'
import { LangModeSection } from '../components/settings/LangModeSection'
import { sys } from '../i18n/lane-system'
import { btnGhost, proseCls, skelCls } from '../components/ui/styles'
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
      {/* view-head：h1 + 一句话说明 + 右侧主动作 */}
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <h1 className="text-[30px] font-semibold leading-[1.25] tracking-tight text-ink max-sm:text-[25px]">
            {sys.settings.title}
          </h1>
          <p className={`${proseCls} mt-1 text-[13.5px] text-ink-muted`}>{sys.settings.subtitle}</p>
        </div>
        <button
          type="button"
          className={`${btnGhost} ml-auto shrink-0`}
          disabled={wizard.isPending}
          onClick={() => void wizard.mutate(false)}
        >
          <Icon name="flow" size={14} />
          {sys.settings.action.showWizard}
        </button>
      </header>

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
            {/* 真·本机台账紧跟遥测节：两节并排正是为了让「正交的两层」看得见 */}
            <LocalLedgerSection />
            {/* OM（输出侧度量）紧跟台账节：数据同源（本机台账 + injections），同区呈现 */}
            <OmSection />
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
        <LedgerSection />
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
      </div>
    </div>
  )
}
