# Liquid Glass codex 化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Liquid Glass 重构为 codex 式观感（改名 Codex）：白底悬浮聊天窗（四角全圆）、淡色半透明侧栏、蓝色磨砂输入框、搜索白 pill、停用折射引擎；并通过 Tauri 窗效（Windows acrylic / macOS vibrancy）实现壁纸级磨砂，非窗效环境回退淡青绿底色。

**Architecture:** css 重写集中在 `src/themes/liquidGlass.ts`；窗效为 Rust command（`set_window_effect`）+ themeStore 按当前风格 invoke，成功后给 `<html>` 设 `data-window-effect` 让背景透明。规格见 `docs/superpowers/specs/2026-07-18-liquid-glass-codex-redesign-design.md`。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Vitest（jsdom）+ Tauri 2（Rust）。

## Global Constraints

- 主题显示名改为 `Codex`（两处：liquidGlassTheme.name、liquidGlassStyle.name）；id 保持 `liquid-glass` 不变。
- 风格 css 必须基于 CSS 变量，不得写死具体颜色（acrylic tint 的 RGBA 是 Rust 侧唯一例外）。
- 停用折射：仅移除 `liquidGlassStyle.style.effects`，`src/lib/liquidGlass/` 引擎代码不动。
- 保留默认过渡动画，不新增任何动效。
- 选中会话项用新钩子 `data-lq-selected`（替代 Task 4 挂载的 `data-lq-glass`，搜索框保留 `data-lq-glass`）。
- 本环境无 Rust 工具链：`cargo check` 无法本地执行，Rust 代码的编译验证由 CI（标签构建）把关，实现时必须严格按给定代码。
- 提交信息使用英文 Conventional Commits；已知 4 个 main 上既有测试失败与本计划无关。

---

### Task 1: codex 化 css 重写 + 改名 + 停折射

**Files:**
- Modify: `src/themes/liquidGlass.ts`（两处 name、删除 effects、css 模板字符串重写）
- Modify: `src/features/chat/sidebar/ActiveSessionItem.tsx`（`data-lq-glass` → `data-lq-selected`）
- Test: `src/themes/themes.test.ts`（更新断言）

**Interfaces:**
- Consumes: 现有 liquidGlassStyle、悬浮布局钩子
- Produces: css 含 `[data-lq-selected]` 规则；`liquidGlassStyle.style.effects` 不存在；两处 name 为 `'Codex'`

- [ ] **Step 1: 更新失败测试**

`src/themes/themes.test.ts` 的 `describe('liquid glass floating layout css', ...)` 块整体替换为：

```ts
describe('liquid glass floating layout css', () => {
  it('declares codex-style surfaces, blue frosted glass and window-effect transparency', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    expect(css).not.toContain('radial-gradient')
    // 蓝色磨砂输入框
    expect(css).toContain('hsl(var(--accent-main-100) / 0.16)')
    expect(css).toContain('blur(20px)')
    // 白底聊天窗口与淡色侧栏
    expect(css).toContain('background-color: hsl(var(--bg-000));')
    expect(css).toContain('hsl(var(--bg-000) / 0.55)')
    // 搜索白 pill 与选中高亮
    expect(css).toContain('hsl(var(--bg-000) / 0.85)')
    expect(css).toContain('[data-lq-selected]')
    // 窗效透明变体
    expect(css).toContain('[data-window-effect]')
    // 悬浮布局保留
    expect(css).toContain('@media (min-width: 768px)')
  })

  it('uses Codex as display name and declares no refraction effect', () => {
    const lgTheme = builtinThemes.find(t => t.id === 'liquid-glass')
    const lgStyle = builtinStyleThemes.find(s => s.id === 'liquid-glass')
    expect(lgTheme?.name).toBe('Codex')
    expect(lgStyle?.name).toBe('Codex')
    expect(lgStyle?.style.effects ?? []).not.toContain('liquid-refraction')
  })
})
```

并删除 `describe('style effects flags', ...)` 中的 `const lg = builtinStyleThemes.find(s => s.id === 'liquid-glass')` 与 `expect(lg?.style.effects).toContain('liquid-refraction')` 两行（该 describe 的数组类型校验循环保留）。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（新断言不满足）

- [ ] **Step 3: 重写 liquidGlass.ts**

对 `src/themes/liquidGlass.ts`：

1. `liquidGlassTheme` 的 `name: 'Liquid Glass'` → `name: 'Codex'`；`liquidGlassStyle` 的 `name: 'Liquid Glass'` → `name: 'Codex'`。
2. 删除 `liquidGlassStyle.style` 中的 `effects: ['liquid-refraction'],` 行。
3. `css:` 模板字符串整体替换为：

