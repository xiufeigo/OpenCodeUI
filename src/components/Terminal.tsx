// ============================================
// Terminal - 单个 xterm 终端实例
// 使用 xterm.js + WebSocket 连接后端 PTY
// ============================================

import { useEffect, useRef, memo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { getPtyConnectUrl, getPtySession, isPtyNotFoundError, updatePtySession } from '../api/pty'
import { useTheme } from '../hooks'
import { layoutStore, useLayoutStore } from '../store/layoutStore'
import { useInputCapabilities } from '../hooks/useInputCapabilities'
import { logger } from '../utils/logger'
import { createTerminalCheckpoint } from '../utils/terminalCheckpoint'
import { isTauri } from '../utils/tauri'
import { copyTextToClipboard, readTextFromClipboard } from '../utils/clipboard'
import { hapticTap } from '../utils/haptics'
import { keybindingStore } from '../store/keybindingStore'
import i18n from '../i18n'

/**
 * 终端连接失败的原因与排查方向。
 *
 * 浏览器 WebSocket 带不了 Authorization，v2 必须先 POST `/api/pty/:id/connect-token`
 * 换一次性票据。服务端对该接口有两道闸（官方 packages/server/src/handlers/pty.ts:125-129）：
 * 必须带 `x-opencode-ticket: 1` 头（强制跨域预检），且 Origin 必须在允许列表内
 * （同源 / localhost / tauri / *.opencode.ai / 服务端 cors 配置，见 packages/server/src/cors.ts）。
 * 403 时把原因写进终端——之前只重连不解释，用户只能看到无限
 * [Disconnected, reconnecting...]（issue #181）。
 */
function describePtyConnectFailure(error: unknown): { message: string; hint?: string } {
  const tagged =
    typeof error === 'object' && error !== null
      ? (error as { _tag?: unknown; message?: unknown })
      : undefined
  const tag = typeof tagged?._tag === 'string' ? tagged._tag : ''
  const message =
    typeof tagged?.message === 'string'
      ? tagged.message
      : error instanceof Error
        ? error.message
        : String(error)
  if (tag === 'ForbiddenError' || /403|forbidden/i.test(`${tag} ${message}`)) {
    return {
      message,
      hint: i18n.t('components:terminal.connectForbiddenHint', { origin: window.location.origin }),
    }
  }
  return { message }
}

const TERMINAL_FONT_FALLBACK =
  "'Fira Code', 'Noto Sans Mono CJK SC', 'JetBrains Mono', 'Cascadia Code', 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', 'Noto Sans Mono', 'Ubuntu Mono', 'WenQuanYi Micro Hei Mono', 'DejaVu Sans Mono', 'Noto Sans CJK SC', ui-monospace, monospace"

/** 终端行高（固定值，与字号无关） */
const TERMINAL_LINE_HEIGHT = 1.4

/** 触屏设备上字号有下限（太小点不准） */
function effectiveTerminalFontSize(size: number, touchUi: boolean): number {
  return touchUi ? Math.max(size, 14) : size
}

/**
 * 解析终端字体族。
 * 用户显式设置优先；没设置就跟随主题的 --font-mono（自定义 CSS 也能改）。
 */
function resolveTerminalFontFamily(configured: string): string {
  const trimmed = configured.trim()
  if (!trimmed) {
    const themeFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
    return themeFamily || TERMINAL_FONT_FALLBACK
  }
  // 用户填的是字体名：补一个通用等宽兜底，字体缺失时不要回落到比例字体
  if (!/,\s*(monospace|ui-monospace|sans-serif|serif|cursive|fantasy|system-ui)\s*$/i.test(trimmed)) {
    return `${trimmed}, monospace`
  }
  return trimmed
}

// ============================================
// 终端主题 - 与应用主题配合
// ============================================

// 获取 CSS 变量的实际 HSL 值并转换为 hex
function getHSLColor(varName: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  if (!value) return ''

  // CSS 变量格式是 "h s% l%" 或 "h s l"
  const parts = value.split(/\s+/)
  if (parts.length < 3) return ''

  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100

  // HSL to RGB
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function getTerminalTheme(isDark: boolean) {
  const fgColor = getHSLColor('--text-100') || (isDark ? '#e8e0d5' : '#2d2a26')
  // 背景色需要设为实际颜色（而非透明），因为 xterm 在处理反转视频（\e[7m）时
  // 会用 theme.background 作为反转后的前景色。如果设为 #00000000，
  // 反转视频的文字会变成黑色，且反转背景也会出现黑框。
  // 实际的透明效果由 CSS `.xterm-viewport { background-color: transparent !important }` 实现。
  const bgColor = getHSLColor('--bg-100') || (isDark ? '#1a1a1a' : '#f5f3ef')

  if (isDark) {
    return {
      background: bgColor,
      foreground: fgColor,
      cursor: '#e8e0d5',
      cursorAccent: '#1a1a1a',
      selectionBackground: '#4a4540',
      selectionForeground: '#e8e0d5',
      selectionInactiveBackground: '#3a3530',
      // ANSI colors - 暖色调适配
      black: '#1a1a1a',
      red: '#e55561',
      green: '#8cc265',
      yellow: '#d4a656',
      blue: '#6cb6ff',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#ff6b7a',
      brightGreen: '#a8e075',
      brightYellow: '#e5b567',
      brightBlue: '#82cfff',
      brightMagenta: '#de8ef0',
      brightCyan: '#70d0dc',
      brightWhite: '#ffffff',
    }
  } else {
    return {
      background: bgColor,
      foreground: fgColor,
      cursor: '#2d2a26',
      cursorAccent: '#f5f3ef',
      selectionBackground: '#d5d0c8',
      selectionForeground: '#2d2a26',
      selectionInactiveBackground: '#e5e0d8',
      // ANSI colors - 浅色模式
      // 注意：在浅色背景下，white/brightWhite 需要是深色，
      // 因为 PowerShell 等 shell 会用这些 ANSI 颜色渲染用户输入文本
      black: '#f5f3ef',
      red: '#c9514a',
      green: '#4a9f4a',
      yellow: '#b58900',
      blue: '#3a7fc9',
      magenta: '#a04a9f',
      cyan: '#3a9f9f',
      white: '#655f58',
      brightBlack: '#6b6560',
      brightRed: '#e55561',
      brightGreen: '#6ab56a',
      brightYellow: '#d4a020',
      brightBlue: '#5a9fe0',
      brightMagenta: '#c06abf',
      brightCyan: '#5abfbf',
      brightWhite: '#2d2a26',
    }
  }
}

function isDarkMode(): boolean {
  const mode = document.documentElement.getAttribute('data-mode')
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

// ============================================
// Mobile Extra Keys Toolbar
// 参考 Termux / Moshi / Blink Shell 业界方案
// CTRL / ALT 为粘滞修饰键，支持同时激活，下一次按键自动附带
// ============================================

type ModifierKey = 'ctrl' | 'alt'

type StickyModifiers = Record<ModifierKey, boolean>

function createStickyModifiers(): StickyModifiers {
  return { ctrl: false, alt: false }
}

interface MobileExtraKey {
  data?: string
  label: string
  modifier?: ModifierKey
}

const MOBILE_EXTRA_KEY_ROWS: MobileExtraKey[][] = [
  [
    { label: 'ESC', data: '\x1b' },
    { label: '/', data: '/' },
    { label: '-', data: '-' },
    { label: 'HOME', data: '\x1b[H' },
    { label: '↑', data: '\x1b[A' },
    { label: 'END', data: '\x1b[F' },
    { label: 'PGUP', data: '\x1b[5~' },
  ],
  [
    { label: 'TAB', data: '\t' },
    { label: 'CTRL', modifier: 'ctrl' },
    { label: 'ALT', modifier: 'alt' },
    { label: '←', data: '\x1b[D' },
    { label: '↓', data: '\x1b[B' },
    { label: '→', data: '\x1b[C' },
    { label: 'PGDN', data: '\x1b[6~' },
  ],
]

function toCtrlSequence(data: string): string {
  if (data.length !== 1) return data

  const upper = data.toUpperCase()
  if (upper >= 'A' && upper <= 'Z') {
    return String.fromCharCode(upper.charCodeAt(0) - 64)
  }

  switch (data) {
    case ' ':
    case '@':
    case '`':
      return '\x00'
    case '[':
      return '\x1b'
    case '\\':
      return '\x1c'
    case ']':
      return '\x1d'
    case '^':
      return '\x1e'
    case '_':
    case '/':
      return '\x1f'
    case '?':
      return '\x7f'
    default:
      return data
  }
}

function hasStickyModifier(sticky: StickyModifiers): boolean {
  return sticky.ctrl || sticky.alt
}

function isNativePasteShortcut(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'v'
}

function canReadClipboardText() {
  // Ctrl/Cmd+V uses ClipboardEvent.clipboardData, but smart right-click paste must actively call
  // navigator.clipboard.readText(), which browsers only expose in secure contexts.
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.readText
  )
}

function applyStickyModifiers(data: string, sticky: StickyModifiers): string {
  let output = data
  if (sticky.ctrl) output = toCtrlSequence(output)
  if (sticky.alt) output = `\x1b${output}`
  return output
}

const REPEAT_DELAY = 350
const REPEAT_INTERVAL = 80

// 长按连续触发：pointerdown 立即触发 + 触觉反馈，持续按住后间隔重复。
// 释放监听挂 window，确保指针移出按钮也能清理。
function useRepeatablePress() {
  const timerRef = useRef<number | null>(null)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    window.addEventListener('pointerup', clear)
    window.addEventListener('pointercancel', clear)
    return () => {
      window.removeEventListener('pointerup', clear)
      window.removeEventListener('pointercancel', clear)
      clear()
    }
  }, [clear])

  return useCallback(
    (action: () => void, repeat: boolean) => {
      clear()
      action()
      hapticTap()
      if (!repeat) return
      const schedule = (delay: number) => {
        timerRef.current = window.setTimeout(() => {
          action()
          schedule(REPEAT_INTERVAL)
        }, delay)
      }
      schedule(REPEAT_DELAY)
    },
    [clear],
  )
}

