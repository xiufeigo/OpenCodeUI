// ============================================
// useFilePreview - 单个文件的内容状态
// ============================================
//
// 与 useFileExplorer（目录树 + git 状态）拆开：一个打开的文件 = 一个面板标签页，
// 每个标签页自己管自己那份内容（加载、编辑保存、外部改动检测）。
//
// 保存事务（需求三）：
//   服务端的 fs.write 没有 If-Match / 版本号，乐观并发只能自己做——
//   保存前重读磁盘，与编辑开始时的基线指纹比对；不一致且未 force → STALE_REVISION，
//   由 UI 弹「重新载入 / 覆盖」。写回时按原文保真（行尾 / BOM），
//   混合行尾原文直接拒绝（写出去必然整文件 diff）。

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFileContent, writeFileBytes } from '../api'
import type { FileContent } from '../api/types'
import { useAutoRefresh } from './useAutoRefresh'
import { canonicalizePath, fileBaseName, toAbsoluteFilePath } from '../utils/pathUtils'
import { createUploadId, getServerTmpDirectory } from '../api/file'
import {
  encodeTextPreservingFormat,
  encodeTextUnifyingLineEndings,
  hashBytes,
  MixedLineEndingsError,
} from '../utils/textEncoding'

export interface UseFilePreviewOptions {
  /** 相对工作区根的文件路径 */
  path: string
  /** 工作区目录（读写的根） */
  directory?: string
  /** 数据所属服务器（缺省用活动服务器） */
  serverId?: string
  /** 所属会话（用于挂 SSE 事件：会话空闲 / 断线重连时重新同步） */
  sessionId?: string | null
  /** SSE 消费者 id，每个打开的文件必须唯一 */
  consumerId: string
  /** 关闭时停止同步 */
  enabled?: boolean
}

export interface UseFilePreviewResult {
  content: FileContent | null
  loading: boolean
  error: string | null
  /** 强制从磁盘重读（不标记为外部改动） */
  reload: () => Promise<void>
  /** 保存草稿：基线比对 → 保真编码 → 写 → 写后重读校验 */
  save: (text: string, baselineHash?: string, force?: boolean, unifyEol?: boolean) => Promise<void>
  /** 文件被外部（agent / 别的编辑器）改动过 */
  externalChange: { path: string } | null
  clearExternalChange: () => void
}

