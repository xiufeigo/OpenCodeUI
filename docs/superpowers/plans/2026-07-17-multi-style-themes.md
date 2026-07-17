# 多维度完整主题系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OpenCodeUI 新增 Material Design、Liquid Glass、复古终端三套完整主题，并让「界面风格」（圆角/阴影/字体/特效）成为可与任意色板叠加的独立层。

**Architecture:** 扩展现有主题引擎：`ThemePreset`（色板）增加可选 `defaultStyleId`，新增独立的 `ThemeStylePreset` 注册表；`themeStore` 新增持久化字段 `styleId`（`auto`/`none`/风格 id），注入颜色变量的同时注入风格变量与风格 CSS；设置页新增「界面风格」选择器。设计规格见 `docs/superpowers/specs/2026-07-17-multi-style-themes-design.md`。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4（CSS-first `@theme`）+ Vitest（jsdom，globals: true）+ @fontsource/jetbrains-mono。

## Global Constraints

- 颜色格式为裸 HSL token（`'256 34% 48%'`，不带 `hsl()` 包装），与现有 7 套主题一致。
- 新主题文件（`src/themes/material.ts` 等）从 `./index` 导入类型时必须用 `import type`（类型导入在编译后擦除，避免运行时循环依赖）。
- 风格 `css` 必须基于 CSS 变量编写（`hsl(var(--bg-100) / 0.6)` 等），不得写死具体颜色，以保证与任意色板叠加。
- 主题/风格名称硬编码英文，不走 i18n；但设置项标签必须同时加入 `src/locales/en/settings.json` 和 `src/locales/zh-CN/settings.json`。
- 不修改现有 7 套色板的任何颜色值。
- 每个任务结束按步骤提交 git commit（提交信息使用 Conventional Commits 英文）。
- 测试命令：`npx vitest run <file>`；全量验证：`npm run validate`。

---

### Task 1: 主题类型与序列化/解析函数

**Files:**
- Modify: `src/themes/index.ts`（在 `ThemeColors` 接口后新增类型；文件末尾新增函数与注册表）
- Test: `src/themes/themes.test.ts`（新建）

**Interfaces:**
- Consumes: 无（纯基础层）
- Produces（后续任务依赖的确切签名）:
  - `interface ThemeStyle { radius?, shadows?, fonts?, motion?, css? }`
  - `interface ThemeStylePreset { id: string; name: string; description: string; style: ThemeStyle }`
  - `ThemePreset.defaultStyleId?: string`
  - `themeStyleToCSS(style?: ThemeStyle): string`
  - `resolveStyleId(styleId: string, preset?: ThemePreset): string | undefined`
  - `builtinStyleThemes: ThemeStylePreset[]`（本任务为空数组）
  - `getStylePreset(id: string): ThemeStylePreset | undefined`

- [ ] **Step 1: 写失败测试**

创建 `src/themes/themes.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（`themeStyleToCSS is not a function` 或导入错误）

- [ ] **Step 3: 实现类型与函数**

在 `src/themes/index.ts` 的 `ThemePreset` 接口定义（当前在 `src/themes/index.ts:74-80`）之前插入：

```ts
/**
 * 界面风格：独立于色板的形状/阴影/字体/动效/特效定义。
 * 所有字段可选；css 为风格激活期间注入的附加 CSS 原文，
 * 必须基于 CSS 变量编写以便与任意色板叠加。
 */
export interface ThemeStyle {
  /** 圆角覆盖 → --radius-* */
  radius?: Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', string>>
  /** 阴影覆盖 → --shadow-*（完整 box-shadow 声明值） */
  shadows?: Partial<Record<'sm' | 'md' | 'lg' | 'xl' | 'float', string>>
  /** 字体栈覆盖 → --font-ui-sans / --font-mono */
  fonts?: { uiSans?: string; mono?: string }
  /** 动效 → --motion-duration-fast / --motion-duration-base / --motion-ease */
  motion?: { durationFast?: string; durationBase?: string; ease?: string }
  /** 附加 CSS 原文（特效：毛玻璃规则、扫描线等） */
  css?: string
}

/** 界面风格预设：可叠加在任意色板上的风格包 */
export interface ThemeStylePreset {
  id: string
  name: string
  description: string
  style: ThemeStyle
}
```

给 `ThemePreset` 增加可选字段（改后如下）：

```ts
export interface ThemePreset {
  id: string
  name: string
  description: string
  light: ThemeColors
  dark: ThemeColors
  /** 配套界面风格 id（styleId 为 'auto' 时生效）；缺省表示无配套风格 */
  defaultStyleId?: string
}
```

在文件末尾（`themeColorsToCSSVars` 之后）追加：

```ts
// ============================================
// Interface Style Registry
// ============================================

export const builtinStyleThemes: ThemeStylePreset[] = []

