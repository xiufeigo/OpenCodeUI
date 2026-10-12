import { isTauri } from './tauri'

const INSETS_CHANGED_EVENT = 'opencode:insets-changed'
const INSET_EDGES = ['top', 'bottom', 'left', 'right'] as const

interface AndroidInsetsBridge {
  getSafeAreaInsets: () => string
}

export function configureNativeShell() {
  if (!isTauri()) return

  document.documentElement.classList.add('tauri-app')
  const viewportMeta = document.querySelector('meta[name="viewport"]')
  if (viewportMeta) {
    const content = viewportMeta.getAttribute('content') || ''
    if (!content.includes('viewport-fit=cover')) {
      viewportMeta.setAttribute('content', content + ', viewport-fit=cover')
    }
  }

  if (!/Android/i.test(navigator.userAgent)) return

  const bridge = (window as unknown as { __opencode_android?: AndroidInsetsBridge }).__opencode_android
  if (!bridge?.getSafeAreaInsets) throw new Error('Android safe-area bridge is unavailable')

  const applyInsets = () => {
    const insets = JSON.parse(bridge.getSafeAreaInsets()) as Record<string, unknown>
    for (const edge of INSET_EDGES) {
      const value = insets[edge]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid Android safe-area inset: ${edge}`)
      }
    }
    for (const edge of INSET_EDGES) {
      document.documentElement.style.setProperty(`--safe-area-inset-${edge}`, `${insets[edge]}px`)
    }
  }

  // 每个新文档在 React 渲染前读取原生快照；旋转/系统栏变化仍由原生事件更新。
  applyInsets()
  window.addEventListener(INSETS_CHANGED_EVENT, applyInsets)
  return () => window.removeEventListener(INSETS_CHANGED_EVENT, applyInsets)
}
