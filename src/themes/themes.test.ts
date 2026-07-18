import { describe, expect, it } from 'vitest'
import {
  builtinStyleThemes,
  builtinThemes,
  getStylePreset,
  resolveStyleId,
  themeStyleToCSS,
  type ThemeColors,
  type ThemePreset,
} from './index'

describe('themeStyleToCSS', () => {
  it('returns empty string for undefined or empty style', () => {
    expect(themeStyleToCSS(undefined)).toBe('')
    expect(themeStyleToCSS({})).toBe('')
  })

  it('serializes radius, shadows, fonts and motion into a :root:root block', () => {
    const css = themeStyleToCSS({
      radius: { md: '12px', '2xl': '28px' },
      shadows: { sm: '0 1px 2px rgb(0 0 0 / 0.1)' },
      fonts: { uiSans: 'Roboto, sans-serif', mono: 'JetBrains Mono, monospace' },
      motion: { durationFast: '100ms', durationBase: '200ms', ease: 'cubic-bezier(0.2, 0, 0, 1)' },
    })
    expect(css).toBe(
      ':root:root {\n' +
        '  --radius-md: 12px;\n' +
        '  --radius-2xl: 28px;\n' +
        '  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.1);\n' +
        '  --font-ui-sans: Roboto, sans-serif;\n' +
        '  --font-mono: JetBrains Mono, monospace;\n' +
        '  --motion-duration-fast: 100ms;\n' +
        '  --motion-duration-base: 200ms;\n' +
        '  --motion-ease: cubic-bezier(0.2, 0, 0, 1);\n' +
        '}',
    )
  })

  it('appends raw css after the variable block', () => {
    const css = themeStyleToCSS({ radius: { md: '12px' }, css: 'body { color: red; }' })
    expect(css).toBe(':root:root {\n  --radius-md: 12px;\n}\n\nbody { color: red; }')
  })

  it('returns only raw css when no variables are defined', () => {
    expect(themeStyleToCSS({ css: 'body { color: red; }' })).toBe('body { color: red; }')
  })
})

describe('resolveStyleId', () => {
  const presetWithDefault = { defaultStyleId: 'material' } as ThemePreset
  const presetWithoutDefault = {} as ThemePreset

  it('none always disables the style', () => {
    expect(resolveStyleId('none', presetWithDefault)).toBeUndefined()
  })

  it('auto follows the preset defaultStyleId', () => {
    expect(resolveStyleId('auto', presetWithDefault)).toBe('material')
    expect(resolveStyleId('auto', presetWithoutDefault)).toBeUndefined()
  })

  it('explicit style wins over the preset default', () => {
    expect(resolveStyleId('retro-terminal', presetWithDefault)).toBe('retro-terminal')
  })
})

const HSL_TOKEN = /^\d{1,3} \d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/

function expectHslTokens(colors: ThemeColors) {
  const groups = [colors.background, colors.text, colors.accent, colors.semantic, colors.border]
  for (const group of groups) {
    for (const value of Object.values(group)) {
      expect(value).toMatch(HSL_TOKEN)
    }
  }
  if (colors.special) {
    for (const value of Object.values(colors.special)) {
      if (value) expect(value).toMatch(HSL_TOKEN)
    }
  }
}

describe('builtin theme presets', () => {
  it('every preset has complete light and dark palettes with valid HSL tokens', () => {
    expect(builtinThemes.length).toBeGreaterThan(0)
    for (const preset of builtinThemes) {
      expectHslTokens(preset.light)
      expectHslTokens(preset.dark)
    }
  })

  it('defaultStyleId references a registered style', () => {
    for (const preset of builtinThemes) {
      if (preset.defaultStyleId) {
        expect(getStylePreset(preset.defaultStyleId)).toBeDefined()
      }
    }
  })
})

describe('builtin style presets', () => {
  it('has unique ids and non-empty style payloads', () => {
    const ids = builtinStyleThemes.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of builtinStyleThemes) {
      expect(s.name).toBeTruthy()
      expect(Object.keys(s.style).length).toBeGreaterThan(0)
    }
  })
})

