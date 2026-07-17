# Liquid Glass 2.0（真·液态玻璃）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Liquid Glass 风格实现真·液态玻璃：SVG 位移滤镜折射（仅边缘变形、中心不变形的透镜膨胀）+ 桌面端悬浮圆角大框 + 环境渐变底色，不支持 `backdrop-filter: url()` 的平台自动降级为现有磨砂。

**Architecture:** 自研小型折射引擎（`src/lib/liquidGlass/`）：按元素尺寸用圆角矩形 SDF 生成位移图（canvas → feImage → feDisplacementMap），通过 `ThemeStyle.effects` 标志由 themeStore 启停；悬浮布局通过主容器上的 `data-lq-*` 钩子 + 风格 css（`min-width: 768px` 媒体查询限定桌面端）实现。规格见 `docs/superpowers/specs/2026-07-17-liquid-glass-2-design.md`。

**Tech Stack:** React 19 + TypeScript + Tailwind CSS v4 + Vitest（jsdom）。

## Global Constraints

- 折射引擎只在 `liquid-glass` 风格激活时运行；其他风格/色板零影响。
- 风格 css 必须基于 CSS 变量，不得写死具体颜色。
- 悬浮布局仅桌面端（`@media (min-width: 768px)`），移动端与分屏模式不改。
- 大面板（data-lq-surface）只磨砂不上折射滤镜；折射只给 `.glass` / `.glass-alt`。
- 提交信息使用英文 Conventional Commits。
- 测试命令：`npx vitest run <file>`；全量验证 `npm run validate`（已知 4 个 main 上既有失败用例与本计划无关）。
- 位移图/引擎参数（EDGE_BAND、SDF_SHIFT、REFRACTION_STRENGTH、BACKDROP_CHAIN）是视觉调优旋钮，实现时按给定值，后续可依据肉眼效果微调。

---

### Task 1: 位移图生成器（纯函数）

**Files:**
- Create: `src/lib/liquidGlass/displacementMap.ts`
- Test: `src/lib/liquidGlass/displacementMap.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `generateDisplacementMap(width: number, height: number, radius: number): DisplacementMap`
  - `interface DisplacementMap { data: Uint8ClampedArray; width: number; height: number; scale: number }`
  - 常量 `DISPLACEMENT_DPI_SCALE`、`EDGE_BAND`、`SDF_SHIFT`、`REFRACTION_STRENGTH`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/liquidGlass/displacementMap.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { DISPLACEMENT_DPI_SCALE, generateDisplacementMap } from './displacementMap'

const W = 400
const H = 200
const RADIUS = 16

/** 从 RGBA 通道还原 map 像素单位的位移（channel = raw/safeMax + 0.5，safeMax = scale * DPI_SCALE） */
function readRaw(map: ReturnType<typeof generateDisplacementMap>, x: number, y: number) {
  const i = (y * map.width + x) * 4
  const safeMax = map.scale * DISPLACEMENT_DPI_SCALE
  return {
    dx: (map.data[i] / 255 - 0.5) * safeMax,
    dy: (map.data[i + 1] / 255 - 0.5) * safeMax,
  }
}

describe('generateDisplacementMap', () => {
  const map = generateDisplacementMap(W, H, RADIUS)
  const mw = map.width
  const mh = map.height

  it('generates a low-resolution map scaled by DPI scale', () => {
    expect(mw).toBe(Math.round(W * DISPLACEMENT_DPI_SCALE))
    expect(mh).toBe(Math.round(H * DISPLACEMENT_DPI_SCALE))
    expect(map.data.length).toBe(mw * mh * 4)
    expect(map.scale).toBeGreaterThan(0)
  })

  it('has zero displacement at the center', () => {
    const c = readRaw(map, Math.floor(mw / 2), Math.floor(mh / 2))
    expect(Math.abs(c.dx)).toBeLessThan(0.5)
    expect(Math.abs(c.dy)).toBeLessThan(0.5)
  })

  it('has zero displacement across the flat center zone', () => {
    // 距中心 20% 宽处仍在平坦区内（折射仅限边缘）
    const p = readRaw(map, Math.floor(mw * 0.7), Math.floor(mh / 2))
    expect(Math.abs(p.dx)).toBeLessThan(0.5)
  })

  it('displaces toward the center at left/right edges, symmetrically', () => {
    const l = readRaw(map, 1, Math.floor(mh / 2))
    const r = readRaw(map, mw - 2, Math.floor(mh / 2))
    expect(l.dx).toBeGreaterThan(0.5)
    expect(r.dx).toBeLessThan(-0.5)
    expect(Math.abs(Math.abs(l.dx) - Math.abs(r.dx))).toBeLessThan(0.5)
  })

  it('displaces toward the center at top/bottom edges', () => {
    const t = readRaw(map, Math.floor(mw / 2), 1)
    const b = readRaw(map, Math.floor(mw / 2), mh - 2)
    expect(t.dy).toBeGreaterThan(0.5)
    expect(b.dy).toBeLessThan(-0.5)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/liquidGlass/displacementMap.test.ts`
