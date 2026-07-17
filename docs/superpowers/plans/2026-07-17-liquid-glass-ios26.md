# Liquid Glass iOS 26 质感强化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Liquid Glass 风格在激活时呈现 iOS 26 式液态玻璃质感（高透明 + 强模糊/饱和 + 镜面边缘高光 + 斜向光泽），并修复其规则被毛玻璃开关遮盖的特异性问题。

**Architecture:** 仅替换 `src/themes/liquidGlass.ts` 中 `liquidGlassStyle.style.css` 的 CSS 文本：选择器加 `:root:root` 前缀（与 `:root[data-glass] .glass` 同特异性，注入 stylesheet 位置靠后而胜出），并加入边缘高光/暗边/投影/斜向光泽。规格见 `docs/superpowers/specs/2026-07-17-liquid-glass-ios26-design.md`。

**Tech Stack:** TypeScript + Vitest。

## Global Constraints

- 只修改 `src/themes/liquidGlass.ts` 与 `src/themes/themes.test.ts`。
- CSS 必须全部基于 CSS 变量（`hsl(var(--bg-000) / …)`、`hsl(var(--always-white) / …)` 等），不得写死具体颜色。
- 只覆盖 `border-color`，不设置 border 宽度。
- 提交信息使用英文 Conventional Commits。
- 不修改 `.glass` / `.glass-alt` 之外的任何选择器，不改 radius/shadows token。

---

### Task 1: 强化 liquidGlass 风格 CSS + 特异性回归测试

**Files:**
- Modify: `src/themes/liquidGlass.ts`（仅 `css` 模板字符串，`liquidGlassStyle` 定义内）
- Test: `src/themes/themes.test.ts`（追加一个 describe 块）

**Interfaces:**
- Consumes: 现有 `liquidGlassStyle: ThemeStylePreset`（`src/themes/liquidGlass.ts:123-148`）
- Produces: 同一导出 `liquidGlassStyle`，`style.css` 内容更新；无新接口

- [ ] **Step 1: 写失败测试**

在 `src/themes/themes.test.ts` 末尾追加：

```ts
describe('liquid glass style specificity', () => {
  it('glass rules use :root:root prefix so they are not masked by the data-glass toggle', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    // 与 index.css 中 :root[data-glass] .glass 同特异性，且注入顺序靠后而胜出
    expect(css).toContain(':root:root .glass')
    expect(css).toContain(':root:root .glass-alt')
    // 不允许出现无前缀的裸 glass 选择器（会被 :root[data-glass] 规则遮盖）
    const bareSelector = /(^|\n)\s*\.glass(-alt)?\s*\{/
    expect(bareSelector.test(css)).toBe(false)
  })
})
```

注：`builtinStyleThemes` 已在该文件的导入中，无需改 import。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（当前 css 使用裸 `.glass {` 选择器，`toContain(':root:root .glass')` 不成立）

- [ ] **Step 3: 替换风格 CSS**

在 `src/themes/liquidGlass.ts` 中，把 `css:` 的模板字符串（当前第 136-146 行）整体替换为：

```ts
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
}`,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts src/store/themeStore.test.ts`
Expected: PASS（全部通过，含新增特异性用例）

- [ ] **Step 5: 全量校验**

Run: `npm run typecheck && npm run lint`
Expected: 无错误（允许既有的 27 条 warning）

- [ ] **Step 6: Commit**

```bash
git add src/themes/liquidGlass.ts src/themes/themes.test.ts
git commit -m "feat(themes): strengthen Liquid Glass to iOS 26-style specular glass"
```
