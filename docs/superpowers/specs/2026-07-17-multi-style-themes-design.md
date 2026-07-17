# 多维度完整主题系统设计

日期：2026-07-17
状态：已获用户确认（含「风格可叠加」修订）

## 背景与目标

OpenCodeUI 当前的主题系统（`src/themes/index.ts` + `src/store/themeStore.ts`）只支持颜色维度：每个 `ThemePreset` 含 light/dark 两套 `ThemeColors`，运行时注入 CSS 变量（`:root:root { --bg-000: ... }`），经 `src/index.css` 的 `@theme` 映射为 Tailwind token。已有 7 套内置换色主题。

目标：新增三套**完整风格主题**——Material Design、Liquid Glass、复古终端——使主题除颜色外还能控制：

- 形状与质感（圆角、阴影）
- 字体排印（UI 字体、等宽字体；引入 JetBrains Mono）
- 材质特效（毛玻璃、扫描线、辉光）
- 动效（CSS 过渡时长与缓动）

并且：**界面风格是独立层，可与任意色板叠加**（如「海洋」色板 + Liquid Glass 特效、「Dracula」色板 + 终端扫描线）。特效 CSS 全部基于颜色变量编写（`hsl(var(--bg-100) / 0.6)` 等），与具体色板解耦，任意组合无需单独调优。

## 架构决策

扩展现有预设系统，拆出两个注册表：

- **色板预设**（`ThemePreset`，现有机制）：light/dark 颜色，新增可选字段 `defaultStyleId` 指向配套风格。
- **界面风格**（`ThemeStylePreset`，新增）：圆角/阴影/字体/动效/特效 CSS，独立于色板。

用户在选择色板之外，可通过设置页「界面风格」下拉选择 `跟随主题（默认）/ 无 / Material / Liquid Glass / 复古终端`：

- `跟随主题`：使用当前色板预设的 `defaultStyleId`（三套新预设自带匹配风格；旧 7 套无此字段 → 无风格，行为与现状一致）。
- `无`：强制不应用任何风格。
- 具体风格：在任意色板上叠加该风格。

（已对比并否决：风格与颜色永久捆绑的单层方案、纯 Custom CSS 片段方案。）

## 详细设计

### 1. 类型定义（`src/themes/index.ts`）

```ts
export interface ThemeStyle {
  /** 圆角覆盖 → --radius-* */
  radius?: Partial<Record<'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl', string>>
  /** 阴影覆盖 → --shadow-*（完整 box-shadow 声明值） */
  shadows?: Partial<Record<'sm' | 'md' | 'lg' | 'xl' | 'float', string>>
  /** 字体栈覆盖 → --font-ui-sans / --font-mono */
  fonts?: { uiSans?: string; mono?: string }
  /** 动效 → --motion-duration-fast / --motion-duration-base / --motion-ease
      由风格自身 css 及引用这些变量的过渡规则消费 */
  motion?: { durationFast?: string; durationBase?: string; ease?: string }
  /** 风格激活期间注入的附加 CSS 原文（特效：毛玻璃规则、扫描线等） */
  css?: string
}

/** 界面风格预设：独立于色板的风格包 */
export interface ThemeStylePreset {
  id: string // 'material' | 'liquid-glass' | 'retro-terminal'
  name: string
  description: string
  style: ThemeStyle
}

export interface ThemePreset {
  id: string
  name: string
  description: string
  light: ThemeColors
  dark: ThemeColors
  /** 配套界面风格 id；缺省表示无配套风格 */
  defaultStyleId?: string
}
```

序列化：新增 `themeStyleToCSS(style?: ThemeStyle): string`，把 radius/shadows/fonts/motion 映射为 CSS 变量声明（`--radius-md: 12px;` 等），并原样附加 `css` 字段。

风格解析：新增 `resolveStyleId(styleId: string, preset?: ThemePreset): string | undefined`——

- `styleId === 'auto'` → 返回 `preset?.defaultStyleId`
- `styleId === 'none'` → 返回 `undefined`
- 其他 → 原样返回（显式选择的风格优先于色板配套，且切换色板后保持，这是叠加的语义）

### 2. 注入机制（`src/store/themeStore.ts`）

- state 新增 `styleId: string`，默认 `'auto'`，持久化到 localStorage key `theme-style`；新增 `setStyleId()` action。
- `applyTheme()` 中用 `resolveStyleId` 求出有效风格，从风格注册表取 `ThemeStyle`。
- `injectThemeStyle()` 扩展为注入「颜色变量 + 风格变量 + 风格 css」，仍写入现有的 `<style id="opencode-theme-vars">`，选择器保持 `:root:root` 以覆盖 `@theme` 默认值。
- 风格 css 只存在于当前 stylesheet 中；切换风格/色板时 stylesheet 整体重写，特效 CSS 自动消失——不需要 `data-theme` 属性，无残留。
- `normalizeThemeBackup`（设置备份/恢复）需识别并校验新字段 `styleId`（非法值回退 `'auto'`）。
- `applyTheme()` 其余流程（data-mode、meta theme-color、Android 桥、custom CSS、字号覆盖）不变。

### 3. 三套新主题（各自独立文件，色板与风格同文件内聚）

`src/themes/index.ts` 已近千行。每套新主题一个文件，同时导出该套的色板预设和风格预设：

- **`src/themes/material.ts` — Material Design 3**
  - 色板：M3 基线紫（light primary `#6750A4` / dark `#D0BCFF`），surface tint 背景体系，light + dark 两套完整 `ThemeColors`。
  - 风格：圆角 M3 shape scale（xs=4 / sm=8 / md=12 / lg=16 / xl=20 / 2xl=28）；带色 elevation 阴影（低透明度紫色基调）；emphasized 缓动（如 `cubic-bezier(0.2, 0, 0, 1)`）。

