import { describe, expect, it } from 'vitest'
import { resolveStyleId, themeStyleToCSS, type ThemePreset } from './index'

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
