import type { GlobalSettings } from '../../../../../../shared/global-settings-types'
import { SearchableSetting } from '../../section-layout/SearchableSetting'
import { SettingsSwitchRow } from '../../form-controls/SettingsFormControls'
import { useTranslate } from '../../../../i18n/use-translate'

export function BrowserDevServerAutoOpenSetting({
  settings,
  updateSettings
}: {
  settings: Pick<GlobalSettings, 'openDevServersInBrowser'>
  updateSettings: (updates: Partial<GlobalSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const title = t('settings.browser.devServerAutoOpen.title', 'Open dev servers automatically')
  const description = t(
    'settings.browser.devServerAutoOpen.description',
    'When a terminal in the active workspace starts a server, open it in a browser tab.'
  )
  const enabled = settings.openDevServersInBrowser !== false

  return (
    <SearchableSetting
      title={title}
      description={description}
      keywords={['dev server', 'localhost', 'port', 'preview', 'auto open']}
    >
      <SettingsSwitchRow
        label={title}
        description={description}
        checked={enabled}
        onChange={() => updateSettings({ openDevServersInBrowser: !enabled })}
      />
    </SearchableSetting>
  )
}