export function useFilePreview(options: UseFilePreviewOptions): UseFilePreviewResult {
  const { path, directory, serverId, sessionId, consumerId, enabled = true } = options
  const { t } = useTranslation(['components'])

  const [content, setContent] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [externalChange, setExternalChange] = useState<{ path: string } | null>(null)

  /** 内容快照（ref 版：事件回调里要读最新值） */
  const contentRef = useRef<FileContent | null>(null)
  contentRef.current = content
  /** 最近一次由我们写入的文件（路径 + 内容指纹），用于自写事件抑制 */
  const lastWriteRef = useRef<{ path: string; hash: string } | null>(null)
  const loadIdRef = useRef(0)

  const load = useCallback(
    async () => {
      if (!directory || !path) return
      const loadId = ++loadIdRef.current
      setLoading(true)
      setError(null)
      try {
        const fresh = await getFileContent(path, directory, serverId)
        if (loadId !== loadIdRef.current) return
        setContent(fresh)
      } catch (e) {
        if (loadId !== loadIdRef.current) return
        setError(e instanceof Error ? e.message : t('fileExplorer.failedToLoadFile'))
        setContent(null)
      } finally {
        if (loadId === loadIdRef.current) setLoading(false)
      }
    },
    [directory, path, serverId, t],
  )

  /**
   * 与磁盘对账：内容真变了才更新（touch / 权限变更不算），
   * 并把这次改动标记为「外部改动」交给 UI（dirty 时提示冲突）。
   */
  const syncFromDisk = useCallback(async () => {
    if (!directory || !path) return
    const current = contentRef.current
    if (!current) return

    const fresh = await getFileContent(path, directory, serverId).catch(() => null)
    if (!fresh) return
    const freshHash = hashBytes(fresh.bytes)

    // 自写抑制：是我们刚写下去的内容 → 不是外部改动
    const last = lastWriteRef.current
    if (last && last.path === path && last.hash === freshHash) return
    // 内容其实没变（touch / 权限变更等）：无需提示
    if (current.bytes && hashBytes(current.bytes) === freshHash) return

    setContent(fresh)
    setExternalChange({ path })
  }, [directory, path, serverId])

  // 初始加载 + 切换文件 / 工作区时重载
  useEffect(() => {
    if (!enabled || !directory || !path) return
    void load()
    return () => {
      loadIdRef.current += 1
    }
  }, [enabled, directory, path, load])

  // 切换工作区 / 文件时清掉上一份内容，避免"串内容"
  useEffect(() => {
    setContent(null)
    setExternalChange(null)
  }, [directory, path])

  // 会话空闲 / 断线重连 → 与磁盘对账（agent 可能刚改过这个文件）
  useAutoRefresh(consumerId, sessionId ?? null, () => void syncFromDisk(), enabled && !!directory, {
    watchDirectory: directory,
    // 文件级改动由 onFilesystemChanged 精确处理（只关心自己这个文件），
    // 不再触发泛化的整页刷新
    skipRefreshOnFileChange: true,
    onFilesystemChanged: data => {
      if (!directory) return
      const absChanged = toAbsoluteFilePath(data.file, directory)
      const absCurrent = toAbsoluteFilePath(path, directory)
      if (canonicalizePath(absChanged) !== canonicalizePath(absCurrent)) return
      void syncFromDisk()
    },
  })

  const save = useCallback(
    async (text: string, baselineHash?: string, force = false, unifyEol = false) => {
      if (!directory) throw new Error('No workspace is available')

      // ⓪ 写入安全边界（§4.7）：只允许写工作区内的路径。
      //    fs.write 本身不受 location 限制，所以必须自己拦一道。
      const absTarget = canonicalizePath(toAbsoluteFilePath(path, directory))
      const absRoot = canonicalizePath(directory).replace(/[/\\]+$/, '')
      const withinRoot = absTarget === absRoot || absTarget.startsWith(`${absRoot}/`) || absTarget.startsWith(`${absRoot}\\`)
      if (!withinRoot) {
        const outside = new Error(t('fileExplorer.writeOutsideWorkspace')) as Error & { code?: string }
        outside.code = 'OUTSIDE_WORKSPACE'
        throw outside
      }

      // ① 条件校验：同时保证"只改已存在的文件"——文件没了就地报错，不会凭空创建
      const disk = await getFileContent(path, directory, serverId).catch(() => {
        const missing = new Error(t('fileExplorer.fileMissing')) as Error & { code?: string }
        missing.code = 'FILE_MISSING'
        throw missing
      })
      if (!force && baselineHash && hashBytes(disk.bytes) !== baselineHash) {
        const conflict = new Error(t('fileExplorer.saveConflict')) as Error & { code?: string }
        conflict.code = 'STALE_REVISION'
        throw conflict
      }

      // ② 保真编码（混合行尾默认拒绝；unifyEol 是用户确认后的"按多数行尾统一"兜底）
      let encoded: Uint8Array
      try {
        encoded = unifyEol
          ? encodeTextUnifyingLineEndings(disk.bytes, text)
          : encodeTextPreservingFormat(disk.bytes, text)
      } catch (error) {
        if (error instanceof MixedLineEndingsError) {
          const mixed = new Error(t('fileExplorer.mixedLineEndings')) as Error & { code?: string }
          mixed.code = 'MIXED_EOL'
          throw mixed
        }
        throw error
      }

      // ③ 覆盖前留备份：服务端 fs.write 没有版本号/快照，备份是唯一兜底。
      //    备份失败不阻断保存（用户要的是存下来）。
      try {
        const tmp = await getServerTmpDirectory(serverId)
        const backupTarget = `${tmp.replace(/[/\\]+$/, "")}/backups/${createUploadId()}/${fileBaseName(path)}`
        await writeFileBytes(backupTarget, disk.bytes, directory, serverId)
      } catch (backupError) {
        console.warn('[useFilePreview] 备份失败（保存继续）:', backupError)
      }

      // ④ 写入
      await writeFileBytes(path, encoded, directory, serverId)

      // ⑤ 写后重读（既做校验，也让内容与磁盘一致）
      const saved = await getFileContent(path, directory, serverId)

      // ⑥ 写后校验：磁盘上真的是我们刚写的那些字节吗？
      //    不一致说明保存被打断，或写完立刻又被并发改了 —— 保留 dirty 让用户重试。
      if (hashBytes(saved.bytes) !== hashBytes(encoded)) {
        const verifyError = new Error(t('fileExplorer.saveVerifyFailed')) as Error & { code?: string }
        verifyError.code = 'VERIFY_FAILED'
        throw verifyError
      }
      setContent(saved)
      // 记下"这是我刚写的内容"：后续 filesystem.changed 用内容指纹认出自己的写，
      // 避免把自己的保存当成外部改动（那会导致保存后立刻弹冲突）。
      lastWriteRef.current = { path, hash: hashBytes(saved.bytes) }
    },
    [directory, path, serverId, t],
  )

  return {
    content,
    loading,
    error,
    reload: useCallback(() => load(), [load]),
    save,
    externalChange,
    clearExternalChange: useCallback(() => setExternalChange(null), []),
  }
}
