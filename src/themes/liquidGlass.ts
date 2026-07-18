/**
 * Codex 主题（id: liquid-glass）
 *
 * 色板：照搬默认 Eucalyptus，light/dark 两套（保持主题自包含，逐值复制）
 * 风格：codex 桌面端形态 —— 整体背景为预模糊的 Windows 11 壁纸
 * （深色模式用暗色版），body::before 淡色蒙版形成均匀磨砂，
 * 系统标题栏/侧栏/右栏/聊天窗缝隙透明叠加其上；主聊天窗口为唯一的
 * 白底圆角卡片（白色顶栏 + 白色正文）；全主题无投影，靠发丝边分层，
 * 左右侧栏分割线默认隐藏、hover 显现；磨砂不依赖系统窗效与运行时
 * backdrop-filter，避免文字抗锯齿降级。
 * css 同时为 .glass/.glass-alt 浮层注入白底磨砂背景与 backdrop-filter，
 * 独立于设置页的毛玻璃开关。
 */
import type { ThemeColors, ThemePreset, ThemeStylePreset } from './index'
import codexWallpaperLight from '../assets/codex-wallpaper-light.jpg'
import codexWallpaperDark from '../assets/codex-wallpaper-dark.jpg'

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
  description: 'Default palette, frosted chrome and a white rounded chat window',
  light: liquidGlassLight,
  dark: liquidGlassDark,
  defaultStyleId: 'liquid-glass',
}

