import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureNativeShell } from './nativeShell'

const { isTauriMock } = vi.hoisted(() => ({ isTauriMock: vi.fn() }))
vi.mock('./tauri', () => ({ isTauri: isTauriMock }))

describe('configureNativeShell', () => {
  const getSafeAreaInsets = vi.fn()
  let dispose: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    isTauriMock.mockReturnValue(true)
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android')
    Object.defineProperty(window, '__opencode_android', { configurable: true, value: { getSafeAreaInsets } })
    getSafeAreaInsets.mockReturnValue(JSON.stringify({ top: 32, bottom: 0, left: 0, right: 0 }))
    document.head.innerHTML = '<meta name="viewport" content="width=device-width, initial-scale=1">'
  })
  afterEach(() => {
    dispose?.()
    dispose = undefined
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, '__opencode_android')
    document.documentElement.classList.remove('tauri-app')
    document.documentElement.removeAttribute('style')
  })

  it('reads the native snapshot before rendering and restores it for a new document', () => {
    dispose = configureNativeShell()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('32px')
    expect(document.documentElement).toHaveClass('tauri-app')

    dispose?.()
    document.documentElement.removeAttribute('style')
    // 模拟文档重载：没有新的 WindowInsets 回调，原生快照仍存在。
    dispose = configureNativeShell()
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('32px')
    expect(
      document
        .querySelector('meta[name="viewport"]')
        ?.getAttribute('content')
        ?.match(/viewport-fit=cover/g),
    ).toHaveLength(1)
  })

  it('updates from native changes and removes its event listener on disposal', () => {
    dispose = configureNativeShell()
    getSafeAreaInsets.mockReturnValue(JSON.stringify({ top: 24, bottom: 0, left: 0, right: 0 }))
    window.dispatchEvent(new Event('opencode:insets-changed'))
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('24px')

    dispose?.()
    getSafeAreaInsets.mockReturnValue(JSON.stringify({ top: 48, bottom: 0, left: 0, right: 0 }))
    window.dispatchEvent(new Event('opencode:insets-changed'))
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('24px')
  })

  it('preserves browser safe-area handling', () => {
    isTauriMock.mockReturnValue(false)
    configureNativeShell()
    expect(document.documentElement).not.toHaveClass('tauri-app')
    expect(getSafeAreaInsets).not.toHaveBeenCalled()
  })

  it('keeps desktop Tauri independent from the Android bridge', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Windows')
    Reflect.deleteProperty(window, '__opencode_android')
    expect(configureNativeShell).not.toThrow()
    expect(document.documentElement).toHaveClass('tauri-app')
  })

  it('surfaces missing or invalid native insets instead of silently using zero', () => {
    getSafeAreaInsets.mockReturnValue(JSON.stringify({ top: -1, bottom: 0, left: 0, right: 0 }))
    expect(configureNativeShell).toThrow('Invalid Android safe-area inset: top')
    Reflect.deleteProperty(window, '__opencode_android')
    expect(configureNativeShell).toThrow('Android safe-area bridge is unavailable')
  })
})