```css
/* 输入框等浮层：蓝色磨砂液态玻璃 */
:root:root .glass,
:root:root .glass-alt {
  -webkit-backdrop-filter: blur(20px) saturate(160%) brightness(1.05);
  backdrop-filter: blur(20px) saturate(160%) brightness(1.05);
  border-color: hsl(var(--border-300) / 0.6);
  box-shadow:
    inset 0 0 0 0.5px hsl(var(--always-white) / 0.35),
    inset 0 1px 0 0 hsl(var(--always-white) / 0.5),
    inset 0 -2px 6px -2px hsl(var(--always-black) / 0.12),
    0 2px 8px hsl(var(--always-black) / 0.06),
    0 8px 24px hsl(var(--always-black) / 0.1),
    0 16px 48px hsl(var(--always-black) / 0.1);
}

:root:root .glass {
  background-color: hsl(var(--accent-main-100) / 0.16);
  background-image: linear-gradient(
    135deg,
    hsl(var(--always-white) / 0.06) 0%,
    hsl(var(--always-white) / 0.02) 35%,
    transparent 60%
  );
}

:root:root .glass-alt {
  background-color: hsl(var(--accent-main-100) / 0.12);
  background-image: linear-gradient(
    135deg,
    hsl(var(--always-white) / 0.05) 0%,
    hsl(var(--always-white) / 0.015) 35%,
    transparent 60%
  );
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
  :root:root [data-lq-layout] {
    padding: 10px;
    gap: 10px;
  }

  :root:root [data-lq-column] {
    gap: 10px;
  }

  /* agent 聊天窗口：白底悬浮卡片（四角全圆） */
  :root:root [data-lq-surface='chat'] {
    border: none;
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-000));
    box-shadow:
      0 2px 8px hsl(var(--always-black) / 0.05),
      0 12px 32px hsl(var(--always-black) / 0.1),
      0 24px 64px hsl(var(--always-black) / 0.08);
  }

  /* 侧栏/右侧/底部面板：淡色半透明悬浮 */
  :root:root [data-lq-surface]:not([data-lq-surface='chat']) {
    border: none;
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-000) / 0.55);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    backdrop-filter: blur(16px) saturate(150%);
    box-shadow:
      0 2px 8px hsl(var(--always-black) / 0.05),
      0 12px 32px hsl(var(--always-black) / 0.1);
  }

  :root:root [data-lq-header] {
    background-color: transparent;
  }

  :root:root [data-lq-header-fade] {
    --tw-gradient-from: hsl(var(--bg-000));
    --tw-gradient-to: hsl(var(--bg-000) / 0);
  }
}
```

4. `src/features/chat/sidebar/ActiveSessionItem.tsx`：`data-lq-glass={isSelected || undefined}` → `data-lq-selected={isSelected || undefined}`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/themes/liquidGlass.ts src/themes/themes.test.ts src/features/chat/sidebar/ActiveSessionItem.tsx
git commit -m "feat(themes): redesign liquid glass as Codex with white floating chat and blue frosted glass"
```

---

### Task 2: themeStore 窗效接线 + 引擎停用语义

**Files:**
- Modify: `src/store/themeStore.ts`（applyWindowEffect + 调用）
- Test: `src/store/themeStore.test.ts`（更新引擎生命周期断言）

**Interfaces:**
- Consumes: `isTauri()`（`src/utils/tauri.ts`）、`resolveStyleId` 解析出的 styleId
- Produces: themeStore 在 liquid-glass 激活时 invoke `set_window_effect` 并设 `data-window-effect`

- [ ] **Step 1: 更新失败测试**

`src/store/themeStore.test.ts` 的 `describe('liquid glass engine lifecycle', ...)` 块整体替换为：

```ts
describe('liquid glass engine lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    themeStore.setPreset('eucalyptus')
    themeStore.setStyleId('auto')
  })

  it('does not start the engine for liquid-glass (refraction disabled)', () => {
    themeStore.setPreset('liquid-glass')
    expect(isLiquidGlassRunning()).toBe(false)
  })

  it('does not start the engine for other styles either', () => {
    for (const preset of ['material', 'retro-terminal', 'ocean']) {
      themeStore.setPreset(preset)
      expect(isLiquidGlassRunning()).toBe(false)
    }
  })

  it('keeps the engine stopped when styleId is none', () => {
    themeStore.setPreset('liquid-glass')
    themeStore.setStyleId('none')
    expect(isLiquidGlassRunning()).toBe(false)
  })
})
```

（`afterEach(() => stopLiquidGlass())` 保留不动。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/store/themeStore.test.ts`
Expected: FAIL（当前 liquid-glass 会启动引擎）

- [ ] **Step 3: 实现窗效接线**

`src/store/themeStore.ts`：

1. 顶部导入追加（`isTauri` 如未导入）：

```ts
import { isTauri } from '../utils/tauri'
```

2. 新增私有方法（放在 `applyGlassClass()` 附近）：

