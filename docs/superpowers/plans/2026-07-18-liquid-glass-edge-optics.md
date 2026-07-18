# Liquid Glass 边缘光学重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐 Liquid Glass 的边缘光学（锐利镜面高光 + 底部暗角 + 分层阴影 + 可见折射扭曲），并把搜索框与选中会话项纳入玻璃体系（含引擎 attribute 观察能力）。

**Architecture:** 纯参数与钩子迭代：`src/themes/liquidGlass.ts` 的 css 更新边缘/阴影/填充并新增 `[data-lq-glass]` 规则；`displacementMap.ts` 调三个折射常量；`engine.ts` 扩展选择器并给 MutationObserver 加 attributes 观察；两个组件挂载 data 钩子。规格见 `docs/superpowers/specs/2026-07-18-liquid-glass-edge-optics-design.md`。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Vitest（jsdom）。

## Global Constraints

- 风格 css 必须基于 CSS 变量，不得写死具体颜色。
- 只改参数/常量/选择器与钩子，不动位移图算法结构与引擎生命周期框架。
- 提交信息使用英文 Conventional Commits。
- 测试命令：`npx vitest run <file>`；全量验证 `npm run validate`（已知 4 个 main 上既有失败用例与本计划无关）。

---

### Task 1: 边缘光学 css（高光/暗角/阴影/填充 + [data-lq-glass] 规则）

**Files:**
- Modify: `src/themes/liquidGlass.ts`（css 模板字符串）
- Test: `src/themes/themes.test.ts`（更新 floating layout 断言）

**Interfaces:**
- Consumes: 清透版 css 现状
- Produces: 无新接口

- [ ] **Step 1: 更新失败测试**

`src/themes/themes.test.ts` 的 `describe('liquid glass floating layout css', ...)` 块整体替换为：

```ts
describe('liquid glass floating layout css', () => {
  it('declares clear-glass surfaces with edge optics and desktop media query', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    expect(css).not.toContain('radial-gradient')
    expect(css).toContain('blur(16px)')
    // 锐利镜面高光与暗角
    expect(css).toContain('inset 0 1px 0 0 hsl(var(--always-white) / 0.5)')
    expect(css).toContain('inset 0 -2px 6px -2px hsl(var(--always-black) / 0.12)')
    // 大面板分层阴影
    expect(css).toContain('0 24px 64px')
    // 聊天框中性微暗填充
    expect(css).toContain('hsl(var(--always-black) / 0.04)')
    // 搜索框/选中框玻璃规则
    expect(css).toContain('[data-lq-glass]')
    // 悬浮布局保留
    expect(css).toContain('[data-lq-layout]')
    expect(css).toContain('[data-lq-surface]')
    expect(css).toContain('@media (min-width: 768px)')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（新断言的高光/暗角/[data-lq-glass] 尚不存在）

- [ ] **Step 3: 修改 css**

对 `src/themes/liquidGlass.ts` 的 `liquidGlassStyle.style.css` 做以下编辑：

1. `.glass, .glass-alt` 共享块中：
   - `border-color: hsl(var(--always-white) / 0.16);` → `border-color: hsl(var(--border-300) / 0.6);`
   - box-shadow 三行替换为：

```css
  box-shadow:
    inset 0 0 0 0.5px hsl(var(--always-white) / 0.35),
    inset 0 1px 0 0 hsl(var(--always-white) / 0.5),
    inset 0 -2px 6px -2px hsl(var(--always-black) / 0.12),
    0 2px 8px hsl(var(--always-black) / 0.06),
    0 8px 24px hsl(var(--always-black) / 0.1),
    0 16px 48px hsl(var(--always-black) / 0.1);
