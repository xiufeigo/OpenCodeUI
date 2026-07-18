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

function createGlassElement(sized = true, className = 'glass'): HTMLElement {
  const el = document.createElement('div')
  el.className = className
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
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('blur(16px)')
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

  it('cleans up the filter when a .glass element is removed from the DOM', async () => {
    const el = createGlassElement()
    startLiquidGlass()
    expect(document.querySelectorAll('svg defs filter').length).toBe(1)
    el.remove()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelectorAll('svg defs filter').length).toBe(0)
  })

  it('debounced resize rebuild keeps exactly one filter', async () => {
    let roCallback: (() => void) | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          roCallback = cb
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const el = createGlassElement()
    applyLiquidRefraction(el)
    expect(document.querySelectorAll('svg defs filter').length).toBe(1)
    roCallback!()
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(document.querySelectorAll('svg defs filter').length).toBe(1)
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
    vi.unstubAllGlobals()
  })

  it('start picks up .glass-alt elements', () => {
    const el = createGlassElement(true, 'glass-alt')
    startLiquidGlass()
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
  })

  it('start also picks up [data-lq-surface] panels', () => {
    const el = document.createElement('div')
    el.setAttribute('data-lq-surface', 'chat')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(FAKE_RECT)
    document.body.appendChild(el)
    startLiquidGlass()
    expect(el.style.getPropertyValue('backdrop-filter')).toContain('url(#liquid-glass-filter-')
  })
})