describe('liquid glass style specificity', () => {
  it('glass rules use :root:root prefix so they are not masked by the data-glass toggle', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    // 与 index.css 中 :root[data-glass] .glass 同特异性，且注入顺序靠后而胜出
    expect(css).toContain(':root:root .glass')
    expect(css).toContain(':root:root .glass-alt')
    // 不允许出现无前缀的裸 glass 选择器（会被 :root[data-glass] 规则遮盖）
    const bareSelector = /(^|\n)\s*\.glass(-alt)?\s*\{/
    expect(bareSelector.test(css)).toBe(false)
  })
})

describe('style effects flags', () => {
  it('effects is a string array when present', () => {
    for (const s of builtinStyleThemes) {
      if (s.style.effects) {
        expect(Array.isArray(s.style.effects)).toBe(true)
        for (const e of s.style.effects) expect(typeof e).toBe('string')
      }
    }
  })
})

describe('liquid glass floating layout css', () => {
  it('reuses the default eucalyptus palette verbatim', () => {
    const lgTheme = builtinThemes.find(t => t.id === 'liquid-glass')
    const eucalyptus = builtinThemes.find(t => t.id === 'eucalyptus')
    expect(lgTheme?.light).toEqual(eucalyptus?.light)
    expect(lgTheme?.dark).toEqual(eucalyptus?.dark)
  })

  it('declares a single rounded chat window, flush frosted chrome and no shadows', () => {
    const lgStyle = builtinStyleThemes.find(s => s.id === 'liquid-glass')
    const css = lgStyle?.style.css ?? ''
    expect(css).not.toContain('radial-gradient')
    // 阴影令牌全部置空
    for (const value of Object.values(lgStyle?.style.shadows ?? {})) {
      expect(value).toBe('none')
    }
    // 主 agent 窗口：唯一圆角卡片，透明容器无投影
    expect(css).toContain("[data-lq-surface='chat']")
    expect(css).toContain('background-color: transparent')
    expect(css).toContain('box-shadow: none')
    // 聊天正文与顶栏均为白底
    expect(css).toContain('data-lq-chatbody')
    expect(css).toContain('background-color: hsl(var(--bg-000));')
    expect(css).toMatch(/\[data-lq-header\] \{\s+background-color: hsl\(var\(--bg-000\)\);/)
    // 整体磨砂层：body::before 纯蒙版，壁纸预模糊（无运行时滤镜，防文字发虚）
    expect(css).toMatch(/body::before \{[^}]*hsl\(var\(--bg-100\) \/ 0\.65\)/)
    expect(css).not.toMatch(/body::before \{[^}]*backdrop-filter/)
    // 侧栏/右栏/底栏：透明叠加磨砂层（无圆角）；面板头部透明
    expect(css).toContain('border-radius: 0')
    expect(css).toContain('[data-lq-panelhead]')
    // 左右侧栏分割线：默认隐藏，hover 显现
    expect(css).toContain('border-color: transparent')
    expect(css).toContain("[data-lq-surface='sidebar']:hover")
    // 整体背景：Windows 11 壁纸（亮/暗两张）
    expect(css).toContain('codex-wallpaper-light')
    expect(css).toContain('codex-wallpaper-dark')
    // 主窗口顶部为安卓平板状态栏让位（--app-safe-top 桌面端为 0）
    expect(css).toContain('padding-top: calc(10px + var(--app-safe-top, 0px));')
    // 白底磨砂浮层
    expect(css).toContain('hsl(var(--bg-000) / 0.8)')
    // 深色发丝边分层（含跟随系统的深色模式）
    expect(css).toContain("data-mode='dark'")
    expect(css).toContain('prefers-color-scheme: dark')
    expect(css).toContain(':not([data-mode])')
  })

  it('uses Codex as display name and declares no refraction effect', () => {
    const lgTheme = builtinThemes.find(t => t.id === 'liquid-glass')
    const lgStyle = builtinStyleThemes.find(s => s.id === 'liquid-glass')
    expect(lgTheme?.name).toBe('Codex')
    expect(lgStyle?.name).toBe('Codex')
    expect(lgStyle?.style.effects ?? []).not.toContain('liquid-refraction')
  })
})
