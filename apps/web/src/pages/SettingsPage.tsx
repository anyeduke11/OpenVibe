import { useSettings, useOnboardingToggle } from '../hooks/useSettings'
import {
  AppearanceSection,
  CliSection,
  LedgerSection,
  PathsSection,
  ReadabilitySection,
  TelemetrySection,
} from '../components/settings/SettingsSections'
import { LocalLedgerSection } from '../components/settings/LocalLedgerSection'
import { AgentSettingsSection } from '../components/settings/AgentSettingsSection'
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
          <p className={`${proseCls} mt-1 text-[13.5px] text-ink-muted`}>
            {sys.settings.subtitle}
          </p>
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
        <ReadabilitySection />
      </div>
    </div>
  )
}
