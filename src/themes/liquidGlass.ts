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
    css: `:root:root .glass,
:root:root .glass-alt {
  -webkit-backdrop-filter: blur(36px) saturate(200%) brightness(1.05);
  backdrop-filter: blur(36px) saturate(200%) brightness(1.05);
  border-color: hsl(var(--always-white) / 0.16);
  box-shadow:
    inset 0 1px 0 0 hsl(var(--always-white) / 0.22),
    inset 0 -1px 0 0 hsl(var(--always-black) / 0.05),
    0 8px 32px hsl(var(--always-black) / 0.16);
}

:root:root .glass {
  background-color: hsl(var(--bg-000) / 0.5);
  background-image: linear-gradient(
    135deg,
    hsl(var(--always-white) / 0.1) 0%,
    hsl(var(--always-white) / 0.03) 35%,
    transparent 60%
  );
}

:root:root .glass-alt {
  background-color: hsl(var(--bg-100) / 0.42);
  background-image: linear-gradient(
    135deg,
    hsl(var(--always-white) / 0.09) 0%,
    hsl(var(--always-white) / 0.02) 35%,
    transparent 60%
  );
}

/* 环境渐变底色：accent 色系径向渐变，给悬浮面板提供可折射的背景 */
:root:root body {
  background:
    radial-gradient(1200px 800px at 12% -10%, hsl(var(--accent-main-100) / 0.1), transparent 60%),
    radial-gradient(1000px 700px at 88% 110%, hsl(var(--accent-secondary-100) / 0.09), transparent 55%),
    hsl(var(--bg-100));
}

/* 让环境底色透出：根节点、应用根容器、桌面标题栏透明化 */
:root:root #root {
  background: transparent;
}

:root:root [data-lq-app] {
  background-color: transparent;
}

:root:root .desktop-titlebar {
  background-color: transparent;
}

/* 桌面端悬浮圆角大框（移动端维持现状） */
@media (min-width: 768px) {
  :root:root [data-lq-layout] {
    padding: 10px;
    gap: 10px;
  }

  :root:root [data-lq-column] {
    gap: 10px;
  }

  :root:root [data-lq-surface] {
    border: none;
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-100) / 0.72);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    box-shadow: var(--shadow-xl);
  }

  :root:root [data-lq-header] {
    background-color: transparent;
  }

  :root:root [data-lq-header-fade] {
    --tw-gradient-from: hsl(var(--bg-100) / 0.72);
    --tw-gradient-to: hsl(var(--bg-100) / 0);
  }
}`,
    effects: ['liquid-refraction'],
  },
}