export function getStylePreset(id: string): ThemeStylePreset | undefined {
  return builtinStyleThemes.find(s => s.id === id)
}

/**
 * 将 ThemeStyle 序列化为可注入的 CSS 片段。
 * 变量部分包在 :root:root 块中（与颜色变量同优先级）；
 * style.css 原文附加在块之后。无任何内容时返回空字符串。
 */
export function themeStyleToCSS(style?: ThemeStyle): string {
  if (!style) return ''
  const lines: string[] = []

  if (style.radius) {
    for (const [key, value] of Object.entries(style.radius)) {
      if (value) lines.push(`--radius-${key}: ${value};`)
    }
  }
  if (style.shadows) {
    for (const [key, value] of Object.entries(style.shadows)) {
      if (value) lines.push(`--shadow-${key}: ${value};`)
    }
  }
  if (style.fonts?.uiSans) lines.push(`--font-ui-sans: ${style.fonts.uiSans};`)
  if (style.fonts?.mono) lines.push(`--font-mono: ${style.fonts.mono};`)
  if (style.motion?.durationFast) lines.push(`--motion-duration-fast: ${style.motion.durationFast};`)
  if (style.motion?.durationBase) lines.push(`--motion-duration-base: ${style.motion.durationBase};`)
  if (style.motion?.ease) lines.push(`--motion-ease: ${style.motion.ease};`)

  const parts: string[] = []
  if (lines.length > 0) parts.push(`:root:root {\n  ${lines.join('\n  ')}\n}`)
  if (style.css?.trim()) parts.push(style.css.trim())
  return parts.join('\n\n')
}

/**
 * 解析实际生效的界面风格 id：
 * - 'none' → 不应用任何风格
 * - 'auto' → 跟随色板预设的 defaultStyleId
 * - 其余   → 显式选择，优先于色板配套（切换色板后保持）
 */
