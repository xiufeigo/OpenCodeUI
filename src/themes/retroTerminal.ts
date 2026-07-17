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