Expected: FAIL（模块不存在，导入错误）

- [ ] **Step 3: 实现位移图生成器**

创建 `src/lib/liquidGlass/displacementMap.ts`：

```ts
/**
 * 液态玻璃位移图生成器
 *
 * 基于圆角矩形 SDF 生成 feDisplacementMap 用的位移场：
 * - 中心平坦区：采样原坐标，无变形（折射仅限边缘）
 * - 边缘带：采样坐标向中心压缩，背景在边缘处呈现透镜「膨胀」感
 *
 * 算法参考 shuding/liquid-glass，按 uv 空间参数化以适配任意元素尺寸。
 * 常量均为视觉调优旋钮。
 */

/** 生成分辨率缩放（平滑渐变，低分辨率生成后放大无损） */
export const DISPLACEMENT_DPI_SCALE = 0.25
/** 边缘折射带宽（uv 比例，0.12 ≈ 元素短边方向外侧 12%） */
export const EDGE_BAND = 0.12
/** SDF 距离偏移：平坦区在 EDGE_BAND 之外再延伸的距离（uv 比例） */
export const SDF_SHIFT = 0.05
/** 折射强度放大系数（feDisplacementMap scale 的倍率） */
export const REFRACTION_STRENGTH = 2

export interface DisplacementMap {
  /** RGBA 通道：R=dx、G=dy（0.5 为零点的归一化），B=0、A=255 */
  data: Uint8ClampedArray
  /** 生成分辨率宽（已乘 DISPLACEMENT_DPI_SCALE） */
  width: number
  /** 生成分辨率高 */
  height: number
  /** feDisplacementMap 的 scale（元素像素单位） */
  scale: number
}

function smoothStep(a: number, b: number, t: number): number {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

/** 圆角矩形有向距离（内部为负，边界为 0，外部为正），x/y 以矩形中心为原点 */
function roundedRectSDF(x: number, y: number, halfW: number, halfH: number, radius: number): number {
  const qx = Math.abs(x) - halfW + radius
  const qy = Math.abs(y) - halfH + radius
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

export function generateDisplacementMap(width: number, height: number, radius: number): DisplacementMap {
  const w = Math.max(1, Math.round(width * DISPLACEMENT_DPI_SCALE))
  const h = Math.max(1, Math.round(height * DISPLACEMENT_DPI_SCALE))
  const data = new Uint8ClampedArray(w * h * 4)

  // 平坦中心区：uv 空间内缩 EDGE_BAND 的圆角矩形
  const halfW = 0.5 - EDGE_BAND
  const halfH = 0.5 - EDGE_BAND
  const r = Math.min(Math.max(radius / Math.min(width, height), 0.01), Math.min(halfW, halfH))

  const raw: number[] = []
  let maxScale = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ix = x / w - 0.5
      const iy = y / h - 0.5
      const distanceToEdge = roundedRectSDF(ix, iy, halfW, halfH, r)
      // 中心（distance ≤ 0）→ displacement=1 → scaled=1 → 采样原 uv（无变形）
      // 边缘 → displacement→0 → 采样坐标向中心压缩（透镜膨胀）
      const displacement = smoothStep(0.8, 0, distanceToEdge - SDF_SHIFT)
      const scaled = smoothStep(0, 1, displacement)
      const sampleX = ix * scaled + 0.5
      const sampleY = iy * scaled + 0.5
      const dx = sampleX * w - x
      const dy = sampleY * h - y
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy))
      raw.push(dx, dy)
    }
  }

  const safeMax = maxScale || 1
  let p = 0
  for (let i = 0; i < raw.length; i += 2) {
    data[p++] = (raw[i] / safeMax + 0.5) * 255
    data[p++] = (raw[i + 1] / safeMax + 0.5) * 255
    data[p++] = 0
    data[p++] = 255
  }

  return {
    data,
    width: w,
    height: h,
    scale: (safeMax / DISPLACEMENT_DPI_SCALE) * REFRACTION_STRENGTH,
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/liquidGlass/displacementMap.test.ts`
Expected: PASS（5 个用例全过）

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidGlass/displacementMap.ts src/lib/liquidGlass/displacementMap.test.ts
git commit -m "feat(liquid-glass): add displacement map generator"
```

---

### Task 2: 折射引擎（DOM/SVG 生命周期）

**Files:**
- Create: `src/lib/liquidGlass/engine.ts`
- Create: `src/lib/liquidGlass/index.ts`
- Test: `src/lib/liquidGlass/engine.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `generateDisplacementMap`
- Produces（Task 3 依赖的确切签名）:
  - `applyLiquidRefraction(el: HTMLElement): () => void`（返回 cleanup）
  - `startLiquidGlass(): void`（幂等）
  - `stopLiquidGlass(): void`（幂等）
  - `isLiquidGlassRunning(): boolean`

