// ============================================
// FileViewer - 单个打开文件的展示面板
// ============================================
//
// 一个打开的文件 = 面板里的一个 'file' 标签页，内容整页展示（不再从下方顶开）。
// 编辑态是显式的：铅笔 → ✓ 保存 / ✕ 取消。dirty = 草稿与磁盘内容不同；
// 保存失败在内容区顶部给横幅，冲突（STALE_REVISION）额外给"重新载入 / 覆盖"。

import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { layoutStore, type PreviewFile } from '../store/layoutStore'
import {
  DownloadIcon,
  MaximizeIcon,
  PencilIcon,
  CheckIcon,
  CloseIcon,
} from './Icons'
import { CodePreview } from './CodePreview'
import { EditConfirmDialog } from './EditConfirmDialog'
import { hashBytes } from '../utils/textEncoding'
import { HtmlFilePreviewFrame } from './HtmlFilePreviewFrame'
import { MarkdownRenderer } from './MarkdownRenderer'
import { useFullscreenLayer } from '../contexts'
import { getMaterialIconUrl } from '../utils/materialIcons'
import { detectLanguage } from '../utils/languageUtils'
import {
  getPreviewCategory,
  isTextualMedia,
  buildBytesDataUrl,
  buildTextDataUrl,
  formatMimeType,
  type PreviewCategory,
} from '../utils/mimeUtils'
import { getMimeFromPath } from '../features/chat/input/inputUtils'
import { downloadFileContent } from '../utils/downloadUtils'
import { useFilePreview } from '../hooks/useFilePreview'
import { fileEditorId, registerFileEditorCloseHandler, setFileEditorDirty } from '../store/unsavedFileStore'
import type { TargetLineRange } from './codeMirrorReadonlyExtensions'

const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/x-markdown', 'text/md', 'application/markdown'])
const HTML_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml'])

function isMarkdownPreview(language: string, mimeType?: string): boolean {
  if (language === 'markdown' || language === 'mdx') return true
  if (!mimeType) return false
  return MARKDOWN_MIME_TYPES.has(mimeType.split(';', 1)[0].toLowerCase())
}

function isHtmlPreview(language: string, mimeType?: string): boolean {
  if (language === 'html') return true
  if (!mimeType) return false
  return HTML_MIME_TYPES.has(mimeType.split(';', 1)[0].toLowerCase())
}

export interface FileViewerProps {
  /** 面板标签 id */
  tabId: string
  /** 这一页展示的文件 */
  file: PreviewFile
  /** 数据所属服务器（缺省用活动服务器） */
  serverId?: string
  /** 所属会话 */
  sessionId?: string | null
  isPanelResizing?: boolean
}