```

2. `.glass` 块：`background-color: hsl(var(--bg-000) / 0.22);` → `background-color: hsl(var(--always-black) / 0.04);`（sheen 渐变保持不变）

3. `[data-lq-surface]` 块：`box-shadow: var(--shadow-xl);` 替换为：

```css
    box-shadow:
      inset 0 0 0 0.5px hsl(var(--always-white) / 0.25),
      inset 0 1px 0 0 hsl(var(--always-white) / 0.4),
      inset 0 -2px 8px -2px hsl(var(--always-black) / 0.1),
      0 2px 8px hsl(var(--always-black) / 0.05),
      0 12px 32px hsl(var(--always-black) / 0.1),
      0 24px 64px hsl(var(--always-black) / 0.08);
```

4. 在 `.glass-alt` 块之后（`/* 桌面端悬浮圆角大框 */` 媒体查询之前）追加：

```css

/* 搜索框与选中项：同款玻璃质感（列表项尺度圆角） */
:root:root [data-lq-glass] {
  background-color: hsl(var(--always-black) / 0.04);
  -webkit-backdrop-filter: blur(16px) saturate(160%) brightness(1.05);
  backdrop-filter: blur(16px) saturate(160%) brightness(1.05);
  border-color: hsl(var(--border-300) / 0.6);
  border-radius: var(--radius-lg);
  box-shadow:
    inset 0 0 0 0.5px hsl(var(--always-white) / 0.35),
    inset 0 1px 0 0 hsl(var(--always-white) / 0.5),
    inset 0 -2px 6px -2px hsl(var(--always-black) / 0.12),
    0 2px 8px hsl(var(--always-black) / 0.06),
    0 8px 24px hsl(var(--always-black) / 0.1);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/themes/liquidGlass.ts src/themes/themes.test.ts
git commit -m "feat(liquid-glass): sharpen edge optics with specular rim, vignette and layered shadows"
```

---

### Task 2: 折射常量增强

**Files:**
- Modify: `src/lib/liquidGlass/displacementMap.ts`（3 个常量）
- Test: `src/lib/liquidGlass/displacementMap.test.ts`（既有断言，预期不受影响）

**Interfaces:**
- Consumes: Task 1 无关；引擎与测试共用这些常量
- Produces: `REFRACTION_STRENGTH = 4`、`EDGE_BAND = 0.16`、`SDF_SHIFT = 0.08`

- [ ] **Step 1: 修改常量**

`src/lib/liquidGlass/displacementMap.ts`：

```ts
export const EDGE_BAND = 0.16
export const SDF_SHIFT = 0.08
export const REFRACTION_STRENGTH = 4
```

（注释同步：`EDGE_BAND` 注释中 `0.12` 改为 `0.16`。）

- [ ] **Step 2: 运行既有测试验证**

Run: `npx vitest run src/lib/liquidGlass/displacementMap.test.ts`
Expected: PASS（定性断言——中心零、平坦区零、边缘非零且对称——在新常量下仍成立；若不通过，按新曲线重算阈值并报告）

- [ ] **Step 3: Commit**

```bash
git add src/lib/liquidGlass/displacementMap.ts src/lib/liquidGlass/displacementMap.test.ts
git commit -m "feat(liquid-glass): boost refraction strength and widen edge band"
```

---

### Task 3: 引擎 attribute 观察 + 选择器扩展

**Files:**
- Modify: `src/lib/liquidGlass/engine.ts`（GLASS_SELECTOR + MutationObserver 配置与 attribute 分支）
- Test: `src/lib/liquidGlass/engine.test.ts`（新增用例）

**Interfaces:**
- Consumes: 现有引擎
- Produces: `GLASS_SELECTOR = '.glass, .glass-alt, [data-lq-surface], [data-lq-glass]'`；引擎可感知元素属性动态变化（获得/失去钩子）

- [ ] **Step 1: 写失败测试**

`src/lib/liquidGlass/engine.test.ts` 的 `describe('liquid glass engine', ...)` 内追加：

```ts
  it('picks up elements that gain a hook attribute dynamically, and cleans up on removal', async () => {
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(FAKE_RECT)
    document.body.appendChild(el)
    startLiquidGlass()
    expect(el.style.getPropertyValue('backdrop-filter')).toBe('')

    el.setAttribute('data-lq-glass', '')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')

    el.removeAttribute('data-lq-glass')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(el.style.getPropertyValue('backdrop-filter')).toBe('')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/liquidGlass/engine.test.ts`
Expected: FAIL（获得属性后 backdrop-filter 仍为空）

- [ ] **Step 3: 实现**

`src/lib/liquidGlass/engine.ts`：

1. 选择器改为：

```ts
const GLASS_SELECTOR = '.glass, .glass-alt, [data-lq-surface], [data-lq-glass]'
```

2. MutationObserver 的 `observe` 配置改为：

```ts
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-lq-surface', 'data-lq-glass'],
    })
```

3. mutation 回调内（`for (const mutation of mutations)` 循环体中，childList 处理之后）追加 attribute 分支：

```ts
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        const target = mutation.target
        if (target.matches(GLASS_SELECTOR)) {
          applyLiquidRefraction(target)
        } else {
          const entry = applied.get(target)
          if (entry) cleanupEntry(target, entry)
        }
        continue
      }