export const liquidGlassStyle: ThemeStylePreset = {
  id: 'liquid-glass',
  name: 'Codex',
  description: 'Codex-style frosted chrome, single rounded chat window, no shadows',
  style: {
    radius: { sm: '8px', md: '12px', lg: '16px', xl: '20px', '2xl': '24px' },
    shadows: {
      sm: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      float: 'none',
    },
    css: `/* 输入框等浮层：白底磨砂，无投影 */
:root:root .glass,
:root:root .glass-alt {
  -webkit-backdrop-filter: blur(20px) saturate(160%) brightness(1.03);
  backdrop-filter: blur(20px) saturate(160%) brightness(1.03);
  border-color: hsl(var(--border-300) / 0.6);
  box-shadow: none;
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
  box-shadow: none;
}

:root:root [data-lq-glass]:hover {
  background-color: hsl(var(--bg-000) / 0.92);
}

:root:root [data-lq-glass]:focus-visible {
  border-color: hsl(var(--accent-main-100) / 0.5);
}

/* 选中会话项：codex 侧栏白卡 */
:root:root [data-lq-selected] {
  background-color: hsl(var(--bg-000) / 0.9);
  border-color: hsl(var(--border-200) / 0.8);
  border-radius: var(--radius-md);
  box-shadow: none;
}

/* 整体背景：Windows 11 壁纸（深色模式用暗色版）；主聊天窗口保持白底 */
:root:root body {
  background: url('${codexWallpaperLight}') center / cover no-repeat hsl(var(--bg-100));
}

:root:root[data-mode='dark'] body {
  background-image: url('${codexWallpaperDark}');
}

/* 跟随系统的深色模式（data-mode 缺省时由媒体查询接管） */
@media (prefers-color-scheme: dark) {
  :root:root:not([data-mode]) body {
    background-image: url('${codexWallpaperDark}');
  }
}

/* 整体磨砂层：淡色蒙版叠在预模糊壁纸上形成均匀磨砂。
   不用运行时 backdrop-filter：全屏滤镜会让 Chromium 文字抗锯齿降级，字体发虚 */
:root:root body::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: hsl(var(--bg-100) / 0.65);
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

/* 面板头部动作按钮：白底遮罩，避免融进磨砂背景找不到 */
:root:root [data-lq-iconbtn] {
  background-color: hsl(var(--bg-000) / 0.7);
}

:root:root [data-lq-iconbtn]:hover {
  background-color: hsl(var(--bg-000) / 0.9);
}

/* ===== 桌面端 Codex 布局（移动端维持默认） ===== */
@media (min-width: 768px) {
  /* 主窗口四周留白，露出磨砂 chrome / 壁纸；
     顶部额外叠加 --app-safe-top：安卓平板上为状态栏让位（桌面端为 0，不影响） */
  :root:root [data-lq-chatwrap] {
    padding: 10px;
    padding-top: calc(10px + var(--app-safe-top, 0px));
  }

  /* 主 agent 窗口：唯一的圆角卡片，透明容器（白顶栏 + 白正文），无投影 */
  :root:root [data-lq-surface='chat'] {
    border: 1px solid hsl(var(--border-200) / 0.6);
    border-radius: var(--radius-lg);
    background-color: transparent;
    box-shadow: none;
  }

  /* 顶栏：与正文一致的白色底 */
  :root:root [data-lq-surface='chat'] [data-lq-header] {
    background-color: hsl(var(--bg-000));
    border-bottom: 1px solid hsl(var(--border-200) / 0.6);
  }

  /* 聊天正文：白底 */
  :root:root [data-lq-surface='chat'] [data-lq-chatbody] {
    background-color: hsl(var(--bg-000));
  }

  /* 侧栏/右栏/底栏：透明叠加在整体磨砂层之上，无圆角、无投影，仅留发丝边 */
  :root:root [data-lq-surface='sidebar'],
  :root:root [data-lq-surface='left'],
  :root:root [data-lq-surface='right'],
  :root:root [data-lq-surface='bottom'] {
    border: 0 solid hsl(var(--border-200) / 0.6);
    border-radius: 0;
    background-color: transparent;
    box-shadow: none;
  }

  :root:root [data-lq-surface='sidebar'],
  :root:root [data-lq-surface='left'] {
    border-right-width: 1px;
  }

  :root:root [data-lq-surface='right'] {
    border-left-width: 1px;
  }

  :root:root [data-lq-surface='bottom'] {
    border-top-width: 1px;
  }

  /* 右栏/底栏面板头部：透明叠加磨砂层 */
  :root:root [data-lq-panelhead] {
    background-color: transparent;
  }

  /* 亮色模式：侧栏文字加深，提升磨砂底上的可读性（搜索框保留原有色值） */
  :root:root[data-mode='light'] [data-lq-surface='sidebar'],
  :root:root[data-mode='light'] [data-lq-surface='left'],
  :root:root[data-mode='light'] [data-lq-surface='right'] {
    --text-200: 170 12% 30%;
    --text-300: 170 10% 42%;
    --text-400: 170 9% 54%;
  }

  :root:root[data-mode='light'] [data-lq-glass] {
    --text-200: 170 10% 40%;
    --text-300: 170 8% 55%;
    --text-400: 170 8% 70%;
  }

  @media (prefers-color-scheme: light) {
    :root:root:not([data-mode]) [data-lq-surface='sidebar'],
    :root:root:not([data-mode]) [data-lq-surface='left'],
    :root:root:not([data-mode]) [data-lq-surface='right'] {
      --text-200: 170 12% 30%;
      --text-300: 170 10% 42%;
      --text-400: 170 9% 54%;
    }

    :root:root:not([data-mode]) [data-lq-glass] {
      --text-200: 170 10% 40%;
      --text-300: 170 8% 55%;
      --text-400: 170 8% 70%;
    }
  }

  /* 左右侧栏分割线：默认隐藏，鼠标移上时显现 */
  :root:root [data-lq-surface='sidebar'],
  :root:root [data-lq-surface='left'],
  :root:root [data-lq-surface='right'] {
    border-color: transparent;
    transition: border-color 160ms ease;
  }

  :root:root [data-lq-surface='sidebar']:hover,
  :root:root [data-lq-surface='left']:hover,
  :root:root [data-lq-surface='right']:hover {
    border-color: hsl(var(--border-200) / 0.6);
  }

  /* 深色模式：发丝边分层（bg-000 比 bg-100 浅，正文卡片天然提亮） */
  :root:root[data-mode='dark'] [data-lq-surface='chat'],
  :root:root[data-mode='dark'] [data-lq-surface='bottom'] {
    border-color: hsl(var(--border-200) / 0.8);
  }

  :root:root[data-mode='dark'] [data-lq-surface='sidebar']:hover,
  :root:root[data-mode='dark'] [data-lq-surface='left']:hover,
  :root:root[data-mode='dark'] [data-lq-surface='right']:hover {
    border-color: hsl(var(--border-200) / 0.8);
  }

  /* 跟随系统的深色模式（data-mode 缺省时由媒体查询接管） */
  @media (prefers-color-scheme: dark) {
    :root:root:not([data-mode]) [data-lq-surface='chat'],
    :root:root:not([data-mode]) [data-lq-surface='bottom'] {
      border-color: hsl(var(--border-200) / 0.8);
    }

    :root:root:not([data-mode]) [data-lq-surface='sidebar']:hover,
    :root:root:not([data-mode]) [data-lq-surface='left']:hover,
    :root:root:not([data-mode]) [data-lq-surface='right']:hover {
      border-color: hsl(var(--border-200) / 0.8);
    }
  }

  /* 顶栏下渐隐遮罩与正文同色，保持不可见 */
  :root:root [data-lq-header-fade] {
    --tw-gradient-from: hsl(var(--bg-000));
    --tw-gradient-to: hsl(var(--bg-000) / 0);
  }
}`,
  },
}
