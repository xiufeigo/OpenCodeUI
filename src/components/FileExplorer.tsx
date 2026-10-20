// ============================================
// FileExplorer - 文件目录树
// ============================================
//
// 只负责目录树：展开/折叠、搜索、右键（在系统文件管理器里显示）。
// 点击文件不再"从下面顶开预览"，而是在面板标签栏里开一个新标签（全高展示），
// 内容由 FileViewer 负责。

import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useFileExplorer, type FileTreeNode } from '../hooks'
import { layoutStore, useLayoutStore, type PanelPosition } from '../store/layoutStore'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  RetryIcon,
  AlertCircleIcon,
  SearchIcon,
  CloseIcon,
} from './Icons'
import { getMaterialIconUrl } from '../utils/materialIcons'
import { toAbsolutePath } from '../features/mention'
import { getDesktopPlatform, isTauri, isTauriMobile } from '../utils/tauri'
import { startInternalDrag } from '../lib/internalDragCore'
import { searchFiles } from '../api/file'

function canRevealInSystemExplorer(): boolean {
  return isTauri() && !isTauriMobile()
}

function getRevealInSystemExplorerLabel(t: (key: string) => string): string {
  switch (getDesktopPlatform()) {
    case 'windows':
      return t('fileExplorer.revealInExplorer')
    case 'macos':
      return t('fileExplorer.revealInFinder')
    default:
      return t('fileExplorer.revealInFileManager')
  }
}

async function revealPathInSystemExplorer(absolutePath: string) {
  const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
  await revealItemInDir(absolutePath)
}

interface FileExplorerProps {
  panelTabId: string
  directory?: string
  /** 数据所属服务器（右侧面板跟随焦点 session 时传入；缺省用活动服务器） */
  serverId?: string
  /** 点击文件时在哪个面板开标签 */
  position?: PanelPosition
  sessionId?: string | null
}