- [ ] **Step 1: 写失败测试**

创建 `src/lib/liquidGlass/engine.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLiquidRefraction, isLiquidGlassRunning, startLiquidGlass, stopLiquidGlass } from './index'

const FAKE_RECT = {
  width: 400,
  height: 200,
  top: 0,
  left: 0,
  right: 400,
  bottom: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect

function createGlassElement(sized = true): HTMLElement {
  const el = document.createElement('div')
  el.className = 'glass'
  if (sized) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(FAKE_RECT)
  }
  document.body.appendChild(el)
  return el
}

describe('liquid glass engine', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    stopLiquidGlass()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,x')
  })

  afterEach(() => {
    stopLiquidGlass()
    vi.restoreAllMocks()
  })

  it('apply sets inline backdrop-filter with the filter url, cleanup removes it', () => {
    const el = createGlassElement()
    const cleanup = applyLiquidRefraction(el)
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('blur(36px)')
    cleanup()
    expect(el.style.getPropertyValue('backdrop-filter')).toBe('')
  })

  it('apply is a no-op for zero-size elements (jsdom default rect)', () => {
    const el = createGlassElement(false)
    expect(() => applyLiquidRefraction(el)).not.toThrow()
    expect(el.style.getPropertyValue('backdrop-filter')).toBe('')
  })

  it('start applies to existing .glass elements and is idempotent', () => {
    createGlassElement()
    startLiquidGlass()
    startLiquidGlass()
    expect(isLiquidGlassRunning()).toBe(true)
    const filters = document.querySelectorAll('svg defs filter')
    expect(filters.length).toBe(1)
  })

  it('start picks up .glass elements added later via MutationObserver', async () => {
    startLiquidGlass()
    const el = createGlassElement()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
  })

  it('stop removes all filters, inline styles and the svg root', () => {
    const el = createGlassElement()
    startLiquidGlass()
    stopLiquidGlass()
    expect(isLiquidGlassRunning()).toBe(false)
    expect(el.style.getPropertyValue('backdrop-filter')).toBe('')
    expect(document.querySelectorAll('svg defs filter').length).toBe(0)
  })

  it('stop is safe to call when not running', () => {
    expect(() => stopLiquidGlass()).not.toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/liquidGlass/engine.test.ts`
Expected: FAIL（模块不存在，导入错误）

- [ ] **Step 3: 实现引擎**

创建 `src/lib/liquidGlass/engine.ts`：

