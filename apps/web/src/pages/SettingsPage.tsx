import { useSettings } from '../hooks/useSettings'
import {
  BackupSection,
  PackSection,
  SeedSection,
  ServiceSection,
  TelemetrySection,
  WizardSection,
} from '../components/settings/SettingsSections'
import { zh } from '../i18n/zh'

/** /settings（design §10）：服务信息 / 种子与预置包 / 匿名统计 / 向导重置 / 备份说明 */
export function SettingsPage() {
  const settings = useSettings()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3">
        <h1 className="text-base font-semibold">{zh.settings.title}</h1>
      </header>
      <div className="flex-1 overflow-auto px-5 py-4">
        <div className="grid max-w-3xl gap-4">
          <ServiceSection settings={settings.data} />
          <SeedSection settings={settings.data} />
          <PackSection />
          <TelemetrySection />
          <WizardSection settings={settings.data} />
          <BackupSection />
        </div>
      </div>
    </div>
  )
}