```

（注意：现有 childList 的两个 forEach 分支保持不动；attribute 分支用 `continue` 跳过对同一 mutation 的 childList 处理。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/liquidGlass/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidGlass/engine.ts src/lib/liquidGlass/engine.test.ts
git commit -m "feat(liquid-glass): observe hook attribute changes and cover data-lq-glass"
```

---

### Task 4: 搜索框与选中框挂载钩子 + 全量验证

**Files:**
- Modify: `src/features/chat/sidebar/SidePanel.tsx:1124`（搜索 input 加属性）
- Modify: `src/features/chat/sidebar/ActiveSessionItem.tsx:64`（根 div 条件属性）

**Interfaces:**
- Consumes: Task 3 的 `[data-lq-glass]` 选择器与 attribute 观察
- Produces: 无新接口

- [ ] **Step 1: 搜索 input 加钩子**

`src/features/chat/sidebar/SidePanel.tsx` 第 1124 行的 `<input`（`name="sidebar-chat-search"`）加属性：

```tsx
            <input
              type="text"
              name="sidebar-chat-search"
              data-lq-glass
```

- [ ] **Step 2: 选中会话项加条件钩子**

`src/features/chat/sidebar/ActiveSessionItem.tsx` 根 div（第 61-66 行）的 props 中插入：

```tsx
      data-lq-glass={isSelected || undefined}
```

（放在 `onClick={handleClick}` 之后、`className` 之前的任意位置；React 对 `undefined` 不渲染该属性。）

- [ ] **Step 3: 校验**

Run: `npm run typecheck && npm run lint && npx vitest run src/lib/liquidGlass/ src/themes/themes.test.ts`
Expected: 无错误，测试全过

- [ ] **Step 4: Commit**

```bash
git add src/features/chat/sidebar/SidePanel.tsx src/features/chat/sidebar/ActiveSessionItem.tsx
git commit -m "feat(liquid-glass): glass-treat sidebar search input and selected session item"
```

---

### Task 5: 全量验证与手动冒烟

**Files:** 无（纯验证）

- [ ] **Step 1: 全量验证**

Run: `npm run validate`
Expected: typecheck、lint、build 通过；测试仅剩 4 个 main 上既有失败

- [ ] **Step 2: 手动冒烟（交给用户在 dev server 中确认）**

Run: `npm run dev`，依次确认：

1. 聊天输入框：微暗透明玻璃，顶缘亮高光、底部暗角、外阴影分层可辨，文字可读。
2. 悬浮大面板：边缘高光/暗角可见，面板从背景上"浮起"（阴影有分量）；折射扭曲在面板边缘可见。
3. 侧边栏搜索框：玻璃条质感；点击选中不同会话时，选中项呈现玻璃质感（属性动态切换生效）。
4. 菜单/对话框（.glass 浮层）：与输入框一致的边缘光学。
5. 深色模式：亮边主导，暗角与阴影不违和；切走主题无残留。
