# Liquid Glass 2.0（真·液态玻璃）设计

日期：2026-07-17
状态：已获用户确认

## 背景与目标

当前 Liquid Glass 风格（`src/themes/liquidGlass.ts`）是磨砂玻璃（半透明 + backdrop blur）。用户目标是 iOS 26 式真·液态玻璃：**反射 + 折射 + 透镜膨胀**——折射变形仅限边缘、中心不变形；边缘高光与底部投影营造浮于表面的立体感；主界面大面板悬浮化（圆角大框 + 环境背景透出）。

参考实现：`shuding/liquid-glass`——按元素尺寸用圆角矩形 SDF 生成位移图（边缘位移强、中心为零），经 `feImage + feDisplacementMap` 构成 SVG 滤镜，以 `backdrop-filter: url(#filter)` 作用于背景内容。

已确认的产品决策：

- 接受为 Liquid Glass 风格加**环境渐变底色**（上轮"不加"的结论本轮由用户明确推翻）。
- 动态程度为**静态透镜 + 活动背景**：位移图按尺寸生成一次；背景内容滚动时折射实时变化。不做鼠标跟手涟漪。
- 路线为**运行时引擎 + 风格钩子**，效果仅在 Liquid Glass 风格激活时出现。
- 悬浮大框只做**桌面端**；移动端维持现状（聊天页已是圆角卡片）。
- 折射滤镜只给小浮层（`.glass` / `.glass-alt`）；悬浮大面板只磨砂不折射（性能）。

## 平台支持与降级

`backdrop-filter: url(#svg)` 仅 Chromium 系支持（Windows WebView2、Android WebView ✓；macOS WKWebView、Linux webkit2gtk、Firefox/Safari ✗）。降级天然成立：引擎以内联 style 设置 `backdrop-filter: url(...) blur(...)`，不支持的浏览器将该声明视为无效，自动落回风格 css 中的磨砂规则（现有 iOS26 强化版磨砂保留为兜底）。

## 详细设计

### 1. 折射引擎（新增 `src/lib/liquidGlass/`）

**`displacementMap.ts`**（纯函数）：

- `generateDisplacementMap(width: number, height: number, radius: number): { data: Uint8ClampedArray; scale: number }`
- 内部按 `DPI_SCALE = 0.25` 缩小生成分辨率（平滑渐变，放大后无损），坐标基于圆角矩形 SDF（`roundedRectSDF`）：
  - 距边缘在阈值内（约元素短边的 12%）→ 位移最强，方向指向中心（透镜膨胀）
  - 中心区域 → 位移为零（折射仅限边缘）
- 输出 R/G 通道编码 x/y 位移（0.5 为零点的归一化），`scale` 为 `feDisplacementMap` 的强度。

**`engine.ts`**：

- `applyLiquidRefraction(el: HTMLElement): () => void`
  - 按元素当前尺寸生成位移图 → canvas → `feImage` + `feDisplacementMap` 组成 `<filter>` 注入共享的隐藏 `<svg><defs>`（引擎单例管理）
  - 元素内联设置 `backdrop-filter: url(#id) blur(36px) saturate(200%) brightness(1.05)`——即在与风格 css 相同的模糊/饱和链前加 `url()`：支持的浏览器得到「折射 + 磨砂」，不支持的浏览器因整条声明无效自动落回风格 css 的纯磨砂规则
  - ResizeObserver（150ms debounce）尺寸变化时重建位移图
  - 返回 cleanup：移除内联 backdrop-filter、销毁滤镜
- `startLiquidGlass(): void`：对 `document` 中所有 `.glass, .glass-alt` 元素 apply；MutationObserver 监听 DOM，新出现的匹配元素自动 apply，移除的元素自动 cleanup。幂等。
- `stopLiquidGlass(): void`：全部 cleanup，断开 observer，移除共享 svg。幂等。
- jsdom / 无 canvas 2D 环境下静默 no-op（不抛错）。

### 2. 风格注册表扩展（`src/themes/index.ts`）

```ts
export interface ThemeStyle {
  // ...现有字段
  /** 需要运行时引擎支持的特效标志（如 'liquid-refraction'） */
  effects?: string[]
}
```

`liquidGlassStyle` 增加 `effects: ['liquid-refraction']`。注册表校验测试同步校验 effects 为字符串数组。

