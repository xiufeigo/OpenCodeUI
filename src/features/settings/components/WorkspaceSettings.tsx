import { useTranslation } from 'react-i18next'
import { useTheme } from '../../../hooks'
import { useInputCapabilities } from '../../../hooks/useInputCapabilities'
import { layoutStore, useLayoutStore } from '../../../store'
import { TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN } from '../../../store/themeStore'
import { Toggle, SegmentedControl, SettingRow, SettingField, SettingsSection, RangeSlider, settingsFieldClass } from './SettingsUI'

/** 常见等宽字体（按名字填，系统没装就自动回落） */
const TERMINAL_FONT_PRESETS = [
  'JetBrains Mono',
  'Fira Code',
  'Cascadia Code',
  'Consolas',
  'Menlo',
  'SF Mono',
  'DejaVu Sans Mono',
  'Noto Sans Mono',
  'Sarasa Mono SC',
  'Courier New',
]

export function WorkspaceSettings() {
  const { t } = useTranslation(['settings'])
  const { preferTouchUi } = useInputCapabilities()
  const {
    isWideMode,
    toggleWideMode,
    diffStyle,
    setDiffStyle,
    codeWordWrap,
    setCodeWordWrap,
    manualTerminalTitles,
    setManualTerminalTitles,
    terminalFontSize,
    setTerminalFontSize,
    terminalFontFamily,
    setTerminalFontFamily,
  } = useTheme()
  const {
    sidebarFolderRecents,
    sidebarFolderRecentsShowDiff,
    sidebarShowChildSessions,
    terminalCopyOnSelect,
    terminalRightClickPaste,
    wakeLock,
  } = useLayoutStore()

  const toggleManualTerminalTitles = () => {
    const next = !manualTerminalTitles
    setManualTerminalTitles(next)
    layoutStore.syncTerminalTitleMode(next)
  }

  return (
    <div>
      <SettingsSection title={t('workspace.layout')} description={t('workspace.layoutDesc')}>
        <SettingRow label={t('appearance.wideMode')} description={t('appearance.wideModeDesc')} onClick={toggleWideMode}>
          <Toggle enabled={isWideMode} onChange={toggleWideMode} />
        </SettingRow>

        <SettingRow
          label={t('appearance.wakeLock')}
          description={t('appearance.wakeLockDesc')}
          onClick={() => layoutStore.setWakeLock(!wakeLock)}
        >
          <Toggle enabled={wakeLock} onChange={() => layoutStore.setWakeLock(!wakeLock)} />
        </SettingRow>

        <SettingRow
          label={t('appearance.codeWordWrap')}
          description={t('appearance.codeWordWrapDesc')}
          onClick={() => setCodeWordWrap(!codeWordWrap)}
        >
          <Toggle enabled={codeWordWrap} onChange={() => setCodeWordWrap(!codeWordWrap)} />
        </SettingRow>

        <SettingRow
          label={t('workspace.manualTerminalTitles')}
          description={t('workspace.manualTerminalTitlesDesc')}
          onClick={toggleManualTerminalTitles}
        >
          <Toggle enabled={manualTerminalTitles} onChange={toggleManualTerminalTitles} />
        </SettingRow>

        <SettingField label={t('appearance.diffStyle')} description={t('appearance.diffStyleDesc')}>
          <div className="w-full max-w-[300px]">
            <SegmentedControl
              value={diffStyle}
              options={[
                { value: 'markers', label: t('appearance.diffStyleMarkers') },
                { value: 'changeBars', label: t('appearance.diffStyleChangeBars') },
              ]}
              onChange={v => setDiffStyle(v as 'markers' | 'changeBars')}
            />
          </div>
        </SettingField>
      </SettingsSection>

      <SettingsSection title={t('workspace.terminal')} description={t('workspace.terminalDesc')}>
        <SettingRow
          label={t('workspace.terminalCopyOnSelect')}
          description={t('workspace.terminalCopyOnSelectDesc')}
          onClick={() => layoutStore.setTerminalCopyOnSelect(!terminalCopyOnSelect)}
        >
          <Toggle
            enabled={terminalCopyOnSelect}
            onChange={() => layoutStore.setTerminalCopyOnSelect(!terminalCopyOnSelect)}
          />
        </SettingRow>

        <SettingRow
          label={t('workspace.terminalRightClickPaste')}
          description={t('workspace.terminalRightClickPasteDesc')}
          onClick={() => layoutStore.setTerminalRightClickPaste(!terminalRightClickPaste)}
        >
          <Toggle
            enabled={terminalRightClickPaste}
            onChange={() => layoutStore.setTerminalRightClickPaste(!terminalRightClickPaste)}
          />
        </SettingRow>

        <SettingField label={t('workspace.terminalFontSize')} description={t('workspace.terminalFontSizeDesc')}>
          <div className="w-full max-w-[320px]">
            <RangeSlider
              min={TERMINAL_FONT_SIZE_MIN}
              max={TERMINAL_FONT_SIZE_MAX}
              value={terminalFontSize}
              onChange={setTerminalFontSize}
              minLabel="A"
              maxLabel="A"
              formatValue={v => `${v}px`}
            />
            {preferTouchUi && (
              <p className="mt-1.5 text-[length:var(--fs-xs)] text-text-400">{t('workspace.terminalFontSizeTouchHint')}</p>
            )}
          </div>
        </SettingField>

        <SettingField label={t('workspace.terminalFontFamily')} description={t('workspace.terminalFontFamilyDesc')}>
          <div className="w-full max-w-[320px]">
            <input
              type="text"
              value={terminalFontFamily}
              onChange={e => setTerminalFontFamily(e.target.value)}
              placeholder={t('workspace.terminalFontFamilyPlaceholder')}
              aria-label={t('workspace.terminalFontFamily')}
              list="terminal-font-families"
              spellCheck={false}
              className={`${settingsFieldClass} font-mono`}
            />
            <datalist id="terminal-font-families">
              {TERMINAL_FONT_PRESETS.map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            {terminalFontFamily && (
              <button
                type="button"
                onClick={() => setTerminalFontFamily('')}
                className="mt-1.5 text-[length:var(--fs-xs)] text-text-400 hover:text-text-100 transition-colors"
              >
                {t('workspace.terminalFontFamilyReset')}
              </button>
            )}
          </div>
        </SettingField>
      </SettingsSection>

      <SettingsSection title={t('workspace.sidebar')} description={t('workspace.sidebarDesc')}>
        <SettingRow
          label={t('appearance.folderStyleRecents')}
          description={t('appearance.folderStyleRecentsDesc')}
          onClick={() => layoutStore.setSidebarFolderRecents(!sidebarFolderRecents)}
        >
          <Toggle
            enabled={sidebarFolderRecents}
            onChange={() => layoutStore.setSidebarFolderRecents(!sidebarFolderRecents)}
          />
        </SettingRow>

        <SettingRow
          label={t('appearance.folderStyleRecentsShowDiff')}
          description={t('appearance.folderStyleRecentsShowDiffDesc')}
          onClick={() => layoutStore.setSidebarFolderRecentsShowDiff(!sidebarFolderRecentsShowDiff)}
        >
          <Toggle
            enabled={sidebarFolderRecentsShowDiff}
            onChange={() => layoutStore.setSidebarFolderRecentsShowDiff(!sidebarFolderRecentsShowDiff)}
          />
        </SettingRow>

        <SettingRow
          label={t('appearance.showChildSessions')}
          description={t('appearance.showChildSessionsDesc')}
          onClick={() => layoutStore.setSidebarShowChildSessions(!sidebarShowChildSessions)}
        >
          <Toggle
            enabled={sidebarShowChildSessions}
            onChange={() => layoutStore.setSidebarShowChildSessions(!sidebarShowChildSessions)}
          />
        </SettingRow>
      </SettingsSection>
    </div>
  )
}
