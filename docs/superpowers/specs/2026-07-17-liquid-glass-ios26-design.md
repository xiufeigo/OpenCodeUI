# Liquid Glass 主题 iOS 26 质感强化设计

日期：2026-07-17
状态：已获用户确认

## 背景

Liquid Glass 主题（`src/themes/liquidGlass.ts`）当前玻璃质感不强，根因有二：

1. **特异性问题**：风格 css 用 `.glass` / `.glass-alt`（特异性 0-1-0），而 `src/index.css` 中 `:root[data-glass] .glass`（0-3-0）优先级更高。毛玻璃开关默认开启（`DEFAULT_GLASS_EFFECT = true`），因此风格定义的高质感参数（alpha 0.62、blur 28px）从未生效，实际渲染的是开关的较弱规则（alpha 0.82、blur 22px）。
2. **表现层单薄**：仅有半透明 + 模糊，缺少 iOS 26 Liquid Glass 的镜面边缘高光、折射暗边与斜向光泽。

## 目标

风格激活时呈现 iOS 26 式液态玻璃：更高透明度、更强模糊/饱和、镜面边缘高光、斜向光泽。仅改表现，不改色板/圆角/布局，不加环境渐变底色（用户已确认）。

## 设计

仅修改 `src/themes/liquidGlass.ts` 的 `liquidGlassStyle.style.css`，替换为：

```css
:root:root .glass,
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
  background-image: linear-gradient(135deg,
    hsl(var(--always-white) / 0.1) 0%,
    hsl(var(--always-white) / 0.03) 35%,
    transparent 60%);
}

:root:root .glass-alt {
  background-color: hsl(var(--bg-100) / 0.42);
  background-image: linear-gradient(135deg,
    hsl(var(--always-white) / 0.09) 0%,
    hsl(var(--always-white) / 0.02) 35%,
    transparent 60%);
}
```

设计决策：

- **特异性**：`:root:root .glass`（0-3-0）与 `:root[data-glass] .glass` 同特异性；注入的 `<style id="opencode-theme-vars">` 位于 index.css 之后，同优先级后者胜 → 风格激活时恒定生效，开关不再遮盖；风格未激活时零影响。
- **变量化**：`--always-white` / `--always-black` 在 index.css `:root` 有默认值，风格叠加任意色板均安全（可叠加原则的延续）。
- **边框**：只覆盖 `border-color`，宽度仍由组件的 Tailwind `border` 类控制。
- **投影**：box-shadow 栈内含外阴影，覆盖组件自身 shadow 类后仍保留浮层感。
- **透明度**：glass 0.62→0.5、glass-alt 0.55→0.42；靠 blur(36px) + saturate(200%) 维持可读性（与 iOS 26 同思路）。
- **亮度**：backdrop-filter 加 brightness(1.05)，模拟 iOS 玻璃对背景的提亮。

## 范围边界

- 不新增表面选择器（`.glass`/`.glass-alt` 已覆盖 Dialog、DropdownMenu、CommandPalette、InputBox、SidePanel、Toast 等 17 处浮层）。
- 不改 `--radius-*` / `--shadow-*` token、不改色板、不改毛玻璃开关逻辑。

## 测试

- `src/themes/themes.test.ts` 新增回归断言：`liquidGlassStyle.style.css` 中的 `.glass` / `.glass-alt` 规则必须以 `:root:root` 前缀书写（防止特异性问题复发）。
- 全量 `npm run validate`；视觉效果由用户在 dev server 手动确认。

## 涉及文件

- 修改：`src/themes/liquidGlass.ts`、`src/themes/themes.test.ts`