```ts
/**
 * 液态玻璃折射引擎
 *
 * 为 .glass / .glass-alt 元素创建按尺寸生成的 SVG 位移滤镜，
 * 以内联 backdrop-filter: url(#id) + 磨砂链应用「边缘折射」。
 * 不支持 url() 的浏览器（WebKit/Firefox）视该内联声明为无效，
 * 自动落回风格 css 的磨砂规则，天然降级。
 */
import { generateDisplacementMap } from './displacementMap'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const GLASS_SELECTOR = '.glass, .glass-alt'
const BACKDROP_CHAIN = 'blur(36px) saturate(200%) brightness(1.05)'
const REBUILD_DEBOUNCE_MS = 150
const DEFAULT_RADIUS = 12

interface AppliedEntry {
  filterId: string
  resizeObserver: ResizeObserver | null
  debounceTimer: number | null
}

const applied = new Map<HTMLElement, AppliedEntry>()
let svgRoot: SVGSVGElement | null = null
let defsEl: SVGDefsElement | null = null
let mutationObserver: MutationObserver | null = null
let idCounter = 0
let running = false

export function isLiquidGlassRunning(): boolean {
  return running
}

function ensureDefs(): SVGDefsElement {
  if (defsEl) return defsEl
  svgRoot = document.createElementNS(SVG_NS, 'svg')
  svgRoot.setAttribute('width', '0')
  svgRoot.setAttribute('height', '0')
  svgRoot.setAttribute('aria-hidden', 'true')
  svgRoot.style.position = 'fixed'
  svgRoot.style.inset = '0'
  svgRoot.style.pointerEvents = 'none'
  defsEl = document.createElementNS(SVG_NS, 'defs')
  svgRoot.appendChild(defsEl)
  document.body.appendChild(svgRoot)
  return defsEl
}

function buildFilter(el: HTMLElement, filterId: string): SVGFilterElement | null {
  const rect = el.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return null

  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || DEFAULT_RADIUS
  const map = generateDisplacementMap(rect.width, rect.height, radius)

  const canvas = document.createElement('canvas')
  canvas.width = map.width
  canvas.height = map.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.putImageData(new ImageData(map.data, map.width, map.height), 0, 0)

  const filter = document.createElementNS(SVG_NS, 'filter')
  filter.setAttribute('id', filterId)
  filter.setAttribute('filterUnits', 'userSpaceOnUse')
  filter.setAttribute('colorInterpolationFilters', 'sRGB')
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', String(Math.ceil(rect.width)))
  filter.setAttribute('height', String(Math.ceil(rect.height)))

  const feImage = document.createElementNS(SVG_NS, 'feImage')
  feImage.setAttribute('id', `${filterId}_map`)
  feImage.setAttribute('width', String(Math.ceil(rect.width)))
  feImage.setAttribute('height', String(Math.ceil(rect.height)))
  feImage.setAttribute('preserveAspectRatio', 'none')
  feImage.setAttributeNS(XLINK_NS, 'href', canvas.toDataURL('image/png'))

  const feDisplacementMap = document.createElementNS(SVG_NS, 'feDisplacementMap')
  feDisplacementMap.setAttribute('in', 'SourceGraphic')
  feDisplacementMap.setAttribute('in2', `${filterId}_map`)
  feDisplacementMap.setAttribute('xChannelSelector', 'R')
  feDisplacementMap.setAttribute('yChannelSelector', 'G')
  feDisplacementMap.setAttribute('scale', String(map.scale))

  filter.appendChild(feImage)
  filter.appendChild(feDisplacementMap)
  return filter
}

function cleanupEntry(el: HTMLElement, entry: AppliedEntry) {
  if (entry.debounceTimer !== null) window.clearTimeout(entry.debounceTimer)
  entry.resizeObserver?.disconnect()
  defsEl?.querySelector(`#${entry.filterId}`)?.remove()
  el.style.removeProperty('backdrop-filter')
  el.style.removeProperty('-webkit-backdrop-filter')
  applied.delete(el)
}

export function applyLiquidRefraction(el: HTMLElement): () => void {
  const existing = applied.get(el)
  if (existing) return () => cleanupEntry(el, existing)

  const filterId = `liquid-glass-filter-${++idCounter}`
  const entry: AppliedEntry = { filterId, resizeObserver: null, debounceTimer: null }
  applied.set(el, entry)

  const rebuild = () => {
    const defs = ensureDefs()
    defs.querySelector(`#${filterId}`)?.remove()
    const filter = buildFilter(el, filterId)
    if (!filter) return
    defs.appendChild(filter)
    el.style.setProperty('backdrop-filter', `url(#${filterId}) ${BACKDROP_CHAIN}`)
    el.style.setProperty('-webkit-backdrop-filter', `url(#${filterId}) ${BACKDROP_CHAIN}`)
  }

  rebuild()

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (entry.debounceTimer !== null) window.clearTimeout(entry.debounceTimer)
      entry.debounceTimer = window.setTimeout(rebuild, REBUILD_DEBOUNCE_MS)
    })
    ro.observe(el)
    entry.resizeObserver = ro
  }

  return () => cleanupEntry(el, entry)
}