### 3. 引擎启停（`src/store/themeStore.ts`）

`applyTheme()` 末尾：解析当前有效风格，若其 `effects` 含 `'liquid-refraction'` 则 `startLiquidGlass()`，否则 `stopLiquidGlass()`。SSR/非浏览器环境跳过。

### 4. 悬浮圆角大框（桌面端，仅风格激活时）

**钩子属性**（每处仅加一个 `data-*`，不改组件结构）：

- `src/App.tsx` 主行容器（桌面分支）加 `data-lq-layout`
- `src/features/chat/sidebar/Sidebar.tsx` docked 容器加 `data-lq-surface="sidebar"`
- `src/features/chat/ChatPane.tsx` 根容器加 `data-lq-surface="chat"`
- `src/components/ResizablePanel.tsx` 容器按 position 加 `data-lq-surface="right"` / `"bottom"`

**`liquidGlassStyle.style.css` 追加**（均 `:root:root` 前缀）：

- `body`：环境渐变底色——accent 色系双径向渐变叠加 `hsl(var(--bg-100))`（light 淡雅、dark 深空；全部用色板变量，叠加其他色板时协调）
- `[data-lq-layout]`：`padding: 10px; gap: 10px;`
- `[data-lq-surface]`：去贴边 border、`border-radius: var(--radius-2xl)`、面板阴影、半透明磨砂背景（`hsl(var(--bg-100) / 0.72)` + `backdrop-filter: blur(24px) saturate(180%)`）
- Header（ChatPane 内 absolute 顶部的 `header` 元素，`src/features/chat/Header.tsx`）：背景由 `bg-bg-100` 改为透明，其底部渐变遮罩（`from-bg-100`）改为从面板底色 `hsl(var(--bg-100) / 0.72)` 渐出，使消息流在玻璃面板内连续透出

### 5. 范围边界（明确不做）

- 不做鼠标跟手涟漪/动态位移重算。
- 大面板不上折射滤镜（只磨砂）。
- 不改动移动端布局与分屏模式。
- 不改其他风格/色板；引擎只在 liquid-glass 风格激活时运行。
- 不引入第三方 liquid glass 依赖（引擎自研，约 200 行）。

## 错误处理

- 元素尺寸为 0（隐藏/卸载中）→ 跳过生成，待 ResizeObserver 触发有效尺寸。
- canvas 2D context 获取失败 → 该元素跳过，不影响其他元素。
- 引擎重复 start/stop → 幂等无副作用。
- 风格切换到无 effects 的风格 → stop 全部清理，无残留滤镜/内联样式。

## 测试

- `src/lib/liquidGlass/displacementMap.test.ts`：
  - 中心像素位移为零（或 ≤1 LSB）
  - 边缘区域位移显著大于中心
  - 左右/上下对称（位移场镜像）
- `src/lib/liquidGlass/engine.test.ts`（jsdom）：
  - apply 后元素内联 `backdrop-filter` 包含 `url(#`，cleanup 后移除
  - start/stop 幂等；重复 start 不产生重复滤镜
  - 无 2D context 时不抛错
- `src/themes/themes.test.ts`：effects 字段为字符串数组（含 liquidGlassStyle 含 'liquid-refraction'）。
- 全量 `npm run validate`；视觉效果由用户 dev server 验收（输入框/菜单边缘折射、悬浮大框、深色模式、风格切换无残留）。

## 涉及文件

新增：

- `src/lib/liquidGlass/displacementMap.ts`
- `src/lib/liquidGlass/engine.ts`
- `src/lib/liquidGlass/index.ts`（导出入口）
- `src/lib/liquidGlass/displacementMap.test.ts`
- `src/lib/liquidGlass/engine.test.ts`

修改：

- `src/themes/index.ts`（ThemeStyle.effects）
- `src/themes/liquidGlass.ts`（effects 标志 + 悬浮/环境 css）
- `src/store/themeStore.ts`（引擎启停调用）
- `src/App.tsx`、`src/features/chat/sidebar/Sidebar.tsx`、`src/features/chat/ChatPane.tsx`、`src/components/ResizablePanel.tsx`（各一个 data 属性）
- `src/themes/themes.test.ts`（effects 校验）
