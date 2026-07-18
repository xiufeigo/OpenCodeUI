# Liquid Glass 清透感重做设计

日期：2026-07-18
状态：已获用户确认

## 背景

Liquid Glass 2.0（`docs/superpowers/specs/2026-07-17-liquid-glass-2-design.md`）交付后，用户反馈质感不对：参考 `Kyant0/AndroidLiquidGlass` demo（`artworks/banner.jpg`），目标是**背景基本不变、所有悬浮框/搜索框呈完全透明玻璃质感**，而不是当前的"半透明+高模糊"。

参考图视觉分析：

- 玻璃填充透明度极高（约 15-25%），背后内容（壁纸/图标）清晰可辨
- 透镜折射是主要特征（toggle 滑块放大后方轨道、tab bar 透镜化图标）
- 形状由镜面边缘高光 + 底部暗边投影定义，而非浓重填充

当前实现的问题：大面板 `bg-100/0.72 + blur(24px)`、小浮层 `0.5/0.42 + blur(36px)` 太奶太糊；位移折射被磨砂掩盖；环境渐变底色偏离"背景没什么变化"的要求。

已确认决策：

- 大面板（悬浮框）也上折射滤镜（与参考图 tab bar 一致）
- 环境渐变底色全部撤掉，背景完全恢复主题原样
- 嵌套 backdrop-filter 风险（InputBox.tsx 实践注释）已知悉，按预案处理

## 详细设计

### 1. 清透质感参数（`src/themes/liquidGlass.ts` 的 css）

小浮层 `.glass` / `.glass-alt`：

- 填充：`hsl(var(--bg-000) / 0.22)`（glass，原 0.5）、`hsl(var(--bg-100) / 0.18)`（glass-alt，原 0.42）
- 模糊链：`blur(16px) saturate(160%) brightness(1.05)`（原 36px/200%）
- 斜向光泽减淡（起点 alpha 0.1→0.06 / 0.09→0.05）
- 保留：顶部镜面高光（inset 0 1px white/0.22）、底部暗边、浮层投影、`border-color` 亮边

大面板 `[data-lq-surface]`：

- 填充：`hsl(var(--bg-100) / 0.2)`（原 0.72）
- 模糊链：`blur(16px) saturate(160%)`（原 24px/180%）
- 圆角、阴影不变

折射引擎磨砂链（`src/lib/liquidGlass/engine.ts` 的 `BACKDROP_CHAIN`）同步改为 `blur(16px) saturate(160%) brightness(1.05)`，与 css 保持一致（降级平台渲染一致）。

### 2. 大面板折射（`src/lib/liquidGlass/engine.ts`）

- `GLASS_SELECTOR` 从 `'.glass, .glass-alt'` 扩展为 `'.glass, .glass-alt, [data-lq-surface]'`。
- 大面板同样按自身尺寸生成位移滤镜（0.25 DPI 下 1366×800 → 约 68k 像素，一次性生成，ResizeObserver 防抖重建）。
- 折射强度参数不变（`REFRACTION_STRENGTH = 2`），肉眼验收后可调。

**嵌套 backdrop-filter 预案**：大面板应用滤镜后，面板内部浮层（输入框、MentionMenu 等）的 backdrop-filter 可能在 Chromium 失效。冒烟确认后，若失效则在 liquid-glass css 中追加 `[data-lq-surface] .glass, [data-lq-surface] .glass-alt { backdrop-filter: none; background-color: hsl(var(--bg-000) / 0.35); }`（纯透明+高光，无滤镜），本任务先不加入，以冒烟结果为准。

### 3. 环境背景撤除（`src/themes/liquidGlass.ts` 的 css）

删除上一轮的三个规则块：

- `:root:root body { background: radial-gradient(...) }`
- `:root:root #root / [data-lq-app] / .desktop-titlebar { background(-color): transparent }`

悬浮布局规则（`@media (min-width: 768px)` 内的 padding/gap/surface/header）保留，仅按第 1 节更新 surface 的填充与模糊值。

### 4. 风格选择器网格化（`src/features/settings/components/AppearanceSettings.tsx`）

界面风格选择从 `SegmentedControl` 改为与主题色一致的网格卡片（解决 5 选项窄屏截断问题）：

- 布局：`grid gap-2 sm:grid-cols-2`（窄屏单列垂直排列，宽屏双列），与 PresetCard 区域同模式
- 选项：跟随主题（auto）、无（none）、三个风格预设（来自 `availableStylePresets`）
- 卡片：选项名 + 简述（auto/none 用 i18n 文案，风格用注册表 name/description），选中态 `ring-1 ring-accent-main-100/60` + 高亮背景，点击 `setStyleId(id)`
- 移除该处的 `SegmentedControl` 使用（组件本身保留，颜色模式等处仍在用）

### 5. 范围边界

- 不动位移图算法与引擎生命周期逻辑（仅改 selector 与 BACKDROP_CHAIN）。
- 不动移动端布局、分屏模式、其他风格/色板。
- 折射强度/透明度的最终数值以用户冒烟验收为准，允许后续微调（旋钮已文档化）。

## 测试

- 更新 `src/themes/themes.test.ts` 的 liquid glass 结构断言：
  - css 不再包含 `radial-gradient`（环境背景已撤）
  - css 包含 `hsl(var(--bg-100) / 0.2)`（大面板清透填充）与 `blur(16px)`
- 更新 `src/lib/liquidGlass/engine.test.ts`：`GLASS_SELECTOR` 扩展后，`[data-lq-surface]` 元素也被引擎拾取（新增用例）
- 全量 `npm run validate`；视觉由用户 dev server 验收（重点：清透度、大面板折射、嵌套浮层表现、日夜模式）

## 涉及文件

- 修改：`src/themes/liquidGlass.ts`、`src/lib/liquidGlass/engine.ts`、`src/lib/liquidGlass/engine.test.ts`、`src/themes/themes.test.ts`、`src/features/settings/components/AppearanceSettings.tsx`