interface MobileExtraKeysProps {
  onFocusTerminal: () => void
  onSend: (data: string) => void
  onToggleSticky: (modifier: ModifierKey) => void
  stickyModifiers: StickyModifiers
}

function MobileExtraKeys({ onSend, stickyModifiers, onToggleSticky, onFocusTerminal }: MobileExtraKeysProps) {
  const toolbarGridStyle = { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' } as const
  const press = useRepeatablePress()

  const handleSend = useCallback(
    (data: string) => {
      onSend(data)
      onFocusTerminal()
    },
    [onFocusTerminal, onSend],
  )

  const btnBase =
    'flex h-8 min-w-0 w-full items-center justify-center overflow-hidden whitespace-nowrap rounded-md border px-0 text-[length:var(--fs-xxs)] leading-none font-mono font-semibold tracking-[-0.02em] text-text-200 transition-[background-color,color,border-color,transform] duration-100 select-none active:scale-[0.98] touch-none'
  const btnNormal = `${btnBase} border-border-200/20 bg-bg-200/70 active:bg-bg-300/80`
  const btnActive = `${btnBase} border-accent-main-100/45 bg-accent-main-100/18 text-accent-main-100`

  return (
    <div
      className="w-full border-t border-border-200/40 bg-bg-100/95 supports-[backdrop-filter]:bg-bg-100/85 supports-[backdrop-filter]:backdrop-blur-sm"
      style={{ WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' }}
    >
      <div className="px-1 py-1">
        <div className="grid gap-0.5">
          {MOBILE_EXTRA_KEY_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className="grid w-full gap-0.5" style={toolbarGridStyle}>
              {row.map(key => {
                const isActive = key.modifier ? stickyModifiers[key.modifier] : false

                return (
                  <button
                    key={key.label}
                    type="button"
                    aria-pressed={isActive}
                    className={isActive ? btnActive : btnNormal}
                    onPointerDown={e => {
                      e.preventDefault()
                      const { modifier, data } = key
                      if (modifier) {
                        // 粘滞修饰键：单次切换，不连发
                        press(() => {
                          onToggleSticky(modifier)
                          onFocusTerminal()
                        }, false)
                        return
                      }
                      if (data) {
                        press(() => handleSend(data), true)
                      }
                    }}
                    onContextMenu={e => e.preventDefault()}
                  >
                    <span className="block max-w-full overflow-hidden whitespace-nowrap text-center leading-none [text-wrap:nowrap]">
                      {key.label}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Terminal Component
// ============================================

interface TerminalProps {
  ptyId: string
  directory?: string
  /** 数据所属服务器（缺省用活动服务器） */
  serverId?: string
  isActive: boolean
  terminalScopeKey?: string
}

export const Terminal = memo(function Terminal({
  ptyId,
  directory,
  serverId,
  isActive,
  terminalScopeKey,
}: TerminalProps) {
  const { t } = useTranslation('components')
  const [snapshotError, setSnapshotError] = useState<string | null>(null)
  const [remoteExited, setRemoteExited] = useState(false)
  const [replayGap, setReplayGap] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalDirectoryRef = useRef(directory)
  const [isTouchScrolling, setIsTouchScrolling] = useState(false)
  const [stickyModifiers, setStickyModifiers] = useState<StickyModifiers>(() => createStickyModifiers())
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const stickyModifiersRef = useRef<StickyModifiers>(createStickyModifiers())
  const transportSendRef = useRef<((data: string) => void) | null>(null)
  const transportDisconnectRef = useRef<(() => void) | null>(null)
  const resizeTimeoutRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const isPanelResizingRef = useRef(false)
  const [hasBeenActive, setHasBeenActive] = useState(isActive)
  const { preferTouchUi, hasTouch, hasCoarsePointer } = useInputCapabilities()
  const { manualTerminalTitles, terminalFontSize, terminalFontFamily } = useTheme()
  const { terminalCopyOnSelect, terminalRightClickPaste } = useLayoutStore()
  const touchCapable = hasTouch || hasCoarsePointer
  const manualTerminalTitlesRef = useRef(manualTerminalTitles)
  const terminalCopyOnSelectRef = useRef(terminalCopyOnSelect)
  const terminalRightClickPasteRef = useRef(terminalRightClickPaste)
  // 字号 / 字体：初始化时读一次，之后改了要热更新到已打开的终端
  const terminalFontSizeRef = useRef(terminalFontSize)
  const terminalFontFamilyRef = useRef(terminalFontFamily)
  /** 已经应用到终端上的字号 / 字体（用来跳过重复应用） */
  const appliedFontRef = useRef<{ size: number; family: string } | null>(null)

  const clearStickyModifiers = useCallback(() => {
    const next = createStickyModifiers()
    stickyModifiersRef.current = next
    setStickyModifiers(next)
  }, [])

  const toggleStickyModifier = useCallback((modifier: ModifierKey) => {
    setStickyModifiers(prev => {
      const next = { ...prev, [modifier]: !prev[modifier] }
      stickyModifiersRef.current = next
      return next
    })
  }, [])

  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  const sendTerminalData = useCallback(
    (data: string) => {
      const sticky = stickyModifiersRef.current
      const outgoing = applyStickyModifiers(data, sticky)

      transportSendRef.current?.(outgoing)

      if (hasStickyModifier(sticky)) {
        clearStickyModifiers()
      }
    },
    [clearStickyModifiers],
  )

  useEffect(() => {
    manualTerminalTitlesRef.current = manualTerminalTitles
  }, [manualTerminalTitles])

  useEffect(() => {
    terminalCopyOnSelectRef.current = terminalCopyOnSelect
  }, [terminalCopyOnSelect])

  useEffect(() => {
    terminalRightClickPasteRef.current = terminalRightClickPaste
  }, [terminalRightClickPaste])

  useEffect(() => {
    terminalFontSizeRef.current = terminalFontSize
  }, [terminalFontSize])

  useEffect(() => {
    terminalFontFamilyRef.current = terminalFontFamily
  }, [terminalFontFamily])

  // 当 tab 第一次变为活动状态时，标记它
  useEffect(() => {
    if (isActive && !hasBeenActive) {
      setHasBeenActive(true)
    }
  }, [isActive, hasBeenActive])

  // 初始化终端
  useEffect(() => {
    if (!containerRef.current) return
    if (!hasBeenActive) return

    // Read latest snapshot values from the store directly, not from
    // the render closure. This breaks the infinite cycle:
    //   old terminal cleanup → updateTerminalSnapshot → notify →
    //   re-render → effect deps changed → cleanup → notify → ...
    const freshTab = layoutStore
      .getState()
      .panelTabs.find(t => t.id === ptyId && t.terminalScopeKey === terminalScopeKey && t.type === 'terminal')
    const effectBuffer = typeof freshTab?.buffer === 'string' ? freshTab.buffer : ''
    const effectScrollY = typeof freshTab?.scrollY === 'number' ? freshTab.scrollY : undefined
    const effectCursor =
      typeof freshTab?.cursor === 'number' && Number.isSafeInteger(freshTab.cursor) && freshTab.cursor >= 0
        ? freshTab.cursor
        : 0
    const effectCols =
      typeof freshTab?.cols === 'number' && Number.isSafeInteger(freshTab.cols) && freshTab.cols > 0
        ? freshTab.cols
        : undefined
    const effectRows =
      typeof freshTab?.rows === 'number' && Number.isSafeInteger(freshTab.rows) && freshTab.rows > 0
        ? freshTab.rows
        : undefined

    const restoreSize = effectBuffer && effectCols && effectRows ? { cols: effectCols, rows: effectRows } : undefined

    mountedRef.current = true
    let disposed = false
    let restored = !effectBuffer
    setRemoteExited(freshTab?.status === 'exited')
    let ws: WebSocket | null = null
    let wsConnectTimeout: number | null = null
    let disposeData: { dispose: () => void } | null = null
    let disposeTitle: { dispose: () => void } | null = null
    const terminalDirectory = terminalDirectoryRef.current

    const touchUi = preferTouchUi
    const theme = getTerminalTheme(isDarkMode())

    // 终端字号 / 字体来自设置（未设置字体时跟随主题 --font-mono）
    const fontSize = effectiveTerminalFontSize(terminalFontSizeRef.current, touchUi)
    const fontFamily = resolveTerminalFontFamily(terminalFontFamilyRef.current)
    appliedFontRef.current = { size: fontSize, family: fontFamily }

    const terminal = new XTerm({
      theme,
      fontFamily,
      fontSize: fontSize,
      lineHeight: touchUi ? Math.max(TERMINAL_LINE_HEIGHT, 1.3) : TERMINAL_LINE_HEIGHT,
      ...(restoreSize ? { cols: restoreSize.cols, rows: restoreSize.rows } : {}),
      cursorBlink: true,
      cursorStyle: 'block',
      smoothScrollDuration: touchUi ? 100 : 0,
      allowProposedApi: true,
      scrollback: 10000,
      convertEol: true,
      allowTransparency: true, // 开启透明背景
      ...(touchUi
        ? {
            scrollSensitivity: 2,
            macOptionIsMeta: true,
            disableStdin: false,
          }
        : {}),
    })

    const fitAddon = new FitAddon()
    const serializeAddon = new SerializeAddon()
    const webLinksAddon = new WebLinksAddon((_event, uri) => {
      if (isTauri()) {
        import('@tauri-apps/plugin-opener').then(mod => mod.openUrl(uri)).catch(() => window.open(uri))
      } else {
        window.open(uri)
      }
    })

    terminal.loadAddon(fitAddon)
    terminal.loadAddon(serializeAddon)
    terminal.loadAddon(webLinksAddon)

    terminal.open(containerRef.current)

    // WebGL 渲染器: GPU 加速，大幅提升 TUI 渲染性能
    // 若 WebGL 不可用则静默回退到内置 DOM 渲染器
    const webglAddon = new WebglAddon()
    webglAddon.onContextLoss(() => {
      webglAddon.dispose()
      logger.log('[Terminal] WebGL context lost, falling back to DOM renderer')
    })
    try {
      terminal.loadAddon(webglAddon)
    } catch {
      webglAddon.dispose()
      logger.log('[Terminal] WebGL not available, using DOM renderer')
    }

    const textarea = terminal.textarea
    const handleTextareaBlur = () => clearStickyModifiers()

    terminal.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown') return true

      const action = keybindingStore.findMatchingAction(event, 'terminal')
      if (action === 'terminal.paste') {
        if (isNativePasteShortcut(event)) {
          return false
        }

        event.preventDefault()
        void readTextFromClipboard()
          .then(text => {
            if (!text || disposed) return
            sendTerminalData(text)
          })
          .catch(() => {})
        return false
      }

      if (action !== 'terminal.copySelection' || !terminal.hasSelection()) return true

      const selected = terminal.getSelection()
      if (!selected) return true

      event.preventDefault()
      void copyTextToClipboard(selected).catch(() => {})
      terminal.clearSelection()
      return false
    })

    const terminalElement = terminal.element
    const handleSelectionCopy = (event: MouseEvent) => {
      if (event.button !== 0) return
      if (!terminalCopyOnSelectRef.current || !terminal.hasSelection()) return

      const selected = terminal.getSelection()
      if (!selected) return

      void copyTextToClipboard(selected)
        .then(() => terminal.clearSelection())
        .catch(() => {})
    }

    const handleContextMenuPaste = (event: MouseEvent) => {
      if (!terminalRightClickPasteRef.current) return

      if (terminal.hasSelection()) {
        event.preventDefault()
        const selected = terminal.getSelection()
        if (selected) {
          void copyTextToClipboard(selected).catch(() => {})
          terminal.clearSelection()
        }
        return
      }

      if (!canReadClipboardText()) {
        terminal.focus()
        return
      }

      event.preventDefault()
      void readTextFromClipboard()
        .then(text => {
          if (!text || disposed) return
          sendTerminalData(text)
          terminal.focus()
        })
        .catch(() => {})
    }

    terminalElement?.addEventListener('mouseup', handleSelectionCopy)
    terminalElement?.addEventListener('contextmenu', handleContextMenuPaste)
    if (touchUi && textarea) {
      textarea.setAttribute('autocapitalize', 'none')
      textarea.setAttribute('autocomplete', 'off')
      textarea.setAttribute('autocorrect', 'off')
      textarea.setAttribute('enterkeyhint', 'send')
      textarea.setAttribute('inputmode', 'text')
      textarea.setAttribute('spellcheck', 'false')
      textarea.addEventListener('blur', handleTextareaBlur)
    }

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const checkpoint = createTerminalCheckpoint({
      cursor: effectCursor,
      write: (data, callback) => terminal.write(data, callback),
      read: () => ({
        buffer: serializeAddon.serialize(),
        scrollY: terminal.buffer.active.viewportY,
        rows: terminal.rows,
        cols: terminal.cols,
      }),
      save: snapshot => layoutStore.updateTerminalSnapshot(ptyId, snapshot, terminalScopeKey),
      isReady: () => restored,
      onReplayGap: () => {
        if (!disposed) setReplayGap(true)
      },
      onError: error => {
        if (error) logger.error('[Terminal] Checkpoint failed:', ptyId, error)
        if (!disposed) setSnapshotError(error ? String(error) : null)
      },
    })
    const flushCheckpoint = () => checkpoint.flush(true)
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushCheckpoint()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', flushCheckpoint)

    // 连接 WebSocket（带自动重连）
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    const MAX_RECONNECT_DELAY = 30000 // 最大 30s
    const BASE_RECONNECT_DELAY = 1000 // 起始 1s
    let intentionalClose = false // 标记主动关闭
    const useNativePtyBridge = isTauri()
    // 已经提示过的排查方向（重连会反复失败，同一条只写一次，避免刷屏）
    const printedHintsRef = new Set<string>()

    const resetTransport = () => {
      transportSendRef.current = null
      transportDisconnectRef.current = null
    }

    const handleConnected = () => {
      logger.log(useNativePtyBridge ? '[Terminal/Tauri] Connected:' : '[Terminal] WebSocket connected:', ptyId)
      if (disposed) return
      reconnectAttempt = 0
      layoutStore.updateTerminalTab(ptyId, { status: 'connected' }, terminalScopeKey)
      const { cols, rows } = terminal
      logger.log('[Terminal] Sending size:', cols, 'x', rows)
      updatePtySession(ptyId, { size: { cols, rows } }, terminalDirectory, serverId).catch(error =>
        logger.warn('[Terminal] Resize failed:', error),
      )
    }

    const markExited = () => {
      setRemoteExited(true)
      layoutStore.updateTerminalTab(ptyId, { status: 'exited' }, terminalScopeKey)
    }

    const handleDisconnected = ({
      code,
      reason,
      hint,
    }: {
      code?: number
      reason?: string
      /** 可执行的排查提示（目前只有票据 403 会带）——同一条只打印一次 */
      hint?: string
    }) => {
      logger.log(
        useNativePtyBridge ? '[Terminal/Tauri] Disconnected:' : '[Terminal] WebSocket closed:',
        ptyId,
        code,
        reason,
      )
      resetTransport()
      if (disposed) return
      layoutStore.updateTerminalTab(ptyId, { status: 'disconnected' }, terminalScopeKey)

      if (intentionalClose) return
      if (code === 4404) {
        markExited()
        return
      }

      if (reconnectTimer !== null) return

      // 把服务端给的原因写出来（之前只进日志），否则用户只看到无限重连
      if (reason) {
        terminal.write(`\r\n\x1b[31m${i18n.t('components:terminal.connectFailed', { message: reason })}\x1b[0m\r\n`)
      }
      if (hint && !printedHintsRef.has(hint)) {
        printedHintsRef.add(hint)
        terminal.write(`\x1b[33m${hint}\x1b[0m\r\n`)
      }

      reconnectAttempt++
      const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempt - 1), MAX_RECONNECT_DELAY)
      terminal.write(`\r\n\x1b[90m[Disconnected, reconnecting in ${(delay / 1000).toFixed(0)}s...]\x1b[0m\r\n`)
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        if (!disposed) {
          connectTransport()
        }
      }, delay)
    }

    const openTransport = (cursor: number) => {
      if (disposed) return

      fitAddon.fit()

      if (useNativePtyBridge) {
        logger.log(
          '[Terminal/Tauri] Connecting PTY bridge:',
          ptyId,
          reconnectAttempt > 0 ? `(reconnect #${reconnectAttempt})` : '',
        )
        void import('../api/ptyBridge')
          .then(({ connectTauriPty }) =>
            connectTauriPty({
              ptyId,
              directory: terminalDirectory,
              cursor,
              serverId,
              onConnected: handleConnected,
              onMessage: chunk => {
                if (!disposed) checkpoint.accept(chunk)
              },
              onDisconnected: handleDisconnected,
              onError: message => {
                logger.log('[Terminal/Tauri] PTY bridge error:', ptyId, message)
              },
            }),
          )
          .then(connection => {
            if (!connection) return
            if (disposed) {
              connection.close()
              return
            }
            transportSendRef.current = data => connection.send(data)
            transportDisconnectRef.current = () => connection.close()
          })
          .catch(error => {
            const { message, hint } = describePtyConnectFailure(error)
            logger.log('[Terminal/Tauri] Failed to initialize PTY bridge:', ptyId, message)
            handleDisconnected({ reason: message, hint })
          })
      } else {
        // v2 的 WS 连接需要先异步换取一次性 ticket（见 api/pty.getPtyConnectUrl）
        void getPtyConnectUrl(ptyId, terminalDirectory, { cursor }, serverId)
          .then(wsUrl => {
            if (disposed) return
            logger.log(
              '[Terminal] Connecting PTY:',
              ptyId,
              reconnectAttempt > 0 ? `(reconnect #${reconnectAttempt})` : '',
            )
            ws = new WebSocket(wsUrl)
            ws.binaryType = 'arraybuffer'
            transportSendRef.current = data => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(data)
              }
            }
            transportDisconnectRef.current = () => ws?.close()

            ws.onopen = handleConnected

            ws.onmessage = event => {
              if (!disposed) checkpoint.accept(event.data as string | ArrayBuffer)
            }

            ws.onclose = e => {
              handleDisconnected({ code: e.code, reason: e.reason })
            }

            ws.onerror = e => {
              logger.log('[Terminal] WebSocket error:', ptyId, e)
              // onclose 会在 onerror 之后触发，重连逻辑交给 onclose
            }
          })
          .catch(error => {
            const { message, hint } = describePtyConnectFailure(error)
            logger.log('[Terminal] Failed to prepare PTY WebSocket URL:', ptyId, message)
            handleDisconnected({ reason: message, hint })
          })
      }

      disposeData?.dispose()
      disposeData = terminal.onData(data => {
        sendTerminalData(data)
      })
    }

    let connecting = false
    const connectTransport = () => {
      if (disposed || connecting) return
      connecting = true
      checkpoint.drain(cursor => {
        void getPtySession(ptyId, terminalDirectory, serverId)
          .then(pty => {
            if (disposed) return
            if (pty.status === 'exited') {
              markExited()
              return
            }
            openTransport(cursor)
          })
          .catch(error => {
            if (disposed) return
            if (isPtyNotFoundError(error)) {
              markExited()
              return
            }
            logger.error('[Terminal] Cannot reconnect:', ptyId, error)
            handleDisconnected({ reason: String(error) })
          })
          .finally(() => {
            connecting = false
          })
      })
    }

    const scheduleInitialConnect = () => {
      if (freshTab?.status === 'exited') return
      wsConnectTimeout = requestAnimationFrame(connectTransport) as unknown as number
    }

    if (effectBuffer) {
      terminal.write(effectBuffer, () => {
        if (disposed) return
        restored = true
        if (effectScrollY !== undefined) {
          terminal.scrollToLine(effectScrollY)
        }
        scheduleInitialConnect()
      })
    } else {
      scheduleInitialConnect()
    }

    disposeTitle = terminal.onTitleChange(title => {
      if (disposed) return
      layoutStore.updateTerminalShellTitle(ptyId, title, manualTerminalTitlesRef.current, terminalScopeKey)
    })

    return () => {
      checkpoint.dispose()
      disposed = true
      mountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', flushCheckpoint)
      intentionalClose = true
      if (wsConnectTimeout) {
        cancelAnimationFrame(wsConnectTimeout)
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
        resizeTimeoutRef.current = null
      }

      transportDisconnectRef.current?.()
      disposeData?.dispose()
      disposeTitle?.dispose()
      textarea?.removeEventListener('blur', handleTextareaBlur)
      terminalElement?.removeEventListener('mouseup', handleSelectionCopy)
      terminalElement?.removeEventListener('contextmenu', handleContextMenuPaste)
      resetTransport()
      // 显式 dispose addons
      fitAddon.dispose()
      serializeAddon.dispose()
      webLinksAddon.dispose()
      webglAddon.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [ptyId, hasBeenActive, clearStickyModifiers, sendTerminalData, preferTouchUi, serverId, terminalScopeKey])

  useEffect(() => {
    const container = containerRef.current
    const terminal = terminalRef.current
    if (!container || !terminal) return
    if (!touchCapable) return

    let touchStartY = 0
    let scrollStart = 0
    let lastTouchY = 0
    let lastTouchTime = 0
    let velocity = 0
    let momentumRaf = 0

    const stopMomentum = () => {
      if (momentumRaf) {
        cancelAnimationFrame(momentumRaf)
        momentumRaf = 0
      }
    }

    const startMomentum = () => {
      const viewport = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null
      if (!viewport || Math.abs(velocity) < 0.5) {
        setIsTouchScrolling(false)
        return
      }

      const friction = 0.95
      const step = () => {
        velocity *= friction
        if (Math.abs(velocity) < 0.5) {
          momentumRaf = 0
          // 惯性结束后延迟淡出滚动条
          setTimeout(() => setIsTouchScrolling(false), 600)
          return
        }
        viewport.scrollTop += velocity
        momentumRaf = requestAnimationFrame(step)
      }
      momentumRaf = requestAnimationFrame(step)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      stopMomentum()
      const y = e.touches[0].clientY
      touchStartY = y
      lastTouchY = y
      lastTouchTime = Date.now()
      velocity = 0
      const viewport = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null
      scrollStart = viewport?.scrollTop ?? 0
      setIsTouchScrolling(false)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const viewport = terminal.element?.querySelector('.xterm-viewport') as HTMLElement | null
      if (!viewport) return

      const y = e.touches[0].clientY
      const delta = touchStartY - y

      if (Math.abs(delta) > 6) {
        setIsTouchScrolling(true)
      }

      // 计算速度（用于惯性）
      const now = Date.now()
      const dt = now - lastTouchTime
      if (dt > 0) {
        velocity = ((lastTouchY - y) / dt) * 16 // 归一化到每帧 px
      }
      lastTouchY = y
      lastTouchTime = now

      viewport.scrollTop = scrollStart + delta
      if (touchCapable) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      startMomentum()
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      stopMomentum()
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isActive, touchCapable])

  // 处理大小变化
  useEffect(() => {
    if (!isActive || !fitAddonRef.current || !terminalRef.current) return

    const handleResize = () => {
      if (isPanelResizingRef.current) return

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        if (fitAddonRef.current && terminalRef.current && !isPanelResizingRef.current) {
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          updatePtySession(ptyId, { size: { cols, rows } }, terminalDirectoryRef.current, serverId).catch(error =>
            logger.warn('[Terminal] Resize failed:', error),
          )
        }
      }, 16)
    }

    window.addEventListener('resize', handleResize)
    const resizeObserver = new ResizeObserver(handleResize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    const handlePanelResizeStart = () => {
      isPanelResizingRef.current = true
    }
    window.addEventListener('panel-resize-start', handlePanelResizeStart)

    handleResize()

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('panel-resize-start', handlePanelResizeStart)
      resizeObserver.disconnect()
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current)
        resizeTimeoutRef.current = null
      }
    }
  }, [isActive, ptyId, serverId])

  /**
   * 把当前的字号 / 字体设置应用到已打开的终端。
   *
   * xterm 允许运行时改 options.fontSize / fontFamily：字符尺寸变了之后
   * 必须重新 fit 算行列数，再把新尺寸同步给服务端（否则 TUI 排版错位）。
   */
  const applyFontOptions = useCallback(() => {
    const terminal = terminalRef.current
    const fitAddon = fitAddonRef.current
    if (!terminal || !fitAddon) return

    const size = effectiveTerminalFontSize(terminalFontSizeRef.current, preferTouchUi)
    const family = resolveTerminalFontFamily(terminalFontFamilyRef.current)
    const applied = appliedFontRef.current
    if (applied && applied.size === size && applied.family === family) return
    appliedFontRef.current = { size, family }

    terminal.options.fontSize = size
    terminal.options.fontFamily = family

    fitAddon.fit()
    const { cols, rows } = terminal
    void updatePtySession(ptyId, { size: { cols, rows } }, terminalDirectoryRef.current, serverId).catch(error =>
      logger.warn('[Terminal] Resize failed:', error),
    )
  }, [preferTouchUi, ptyId, serverId])

  // 设置里改了字号 / 字体 → 立刻作用到已打开的终端
  useEffect(() => {
    applyFontOptions()
  }, [applyFontOptions, terminalFontSize, terminalFontFamily])

  // 主题变化时更新
  useEffect(() => {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-mode') {
          if (terminalRef.current) {
            terminalRef.current.options.theme = getTerminalTheme(isDarkMode())
          }
          // --font-mono 可能随主题变：跟着重新应用字体设置
          applyFontOptions()
          break
        }
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    })

    return () => observer.disconnect()
  }, [applyFontOptions])

  // 当 tab 变为活动状态时，聚焦并重新 fit
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
      if (fitAddonRef.current) {
        requestAnimationFrame(() => {
          fitAddonRef.current?.fit()
        })
      }
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) {
      clearStickyModifiers()
    }
  }, [isActive, clearStickyModifiers])

  // 监听面板 resize 结束事件
  useEffect(() => {
    if (!isActive) return

    const handlePanelResizeEnd = () => {
      isPanelResizingRef.current = false
      if (fitAddonRef.current && terminalRef.current) {
        requestAnimationFrame(() => {
          if (!fitAddonRef.current || !terminalRef.current) return
          fitAddonRef.current.fit()
          const { cols, rows } = terminalRef.current
          updatePtySession(ptyId, { size: { cols, rows } }, terminalDirectoryRef.current, serverId).catch(error =>
            logger.warn('[Terminal] Resize failed:', error),
          )
        })
      }
    }

    window.addEventListener('panel-resize-end', handlePanelResizeEnd)
    return () => window.removeEventListener('panel-resize-end', handlePanelResizeEnd)
  }, [isActive, ptyId, serverId])

  return (
    <>
      <style>{`
        .xterm-viewport, 
        .xterm-screen, 
        .xterm-scrollable-element {
          background-color: transparent !important;
        }
        .xterm {
          padding: 0 !important;
        }
        /* 滚动条基础样式 */
        .xterm-viewport {
          scrollbar-width: thin;
          scrollbar-color: hsl(var(--border-300) / 0.25) transparent;
        }
        .xterm-viewport::-webkit-scrollbar {
          width: 6px;
          background: transparent;
        }
        .xterm-viewport::-webkit-scrollbar-track {
          background: transparent;
        }
        .xterm-viewport::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border-300) / 0.25);
          border-radius: 99px;
          transition: background-color 0.2s ease;
        }
        .xterm-viewport::-webkit-scrollbar-thumb:hover {
          background-color: hsl(var(--border-300) / 0.5);
        }
        /* 移动端：空闲时滚动条淡出，滚动时显示 */
        .scrollbar-idle .xterm-viewport::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border-300) / 0);
          transition: background-color 0.8s ease;
        }
        .scrollbar-active .xterm-viewport::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border-300) / 0.35);
          transition: background-color 0.15s ease;
        }
      `}</style>
      <div
        className="flex flex-col h-full w-full"
        style={{
          visibility: isActive ? 'visible' : 'hidden',
          position: isActive ? 'relative' : 'absolute',
          pointerEvents: isActive ? 'auto' : 'none',
          inset: isActive ? undefined : 0,
        }}
      >
        {replayGap && (
          <div role="status" className="shrink-0 px-3 py-2 text-text-300 text-[length:var(--fs-sm)]">
            {t('terminal.replayGap')}
          </div>
        )}
        {remoteExited && (
          <div role="status" className="shrink-0 px-3 py-2 text-text-300 text-[length:var(--fs-sm)]">
            {t('terminal.remoteExited')}
          </div>
        )}
        {snapshotError && (
          <div role="alert" className="shrink-0 px-3 py-2 text-text-300 text-[length:var(--fs-sm)]">
            {t('terminal.snapshotFailed')}: {snapshotError}
          </div>
        )}
        <div
          ref={containerRef}
          className={`flex-1 min-h-0 w-full bg-bg-100 ${preferTouchUi ? 'no-scrollbar' : ''} ${preferTouchUi ? (isTouchScrolling ? 'scrollbar-active' : 'scrollbar-idle') : ''}`}
          style={{
            padding: preferTouchUi ? '0' : '4px 0 0 4px',
            touchAction: touchCapable ? 'pan-y' : 'auto',
          }}
          onClick={() => {
            if (preferTouchUi && terminalRef.current) {
              focusTerminal()
            }
          }}
          onTouchEnd={e => {
            if (terminalRef.current && e.target === containerRef.current) {
              focusTerminal()
            }
          }}
        />
        {preferTouchUi && (
          <MobileExtraKeys
            stickyModifiers={stickyModifiers}
            onToggleSticky={toggleStickyModifier}
            onSend={sendTerminalData}
            onFocusTerminal={focusTerminal}
          />
        )}
      </div>
    </>
  )
})