export const FileViewer = memo(function FileViewer({
  tabId,
  file,
  serverId,
  sessionId,
  isPanelResizing = false,
}: FileViewerProps) {
  const { t } = useTranslation(['components', 'common'])

  const path = file.path
  const directory = file.directory
  // 文件标签记住自己所属的服务器：切服务器后仍然读原来的服务器
  const fileServerId = file.serverId ?? serverId
  const editorId = fileEditorId(fileServerId, directory, path)
  // 会话事件只认同一个服务器的会话，否则跨服务器的 idle 会误触发刷新
  const fileSessionId = file.serverId && serverId && file.serverId !== serverId ? null : sessionId

  const { content, loading, error, reload, save, externalChange, clearExternalChange } = useFilePreview({
    path,
    directory,
    serverId: fileServerId,
    sessionId: fileSessionId,
    consumerId: `file-preview-${tabId}`,
  })

  // ============================================
  // 编辑模式
  // ============================================
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveConflict, setSaveConflict] = useState(false)
  /** 上次保存因混合行尾被拒（显示"按多数行尾统一"兜底按钮） */
  const [mixEolFallback, setMixEolFallback] = useState(false)
  /** 进入编辑时的基线指纹：保存前用它判断磁盘是否被别人改过 */
  const [baselineHash, setBaselineHash] = useState<string | undefined>()

  const originalText = content && !content.isBinary ? content.content : ''

  const beginEditing = useCallback(() => {
    if (!content || content.isBinary) return
    setDraft(content.content)
    setSaveError(null)
    setSaveConflict(false)
    setBaselineHash(content.bytes ? hashBytes(content.bytes) : undefined)
    setIsEditing(true)
  }, [content])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setDraft('')
    setSaveError(null)
    setSaveConflict(false)
  }, [])

  const saveEditing = useCallback(
    async (force = false, unifyEol = false) => {
      if (isSaving) return
      setIsSaving(true)
      setSaveError(null)
      try {
        await save(draft, baselineHash, force, unifyEol)
        setIsEditing(false)
        setSaveConflict(false)
        setMixEolFallback(false)
      } catch (failure) {
        setSaveError(failure instanceof Error ? failure.message : t('fileExplorer.saveFailed'))
        setMixEolFallback(
          Boolean(failure && typeof failure === 'object' && 'code' in failure && failure.code === 'MIXED_EOL'),
        )
        setSaveConflict(
          Boolean(failure && typeof failure === 'object' && 'code' in failure && failure.code === 'STALE_REVISION'),
        )
      } finally {
        setIsSaving(false)
      }
    },
    [baselineHash, draft, isSaving, save, t],
  )

  const isDirty = isEditing && draft !== originalText
  const isDirtyRef = useRef(isDirty)
  isDirtyRef.current = isDirty

  /**
   * 二次确认：写盘前、丢改动前都先让人看一眼 diff（防误触）。
   * run 是"确认后才执行"的动作。
   */
  const [confirmState, setConfirmState] = useState<{ mode: 'save' | 'discard'; conflict?: boolean; run: () => void } | null>(
    null,
  )
  const requestSave = useCallback(
    (force: boolean) => {
      if (!isDirty && !force) return
      setConfirmState({ mode: 'save', conflict: force || saveConflict, run: () => void saveEditing(force) })
    },
    [isDirty, saveConflict, saveEditing],
  )
  const requestDiscard = useCallback(
    (run: () => void) => {
      if (!isDirty) {
        run()
        return
      }
      setConfirmState({ mode: 'discard', run })
    },
    [isDirty],
  )

  // 面板标签上的关闭按钮：脏内容要先确认再丢
  const handleCloseRequest = useCallback(() => {
    if (!isDirtyRef.current) {
      layoutStore.removeTab(tabId)
      return
    }
    setConfirmState({ mode: 'discard', run: () => layoutStore.removeTab(tabId) })
  }, [tabId])
  useEffect(() => registerFileEditorCloseHandler(editorId, handleCloseRequest), [editorId, handleCloseRequest])

  /** 外部改动的一次性轻提示（几秒后自己消失，不打断输入） */
  const [externalNotice, setExternalNotice] = useState<string | null>(null)
  useEffect(() => {
    if (!externalChange || externalChange.path !== path) return
    if (isDirty) {
      // 我在改、磁盘也变了：不覆盖草稿，标成冲突，保存时基线比对会再确认一次
      setSaveConflict(true)
      setSaveError(t('fileExplorer.saveConflict'))
    } else {
      setExternalNotice(t('fileExplorer.externalUpdated'))
    }
    clearExternalChange()
  }, [clearExternalChange, externalChange, isDirty, path, t])

  useEffect(() => {
    if (!externalNotice) return
    const timer = window.setTimeout(() => setExternalNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [externalNotice])

  // 应用级脏标记（关窗/离开前拦一道）
  useEffect(() => {
    setFileEditorDirty(editorId, isDirty)
    return () => setFileEditorDirty(editorId, false)
  }, [editorId, isDirty])

  useEffect(() => {
    if (!isDirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  // Ctrl/Cmd+S 保存（编辑器自身不绑，避免和输入框抢）
  useEffect(() => {
    if (!isEditing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        requestSave(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isEditing, requestSave])

  const fileName = path?.split(/[/\\]/).pop() || 'Untitled'
  const language = path ? detectLanguage(path) : 'text'

  const handleDownload = useCallback(() => {
    if (content) {
      downloadFileContent(content, fileName)
    }
  }, [content, fileName])

  // 处理内容类型分发
  const displayContent = useMemo(() => {
    if (!content) return null

    // v2 的 file.read 只返回原始字节：没有 mimeType，也没有 base64 encoding。
    // MIME 由路径推断，二进制与否用解码结果判断。
    const mimeType = getMimeFromPath(content.path)
    const isBinary = content.isBinary
    const category = getPreviewCategory(mimeType)

    if (isHtmlPreview(language, mimeType)) {
      return { type: 'html' as const, text: content.content }
    }

    if (isMarkdownPreview(language, mimeType)) {
      return { type: 'markdown' as const, text: content.content }
    }

    // 文本型可渲染媒体（如 SVG）— 同时提供渲染和源码
    if (isTextualMedia(mimeType)) {
      return {
        type: 'textMedia' as const,
        text: content.content,
        dataUrl: buildTextDataUrl(mimeType, content.content),
        category: category!,
        mimeType,
      }
    }

    // 二进制 + 可预览的媒体类型：从原始字节构造 data URL
    if (isBinary && category) {
      return {
        type: 'media' as const,
        category,
        dataUrl: buildBytesDataUrl(mimeType, content.bytes),
        mimeType,
      }
    }

    // 二进制 + 不可预览
    if (isBinary) {
      return {
        type: 'binary' as const,
        mimeType: mimeType || 'application/octet-stream',
      }
    }

    // 显示文件内容
    return { type: 'text' as const, text: content.content }
  }, [content, language])

  // 全屏内容
  const fullscreenContent = useMemo((): ReactNode => {
    if (!displayContent) return null
    switch (displayContent.type) {
      case 'media':
        return (
          <MediaPreview
            category={displayContent.category}
            dataUrl={displayContent.dataUrl}
            mimeType={displayContent.mimeType}
            fileName={fileName}
          />
        )
      case 'binary':
        return <BinaryPlaceholder mimeType={displayContent.mimeType} fileName={fileName} onDownload={handleDownload} />
      case 'textMedia':
        return (
          <TextMediaPreview
            key={file.targetKey ?? path ?? fileName}
            dataUrl={displayContent.dataUrl}
            text={displayContent.text}
            language={language || 'xml'}
            fileName={fileName}
            isResizing={false}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        )
      case 'markdown':
        return (
          <MarkdownFilePreview
            key={file.targetKey ?? path ?? fileName}
            text={displayContent.text}
            isResizing={false}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        )
      case 'html':
        return (
          <HtmlFilePreview
            key={file.targetKey ?? path ?? fileName}
            text={displayContent.text}
            fileName={fileName}
            filePath={path ?? fileName}
            directory={directory}
            isResizing={false}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        )
      case 'text':
        return (
          <CodePreview
            code={displayContent.text}
            language={language || 'text'}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        )
      default:
        return null
    }
  }, [directory, displayContent, file, fileName, handleDownload, language, path])

  const fullscreenHeaderRight = useMemo(
    () =>
      content ? (
        <button
          onClick={handleDownload}
          className="p-1.5 text-text-400 hover:text-text-100 hover:bg-bg-200/60 rounded-lg transition-colors"
          title={`${t('common:save')} ${fileName}`}
        >
          <DownloadIcon size={14} />
        </button>
      ) : null,
    [content, fileName, handleDownload, t],
  )

  const fullscreenLayer = useMemo(
    () =>
      fullscreenContent
        ? {
            id: `file-preview:${path || fileName}`,
            title: fileName,
            headerRight: fullscreenHeaderRight,
            content: fullscreenContent,
            deferContent: displayContent?.type === 'html',
          }
        : null,
    [displayContent?.type, fileName, fullscreenContent, fullscreenHeaderRight, path],
  )
  const { isOpen: isFullscreenOpen, open: openFullscreen } = useFullscreenLayer(fullscreenLayer)

  return (
    <div className="flex flex-col h-full relative">
      {/* 文件头：路径 + 操作 */}
      <div className="flex items-center justify-between gap-2 h-9 px-3 shrink-0 border-b border-border-100/30 bg-bg-100/50">
        <div className="flex items-center gap-1.5 min-w-0">
          <img
            src={getMaterialIconUrl(path, 'file')}
            alt=""
            width={14}
            height={14}
            className="shrink-0"
            onError={e => {
              e.currentTarget.style.visibility = 'hidden'
            }}
          />
          <span className="truncate font-mono text-[length:var(--fs-xs)] text-text-300" title={path}>
            {path}
          </span>
          {isDirty && (
            <span className="text-accent-main-100 shrink-0" title={t('fileExplorer.discardUnsaved')} aria-label="dirty">
              ●
            </span>
          )}
          {saveConflict && <span className="text-danger-100 shrink-0" aria-label="conflict">⚠</span>}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {content && !content.isBinary &&
            (isEditing ? (
              <>
                <button
                  onClick={() => requestSave(false)}
                  disabled={isSaving}
                  className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-300/50 rounded transition-colors disabled:opacity-50"
                  title={t('common:save')}
                  aria-label={t('common:save')}
                >
                  <CheckIcon size={12} />
                </button>
                <button
                  onClick={() => requestDiscard(cancelEditing)}
                  disabled={isSaving}
                  className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-300/50 rounded transition-colors disabled:opacity-50"
                  title={t('common:cancel')}
                  aria-label={t('common:cancel')}
                >
                  <CloseIcon size={12} />
                </button>
              </>
            ) : (
              <button
                onClick={beginEditing}
                className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-300/50 rounded transition-colors"
                title={t('common:edit')}
                aria-label={t('common:edit')}
              >
                <PencilIcon size={12} />
              </button>
            ))}
          {content && (
            <>
              <button
                onClick={openFullscreen}
                className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-300/50 rounded transition-colors"
                title={t('contentBlock.fullscreen')}
                aria-label={t('contentBlock.fullscreen')}
              >
                <MaximizeIcon size={12} />
              </button>
              <button
                onClick={handleDownload}
                className="p-1 text-text-400 hover:text-text-100 hover:bg-bg-300/50 rounded transition-colors"
                title={`${t('common:save')} ${fileName}`}
                aria-label={t('common:download')}
              >
                <DownloadIcon size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      <EditConfirmDialog
        isOpen={confirmState !== null}
        mode={confirmState?.mode ?? 'save'}
        fileName={fileName}
        before={confirmState?.mode === 'discard' ? draft : originalText}
        after={confirmState?.mode === 'discard' ? originalText : draft}
        language={language || 'text'}
        conflict={confirmState?.conflict}
        busy={isSaving}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const pending = confirmState
          setConfirmState(null)
          pending?.run()
        }}
      />

      {/* 文件内容 */}
      <div className="flex-1 overflow-auto panel-scrollbar">
        {externalNotice && (
          <div
            className="px-3 py-1 text-[length:var(--fs-xs)] text-text-400 bg-bg-200/30 border-b border-border-200/40"
            data-testid="preview-external-notice"
          >
            {externalNotice}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full text-text-400 text-[length:var(--fs-sm)]">
            {t('common:loading')}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-danger-100 text-[length:var(--fs-sm)] gap-1 px-4">
            <span className="text-center">{error}</span>
            <button
              onClick={() => void reload()}
              className="text-[length:var(--fs-xs)] text-accent-main-100 hover:underline"
            >
              {t('fileExplorer.reload')}
            </button>
          </div>
        ) : isEditing ? (
          // 编辑态优先于"预览类型"分发：md / html / svg 这类带预览的文件，
          // 进编辑态要直接切到源码编辑（而不是继续渲染预览）
          <div className="h-full min-h-0 flex flex-col">
            {saveError && (
              <div className="px-3 py-2 text-danger-100 text-[length:var(--fs-xs)] flex items-center justify-between gap-3">
                <span>{saveError}</span>
                {mixEolFallback && (
                  <button
                    className="text-accent-main-100 hover:underline shrink-0"
                    onClick={() => void saveEditing(false, true)}
                  >
                    {t('fileExplorer.unifyLineEndings')}
                  </button>
                )}
                {saveConflict && (
                  <span className="flex gap-2 shrink-0">
                    <button
                      className="text-text-200 hover:text-text-100"
                      onClick={() => {
                        setIsEditing(false)
                        setSaveError(null)
                        setSaveConflict(false)
                        void reload()
                      }}
                    >
                      {t('fileExplorer.reload')}
                    </button>
                    <button className="text-danger-100 hover:text-danger-200" onClick={() => requestSave(true)}>
                      {t('fileExplorer.overwrite')}
                    </button>
                  </span>
                )}
              </div>
            )}
            <div className="flex-1 min-h-0">
              <CodePreview
                code={draft}
                language={language || 'text'}
                isResizing={isPanelResizing}
                readOnly={false}
                onChange={setDraft}
              />
            </div>
          </div>
        ) : displayContent?.type === 'media' ? (
          <MediaPreview
            category={displayContent.category}
            dataUrl={displayContent.dataUrl}
            mimeType={displayContent.mimeType}
            fileName={fileName}
          />
        ) : displayContent?.type === 'binary' ? (
          <BinaryPlaceholder mimeType={displayContent.mimeType} fileName={fileName} onDownload={handleDownload} />
        ) : displayContent?.type === 'textMedia' ? (
          <TextMediaPreview
            key={file.targetKey ?? path ?? fileName}
            dataUrl={displayContent.dataUrl}
            text={displayContent.text}
            language={language || 'xml'}
            fileName={fileName}
            isResizing={isPanelResizing}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        ) : displayContent?.type === 'markdown' ? (
          <MarkdownFilePreview
            key={file.targetKey ?? path ?? fileName}
            text={displayContent.text}
            isResizing={isPanelResizing}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        ) : displayContent?.type === 'html' ? (
          isFullscreenOpen ? null : (
            <HtmlFilePreview
              key={file.targetKey ?? path ?? fileName}
              text={displayContent.text}
              fileName={fileName}
              filePath={path ?? fileName}
              directory={directory}
              isResizing={isPanelResizing}
              targetLine={file.targetLine}
              targetKey={file.targetKey}
              targetRanges={file.targetRanges}
            />
          )
        ) : displayContent?.type === 'text' ? (
          <CodePreview
            code={displayContent.text}
            language={language || 'text'}
            isResizing={isPanelResizing}
            targetLine={file.targetLine}
            targetKey={file.targetKey}
            targetRanges={file.targetRanges}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-text-400 text-[length:var(--fs-sm)]">
            {t('common:noContent')}
          </div>
        )}
      </div>
    </div>
  )
})

// ============================================
// Media Preview - 路由到具体渲染器
// ============================================

interface MediaPreviewProps {
  category: PreviewCategory
  dataUrl: string
  mimeType: string
  fileName: string
}

function MediaPreview({ category, dataUrl, mimeType, fileName }: MediaPreviewProps) {
  switch (category) {
    case 'image':
      return <ImagePreview dataUrl={dataUrl} fileName={fileName} />
    case 'audio':
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 p-4">
          <div className="text-text-400 text-[length:var(--fs-sm)]">{formatMimeType(mimeType)}</div>
          <audio controls src={dataUrl} className="w-full max-w-xs" />
        </div>
      )
    case 'video':
      return (
        <div className="flex items-center justify-center h-full p-4">
          <video controls src={dataUrl} className="max-w-full max-h-full rounded" />
        </div>
      )
    case 'pdf':
      return <iframe src={dataUrl} title={fileName} className="w-full h-full border-0" />
  }
}

// ============================================
// Image Preview - 缩放 + 拖拽平移
// 直接滚轮缩放（以鼠标为锚点），左键拖拽平移
// ============================================

const MIN_ZOOM = 0.05
const MAX_ZOOM = 20
const ZOOM_FACTOR = 1.15 // 每次滚轮的缩放倍率

interface ImagePreviewProps {
  dataUrl: string
  fileName: string
}

function ImagePreview({ dataUrl, fileName }: ImagePreviewProps) {
  const { t } = useTranslation(['components', 'common'])
  const containerRef = useRef<HTMLDivElement>(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const scaleRef = useRef(1) // 同步访问，避免 stale closure
  const [scale, setScale] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [initialized, setInitialized] = useState(false)
  const dragRef = useRef({ active: false, startX: 0, startY: 0 })

  // fit-to-container scale
  const computeFitScale = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !naturalSize.w || !naturalSize.h) return 1
      const rect = el.getBoundingClientRect()
      return Math.min(rect.width / naturalSize.w, rect.height / naturalSize.h, 1)
    },
    [naturalSize],
  )

  // 图片加载后初始化
  useEffect(() => {
    const container = containerRef.current
    if (!container || !naturalSize.w || !naturalSize.h) return

    const updateFitScale = () => {
      const nextFitScale = computeFitScale(container)
      setFitScale(nextFitScale)

      if (!initialized) {
        scaleRef.current = nextFitScale
        setScale(nextFitScale)
        setTranslate({ x: 0, y: 0 })
        setInitialized(true)
      }
    }

    updateFitScale()

    const resizeObserver = new ResizeObserver(updateFitScale)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [naturalSize, initialized, computeFitScale])

  // 滚轮缩放 — 以鼠标位置为锚点
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      // 鼠标相对容器中心
      const cx = e.clientX - rect.left - rect.width / 2
      const cy = e.clientY - rect.top - rect.height / 2
      const factor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR
      const oldScale = scaleRef.current
      const newScale = Math.min(Math.max(oldScale * factor, MIN_ZOOM), MAX_ZOOM)
      const ratio = newScale / oldScale
      scaleRef.current = newScale
      setScale(newScale)
      setTranslate(t => ({
        x: cx - ratio * (cx - t.x),
        y: cy - ratio * (cy - t.y),
      }))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // 拖拽平移
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      dragRef.current.startX = e.clientX
      dragRef.current.startY = e.clientY
      setTranslate(t => ({ x: t.x + dx, y: t.y + dy }))
    }
    const onUp = () => {
      if (!dragRef.current.active) return
      dragRef.current.active = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY }
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
  }, [])

  const zoomIn = useCallback(() => {
    const s = Math.min(scaleRef.current * 1.25, MAX_ZOOM)
    scaleRef.current = s
    setScale(s)
  }, [])

  const zoomOut = useCallback(() => {
    const s = Math.max(scaleRef.current / 1.25, MIN_ZOOM)
    scaleRef.current = s
    setScale(s)
  }, [])

  const zoomFit = useCallback(() => {
    scaleRef.current = fitScale
    setScale(fitScale)
    setTranslate({ x: 0, y: 0 })
  }, [fitScale])

  const zoomActual = useCallback(() => {
    scaleRef.current = 1
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }, [])

  const isFit = Math.abs(scale - fitScale) < 0.001 && translate.x === 0 && translate.y === 0
  const isActual = Math.abs(scale - 1) < 0.001 && translate.x === 0 && translate.y === 0

  return (
    <div className="flex flex-col h-full">
      {/* Zoom toolbar */}
      <div className="shrink-0 flex items-center justify-center gap-1.5 px-2 py-1 border-b border-border-100/30 bg-bg-100/50 text-[length:var(--fs-xxs)]">
        <button
          onClick={zoomOut}
          className="px-1.5 py-0.5 rounded hover:bg-bg-200 text-text-300 hover:text-text-100 transition-colors"
        >
          −
        </button>
        <span className="w-10 text-center text-text-400 tabular-nums">{Math.round(scale * 100)}%</span>
        <button
          onClick={zoomIn}
          className="px-1.5 py-0.5 rounded hover:bg-bg-200 text-text-300 hover:text-text-100 transition-colors"
        >
          +
        </button>
        <span className="w-px h-3 bg-border-200 mx-1" />
        <button
          onClick={zoomFit}
          className={`px-1.5 py-0.5 rounded transition-colors ${isFit ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('fileExplorer.fit')}
        </button>
        <button
          onClick={zoomActual}
          className={`px-1.5 py-0.5 rounded transition-colors ${isActual ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('fileExplorer.oneToOne')}
        </button>
      </div>
      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
      >
        <img
          src={dataUrl}
          alt={fileName}
          draggable={false}
          className="absolute left-1/2 top-1/2 select-none"
          style={{
            transform: `translate(-50%, -50%) translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          onLoad={e => {
            setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
          }}
        />
      </div>
    </div>
  )
}

// ============================================
// Text Media Preview - 文本型可渲染媒体（如 SVG）
// 支持 Preview / Code 两种视图切换
// ============================================

interface TextMediaPreviewProps {
  dataUrl: string
  text: string
  language: string
  fileName: string
  isResizing?: boolean
  targetLine?: number
  targetKey?: string
  targetRanges?: readonly TargetLineRange[]
}

function TextMediaPreview({
  dataUrl,
  text,
  language,
  fileName,
  isResizing = false,
  targetLine,
  targetKey,
  targetRanges,
}: TextMediaPreviewProps) {
  const { t } = useTranslation(['components', 'common'])
  const [mode, setMode] = useState<'preview' | 'code'>(targetLine ? 'code' : 'preview')

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border-100/30 bg-bg-100/50 text-[length:var(--fs-xxs)]">
        <button
          onClick={() => setMode('preview')}
          className={`px-2 py-0.5 rounded transition-colors ${mode === 'preview' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:preview')}
        </button>
        <button
          onClick={() => setMode('code')}
          className={`px-2 py-0.5 rounded transition-colors ${mode === 'code' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:code')}
        </button>
      </div>
      {/* Content */}
      {mode === 'preview' ? (
        <ImagePreview dataUrl={dataUrl} fileName={fileName} />
      ) : (
        <div className="flex-1 min-h-0">
          <CodePreview
            code={text}
            language={language}
            isResizing={isResizing}
            targetLine={targetLine}
            targetKey={targetKey}
            targetRanges={targetRanges}
          />
        </div>
      )}
    </div>
  )
}

interface HtmlFilePreviewProps {
  text: string
  fileName: string
  filePath: string
  directory?: string
  isResizing?: boolean
  targetLine?: number
  targetKey?: string
  targetRanges?: readonly TargetLineRange[]
}

function HtmlFilePreview({
  text,
  fileName,
  filePath,
  directory,
  isResizing = false,
  targetLine,
  targetKey,
  targetRanges,
}: HtmlFilePreviewProps) {
  const { t } = useTranslation(['components', 'common'])
  const [mode, setMode] = useState<'preview' | 'code'>(targetLine ? 'code' : 'preview')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border-100/30 bg-bg-100/50 px-2 py-1 text-[length:var(--fs-xxs)]">
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={`rounded px-2 py-0.5 transition-colors ${mode === 'preview' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:preview')}
        </button>
        <button
          type="button"
          onClick={() => setMode('code')}
          className={`rounded px-2 py-0.5 transition-colors ${mode === 'code' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:code')}
        </button>
      </div>
      {mode === 'preview' ? (
        <div className="min-h-0 flex-1">
          <HtmlFilePreviewFrame
            html={text}
            title={fileName}
            filePath={filePath}
            directory={directory}
            isResizing={isResizing}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <CodePreview
            code={text}
            language="html"
            isResizing={isResizing}
            targetLine={targetLine}
            targetKey={targetKey}
            targetRanges={targetRanges}
          />
        </div>
      )}
    </div>
  )
}

interface MarkdownFilePreviewProps {
  text: string
  isResizing?: boolean
  targetLine?: number
  targetKey?: string
  targetRanges?: readonly TargetLineRange[]
}

function MarkdownFilePreview({ text, isResizing = false, targetLine, targetKey, targetRanges }: MarkdownFilePreviewProps) {
  const { t } = useTranslation(['components', 'common'])
  const [mode, setMode] = useState<'preview' | 'code'>(targetLine ? 'code' : 'preview')

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center gap-0.5 px-2 py-1 border-b border-border-100/30 bg-bg-100/50 text-[length:var(--fs-xxs)]">
        <button
          onClick={() => setMode('preview')}
          className={`px-2 py-0.5 rounded transition-colors ${mode === 'preview' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:preview')}
        </button>
        <button
          onClick={() => setMode('code')}
          className={`px-2 py-0.5 rounded transition-colors ${mode === 'code' ? 'bg-bg-200 text-text-100' : 'text-text-400 hover:bg-bg-200 hover:text-text-100'}`}
        >
          {t('common:code')}
        </button>
      </div>

      {mode === 'preview' ? (
        <div className="flex-1 min-h-0 overflow-auto panel-scrollbar px-5 py-4">
          <MarkdownRenderer content={text} />
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <CodePreview
            code={text}
            language="markdown"
            isResizing={isResizing}
            targetLine={targetLine}
            targetKey={targetKey}
            targetRanges={targetRanges}
          />
        </div>
      )}
    </div>
  )
}

// ============================================
// Binary Placeholder - 不可预览的二进制文件
// ============================================

interface BinaryPlaceholderProps {
  mimeType: string
  fileName: string
  onDownload?: () => void
}

function BinaryPlaceholder({ mimeType, fileName, onDownload }: BinaryPlaceholderProps) {
  const { t } = useTranslation(['components', 'common'])

  return (
    <div className="flex flex-col items-center justify-center h-full text-text-400 text-[length:var(--fs-sm)] gap-2 p-4">
      <img
        src={getMaterialIconUrl(fileName, 'file')}
        alt=""
        width={32}
        height={32}
        className="opacity-50"
        onError={e => {
          e.currentTarget.style.visibility = 'hidden'
        }}
      />
      <span className="font-medium text-text-300">{fileName}</span>
      <span>{formatMimeType(mimeType)}</span>
      <span className="text-text-500 text-[length:var(--fs-xxs)]">{t('components:fileExplorer.binaryFile')}</span>
      {onDownload && (
        <button
          onClick={onDownload}
          className="mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-bg-200 hover:bg-bg-300 text-text-200 rounded transition-colors text-[length:var(--fs-xs)]"
        >
          <DownloadIcon size={12} />
          {t('common:download')}
        </button>
      )}
    </div>
  )
}