export const FileExplorer = memo(function FileExplorer({
  panelTabId,
  directory,
  serverId,
  position = 'right',
  sessionId,
}: FileExplorerProps) {
  const { t } = useTranslation(['components', 'common'])
  const fileContextMenuRef = useRef<HTMLDivElement>(null)
  const searchRequestIdRef = useRef(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [fileResults, setFileResults] = useState<string[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [fileContextMenu, setFileContextMenu] = useState<{ x: number; y: number; absolutePath: string } | null>(null)
  const canRevealFiles = canRevealInSystemExplorer()
  const revealInSystemExplorerLabel = useMemo(() => getRevealInSystemExplorerLabel(t), [t])
  const [searchError, setSearchError] = useState<string | null>(null)

  const {
    tree,
    isLoading,
    error,
    expandedPaths,
    toggleExpand,
    effectiveDirectory,
    fileStatus,
    refresh,
  } = useFileExplorer({ directory, autoLoad: true, sessionId: sessionId || undefined, serverId, consumerId: `file-explorer-${panelTabId}` })

  // 已打开的文件（在别的标签页里）：在目录树里标出来
  const { panelTabs } = useLayoutStore()
  const openFilePaths = useMemo(() => {
    const paths = new Set<string>()
    for (const tab of panelTabs) {
      if (tab.type !== 'file' || !tab.previewFile) continue
      if ((tab.previewFile.directory ?? '') !== (effectiveDirectory ?? '')) continue
      if ((tab.previewFile.serverId ?? '') !== (serverId ?? '')) continue
      paths.add(tab.previewFile.path)
    }
    return paths
  }, [effectiveDirectory, panelTabs, serverId])

  // 处理文件点击：在标签栏开一个新标签
  const handleFileClick = useCallback(
    (node: FileTreeNode) => {
      if (node.type === 'directory') {
        toggleExpand(node.path)
      } else {
        layoutStore.openFileTab(
          { path: node.path, name: node.name, directory: effectiveDirectory, serverId },
          position,
        )
      }
    },
    [toggleExpand, position, effectiveDirectory, serverId],
  )

  const resolveAbsolutePath = useCallback(
    (path: string, absolute?: string) => {
      if (absolute) return absolute
      if (!directory) return null
      return toAbsolutePath(path, directory)
    },
    [directory],
  )

  const handleFileContextMenu = useCallback(
    (event: React.MouseEvent, path: string, absolute?: string) => {
      if (!canRevealFiles) return
      const absolutePath = resolveAbsolutePath(path, absolute)
      if (!absolutePath) return
      event.preventDefault()
      event.stopPropagation()
      setFileContextMenu({ x: event.clientX, y: event.clientY, absolutePath })
    },
    [canRevealFiles, resolveAbsolutePath],
  )

  const handleRevealInSystemExplorer = useCallback(() => {
    if (!fileContextMenu) return
    const absolutePath = fileContextMenu.absolutePath
    setFileContextMenu(null)
    void revealPathInSystemExplorer(absolutePath).catch(() => {})
  }, [fileContextMenu])

  useEffect(() => {
    if (!fileContextMenu) return

    const handleClickOutside = (event: MouseEvent) => {
      if (fileContextMenuRef.current && !fileContextMenuRef.current.contains(event.target as Node)) {
        setFileContextMenu(null)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFileContextMenu(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [fileContextMenu])

  const trimmedSearchQuery = searchQuery.trim()
  const isSearching = trimmedSearchQuery.length > 0

  useEffect(() => {
    if (!directory || !trimmedSearchQuery) {
      searchRequestIdRef.current += 1
      return
    }

    const requestId = ++searchRequestIdRef.current
    const timer = window.setTimeout(() => {
      setSearchLoading(true)
      setFileResults([])
      setSearchError(null)

      // v2 的文件检索只有 `file.find`（按路径/名称），没有全文内容检索
      searchFiles(trimmedSearchQuery, { directory, limit: 50, serverId })
        .then(paths => {
          if (requestId !== searchRequestIdRef.current) return
          setFileResults(paths)
        })
        .catch(err => {
          if (requestId !== searchRequestIdRef.current) return
          setFileResults([])
          setSearchError(err instanceof Error ? err.message : t('fileExplorer.textSearchFailed'))
        })
        .finally(() => {
          if (requestId === searchRequestIdRef.current) setSearchLoading(false)
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
    }
  }, [directory, trimmedSearchQuery, serverId, t])

  const handleFileResultClick = useCallback(
    (path: string) => {
      const name = path.split(/[/\\]/).pop() || path
      layoutStore.openFileTab({ path, name, directory: effectiveDirectory, serverId }, position)
    },
    [position, effectiveDirectory, serverId],
  )

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value)
    if (!value.trim()) {
      setFileResults([])
      setSearchLoading(false)
      setSearchError(null)
    }
  }, [])

  // 没有选择目录
  if (!directory) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-400 text-[length:var(--fs-base)] gap-2 p-4">
        <img
          src={getMaterialIconUrl('folder', 'directory', false)}
          alt=""
          width={32}
          height={32}
          className="opacity-30"
          onError={e => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />
        <span className="text-center">{t('fileExplorer.selectProject')}</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tree Header */}
      <div className="relative flex h-10 items-center gap-2 px-3 shrink-0">
        <div className="relative group min-w-0 flex-1">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-400 w-3.5 h-3.5 group-focus-within:text-accent-main-100 transition-colors" />
          <input
            type="text"
            name="file-explorer-text-search"
            value={searchQuery}
            onChange={e => handleSearchQueryChange(e.target.value)}
            placeholder={t('fileExplorer.searchFiles')}
            aria-label={t('fileExplorer.searchFiles')}
            autoComplete="off"
            className="w-full bg-bg-200/40 hover:bg-bg-200/60 focus:bg-bg-000 border border-transparent focus:border-border-200 rounded-lg py-1 pl-[30px] pr-7 text-[length:var(--fs-xs)] text-text-100 placeholder:text-text-400/70 focus-visible:ring-1 focus-visible:ring-border-200 focus-visible:ring-inset transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => handleSearchQueryChange('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center text-text-400 hover:text-text-100 rounded transition-colors"
              aria-label={t('fileExplorer.clearSearch')}
              title={t('fileExplorer.clearSearch')}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
          aria-label={t('common:refresh')}
          className="inline-flex h-6 w-6 items-center justify-center text-text-400 hover:text-text-100 hover:bg-bg-200/50 rounded-md transition-colors disabled:opacity-50"
          title={t('common:refresh')}
        >
          <RetryIcon size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <div className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-border-200/30" />
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-auto panel-scrollbar-y">
        {isSearching ? (
          <FileSearchResults
            fileResults={fileResults}
            isLoading={searchLoading}
            error={searchError}
            onSelectFile={handleFileResultClick}
            onContextMenuFile={canRevealFiles ? handleFileContextMenu : undefined}
            directory={directory}
          />
        ) : isLoading && tree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-text-400 text-[length:var(--fs-sm)]">
            {t('common:loading')}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-20 text-danger-100 text-[length:var(--fs-sm)] gap-1 px-4">
            <AlertCircleIcon size={16} />
            <span className="text-center">{error}</span>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-text-400 text-[length:var(--fs-sm)]">
            {t('fileExplorer.noFilesFound')}
          </div>
        ) : (
          <div className="py-1">
            {tree.map(node => (
              <FileTreeItem
                key={node.path}
                node={node}
                depth={0}
                expandedPaths={expandedPaths}
                fileStatus={fileStatus}
                openFilePaths={openFilePaths}
                onClick={handleFileClick}
                onContextMenu={canRevealFiles ? handleFileContextMenu : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {fileContextMenu &&
        createPortal(
          <div
            ref={fileContextMenuRef}
            className="fixed z-[9999] bg-bg-100 border border-border-200 rounded-lg shadow-lg p-1 min-w-[160px]"
            style={{ left: fileContextMenu.x, top: fileContextMenu.y }}
          >
            <button
              type="button"
              onClick={handleRevealInSystemExplorer}
              className="w-full px-2.5 py-1.5 text-left text-[length:var(--fs-sm)] text-text-200 hover:bg-bg-200/60 hover:text-text-100 rounded-md transition-colors"
            >
              {revealInSystemExplorerLabel}
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
})

interface FileSearchResultsProps {
  fileResults: string[]
  isLoading: boolean
  error: string | null
  onSelectFile: (path: string) => void
  onContextMenuFile?: (event: React.MouseEvent, path: string, absolute?: string) => void
  directory?: string
}

/**
 * 搜索结果列表。
 *
 * v1 的结果分「文件名匹配」与「内容匹配」两段，其中内容匹配来自
 * `find.text`。v2 删除了全文检索端点（`find.symbols` / `find.text` 均不存在），
 * 现存入口只有 `file.find`（按路径/名称查找），因此这里只保留文件名匹配一段。
 */
const FileSearchResults = memo(function FileSearchResults({
  fileResults,
  isLoading,
  error,
  onSelectFile,
  onContextMenuFile,
  directory,
}: FileSearchResultsProps) {
  const { t } = useTranslation(['components', 'common'])

  const hasFiles = fileResults.length > 0

  // 拖拽到输入框实现 @mention，与文件树项行为一致
  const handlePointerDragStart = useCallback(
    (e: PointerEvent<HTMLButtonElement>, path: string) => {
      if (!directory) return
      const name = path.split(/[/\\]/).pop() || path
      startInternalDrag(e, {
        kind: 'file-mention',
        file: {
          type: 'file',
          path,
          absolute: toAbsolutePath(path, directory),
          name,
        },
      })
    },
    [directory],
  )

  if (isLoading && !hasFiles) {
    return <div className="flex items-center justify-center h-20 text-text-400 text-[length:var(--fs-sm)]">{t('common:loading')}</div>
  }

  if (error && !hasFiles) {
    return (
      <div className="flex flex-col items-center justify-center h-20 text-danger-100 text-[length:var(--fs-sm)] gap-1 px-4">
        <AlertCircleIcon size={16} />
        <span className="text-center">{error}</span>
      </div>
    )
  }

  if (!hasFiles) {
    return (
      <div className="flex items-center justify-center h-20 text-text-400 text-[length:var(--fs-sm)]">
        {t('fileExplorer.noTextMatches')}
      </div>
    )
  }

  return (
    <div className="py-1">
      <div className="px-2 py-1 text-[length:var(--fs-xxs)] font-medium text-text-500 uppercase tracking-wide">
        {t('fileExplorer.fileMatches')}
      </div>
      {fileResults.map(path => {
        const name = path.split(/[/\\]/).pop() || path
        return (
          <button
            key={`file:${path}`}
            type="button"
            onPointerDown={e => handlePointerDragStart(e, path)}
            onClick={() => onSelectFile(path)}
            onContextMenu={event => onContextMenuFile?.(event, path)}
            className="w-full px-2 py-1.5 text-left hover:bg-bg-200/50 transition-colors"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <img
                src={getMaterialIconUrl(path, 'file', false)}
                alt=""
                width={16}
                height={16}
                draggable={false}
                className="shrink-0"
                loading="lazy"
                decoding="async"
                onError={e => {
                  e.currentTarget.style.visibility = 'hidden'
                }}
              />
              <span className="truncate text-[length:var(--fs-sm)] text-text-200">{name}</span>
            </div>
            <div className="mt-0.5 truncate pl-[22px] text-[length:var(--fs-xxs)] text-text-500">{path}</div>
          </button>
        )
      })}
    </div>
  )
})

// ============================================
// File Tree Item
// ============================================

interface FileTreeItemProps {
  node: FileTreeNode
  depth: number
  expandedPaths: Set<string>
  fileStatus: Map<string, { status: string }>
  /** 已在其它标签页打开的文件 */
  openFilePaths: Set<string>
  onClick: (node: FileTreeNode) => void
  onContextMenu?: (event: React.MouseEvent, path: string, absolute?: string) => void
}

const FileTreeItem = memo(function FileTreeItem({
  node,
  depth,
  expandedPaths,
  fileStatus,
  openFilePaths,
  onClick,
  onContextMenu,
}: FileTreeItemProps) {
  const isExpanded = expandedPaths.has(node.path)
  const isDirectory = node.type === 'directory'
  // node.path 可能用反斜杠（Windows），statusMap key 统一用正斜杠
  const status = fileStatus.get(node.path) || fileStatus.get(node.path.replace(/\\/g, '/'))
  const isOpen = openFilePaths.has(node.path)

  // 状态颜色
  const statusColor = useMemo(() => {
    if (!status) return null
    switch (status.status) {
      case 'added':
        return 'text-success-100'
      case 'modified':
        return 'text-warning-100'
      case 'deleted':
        return 'text-danger-100'
      default:
        return null
    }
  }, [status])

  // 拖拽到输入框实现 @mention。使用 pointer 拖拽，避免 Tauri 原生文件 drop 接管 HTML5 DnD。
  const handlePointerDragStart = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      const fileData = {
        type: (isDirectory ? 'folder' : 'file') as 'file' | 'folder',
        path: node.path, // 相对路径
        absolute: node.absolute, // 绝对路径
        name: node.name,
      }
      startInternalDrag(e, { kind: 'file-mention', file: fileData })
    },
    [node.path, node.absolute, node.name, isDirectory],
  )

  return (
    <div>
      <button
        type="button"
        onPointerDown={handlePointerDragStart}
        onClick={() => onClick(node)}
        onContextMenu={event => onContextMenu?.(event, node.path, node.absolute)}
        className={`
          w-full flex items-center gap-1 px-2 py-0.5 text-left cursor-default
          select-none hover:bg-bg-200/50 transition-colors text-[length:var(--fs-sm)]
          ${isOpen ? 'text-accent-main-100' : 'text-text-300'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {/* Expand/Collapse Icon */}
        {isDirectory ? (
          <span className="w-4 h-4 flex items-center justify-center text-text-400 shrink-0">
            {isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/Folder Icon - Material Icon Theme */}
        <img
          src={getMaterialIconUrl(node.path, isDirectory ? 'directory' : 'file', isExpanded)}
          alt=""
          width={16}
          height={16}
          draggable={false}
          className="shrink-0"
          loading="lazy"
          decoding="async"
          onError={e => {
            e.currentTarget.style.visibility = 'hidden'
          }}
        />

        {/* Name */}
        <span className={`truncate flex-1 ${statusColor || ''}`}>{node.name}</span>

        {/* Loading Indicator */}
        {node.isLoading && (
          <span className="w-3 h-3 border border-text-400 border-t-transparent rounded-full animate-spin shrink-0" />
        )}
      </button>

      {/* Children */}
      {isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              fileStatus={fileStatus}
              openFilePaths={openFilePaths}
              onClick={onClick}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
})
