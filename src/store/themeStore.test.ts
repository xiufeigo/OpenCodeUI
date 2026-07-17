import { beforeEach, describe, expect, it } from 'vitest'
import { importThemeBackup, themeStore } from './themeStore'

const THEME_STYLE_EL_ID = 'opencode-theme-vars'

describe('themeStore interface style', () => {
  beforeEach(() => {
    localStorage.clear()
    themeStore.setPreset('eucalyptus')
    themeStore.setStyleId('auto')
  })

  it('defaults styleId to auto', () => {
    expect(themeStore.getState().styleId).toBe('auto')
  })

  it('setStyleId persists and updates state', () => {
    themeStore.setStyleId('none')
    expect(themeStore.getState().styleId).toBe('none')
    expect(localStorage.getItem('theme-style')).toBe('none')
  })

  it('setStyleId falls back to auto for unknown ids', () => {
    themeStore.setStyleId('bogus')
    expect(themeStore.getState().styleId).toBe('auto')
  })

  it('injects style variables when auto resolves a preset defaultStyleId', () => {
    themeStore.setPreset('material')
    const el = document.getElementById(THEME_STYLE_EL_ID)
    expect(el?.textContent).toContain('--radius-md: 12px;')
  })

  it('style none disables style injection', () => {
    themeStore.setPreset('material')
    themeStore.setStyleId('none')
    const el = document.getElementById(THEME_STYLE_EL_ID)
    expect(el?.textContent).not.toContain('--radius-md')
  })

  it('explicit style stacks on an unrelated palette', () => {
    themeStore.setPreset('ocean')
    themeStore.setStyleId('material')
    const el = document.getElementById(THEME_STYLE_EL_ID)
    expect(el?.textContent).toContain('--radius-md: 12px;')
  })

  it('keeps the explicit style when switching presets', () => {
    themeStore.setStyleId('material')
    themeStore.setPreset('ocean')
    const el = document.getElementById(THEME_STYLE_EL_ID)
    expect(el?.textContent).toContain('--radius-md: 12px;')
  })

  it('importThemeBackup normalizes invalid styleId to auto', () => {
    importThemeBackup({ presetId: 'claude', styleId: 'bogus' })
    expect(localStorage.getItem('theme-style')).toBe('auto')
  })

  it('importThemeBackup keeps a valid explicit styleId', () => {
    importThemeBackup({ presetId: 'claude', styleId: 'material' })
    expect(localStorage.getItem('theme-style')).toBe('material')
  })
})