export function startLiquidGlass(): void {
  if (running) return
  running = true

  document.querySelectorAll<HTMLElement>(GLASS_SELECTOR).forEach(el => applyLiquidRefraction(el))

  if (typeof MutationObserver !== 'undefined') {
    mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return
          if (node.matches(GLASS_SELECTOR)) applyLiquidRefraction(node)
          node.querySelectorAll<HTMLElement>(GLASS_SELECTOR).forEach(el => applyLiquidRefraction(el))
        })
        mutation.removedNodes.forEach(node => {
          if (!(node instanceof HTMLElement)) return
          for (const [el, entry] of Array.from(applied)) {
            if (el === node || node.contains(el)) cleanupEntry(el, entry)
          }
        })
      }
    })
    mutationObserver.observe(document.body, { childList: true, subtree: true })
  }
}

export function stopLiquidGlass(): void {
  if (!running) return
  running = false
  mutationObserver?.disconnect()
  mutationObserver = null
  for (const [el, entry] of Array.from(applied)) cleanupEntry(el, entry)
  svgRoot?.remove()
  svgRoot = null
  defsEl = null
}
```

创建 `src/lib/liquidGlass/index.ts`：

```ts
export { generateDisplacementMap, DISPLACEMENT_DPI_SCALE, EDGE_BAND, SDF_SHIFT, REFRACTION_STRENGTH } from './displacementMap'
export type { DisplacementMap } from './displacementMap'
export { applyLiquidRefraction, startLiquidGlass, stopLiquidGlass, isLiquidGlassRunning } from './engine'
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/liquidGlass/`
Expected: PASS（displacementMap 5 + engine 6 全过）

- [ ] **Step 5: Commit**

```bash
git add src/lib/liquidGlass/
git commit -m "feat(liquid-glass): add refraction engine with SVG displacement filters"
```

---

### Task 3: effects 注册表字段 + themeStore 引擎启停

**Files:**
- Modify: `src/themes/index.ts`（ThemeStyle 加 effects）
- Modify: `src/themes/liquidGlass.ts`（liquidGlassStyle 加 effects 标志）
- Modify: `src/store/themeStore.ts`（applyTheme 末尾启停引擎）
- Test: `src/themes/themes.test.ts`、`src/store/themeStore.test.ts`（追加用例）

**Interfaces:**
- Consumes: Task 2 的 `startLiquidGlass` / `stopLiquidGlass` / `isLiquidGlassRunning`
- Produces:
  - `ThemeStyle.effects?: string[]`
  - `liquidGlassStyle.style.effects === ['liquid-refraction']`
  - themeStore.applyTheme 在风格含 `liquid-refraction` 时启动引擎，否则停止

- [ ] **Step 1: 写失败测试**

`src/themes/themes.test.ts` 末尾追加：

```ts
describe('style effects flags', () => {
  it('effects is a string array when present; liquid-glass declares liquid-refraction', () => {
    for (const s of builtinStyleThemes) {
      if (s.style.effects) {
        expect(Array.isArray(s.style.effects)).toBe(true)
        for (const e of s.style.effects) expect(typeof e).toBe('string')
      }
    }
    const lg = builtinStyleThemes.find(s => s.id === 'liquid-glass')
    expect(lg?.style.effects).toContain('liquid-refraction')
  })
})
```

`src/store/themeStore.test.ts` 末尾追加（文件顶部 import 需加 `import { isLiquidGlassRunning } from '../lib/liquidGlass'`）：

```ts
describe('liquid glass engine lifecycle', () => {
  beforeEach(() => {
    localStorage.clear()
    themeStore.setPreset('eucalyptus')
    themeStore.setStyleId('auto')
  })

  it('starts the engine when the active style declares liquid-refraction', () => {
    themeStore.setPreset('liquid-glass')
    expect(isLiquidGlassRunning()).toBe(true)
  })

  it('stops the engine when switching to a style without the flag', () => {
    themeStore.setPreset('liquid-glass')
    expect(isLiquidGlassRunning()).toBe(true)
    themeStore.setPreset('ocean')
    expect(isLiquidGlassRunning()).toBe(false)
  })

  it('stops the engine when styleId is none', () => {
    themeStore.setPreset('liquid-glass')
    themeStore.setStyleId('none')
    expect(isLiquidGlassRunning()).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts src/store/themeStore.test.ts`
Expected: FAIL（effects 不存在 / 引擎未启动）

- [ ] **Step 3: 实现**

1. `src/themes/index.ts` 的 `ThemeStyle` 接口（`css?: string` 之后）追加字段：

```ts
  /** 需要运行时引擎支持的特效标志（如 'liquid-refraction'） */
  effects?: string[]
```

2. `src/themes/liquidGlass.ts` 的 `liquidGlassStyle.style` 中（`css:` 字段之后）追加：

```ts
    effects: ['liquid-refraction'],
```

3. `src/store/themeStore.ts`：
   - 顶部导入追加：`import { startLiquidGlass, stopLiquidGlass } from '../lib/liquidGlass'`
   - `applyTheme()` 第 2 步中把 `const style = ...` 提升为函数级变量（在 `const preset = this.getPreset()` 之前声明 `let style: ThemeStyle | undefined`，原 `const style = styleId ? ... : undefined` 改为赋值 `style = styleId ? ... : undefined`）
   - `applyTheme()` 的最末尾（`// 4. 更新 meta theme-color` 的 requestAnimationFrame 块之后）追加：

```ts
    // 5. 界面风格特效引擎启停（仅 liquid-glass 风格声明 liquid-refraction）
    if (style?.effects?.includes('liquid-refraction')) {
      startLiquidGlass()
    } else {
      stopLiquidGlass()
    }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts src/store/themeStore.test.ts`
Expected: PASS（全部通过）

- [ ] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add src/themes/index.ts src/themes/liquidGlass.ts src/store/themeStore.ts src/themes/themes.test.ts src/store/themeStore.test.ts
git commit -m "feat(liquid-glass): start refraction engine via style effects flag"
```

---

### Task 4: 悬浮圆角大框 + 环境渐变底色

**Files:**
- Modify: `src/App.tsx`（3 个 data 属性）
- Modify: `src/features/chat/Sidebar.tsx:367`（1 个）
- Modify: `src/features/chat/ChatPane.tsx:978-980`（1 个）
- Modify: `src/components/ui/ResizablePanel.tsx:265`（1 个）
- Modify: `src/features/chat/Header.tsx:199-200, 274`（2 个）
- Modify: `src/themes/liquidGlass.ts`（css 追加悬浮/环境规则）
- Test: `src/themes/themes.test.ts`（追加结构断言）

**Interfaces:**
- Consumes: 无（纯属性 + css）
- Produces: DOM 钩子 `data-lq-app`、`data-lq-layout`、`data-lq-column`、`data-lq-surface="sidebar|chat|right|bottom"`、`data-lq-header`、`data-lq-header-fade`

- [ ] **Step 1: 写失败测试**

`src/themes/themes.test.ts` 末尾追加：

```ts
describe('liquid glass floating layout css', () => {
  it('declares ambient background, floating surfaces and desktop media query', () => {
    const css = builtinStyleThemes.find(s => s.id === 'liquid-glass')?.style.css ?? ''
    expect(css).toContain('radial-gradient')
    expect(css).toContain('[data-lq-layout]')
    expect(css).toContain('[data-lq-surface]')
    expect(css).toContain('@media (min-width: 768px)')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: FAIL（css 中尚无这些选择器）

- [ ] **Step 3: 添加 DOM 钩子**

1. `src/App.tsx`：
   - 根容器（第 834 行）`<div className="relative flex h-full flex-col bg-bg-100 overflow-hidden">` 加 `data-lq-app`
   - 主行容器（第 838 行）`<div className="relative flex min-h-0 flex-1 overflow-hidden">` 加 `data-lq-layout`
   - 桌面分支聊天列（第 967-969 行）`<div ref={surfaceRef} className="flex-1 flex flex-col min-w-0 overflow-hidden" ...>` 加 `data-lq-column`
2. `src/features/chat/Sidebar.tsx`：docked 容器（第 367 行 `<div ref={sidebarRef}`）加 `data-lq-surface="sidebar"`
3. `src/features/chat/ChatPane.tsx`：根容器（第 978-980 行，已有 `data-chat-pane-root="true"`）加 `data-lq-surface="chat"`
4. `src/components/ui/ResizablePanel.tsx`：桌面分支容器（第 265 行 `<div ref={panelRef}`）加 `data-lq-surface={position}`
5. `src/features/chat/Header.tsx`：顶栏 div（第 199-200 行）加 `data-lq-header`；底部渐变 div（第 274 行）加 `data-lq-header-fade`

- [ ] **Step 4: 风格 css 追加悬浮/环境规则**

`src/themes/liquidGlass.ts` 的 `liquidGlassStyle.style.css` 模板字符串末尾（现有 `:root:root .glass-alt { ... }` 块之后）追加：

```css

/* 环境渐变底色：accent 色系径向渐变，给悬浮面板提供可折射的背景 */
:root:root body {
  background:
    radial-gradient(1200px 800px at 12% -10%, hsl(var(--accent-main-100) / 0.1), transparent 60%),
    radial-gradient(1000px 700px at 88% 110%, hsl(var(--accent-secondary-100) / 0.09), transparent 55%),
    hsl(var(--bg-100));
}

/* 让环境底色透出：根节点、应用根容器、桌面标题栏透明化 */
:root:root #root {
  background: transparent;
}

:root:root [data-lq-app] {
  background-color: transparent;
}

:root:root .desktop-titlebar {
  background-color: transparent;
}

/* 桌面端悬浮圆角大框（移动端维持现状） */
@media (min-width: 768px) {
  :root:root [data-lq-layout] {
    padding: 10px;
    gap: 10px;
  }

  :root:root [data-lq-column] {
    gap: 10px;
  }

  :root:root [data-lq-surface] {
    border: none;
    border-radius: var(--radius-2xl);
    background-color: hsl(var(--bg-100) / 0.72);
    -webkit-backdrop-filter: blur(24px) saturate(180%);
    backdrop-filter: blur(24px) saturate(180%);
    box-shadow: var(--shadow-xl);
  }

  :root:root [data-lq-header] {
    background-color: transparent;
  }

  :root:root [data-lq-header-fade] {
    --tw-gradient-from: hsl(var(--bg-100) / 0.72) var(--tw-gradient-from-position);
    --tw-gradient-to: hsl(var(--bg-100) / 0) var(--tw-gradient-to-position);
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/themes/themes.test.ts`
Expected: PASS

- [ ] **Step 6: 构建校验**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: 无类型/lint 错误，构建成功

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/features/chat/Sidebar.tsx src/features/chat/ChatPane.tsx src/components/ui/ResizablePanel.tsx src/features/chat/Header.tsx src/themes/liquidGlass.ts src/themes/themes.test.ts
git commit -m "feat(liquid-glass): add floating rounded surfaces and ambient background"
```

---

### Task 5: 全量验证与手动冒烟

**Files:** 无（纯验证）

- [ ] **Step 1: 全量验证**

Run: `npm run validate`
Expected: typecheck、lint、build 通过；测试仅剩 4 个 main 上既有失败（settingsBackup ×2、modelVisibilityStore ×2）

- [ ] **Step 2: 手动冒烟（交给用户在 dev server 中确认）**

Run: `npm run dev`，依次确认：

1. 选 Liquid Glass 主题：背景出现淡雅 accent 渐变；侧边栏/聊天区/右侧面板变为悬浮圆角大框，彼此与屏幕边缘有 10px 间隙。
2. 输入框/下拉菜单/对话框：边缘可见折射透镜效果（边缘背景轻微放大变形、中心不变形）；背后内容滚动时折射实时变化。
3. 切日/夜模式：环境渐变与悬浮面板在两种模式下均正常。
4. 切到其他主题：悬浮布局、折射滤镜、环境渐变全部消失无残留；切回 Liquid Glass 恢复。
5. 叠加玩法：色板选 Ocean + 风格选 Liquid Glass，悬浮与折射仍生效。
6. 窄窗口（<768px）：布局回到贴边移动端样式，无悬浮间隙。
7. 性能：滚动长聊天、开关多个菜单，无明显掉帧（重点观察输入框与对话框区域）。
