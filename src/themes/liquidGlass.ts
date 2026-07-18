/**
 * Liquid Glass 主题 — Codex
 *
 * 色板：照搬默认 Eucalyptus，light/dark 两套（保持主题自包含，逐值复制）
 * 风格：白底悬浮聊天卡片 + 磨砂侧栏/顶栏；css 为 .glass/.glass-alt 浮层注入
 * 白底磨砂背景与 backdrop-filter，独立于设置页的毛玻璃开关
 */
import type { ThemeColors, ThemePreset, ThemeStylePreset } from './index'

const liquidGlassLight: ThemeColors = {
  background: {
    bg000: '150 10% 99%',
    bg100: '150 12% 96%',
    bg200: '150 12% 93%',
    bg300: '150 10% 89%',
    bg400: '150 10% 85%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '170 15% 15%',
    text200: '170 10% 40%',
    text300: '170 8% 55%',
    text400: '170 8% 70%',
    text500: '170 6% 78%',
    text600: '170 10% 85%',
  },
  accent: {
    brand: '165 45% 42%',
    main000: '165 40% 35%',
    main100: '165 45% 42%',
    main200: '165 50% 48%',
    secondary100: '200 45% 50%',
  },
  semantic: {
    success100: '140 40% 40%',
    success200: '140 35% 32%',
    successBg: '140 30% 94%',
    warning100: '35 80% 45%',
    warning200: '35 70% 38%',
    warningBg: '35 60% 94%',
    danger000: '5 55% 40%',
    danger100: '5 60% 55%',
    danger200: '5 65% 62%',
    dangerBg: '5 60% 96%',
    danger900: '5 50% 93%',
    info100: '200 50% 50%',
    info200: '200 45% 60%',
    infoBg: '200 40% 95%',
  },
  border: {
    border100: '160 10% 86%',
    border200: '160 10% 82%',
    border300: '160 10% 75%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

const liquidGlassDark: ThemeColors = {
  background: {
    bg000: '210 20% 18%',
    bg100: '210 20% 14%',
    bg200: '210 20% 11%',
    bg300: '210 20% 9%',
    bg400: '210 25% 6%',
  },
  text: {
    text000: '0 0% 100%',
    text100: '210 15% 92%',
    text200: '210 10% 70%',
    text300: '210 8% 55%',
    text400: '210 8% 40%',
    text500: '210 6% 32%',
    text600: '210 10% 25%',
  },
  accent: {
    brand: '165 50% 55%',
    main000: '165 45% 45%',
    main100: '165 50% 55%',
    main200: '165 55% 65%',
    secondary100: '200 50% 60%',
  },
  semantic: {
    success100: '140 50% 55%',
    success200: '140 45% 62%',
    successBg: '140 30% 15%',
    warning100: '35 80% 60%',
    warning200: '35 75% 68%',
    warningBg: '35 30% 15%',
    danger000: '5 65% 60%',
    danger100: '5 70% 65%',
    danger200: '5 72% 72%',
    dangerBg: '5 30% 15%',
    danger900: '5 28% 22%',
    info100: '200 60% 65%',
    info200: '200 55% 72%',
    infoBg: '200 30% 15%',
  },
  border: {
    border100: '210 15% 22%',
    border200: '210 15% 26%',
    border300: '210 15% 32%',
  },
  special: {
    alwaysBlack: '0 0% 0%',
    alwaysWhite: '0 0% 100%',
    oncolor100: '0 0% 100%',
  },
}

export const liquidGlassTheme: ThemePreset = {
  id: 'liquid-glass',
  name: 'Codex',
  description: 'Default palette, white floating panes and frosted chrome',
  light: liquidGlassLight,
  dark: liquidGlassDark,
  defaultStyleId: 'liquid-glass',
}

export const liquidGlassStyle: ThemeStylePreset = {
  id: 'liquid-glass',
  name: 'Codex',
  description: 'Codex-style frosted surfaces and floating panes',
  style: {
    radius: { sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px' },
    shadows: {
      sm: '0 1px 2px rgb(0 0 0 / 0.04)',
      md: '0 4px 16px rgb(0 0 0 / 0.06)',
      lg: '0 8px 28px rgb(0 0 0 / 0.08)',
      xl: '0 12px 40px rgb(0 0 0 / 0.1)',
      float: '0 8px 32px rgb(0 0 0 / 0.12)',
    },
    css: `/* 输入框等浮层：白底磨砂 */
:root:root .glass,
:root:root .glass-alt {
  -webkit-backdrop-filter: blur(20px) saturate(160%) brightness(1.03);
  backdrop-filter: blur(20px) saturate(160%) brightness(1.03);
  border-color: hsl(var(--border-300) / 0.6);
  box-shadow:
    inset 0 1px 0 0 hsl(var(--always-white) / 0.5),
    inset 0 -1px 2px 0 hsl(var(--always-black) / 0.08),
    0 2px 8px hsl(var(--always-black) / 0.05),
    0 8px 24px hsl(var(--always-black) / 0.08);
}

:root:root .glass {
  background-color: hsl(var(--bg-000) / 0.8);
}

:root:root .glass-alt {
  background-color: hsl(var(--bg-100) / 0.75);
}

/* 搜索框：codex 式白色 pill */
:root:root [data-lq-glass] {
  background-color: hsl(var(--bg-000) / 0.85);
  border-color: hsl(var(--border-300) / 0.6);
  border-radius: var(--radius-lg);
  box-shadow:
    inset 0 1px 0 0 hsl(var(--always-white) / 0.4),
    0 1px 4px hsl(var(--always-black) / 0.06);
}

:root:root [data-lq-glass]:hover {
  background-color: hsl(var(--bg-000) / 0.92);
}

:root:root [data-lq-glass]:focus-visible {
  box-shadow:
    inset 0 1px 0 0 hsl(var(--always-white) / 0.4),
    0 1px 4px hsl(var(--always-black) / 0.06),
    0 0 0 1px hsl(var(--border-200));
}

/* 选中会话项：淡色高亮 */
:root:root [data-lq-selected] {
  background-color: hsl(var(--accent-main-100) / 0.1);
  border-color: hsl(var(--accent-main-100) / 0.25);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 4px hsl(var(--always-black) / 0.05);
}

/* 环境回退底色（非窗效环境）：淡青绿倾向 */
:root:root body {
  background:
    linear-gradient(160deg, hsl(var(--accent-main-100) / 0.08), hsl(var(--bg-100)) 45%),
    hsl(var(--bg-100));
}

:root:root #root {
  background: transparent;
}

:root:root [data-lq-app] {
  background-color: transparent;
}

:root:root .desktop-titlebar {
  background-color: transparent;
}

/* 窗效开启：透出真实桌面壁纸 */
:root:root[data-window-effect] body {
  background: transparent;
}

/* 桌面端悬浮布局（移动端维持现状） */
@media (min-width: 768px) {
  /* overflow: visible 避免容器硬切悬浮卡片投影 */
  :root:root [data-lq-layout] {
    padding: 10px;
    gap: 10px;
    overflow: visible;
  }

  :root:root [data-lq-column] {
    gap: 10px;
    overflow: visible;
  }

  /* agent 聊天窗口：白底悬浮卡片（四角全圆） */
  :root:root [data-lq-surface='chat'] {
    border: 1px solid hsl(var(--border-200) / 0.6);
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-000));
    box-shadow:
      0 1px 2px hsl(var(--always-black) / 0.04),
      0 4px 16px hsl(var(--always-black) / 0.06),
      0 12px 32px hsl(var(--always-black) / 0.05);
  }

  /* 侧栏/右栏/底栏：更透的磨砂悬浮，透出桌面 */
  :root:root [data-lq-surface]:not([data-lq-surface='chat']) {
    border: 1px solid hsl(var(--border-200) / 0.6);
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-000) / 0.4);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    backdrop-filter: blur(24px) saturate(160%);
    box-shadow:
      0 2px 8px hsl(var(--always-black) / 0.05),
      0 12px 32px hsl(var(--always-black) / 0.1);
  }

  /* 深色模式：发丝边分层，不靠阴影（bg-000 比 bg-100 浅，卡片天然提亮） */
  :root:root[data-mode='dark'] [data-lq-surface] {
    border-color: hsl(var(--border-200) / 0.8);
  }

  /* 顶栏：与侧栏同参数磨砂 */
  :root:root [data-lq-header] {
    background-color: hsl(var(--bg-000) / 0.4);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    backdrop-filter: blur(24px) saturate(160%);
  }

  :root:root [data-lq-header-fade] {
    --tw-gradient-from: hsl(var(--bg-000));
    --tw-gradient-to: hsl(var(--bg-000) / 0);
  }
}`,
  },
}
