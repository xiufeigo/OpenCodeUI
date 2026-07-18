# Liquid Glass 边缘光学重做设计

日期：2026-07-18
状态：已获用户确认

## 背景

清透版（`docs/superpowers/specs/2026-07-18-liquid-glass-clarity-rework-design.md`）上线后，用户对照 Kyant0 参考图（`ios_inner_refraction.png`、`homescreen.png`）反馈：聊天框是"白色半透胶囊"而非玻璃；所有边框缺少参考图的**高光、扭曲、暗角**；外围阴影在浅色模式下不可见，悬浮面板平贴无立体感。

根因：边缘光学太弱（顶缘高光 alpha 0.22、底部暗边 0.05、阴影 black/0.1），浅色模式下白底+白填充无边界；折射强度集中在四角且量小。

## 设计（仅参数与边缘光学，不动架构）

### 1. 锐利镜面描边（`.glass` / `.glass-alt` 共享块，`src/themes/liquidGlass.ts`）

现有 box-shadow 替换为：

```css
box-shadow:
  inset 0 0 0 0.5px hsl(var(--always-white) / 0.35),   /* 一圈细亮边 */
  inset 0 1px 0 0 hsl(var(--always-white) / 0.5),      /* 顶部强镜面高光 */
  inset 0 -2px 6px -2px hsl(var(--always-black) / 0.12), /* 底部+两角暗角 */
  0 2px 8px hsl(var(--always-black) / 0.06),
  0 8px 24px hsl(var(--always-black) / 0.1),
  0 16px 48px hsl(var(--always-black) / 0.1);          /* 分层外阴影 */
border-color: hsl(var(--border-300) / 0.6);            /* 浅色模式深色发丝边 */
```

（`border-color` 替换现有 `hsl(var(--always-white) / 0.16)`；dark 模式下亮边主导，light 模式下发丝边定义轮廓。）

### 2. 大面板阴影（`[data-lq-surface]`）

`box-shadow: var(--shadow-xl)` 替换为：

```css
box-shadow:
  inset 0 0 0 0.5px hsl(var(--always-white) / 0.25),
  inset 0 1px 0 0 hsl(var(--always-white) / 0.4),
  inset 0 -2px 8px -2px hsl(var(--always-black) / 0.1),
  0 2px 8px hsl(var(--always-black) / 0.05),
  0 12px 32px hsl(var(--always-black) / 0.1),
  0 24px 64px hsl(var(--always-black) / 0.08);
```

### 3. 聊天框填充（`.glass`，即输入框等主浮层）

`background-color: hsl(var(--bg-000) / 0.22)` → `hsl(var(--always-black) / 0.04)`（中性微暗底；`.glass-alt` 维持 `hsl(var(--bg-100) / 0.18)`）。浅色模式下白底上立刻读出边界；深色模式下 0.04 黑几乎不可见，观感不变。

### 4. 折射增强（`src/lib/liquidGlass/displacementMap.ts` 常量）

- `REFRACTION_STRENGTH`: 2 → 4
- `EDGE_BAND`: 0.12 → 0.16（扭曲区域更宽）
- `SDF_SHIFT`: 0.05 → 0.08（平坦区略收窄）

## 测试

- `src/themes/themes.test.ts`：断言 `.glass` 填充为 `hsl(var(--always-black) / 0.04)`、box-shadow 含 `inset 0 1px 0 0 hsl(var(--always-white) / 0.5)`（高光）；surface 阴影含 `0 24px 64px`。
- `src/lib/liquidGlass/displacementMap.test.ts`：现有定性断言（中心为零、边缘非零、对称）不受常量调整影响，预期仍通过；若边缘阈值因曲线变化不过，则按新曲线重算阈值（实现时验证）。
- 全量 `npm run validate`；视觉由用户验收。

## 涉及文件

- 修改：`src/themes/liquidGlass.ts`、`src/lib/liquidGlass/displacementMap.ts`、`src/themes/themes.test.ts`