```ts
  /**
   * Tauri 桌面窗效：liquid-glass 风格时启用壁纸磨砂（Windows acrylic / macOS vibrancy）。
   * 启用成功给 <html> 设 data-window-effect 让背景透明（透出真壁纸）；
   * 禁用/失败时保持淡青绿回退底。非 Tauri 环境（Web/Android）直接跳过。
   */
  private applyWindowEffect(styleId: string | undefined) {
    if (!isTauri()) return
    const enabled = styleId === 'liquid-glass'
    const root = document.documentElement
    if (!enabled) {
      root.removeAttribute('data-window-effect')
    }
    void import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('set_window_effect', { enabled }))
      .then(() => {
        if (enabled) root.setAttribute('data-window-effect', '')
      })
      .catch(() => {
        // 窗效不可用时静默降级，保持回退底色
      })
  }
```

3. `applyTheme()` 中，把第 2 步解析 styleId 的局部变量提升：原 `const styleId = resolveStyleId(this.state.styleId, preset)` 保留不变；在方法最末尾（引擎启停块之后）追加：

```ts
    // 6. Tauri 窗效（liquid-glass 风格启用壁纸磨砂）
    this.applyWindowEffect(styleId)
```

（注意 `styleId` 需与 `style` 一样提升为函数级可访问——当前代码中 `const styleId = resolveStyleId(...)` 在 `if (preset)` 块内，需把声明提升到块外：`let styleId: string | undefined`，块内赋值。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/store/themeStore.test.ts src/themes/themes.test.ts`
Expected: PASS（jsdom 中 isTauri() 为 false，窗效路径不触发）

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/store/themeStore.ts src/store/themeStore.test.ts
git commit -m "feat(theme): toggle Tauri window effect with codex style"
```

---

### Task 3: Tauri Rust 窗效（acrylic / vibrancy）

**Files:**
- Create: `src-tauri/src/app/commands/window_effects.rs`
- Modify: `src-tauri/src/app/commands/mod.rs`、`src-tauri/src/app/mod.rs`（注册 command）、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: Task 2 的 `invoke('set_window_effect', { enabled })`
- Produces: tauri command `set_window_effect(enabled: bool)`

**注意：** 本环境无 Rust 工具链，无法 `cargo check`——必须严格按给定代码书写；编译由 CI 标签构建验证。`Cargo.lock` 无法本地更新，CI 构建时由 cargo 解析（tauri-action 默认非 `--locked`）。

- [ ] **Step 1: 加依赖与透明窗口**

`src-tauri/Cargo.toml` 的 `[dependencies]` 段追加：

```toml
window-vibrancy = "0.6"
```

`src-tauri/tauri.conf.json` 的窗口配置（`"dragDropEnabled": true` 之后）追加一行：

```json
        "transparent": true
```

- [ ] **Step 2: 新增 command**

创建 `src-tauri/src/app/commands/window_effects.rs`：

```rust
/// 壁纸磨砂窗效开关：liquid-glass（Codex）风格激活时由前端调用。
/// Windows 用 acrylic（淡青绿 tint），macOS 用 vibrancy（UnderWindowBackground），
/// 其他平台 no-op。
#[tauri::command]
pub fn set_window_effect(window: tauri::Window, enabled: bool) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_acrylic;
        let _ = if enabled {
            apply_acrylic(&window, Some((226, 240, 232, 160)))
        } else {
            apply_acrylic(&window, None)
        };
    }
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        if enabled {
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::UnderWindowBackground, None, None);
        } else {
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::WindowBackground, None, None);
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (&window, enabled);
    }
}
```

- [ ] **Step 3: 注册 command**

`src-tauri/src/app/commands/mod.rs` 追加（保持现有 mod 声明顺序风格）：

```rust
pub mod window_effects;
```

`src-tauri/src/app/mod.rs` 的 `tauri::generate_handler![...]`（约 455-469 行）列表中追加一行：

```rust
            commands::window_effects::set_window_effect,
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/src/app/commands/window_effects.rs src-tauri/src/app/commands/mod.rs src-tauri/src/app/mod.rs
git commit -m "feat(tauri): add window vibrancy/acrylic effect command"
```

---

### Task 4: 全量验证、冒烟与出包

**Files:** 无（纯验证）

- [ ] **Step 1: 全量验证**

Run: `npm run validate`
Expected: typecheck、lint、build 通过；测试仅剩 4 个 main 上既有失败

- [ ] **Step 2: 打 tag 触发 CI（用户已授权固定流程）**

```bash
git push origin feat/multi-style-themes
git tag -a v0.6.32-beta.2 -m "feat: codex-style liquid glass redesign + tauri window vibrancy"
git push origin v0.6.32-beta.2
```

CI 同时验证 Rust 编译（含 window-vibrancy 依赖解析）与各平台构建。

- [ ] **Step 3: 手动冒烟（交给用户）**

1. Windows 桌面端安装新包：选 Codex 主题——背景透出桌面壁纸（acrylic 淡青绿 tint）；聊天窗为白底悬浮卡片（四角全圆）；侧栏淡色半透明；输入框蓝色磨砂无外圈蓝线；搜索框白色 pill；选中会话淡色高亮。
2. Web/Android（无窗效）：背景为淡青绿渐变回退底，其余观感一致。
3. 切走主题：窗效关闭，背景恢复不透明，无残留。