- **`src/themes/liquidGlass.ts` — Liquid Glass**
  - 色板：清透蓝紫色板，light + dark 两套。
  - 风格：圆角整体加大（lg 16 / xl 20 / 2xl 24）；特效 `css` 为卡片/侧栏/对话框等表面注入 `backdrop-filter: blur() saturate()` 与 `hsl(var(--bg-*) / <alpha>)` 半透明背景规则。独立于设置页现有毛玻璃开关（`data-glass`），不读取也不修改该开关状态。

- **`src/themes/retroTerminal.ts` — 复古终端**
  - 色板：暗色绿磷光（绿字近黑底）、浅色琥珀纸白，两套完整 `ThemeColors`。
  - 风格：圆角全 0；`fonts.uiSans` 指向 JetBrains Mono 栈（全局等宽）；特效 `css` 注入 `body::after` 固定定位扫描线叠加层（repeating-linear-gradient，`pointer-events: none`，低透明度，静态无闪烁动画）+ 低强度文本辉光 text-shadow；通过 css 全局压缩过渡时长实现瞬跳感。

index.ts 汇总：三个色板预设加入 `builtinThemes`（`defaultStyleId` 各指自身风格）；三个风格预设组成新注册表 `builtinStyleThemes`。

### 4. JetBrains Mono 打包

新增依赖 `@fontsource/jetbrains-mono`（400/500/700 三个字重），在 `src/main.tsx` 静态引入。本地打包，Tauri 桌面端离线可用，无 CDN 依赖。复古终端风格叠加到任意色板时均可用。

### 5. 设置 UI 与 i18n

- `AppearanceSettings.tsx`：
  - 预设卡片网格遍历 `builtinThemes` 渲染，三个新色板自动出现。
  - 新增「界面风格」设置行（SegmentedControl 或下拉），选项：跟随主题 / 无 / Material / Liquid Glass / 复古终端，读写 `themeStore.styleId`。
- i18n：新设置行的标签与描述需加入 `src/locales/en/settings.json` 与 `src/locales/zh-CN/settings.json` 的 `appearance` 命名空间（如 `uiStyle`、`uiStyleDesc`、`uiStyleAuto`、`uiStyleNone`）。风格名称与色板名称沿用现有惯例硬编码英文。
- 毛玻璃开关、字号滑块保持独立可用，在主题/风格基础上叠加。

### 6. 范围边界（明确不做）

- JS 动画库（motion/framer）不做主题化；动效维度仅覆盖 CSS transition（motion tokens + 风格 css）。
- 扫描线为静态叠加，不做闪烁/滚动动画（无障碍与 `prefers-reduced-motion` 考量）。
- 不引入主题编辑器/导出功能；用户自定义仍走现有 Custom CSS。
- 风格与色板的组合不做两两人工调优（依赖变量化 CSS 天然适配）。

## 数据流与持久化

- localStorage：`theme-preset`（色板 id，现有）+ `theme-style`（风格 id，新增，默认 `'auto'`）。
- `main.tsx` 在 React 渲染前调 `themeStore.init()`，注入逻辑同步应用色板与风格，防闪烁。
- 设置备份/恢复经 `normalizeThemeBackup` 兼容新旧数据（缺 `styleId` 的旧备份 → `'auto'`）。

## 错误处理

- `defaultStyleId` / 风格注册表查找失败（如 id 拼错）→ 视为无风格，仅注入颜色，不抛错。
- 持久化的 `styleId` 非法（如旧版本数据）→ 回退 `'auto'`。
- 风格 `css` 按原文注入，不做校验（与现有 customCSS 行为一致）；语法错误只会导致对应规则被浏览器忽略，不影响变量注入。
- 字体加载失败时回退到字体栈中的后续等宽字体。

## 测试

- 新增 `src/themes/themes.test.ts`：
  - 每个内置色板预设（含 3 套新色板）light/dark 字段完整、颜色值为合法裸 HSL token（`H S% L%` 格式）。
  - 每个风格预设字段合法；`defaultStyleId` 指向的 id 在风格注册表中存在。
  - `themeStyleToCSS` 对 radius/shadows/fonts/motion/css 的序列化输出正确；`undefined` 输入输出为空。
  - `resolveStyleId`：`'auto'` 跟随预设、`'none'` 返回 undefined、显式 id 优先且在切换预设后保持。
- 更新 `src/utils/settingsBackup.test.ts` 相关用例（如存在对 themeStore 备份字段的断言），覆盖 `styleId` 的归一化。
- 全量验证：`npm run validate`（typecheck + lint + test:run + build）。

## 涉及文件

修改：

- `src/themes/index.ts`（ThemeStyle/ThemeStylePreset 类型、序列化与解析函数、注册表汇总）
- `src/store/themeStore.ts`（styleId 状态、注入扩展、备份归一化）
- `src/features/settings/components/AppearanceSettings.tsx`（界面风格设置行）
- `src/locales/en/settings.json`、`src/locales/zh-CN/settings.json`（新设置项文案）
- `src/main.tsx`（引入 JetBrains Mono）
- `package.json`（新增 @fontsource/jetbrains-mono 依赖）

新增：

- `src/themes/material.ts`
- `src/themes/liquidGlass.ts`
- `src/themes/retroTerminal.ts`
- `src/themes/themes.test.ts`