export function resolveStyleId(styleId: string, preset?: ThemePreset): string | undefined {
  if (styleId === 'none') return undefined
  if (styleId === 'auto') return preset?.defaultStyleId
  return styleId
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: PASS（7 个用例全过）

- [ ] **Step 5: Commit**

```bash
git add src/themes/index.ts src/themes/themes.test.ts
git commit -m "feat(themes): add style preset types and serialization helpers"
```

---

### Task 2: Material Design 主题（色板 + 风格）与注册表校验

**Files:**
- Create: `src/themes/material.ts`
- Modify: `src/themes/index.ts`（注册 materialTheme / materialStyle）
- Test: `src/themes/themes.test.ts`（追加注册表校验）

**Interfaces:**
- Consumes: Task 1 的 `ThemeColors` / `ThemePreset` / `ThemeStylePreset` / `builtinStyleThemes`
- Produces:
  - `materialTheme: ThemePreset`（id `'material'`，`defaultStyleId: 'material'`）
  - `materialStyle: ThemeStylePreset`（id `'material'`）

- [ ] **Step 1: 追加失败测试**

把 `src/themes/themes.test.ts` 的导入行改为：

```ts
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
```

在文件末尾追加：

```ts
const HSL_TOKEN = /^\d{1,3} \d{1,3}% \d{1,3}%$/

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（`materialTheme` 尚未注册时，`defaultStyleId references a registered style` 之前的用例全过，但本步骤先创建主题文件再验证；若先跑测试，`resolveStyleId` 等既有用例仍通过，新注册表用例中 `defaultStyleId` 校验在 material 注册前不会失败——因此直接进入 Step 3 创建文件，再运行全量）

注：此任务的「失败」体现在 Step 3 完成前 `src/themes/material.ts` 不存在、注册表为空。先写实现再验证是此任务的合理顺序（测试守护的是注册后的不变量）。

- [ ] **Step 3: 创建 Material 主题并注册**

创建 `src/themes/material.ts`（颜色已由 hex 精确转换为 HSL token）：

```ts
/**
 * Material 主题 — Material Design 3
 *
 * 色板：M3 基线紫 + tonal surface 体系（light/dark 两套）
 * 风格：M3 shape scale 圆角、带品牌色的 elevation 阴影、emphasized 缓动
 */
import type { ThemeColors, ThemePreset, ThemeStylePreset } from './index'

const materialLight: ThemeColors = {
  background: {
    bg000: '315 100% 99%',
    bg100: '278 44% 96%',
    bg200: '276 38% 95%',
    bg300: '276 25% 92%',
    bg400: '280 17% 90%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '264 8% 12%',
    text200: '264 7% 29%',
    text300: '268 6% 43%',
    text400: '264 5% 58%',
    text500: '267 7% 68%',
    text600: '270 11% 79%',
  },
  accent: {
    brand: '256 34% 48%',
    main000: '258 40% 40%',
    main100: '256 34% 48%',
    main200: '257 40% 57%',
    secondary100: '259 11% 40%',
  },
  semantic: {
    success100: '123 46% 34%',
    success200: '124 55% 24%',
    successBg: '125 32% 93%',
    warning100: '36 100% 35%',
    warning200: '36 100% 28%',
    warningBg: '35 79% 92%',
    danger000: '0 75% 42%',
    danger100: '4 71% 50%',
    danger200: '5 72% 63%',
    dangerBg: '5 79% 95%',
    danger900: '4 71% 92%',
    info100: '217 90% 43%',
    info200: '217 67% 54%',
    infoBg: '218 92% 95%',
  },
  border: {
    border100: '262 14% 89%',
    border200: '262 14% 84%',
    border300: '265 10% 77%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

const materialDark: ThemeColors = {
  background: {
    bg000: '260 14% 8%',
    bg100: '264 8% 12%',
    bg200: '257 10% 14%',
    bg300: '257 8% 17%',
    bg400: '257 6% 22%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '280 17% 90%',
    text200: '270 11% 79%',
    text300: '268 10% 66%',
    text400: '262 7% 55%',
    text500: '268 6% 43%',
    text600: '268 7% 34%',
  },
  accent: {
    brand: '258 100% 87%',
    main000: '258 81% 79%',
    main100: '258 100% 87%',
    main200: '258 100% 92%',
    secondary100: '263 27% 81%',
  },
  semantic: {
    success100: '131 40% 58%',
    success200: '134 46% 70%',
    successBg: '135 41% 13%',
    warning100: '36 100% 65%',
    warning200: '37 100% 74%',
    warningBg: '40 57% 15%',
    danger000: '3 67% 73%',
    danger100: '3 70% 83%',
    danger200: '5 72% 90%',
    dangerBg: '5 53% 15%',
    danger900: '4 52% 11%',
    info100: '217 89% 82%',
    info200: '218 90% 88%',
    infoBg: '217 57% 15%',
  },
  border: {
    border100: '257 6% 22%',
    border200: '262 6% 26%',
    border300: '264 6% 30%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

export const materialTheme: ThemePreset = {
  id: 'material',
  name: 'Material',
  description: 'Material Design 3, tonal surfaces with elevation',
  light: materialLight,
  dark: materialDark,
  defaultStyleId: 'material',
}

export const materialStyle: ThemeStylePreset = {
  id: 'material',
  name: 'Material',
  description: 'Material 3 shapes, elevation shadows and emphasized motion',
  style: {
    radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '28px' },
    shadows: {
      sm: '0 1px 2px hsl(var(--accent-main-100) / 0.1), 0 1px 3px 1px hsl(var(--accent-main-100) / 0.06)',
      md: '0 1px 3px hsl(var(--accent-main-100) / 0.1), 0 4px 8px 3px hsl(var(--accent-main-100) / 0.06)',
      lg: '0 2px 6px 2px hsl(var(--accent-main-100) / 0.1), 0 8px 16px 6px hsl(var(--accent-main-100) / 0.08)',
      xl: '0 4px 10px 3px hsl(var(--accent-main-100) / 0.1), 0 12px 24px 8px hsl(var(--accent-main-100) / 0.08)',
      float: '0 8px 20px hsl(var(--accent-main-100) / 0.12)',
    },
    motion: { durationFast: '100ms', durationBase: '200ms', ease: 'cubic-bezier(0.2, 0, 0, 1)' },
    css: `button, [role='button'], a, select {
  transition-timing-function: var(--motion-ease);
}`,
  },
}
```

修改 `src/themes/index.ts`：

1. 在文件顶部注释块之后插入（index.ts 当前无任何 import）：

```ts
import { materialTheme, materialStyle } from './material'
```

2. `builtinThemes` 数组（当前 `src/themes/index.ts:907-915`）末尾追加 `materialTheme`：

```ts
export const builtinThemes: ThemePreset[] = [
  eucalyptusTheme,
  claudeTheme,
  breezeTheme,
  sakuraTheme,
  oceanTheme,
  draculaTheme,
  obsidianTheme,
  materialTheme,
]
```

3. Task 1 创建的空注册表改为：

```ts
export const builtinStyleThemes: ThemeStylePreset[] = [materialStyle]
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: PASS（全部用例通过，含注册表校验）

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/themes/material.ts src/themes/index.ts src/themes/themes.test.ts
git commit -m "feat(themes): add Material Design theme and style preset"
```

---

### Task 3: themeStore 集成 styleId（状态、注入、备份）

**Files:**
- Modify: `src/store/themeStore.ts`
- Test: `src/store/themeStore.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 的 `resolveStyleId` / `themeStyleToCSS` / `getStylePreset` / `builtinStyleThemes` / `ThemeStyle`；Task 2 的 material 主题（测试断言其 `--radius-md: 12px;`）
- Produces:
  - `ThemeState.styleId: string`（`'auto' | 'none' | 风格id`）
  - `themeStore.setStyleId(id: string): void`（内部归一化，非法 id 回退 `'auto'`）
  - `themeStore.getAvailableStylePresets(): { id: string; name: string; description: string }[]`
  - localStorage key `theme-style`；`normalizeThemeBackup`/`importThemeBackup` 兼容 `styleId`

- [ ] **Step 1: 写失败测试**

创建 `src/store/themeStore.test.ts`：

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/store/themeStore.test.ts`
Expected: FAIL（`themeStore.setStyleId is not a function`）

- [ ] **Step 3: 实现 themeStore 改造**

对 `src/store/themeStore.ts` 做以下编辑（行号为当前文件参考）：

1. 替换第 11-12 行的导入：

```ts
import {
  DEFAULT_THEME_ID,
  builtinStyleThemes,
  builtinThemes,
  getStylePreset,
  getThemePreset,
  resolveStyleId,
  themeColorsToCSSVars,
  themeStyleToCSS,
} from '../themes'
import type { ThemePreset, ThemeColors, ThemeStyle } from '../themes'
```

2. 在 `const STORAGE_KEY_PRESET = 'theme-preset'`（第 205 行）之后插入：

```ts
const STORAGE_KEY_STYLE = 'theme-style'
```

3. 在 `const DEFAULT_CODE_FONT_SCALE = 0`（第 121 行）之后插入：

```ts
/** 界面风格默认值：'auto' = 跟随色板预设的 defaultStyleId */
const DEFAULT_STYLE_ID = 'auto'
```

4. 在 `ThemeState` 接口的 `presetId: string`（第 142 行）之后插入：

```ts
  /** 界面风格 ID：'auto' 跟随色板配套、'none' 无风格、其余为风格预设 ID */
  styleId: string
```

5. 在 `parseCustomCSSSnippets` 函数（第 242-261 行）之后插入：

```ts
/** 归一化界面风格 id：'none' 与已注册的风格 id 有效，其余回退 'auto' */
function normalizeStyleId(raw: string | null | undefined): string {
  if (raw === 'none') return 'none'
  if (raw && raw !== 'auto' && getStylePreset(raw)) return raw
  return DEFAULT_STYLE_ID
}
```

6. 构造函数中，在 `const normalizedPreset = ...`（第 273 行）之后插入：

```ts
    const styleId = normalizeStyleId(localStorage.getItem(STORAGE_KEY_STYLE))
```

并在 `this.state = {` 的 `presetId: normalizedPreset,`（第 381 行）之后插入：

```ts
      styleId,
```

7. 在 `get presetId()`（第 418-420 行）之后插入：

```ts
  get styleId() {
    return this.state.styleId
  }
```

8. 在 `setPreset` 方法（第 534-540 行）之后插入：

```ts
  setStyleId(id: string) {
    const normalized = normalizeStyleId(id)
    if (this.state.styleId === normalized) return
    this.state = { ...this.state, styleId: normalized }
    localStorage.setItem(STORAGE_KEY_STYLE, normalized)
    this.applyTheme()
    this.emit()
  }
```

9. 在 `getAvailablePresets` 方法（第 512-518 行）之后插入：

```ts
  /** 获取所有可用界面风格列表 */
  getAvailableStylePresets(): { id: string; name: string; description: string }[] {
    return builtinStyleThemes.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
    }))
  }
```

10. 替换 `applyTheme()` 中的第 2 步（当前第 837-842 行）：

```ts
    // 2. 注入主题颜色变量 + 界面风格（变量与特效 CSS）
    const preset = this.getPreset()
    if (preset) {
      const colors: ThemeColors = resolvedMode === 'dark' ? preset.dark : preset.light
      const styleId = resolveStyleId(this.state.styleId, preset)
      const style = styleId ? getStylePreset(styleId)?.style : undefined
      this.injectThemeStyle(colors, style)
    }
```

11. 替换 `injectThemeStyle` 方法（当前第 869-880 行）：

```ts
  private injectThemeStyle(colors: ThemeColors, style?: ThemeStyle) {
    let el = document.getElementById(STYLE_ID_THEME) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = STYLE_ID_THEME
      document.head.appendChild(el)
    }

    // 用高优先级选择器覆盖 :root 中的默认值
    // 使用 :root:root 提升特异性，确保覆盖 index.css 中的所有定义
    const blocks = [`:root:root {\n  ${themeColorsToCSSVars(colors)}\n}`]
    const styleCSS = themeStyleToCSS(style)
    if (styleCSS) blocks.push(styleCSS)
    el.textContent = blocks.join('\n\n')
  }
```

12. `normalizeThemeBackup` 中，在 `presetId: ...` 行（第 1002-1003 行）之后插入：

```ts
    styleId: normalizeStyleId(typeof parsed?.styleId === 'string' ? parsed.styleId : null),
```

13. `importThemeBackup` 中，在 `localStorage.setItem(STORAGE_KEY_PRESET, backup.presetId)`（第 1080 行）之后插入：

```ts
  localStorage.setItem(STORAGE_KEY_STYLE, backup.styleId)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/store/themeStore.test.ts src/themes/themes.test.ts src/utils/settingsBackup.test.ts`
Expected: PASS（三个文件全过；settingsBackup.test.ts 不受影响的回归确认）

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误（若有其他文件构造了完整 `ThemeState` 字面量，会因缺少 `styleId` 报错——按报错位置补上 `styleId` 字段即可）

- [ ] **Step 6: Commit**

```bash
git add src/store/themeStore.ts src/store/themeStore.test.ts
git commit -m "feat(theme): integrate interface style layer into themeStore"
```

---

### Task 4: Liquid Glass 主题（色板 + 风格）

**Files:**
- Create: `src/themes/liquidGlass.ts`
- Modify: `src/themes/index.ts`（注册 liquidGlassTheme / liquidGlassStyle）
- Test: `src/themes/themes.test.ts`（既有注册表校验自动覆盖新主题）

**Interfaces:**
- Consumes: Task 1 类型与注册表
- Produces:
  - `liquidGlassTheme: ThemePreset`（id `'liquid-glass'`，`defaultStyleId: 'liquid-glass'`）
  - `liquidGlassStyle: ThemeStylePreset`（id `'liquid-glass'`）

- [ ] **Step 1: 创建 Liquid Glass 主题文件**

创建 `src/themes/liquidGlass.ts`：

```ts
/**
 * Liquid Glass 主题 — 液态玻璃
 *
 * 色板：清透蓝紫，light/dark 两套
 * 风格：加大圆角 + 柔和投影；css 为 .glass/.glass-alt 浮层注入
 * 半透明背景与 backdrop-filter，独立于设置页的毛玻璃开关
 */
import type { ThemeColors, ThemePreset, ThemeStylePreset } from './index'

const liquidGlassLight: ThemeColors = {
  background: {
    bg000: '214 64% 98%',
    bg100: '215 55% 96%',
    bg200: '217 50% 93%',
    bg300: '217 46% 89%',
    bg400: '217 42% 84%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '215 35% 13%',
    text200: '215 21% 30%',
    text300: '214 16% 45%',
    text400: '214 18% 59%',
    text500: '214 21% 72%',
    text600: '214 30% 84%',
  },
  accent: {
    brand: '211 100% 50%',
    main000: '211 100% 42%',
    main100: '211 100% 50%',
    main200: '211 100% 60%',
    secondary100: '199 94% 67%',
  },
  semantic: {
    success100: '134 61% 41%',
    success200: '134 62% 31%',
    successBg: '138 44% 92%',
    warning100: '36 100% 44%',
    warning200: '36 100% 35%',
    warningBg: '38 90% 92%',
    danger000: '354 100% 42%',
    danger100: '3 100% 59%',
    danger200: '3 100% 69%',
    dangerBg: '6 84% 95%',
    danger900: '5 77% 91%',
    info100: '210 100% 52%',
    info200: '211 100% 63%',
    infoBg: '211 79% 94%',
  },
  border: {
    border100: '213 40% 90%',
    border200: '216 39% 86%',
    border300: '217 34% 80%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

const liquidGlassDark: ThemeColors = {
  background: {
    bg000: '221 42% 7%',
    bg100: '223 43% 11%',
    bg200: '221 40% 14%',
    bg300: '222 39% 18%',
    bg400: '224 40% 24%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '217 53% 94%',
    text200: '216 31% 79%',
    text300: '218 22% 64%',
    text400: '217 17% 50%',
    text500: '217 19% 38%',
    text600: '217 21% 29%',
  },
  accent: {
    brand: '210 100% 52%',
    main000: '210 100% 40%',
    main100: '210 100% 52%',
    main200: '209 100% 68%',
    secondary100: '197 100% 70%',
  },
  semantic: {
    success100: '135 64% 50%',
    success200: '136 68% 64%',
    successBg: '139 48% 11%',
    warning100: '36 100% 52%',
    warning200: '36 100% 68%',
    warningBg: '40 67% 12%',
    danger000: '3 100% 61%',
    danger100: '3 100% 69%',
    danger200: '3 100% 79%',
    dangerBg: '2 52% 13%',
    danger900: '2 55% 10%',
    info100: '211 100% 63%',
    info200: '210 100% 74%',
    infoBg: '215 62% 14%',
  },
  border: {
    border100: '221 36% 19%',
    border200: '220 34% 23%',
    border300: '222 34% 30%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

export const liquidGlassTheme: ThemePreset = {
  id: 'liquid-glass',
  name: 'Liquid Glass',
  description: 'Translucent frosted surfaces, airy blue tones',
  light: liquidGlassLight,
  dark: liquidGlassDark,
  defaultStyleId: 'liquid-glass',
}

export const liquidGlassStyle: ThemeStylePreset = {
  id: 'liquid-glass',
  name: 'Liquid Glass',
  description: 'Frosted blur panels with large radii',
  style: {
    radius: { sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px' },
    shadows: {
      sm: '0 1px 2px rgb(0 0 0 / 0.04)',
      md: '0 4px 16px rgb(0 0 0 / 0.06)',
      lg: '0 8px 28px rgb(0 0 0 / 0.08)',
      xl: '0 12px 40px rgb(0 0 0 / 0.1)',
      float: '0 8px 32px rgb(0 0 0 / 0.12)',
    },
    css: `.glass {
  background-color: hsl(var(--bg-000) / 0.62);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  backdrop-filter: blur(28px) saturate(180%);
}

.glass-alt {
  background-color: hsl(var(--bg-100) / 0.55);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  backdrop-filter: blur(28px) saturate(180%);
}`,
  },
}
```

注：`index.css` 中 `:root[data-glass] .glass` 的特异性高于此处的 `.glass`，用户手动开启毛玻璃开关时以开关规则为准（符合「主题优先 + 用户可覆盖」原则）。

- [ ] **Step 2: 注册主题**

修改 `src/themes/index.ts`：

1. 顶部 import 之后追加一行：

```ts
import { liquidGlassTheme, liquidGlassStyle } from './liquidGlass'
```

2. `builtinThemes` 数组在 `materialTheme` 后追加 `liquidGlassTheme`。
3. `builtinStyleThemes` 数组改为：

```ts
export const builtinStyleThemes: ThemeStylePreset[] = [materialStyle, liquidGlassStyle]
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts src/store/themeStore.test.ts`
Expected: PASS（注册表校验自动覆盖新主题）

- [ ] **Step 4: Commit**

```bash
git add src/themes/liquidGlass.ts src/themes/index.ts
git commit -m "feat(themes): add Liquid Glass theme and style preset"
```

---

### Task 5: 复古终端主题（色板 + 风格）

**Files:**
- Create: `src/themes/retroTerminal.ts`
- Modify: `src/themes/index.ts`（注册 retroTerminalTheme / retroTerminalStyle）
- Test: `src/themes/themes.test.ts`（既有注册表校验自动覆盖）

**Interfaces:**
- Consumes: Task 1 类型与注册表
- Produces:
  - `retroTerminalTheme: ThemePreset`（id `'retro-terminal'`，`defaultStyleId: 'retro-terminal'`）
  - `retroTerminalStyle: ThemeStylePreset`（id `'retro-terminal'`）

- [ ] **Step 1: 创建复古终端主题文件**

创建 `src/themes/retroTerminal.ts`：

```ts
/**
 * Retro Terminal 主题 — 复古终端
 *
 * 色板：暗色绿磷光 / 浅色琥珀纸白，两套
 * 风格：零圆角、无阴影、全局等宽字体（JetBrains Mono，由 main.tsx 打包引入）、
 * 静态 CRT 扫描线叠加 + 低强度磷光辉光 + 瞬跳式过渡
 */
import type { ThemeColors, ThemePreset, ThemeStylePreset } from './index'

const retroTerminalDark: ThemeColors = {
  background: {
    bg000: '120 20% 3%',
    bg100: '120 23% 5%',
    bg200: '120 24% 7%',
    bg300: '120 30% 11%',
    bg400: '120 30% 15%',
  },
  text: {
    text000: '120 100% 97%',
    text100: '135 100% 60%',
    text200: '135 66% 49%',
    text300: '135 66% 39%',
    text400: '136 65% 29%',
    text500: '136 66% 22%',
    text600: '136 66% 15%',
  },
  accent: {
    brand: '135 100% 60%',
    main000: '135 69% 47%',
    main100: '135 100% 60%',
    main200: '136 100% 70%',
    secondary100: '41 100% 50%',
  },
  semantic: {
    success100: '135 100% 60%',
    success200: '136 100% 70%',
    successBg: '120 49% 10%',
    warning100: '41 100% 50%',
    warning200: '42 100% 65%',
    warningBg: '39 79% 9%',
    danger000: '0 100% 63%',
    danger100: '0 100% 70%',
    danger200: '0 100% 78%',
    dangerBg: '0 54% 11%',
    danger900: '0 52% 8%',
    info100: '195 100% 60%',
    info200: '195 100% 70%',
    infoBg: '198 54% 11%',
  },
  border: {
    border100: '120 40% 17%',
    border200: '120 40% 22%',
    border300: '120 41% 28%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    // 亮绿 accent 上的文字用近黑色，保证对比度
    oncolor100: '120 20% 5%',
  },
}

const retroTerminalLight: ThemeColors = {
  background: {
    bg000: '44 65% 92%',
    bg100: '45 57% 88%',
    bg200: '43 53% 83%',
    bg300: '43 50% 75%',
    bg400: '43 46% 67%',
  },
  text: {
    text000: '46 100% 97%',
    text100: '43 57% 15%',
    text200: '42 46% 25%',
    text300: '42 35% 36%',
    text400: '43 26% 49%',
    text500: '44 28% 61%',
    text600: '44 32% 72%',
  },
  accent: {
    brand: '42 100% 31%',
    main000: '43 100% 24%',
    main100: '42 100% 31%',
    main200: '41 75% 41%',
    secondary100: '48 100% 24%',
  },
  semantic: {
    success100: '122 45% 34%',
    success200: '123 46% 27%',
    successBg: '80 38% 87%',
    warning100: '33 100% 33%',
    warning200: '32 100% 27%',
    warningBg: '40 69% 86%',
    danger000: '4 71% 41%',
    danger100: '4 61% 49%',
    danger200: '5 61% 57%',
    dangerBg: '22 63% 91%',
    danger900: '22 55% 87%',
    info100: '200 87% 33%',
    info200: '199 75% 40%',
    infoBg: '103 25% 89%',
  },
  border: {
    border100: '44 42% 74%',
    border200: '44 38% 66%',
    border300: '43 35% 57%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

export const retroTerminalTheme: ThemePreset = {
  id: 'retro-terminal',
  name: 'Retro Terminal',
  description: 'CRT phosphor greens on dark, amber on paper',
  light: retroTerminalLight,
  dark: retroTerminalDark,
  defaultStyleId: 'retro-terminal',
}

export const retroTerminalStyle: ThemeStylePreset = {
  id: 'retro-terminal',
  name: 'Retro Terminal',
  description: 'Scanlines, glow text, monospace UI, square corners',
  style: {
    radius: { xs: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px' },
    shadows: { sm: 'none', md: 'none', lg: 'none', xl: 'none', float: 'none' },
    fonts: {
      uiSans:
        "'JetBrains Mono', 'Fira Code', 'Noto Sans Mono CJK SC', 'Cascadia Code', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Noto Sans CJK SC', monospace",
    },
    motion: { durationFast: '0ms', durationBase: '0ms', ease: 'linear' },
    css: `/* CRT 扫描线叠加层（静态，无闪烁动画） */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    hsl(var(--text-100) / 0.04) 3px,
    transparent 4px
  );
}

/* 磷光辉光 */
body {
  text-shadow: 0 0 4px hsl(var(--text-100) / 0.2);
}

/* 瞬跳感：压缩所有 CSS 过渡时长 */
*,
*::before,
*::after {
  transition-duration: 0.01ms !important;
}

@media (prefers-reduced-motion: reduce) {
  body::after {
    background: none;
  }
}`,
  },
}
```

- [ ] **Step 2: 注册主题**

修改 `src/themes/index.ts`：

1. 顶部 import 之后追加一行：

```ts
import { retroTerminalTheme, retroTerminalStyle } from './retroTerminal'
```

2. `builtinThemes` 数组在 `liquidGlassTheme` 后追加 `retroTerminalTheme`。
3. `builtinStyleThemes` 数组改为：

```ts
export const builtinStyleThemes: ThemeStylePreset[] = [materialStyle, liquidGlassStyle, retroTerminalStyle]
```

- [ ] **Step 3: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts src/store/themeStore.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/themes/retroTerminal.ts src/themes/index.ts
git commit -m "feat(themes): add Retro Terminal theme and style preset"
```

---

### Task 6: 打包 JetBrains Mono 字体

**Files:**
- Modify: `package.json`（npm install 自动写入）
- Modify: `src/main.tsx`（新增 3 行 import）

**Interfaces:**
- Consumes: Task 5 中 `retroTerminalStyle.fonts.uiSans` 引用的 `'JetBrains Mono'` 字体族
- Produces: 全局可用的 JetBrains Mono 400/500/700 字重（woff2，Vite 打包）

- [ ] **Step 1: 安装依赖**

Run: `npm install @fontsource/jetbrains-mono`
Expected: package.json dependencies 新增 `@fontsource/jetbrains-mono`（v5.x），无安装错误

- [ ] **Step 2: 引入字体**

在 `src/main.tsx` 第 3 行 `import 'katex/dist/katex.min.css'` 之后插入：

```ts
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
```

- [ ] **Step 3: 验证构建**

Run: `npm run build`
Expected: 构建成功，产物中包含 JetBrains Mono 的 woff2 资源（dist/assets 下出现 `jetbrains-mono-*.woff2`）

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/main.tsx
git commit -m "feat(themes): bundle JetBrains Mono font"
```

---

### Task 7: 设置页「界面风格」选择器与 i18n

**Files:**
- Modify: `src/hooks/useTheme.ts`
- Modify: `src/features/settings/components/AppearanceSettings.tsx`
- Modify: `src/locales/en/settings.json`
- Modify: `src/locales/zh-CN/settings.json`

**Interfaces:**
- Consumes: Task 3 的 `themeStore.setStyleId` / `getAvailableStylePresets` / `state.styleId`
- Produces: `useTheme()` 新增返回 `styleId: string`、`setStyleId(id: string): void`、`availableStylePresets: { id: string; name: string; description: string }[]`

- [ ] **Step 1: useTheme 暴露风格 API**

在 `src/hooks/useTheme.ts` 的 `// ---- Custom CSS ----` 注释块（第 119 行）之前插入：

```ts
  // ---- Interface Style (界面风格) ----

  const setStyleId = useCallback((id: string) => {
    themeStore.setStyleId(id)
  }, [])
```

在 return 对象的 `availablePresets: themeStore.getAvailablePresets(),`（第 255 行）之后插入：

```ts
    // 界面风格
    styleId: state.styleId,
    setStyleId,
    availableStylePresets: themeStore.getAvailableStylePresets(),
```

- [ ] **Step 2: 添加 i18n 文案**

`src/locales/en/settings.json`：在 `"themePresetsDesc": "Choose a base visual style for the app",`（第 163 行）之后插入：

```json
    "uiStyle": "Interface Style",
    "uiStyleDesc": "Layer shape, blur, or terminal effects on top of any color theme",
    "uiStyleAuto": "Follow Theme",
    "uiStyleNone": "None",
```

`src/locales/zh-CN/settings.json`：在 `"themePresetsDesc": "选择应用的基础视觉风格",`（第 163 行）之后插入：

```json
    "uiStyle": "界面风格",
    "uiStyleDesc": "在任意颜色主题上叠加形状、毛玻璃或终端特效",
    "uiStyleAuto": "跟随主题",
    "uiStyleNone": "无",
```

- [ ] **Step 3: AppearanceSettings 新增风格选择器**

`src/features/settings/components/AppearanceSettings.tsx`：

1. `useTheme()` 解构（第 492-514 行）中，在 `availablePresets,` 之后插入：

```ts
    styleId,
    setStyleId,
    availableStylePresets,
```

2. 在主题预设 `SettingsSection` 结束（第 578 行 `)}`）之后、`appearance.customCss` 的 `SettingsSection` 之前插入：

```tsx
      <SettingsSection title={t('appearance.uiStyle')}>
        <p className="text-[length:var(--fs-sm)] text-text-400">{t('appearance.uiStyleDesc')}</p>
        <SegmentedControl
          value={styleId}
          options={[
            { value: 'auto', label: t('appearance.uiStyleAuto') },
            { value: 'none', label: t('appearance.uiStyleNone') },
            ...availableStylePresets.map(s => ({ value: s.id, label: s.name })),
          ]}
          onChange={v => setStyleId(v)}
        />
      </SettingsSection>
```

（`SettingsSection` 与 `SegmentedControl` 均已在该文件导入，无需新增 import。）

- [ ] **Step 4: 校验**

Run: `npm run typecheck && npm run lint && npx vitest run src/store src/themes src/utils`
Expected: 无类型/lint 错误，测试全过

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTheme.ts src/features/settings/components/AppearanceSettings.tsx src/locales/en/settings.json src/locales/zh-CN/settings.json
git commit -m "feat(settings): add interface style selector to appearance settings"
```

---

### Task 8: 全量验证与手动冒烟

**Files:** 无（纯验证）

- [ ] **Step 1: 全量验证**

Run: `npm run validate`
Expected: typecheck、lint、test:run、build 全部通过

- [ ] **Step 2: 手动冒烟（交给用户在 dev server 中确认）**

Run: `npm run dev`，依次确认：

1. 设置 → 外观：预设网格出现 Material / Liquid Glass / Retro Terminal 三张新卡片。
2. 选 Retro Terminal：界面变为等宽字体、零圆角、扫描线与辉光生效；切换日/夜模式，绿磷光（暗）与琥珀纸白（亮）均正常。
3. 选 Liquid Glass：输入框、菜单、对话框等浮层呈现明显半透明模糊（无需开启毛玻璃开关）。
4. 叠加：色板选 Ocean，界面风格选手动「Material」→ 海洋配色 + Material 圆角/阴影；风格切回「跟随主题」→ 风格消失。
5. 刷新页面：风格选择保持（localStorage `theme-style` 持久化）。
