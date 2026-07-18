# Liquid Glass codex 化重构设计

日期：2026-07-18
状态：已获用户确认

## 背景

多轮液态玻璃迭代（折射引擎 + 边缘光学）仍未达到用户期望。用户以 codex 桌面应用截图（`codex.png`、`codex-search.png`）为新参照重构：

- codex 主窗：淡青绿环境底（壁纸透出感）、白色内容区悬浮、侧栏淡色半透明、右侧面板白卡悬浮
- codex 搜索：白色 pill 搜索框 + 淡色高亮选中行
- codex 的磨砂源自**桌面壁纸透过**（macOS vibrancy / Windows acrylic 类窗效）

已确认决策：

- **主题显示名改为 Codex**：`liquidGlassTheme.name` 与 `liquidGlassStyle.name` 由 `'Liquid Glass'` 改为 `'Codex'`；内部 id 保持 `liquid-glass` 不变（避免 localStorage/设置备份的数据迁移）
- **停用折射引擎**（codex 为干净磨砂，无透镜扭曲；引擎代码保留）
- **做 Tauri 窗效**（Windows acrylic、macOS vibrancy；Linux/Web/Android 回退淡色底）
- **保留默认过渡动画**（不新增任何动效）

## 详细设计

### 1. 风格 css 重写（`src/themes/liquidGlass.ts`，色板与 radius/shadows token 不动）

- **环境回退底色**（非窗效环境）：
  `:root:root body { background: linear-gradient(160deg, hsl(var(--accent-main-100) / 0.08), hsl(var(--bg-100)) 45%), hsl(var(--bg-100)); }`（淡青绿倾向，由 accent 变量驱动，light/dark 自适应）
  同时 `#root`、`[data-lq-app]`、`.desktop-titlebar` 需透明以透出 body（恢复上一轮的三个透明化规则）。
- **窗效开启变体**：`:root:root[data-window-effect] body { background: transparent; }`（真壁纸透出）。
- **agent 聊天窗口**（`[data-lq-surface="chat"]`）：白底不透明 `hsl(var(--bg-000))`（dark 为 `hsl(var(--bg-100))`）、四角全圆 `var(--radius-2xl)`、软阴影 `0 8px 32px hsl(var(--always-black) / 0.1)`、**无 backdrop-filter**。
- **侧边栏/右侧/底部面板**（`[data-lq-surface="sidebar"]`、`[data-lq-surface="right"]`、`[data-lq-surface="bottom"]`）：淡色半透明 `hsl(var(--bg-000) / 0.55)` + `blur(16px) saturate(150%)` + 同样的圆角与阴影（dark 用 `hsl(var(--bg-100) / 0.55)`）。通过 `[data-lq-surface]:not([data-lq-surface='chat'])` 选择器实现分组规则。
- **输入框等浮层（`.glass`）**：蓝色磨砂——`background-color: hsl(var(--accent-main-100) / 0.16)`、`blur(20px) saturate(160%) brightness(1.05)`、顶部高光细边 + 底部暗角（沿用现有边缘光学六层 box-shadow）、`border-color: hsl(var(--border-300) / 0.6)`。`--tw-ring-shadow` 类 ring 与 accent 边框被玻璃规则覆盖（ring 基于 box-shadow，已被六层阴影覆盖；`border-color` 由玻璃规则统一定义），实现"去蓝圈"无需改组件。`.glass-alt` 改为 `hsl(var(--accent-main-100) / 0.12)` 同链。
- **搜索框（`[data-lq-glass]`）**：codex 式白色 pill——`background-color: hsl(var(--bg-000) / 0.85)`、`border-color: hsl(var(--border-300) / 0.6)`、`border-radius: var(--radius-lg)`、细软阴影、**无 backdrop-filter**；focus-visible 恢复聚焦环（沿用现有修复）。
- **选中会话项**：淡色高亮 `background-color: hsl(var(--accent-main-100) / 0.1)`（复用 `[data-lq-glass]` 规则中的分离选择器或并列规则）。
- **停用折射**：`liquidGlassStyle` 移除 `effects: ['liquid-refraction']`。
- 边缘光学（高光/暗角/分层阴影）沿用现有成果；移动端、分屏模式不变。

### 2. Tauri 壁纸磨砂

- **Rust**（`src-tauri/`）：
  - `Cargo.toml` 加 `window-vibrancy = "0.6"`（以 crates.io 当前兼容版本为准）
  - 新增 command：
    ```rust
    #[tauri::command]
    fn set_window_effect(window: tauri::Window, enabled: bool) {
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
  - 在 `invoke_handler` 中注册（找到现有 `generate_handler!` 处追加）。
  - `tauri.conf.json` 的窗口配置加 `"transparent": true`（acrylic/vibrancy 的前提；未启用窗效的平台 body 背景仍由主题色板覆盖，无观感影响）。
- **JS**（`src/store/themeStore.ts`）：
  - `applyTheme()` 中，当前有效风格为 `liquid-glass` 且 `isTauri()` 时 `invoke('set_window_effect', { enabled: true })` 并给 `<html>` 设 `data-window-effect`；否则 `enabled: false` 并移除该属性。invoke 失败静默降级（保持淡绿回退底，不设属性）。
  - `isTauri()` 已存在于 `src/utils/tauri.ts`。

### 3. 范围边界

- 折射引擎代码保留（`src/lib/liquidGlass/` 不动），仅 liquid-glass 风格不再声明 `liquid-refraction`；`[data-lq-surface]`/`[data-lq-glass]` 钩子保留给 css 使用。
- 不修改 codex 参照之外的组件结构（InputBox 蓝圈纯 css 覆盖）。
- Tauri 窗效只认 `liquid-glass` 风格；其他风格不受影响。

## 测试

- `src/themes/themes.test.ts`：断言蓝磨砂填充 `hsl(var(--accent-main-100) / 0.16)`、白底 chat 规则、`[data-lq-glass]` 白 pill、`liquidGlassStyle.effects` 不含 `liquid-refraction`（或 undefined）。
- `src/store/themeStore.test.ts`：liquid-glass 下 `isLiquidGlassRunning() === false`（更新现有断言为停用语义）。
- Rust：`cargo check --manifest-path src-tauri/Cargo.toml` 通过。
- 全量 `npm run validate`；Windows 桌面端实机验收（壁纸透出、白底聊天窗、蓝磨砂输入框）。

## 涉及文件

- 修改：`src/themes/liquidGlass.ts`、`src/themes/themes.test.ts`、`src/store/themeStore.ts`、`src/store/themeStore.test.ts`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/src/`（command 定义与注册的具体文件以实现时定位为准）、`src-tauri/tauri.conf.json`
