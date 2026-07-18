/**
 * 液态玻璃折射引擎
 *
 * 为 .glass / .glass-alt / [data-lq-surface] 元素创建按尺寸生成的 SVG 位移滤镜，
 * 以内联 backdrop-filter: url(#id) + 磨砂链应用「边缘折射」。
 * 不支持 url() 的浏览器（WebKit/Firefox）视该内联声明为无效，
 * 自动落回风格 css 的磨砂规则，天然降级。
 */
import { generateDisplacementMap } from './displacementMap'

const SVG_NS = 'http://www.w3.org/2000/svg'
const XLINK_NS = 'http://www.w3.org/1999/xlink'
const GLASS_SELECTOR = '.glass, .glass-alt, [data-lq-surface]'
const BACKDROP_CHAIN = 'blur(16px) saturate(160%) brightness(1.05)'
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
  if (defsEl && svgRoot?.isConnected) return defsEl
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
  ctx.putImageData(new ImageData(map.data as Uint8ClampedArray<ArrayBuffer>, map.width, map.height), 0, 0)

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
