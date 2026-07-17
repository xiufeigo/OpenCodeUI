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
