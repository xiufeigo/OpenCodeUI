# Liquid Glass 清透感重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Liquid Glass 从"半透明+高模糊"的磨砂塑料感重做为目标参考（Kyant0/AndroidLiquidGlass）式的完全透明玻璃：填充降至 15-25%、模糊降至 16px、大面板接入折射引擎、撤除环境渐变；并把设置页的界面风格选择器改为网格卡片（窄屏垂直排列）。

**Architecture:** 质感参数集中在 `src/themes/liquidGlass.ts` 的 css 与 `src/lib/liquidGlass/engine.ts` 的两个常量（GLASS_SELECTOR / BACKDROP_CHAIN）；风格选择器改网格仅动 `AppearanceSettings.tsx` 一处与两份 locale 文件。规格见 `docs/superpowers/specs/2026-07-18-liquid-glass-clarity-rework-design.md`。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Vitest（jsdom）。

## Global Constraints

- 风格 css 必须基于 CSS 变量，不得写死具体颜色。
- 只改参数与选择器，不动位移图算法与引擎生命周期逻辑。
- 悬浮布局规则（`@media (min-width: 768px)` 内的 padding/gap/header）保留，仅更新 surface 填充与模糊值。
- 嵌套 backdrop-filter 预案不在本轮实施（以用户冒烟结果为准）。
- 提交信息使用英文 Conventional Commits。
- 测试命令：`npx vitest run <file>`；全量验证 `npm run validate`（已知 4 个 main 上既有失败用例与本计划无关）。

---

### Task 1: 清透质感参数 + 撤除环境背景

**Files:**
- Modify: `src/themes/liquidGlass.ts`（css 模板字符串）
- Modify: `src/lib/liquidGlass/engine.ts:13-14`（两个常量）
- Test: `src/themes/themes.test.ts`（更新 floating layout 断言）、`src/lib/liquidGlass/engine.test.ts`（更新 blur 断言）

**Interfaces:**
- Consumes: 现有 `liquidGlassStyle.style.css`、`engine.ts` 的 `BACKDROP_CHAIN`
- Produces: 无新接口（参数变更）

- [ ] **Step 1: 更新失败测试**

`src/themes/themes.test.ts` 的 `describe('liquid glass floating layout css', ...)` 块（当前 `src/themes/themes.test.ts:137-145`）整体替换为：

```ts
describe('liquid glass floating layout css', () => {
  it('declares clear-glass surfaces and desktop media query, without ambient background', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    // 环境渐变已撤除（背景保持主题原样）
    expect(css).not.toContain('radial-gradient')
    // 大面板清透填充 + 16px 模糊
    expect(css).toContain('hsl(var(--bg-100) / 0.2)')
    expect(css).toContain('blur(16px)')
    // 悬浮布局保留
    expect(css).toContain('[data-lq-layout]')
    expect(css).toContain('[data-lq-surface]')
    expect(css).toContain('@media (min-width: 768px)')
  })
})
```

`src/lib/liquidGlass/engine.test.ts` 中 `expect(el.style.getPropertyValue('backdrop-filter')).toContain('blur(36px)')` 改为：

```ts
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('blur(16px)')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts src/lib/liquidGlass/engine.test.ts`
Expected: FAIL（css 仍含 radial-gradient 与旧参数）

- [ ] **Step 3: 修改 css 参数与撤除环境背景**

对 `src/themes/liquidGlass.ts` 的 `liquidGlassStyle.style.css` 做以下编辑（行号为当前文件参考）：

1. `.glass, .glass-alt` 共享块（第 136-145 行）的两行 `blur(36px) saturate(200%) brightness(1.05)` 改为 `blur(16px) saturate(160%) brightness(1.05)`（`-webkit-` 行与标准行都改）。
2. `.glass` 块（第 147-155 行）：`background-color: hsl(var(--bg-000) / 0.5);` 改为 `hsl(var(--bg-000) / 0.22)`；sheen 渐变两个 stop `hsl(var(--always-white) / 0.1) 0%` → `0.06`、`hsl(var(--always-white) / 0.03) 35%` → `0.02`。
3. `.glass-alt` 块（第 157-165 行）：`background-color: hsl(var(--bg-100) / 0.42);` 改为 `hsl(var(--bg-100) / 0.18)`；sheen 渐变两个 stop `hsl(var(--always-white) / 0.09) 0%` → `0.05`、`hsl(var(--always-white) / 0.02) 35%` → `0.015`。
4. 删除环境背景三个规则块（第 167-186 行整段）：`/* 环境渐变底色… */ :root:root body { background: radial-gradient(...) }`、`/* 让环境底色透出… */ :root:root #root {…}`、`:root:root [data-lq-app] {…}`、`:root:root .desktop-titlebar {…}`。
5. `[data-lq-surface]` 块（第 199-206 行）：`background-color: hsl(var(--bg-100) / 0.72);` 改为 `hsl(var(--bg-100) / 0.2)`；两行 `blur(24px) saturate(180%)` 改为 `blur(16px) saturate(160%)`。
6. `[data-lq-header-fade]` 块（第 212-215 行）：`--tw-gradient-from: hsl(var(--bg-100) / 0.72);` 改为 `hsl(var(--bg-100) / 0.2)`（与面板填充一致）。

- [ ] **Step 4: 同步引擎磨砂链**

`src/lib/liquidGlass/engine.ts` 第 14 行：

```ts
const BACKDROP_CHAIN = 'blur(16px) saturate(160%) brightness(1.05)'
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts src/lib/liquidGlass/engine.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/themes/liquidGlass.ts src/lib/liquidGlass/engine.ts src/themes/themes.test.ts src/lib/liquidGlass/engine.test.ts
git commit -m "feat(liquid-glass): rework to clear-glass look, drop ambient background"
```

---

### Task 2: 大面板接入折射引擎

**Files:**
- Modify: `src/lib/liquidGlass/engine.ts:13`（GLASS_SELECTOR）
- Test: `src/lib/liquidGlass/engine.test.ts`（新增用例）

**Interfaces:**
- Consumes: 现有引擎生命周期（Task 1 后的代码）
- Produces: `GLASS_SELECTOR = '.glass, .glass-alt, [data-lq-surface]'`

- [ ] **Step 1: 写失败测试**

`src/lib/liquidGlass/engine.test.ts` 的 `describe('liquid glass engine', ...)` 内追加：

```ts
  it('start also picks up [data-lq-surface] panels', () => {
    const el = document.createElement('div')
    el.setAttribute('data-lq-surface', 'chat')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(FAKE_RECT)
    document.body.appendChild(el)
    startLiquidGlass()
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
  })
```

（`FAKE_RECT` 已在该文件定义，无需新增。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/liquidGlass/engine.test.ts`
Expected: FAIL（新用例的 backdrop-filter 为空）

- [ ] **Step 3: 扩展选择器**

`src/lib/liquidGlass/engine.ts` 第 13 行改为：

```ts
const GLASS_SELECTOR = '.glass, .glass-alt, [data-lq-surface]'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/liquidGlass/`
Expected: PASS（全部通过）

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidGlass/engine.ts src/lib/liquidGlass/engine.test.ts
git commit -m "feat(liquid-glass): refract floating surfaces as well"
```

---

### Task 3: 界面风格选择器网格化

**Files:**
- Modify: `src/features/settings/components/AppearanceSettings.tsx`（替换 uiStyle 区块）
- Modify: `src/locales/en/settings.json`、`src/locales/zh-CN/settings.json`（各加 2 个文案）

**Interfaces:**
- Consumes: `useTheme()` 已暴露的 `styleId` / `setStyleId` / `availableStylePresets`
- Produces: 无新接口（纯 UI）

- [ ] **Step 1: 添加 i18n 文案**

`src/locales/en/settings.json` 的 `"uiStyleNone": "None",` 之后追加：

```json
    "uiStyleAutoDesc": "Use the style bundled with the color theme",
    "uiStyleNoneDesc": "Colors only, no extra style effects",
```

`src/locales/zh-CN/settings.json` 的 `"uiStyleNone": "无",` 之后追加：

```json
    "uiStyleAutoDesc": "使用颜色主题配套的界面风格",
    "uiStyleNoneDesc": "仅颜色，无额外风格效果",
```

- [ ] **Step 2: 替换选择器为网格卡片**

`src/features/settings/components/AppearanceSettings.tsx` 的 uiStyle `SettingsSection`（当前第 583-594 行）整体替换为：

```tsx
      <SettingsSection title={t('appearance.uiStyle')}>
        <p className="text-[length:var(--fs-sm)] text-text-400">{t('appearance.uiStyleDesc')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { id: 'auto', name: t('appearance.uiStyleAuto'), description: t('appearance.uiStyleAutoDesc') },
            { id: 'none', name: t('appearance.uiStyleNone'), description: t('appearance.uiStyleNoneDesc') },
            ...availableStylePresets,
          ].map(option => {
            const isActive = styleId === option.id
            return (
              <button
                key={option.id}
                onClick={() => setStyleId(option.id)}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-all text-left w-full
                  ${
                    isActive
                      ? 'border-accent-main-100/60 bg-accent-main-100/5 ring-1 ring-accent-main-100/20'
                      : 'border-border-200/50 hover:border-border-300 hover:bg-bg-100/50'
                  }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[length:var(--fs-md)] font-medium text-text-100">{option.name}</span>
                    {isActive && <CheckIcon size={12} className="text-accent-main-100 shrink-0" />}
                  </div>
                  <div className="text-[length:var(--fs-xs)] text-text-400 mt-0.5">{option.description}</div>
                </div>
              </button>
            )
          })}
        </div>
      </SettingsSection>
```

注：`CheckIcon`、`SettingsSection` 均已在该文件导入（PresetCard 正在使用）；`SegmentedControl` 的 import 保留（颜色模式区块仍在用）。

- [ ] **Step 3: 校验**

Run: `npm run typecheck && npm run lint`
Expected: 无错误

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/components/AppearanceSettings.tsx src/locales/en/settings.json src/locales/zh-CN/settings.json
git commit -m "feat(settings): render interface style options as wrapping cards"
```

---

### Task 4: 全量验证与手动冒烟

**Files:** 无（纯验证）

- [ ] **Step 1: 全量验证**

Run: `npm run validate`
Expected: typecheck、lint、build 通过；测试仅剩 4 个 main 上既有失败

- [ ] **Step 2: 手动冒烟（交给用户在 dev server 中确认）**

Run: `npm run dev`，依次确认：

1. Liquid Glass 下：背景恢复主题原样（无渐变）；悬浮大面板清透可见后方聊天内容，边缘有折射透镜感。
2. 输入框/菜单/对话框：完全透明玻璃质感（清透、边缘高光、折射），文字可读性可接受。
3. 输入框与 MentionMenu/SlashCommandMenu 在大面板内的模糊/折射是否正常（嵌套 backdrop-filter 观察项）。
4. 设置页「界面风格」：5 个选项以网格卡片呈现，窄窗口下单列垂直排列；选择与切换正常。
5. 日夜模式、切换其他主题/风格：无残留、恢复正常。
