import { useEffect, useState } from 'react'
import { getPath } from '../api'
import { useDirectory } from '../contexts/useDirectory'
import { globalScopeDirectory } from '../utils/globalSessionScope'

const directoryByServer = new Map<string, string>()

/**
 * 「全局」文件夹要列出的目录。
 * 单服务器直接用 DirectoryContext 里的 pathInfo（不带 directory 的 location.get）。
 * 多服务器时每个服务器各自的默认目录不同，按 serverId 再取一次。
 */
export function useGlobalScopeDirectory(serverId?: string): string | undefined {
  const { pathInfo } = useDirectory()
  const [remote, setRemote] = useState<{ serverId: string; directory?: string }>()

  useEffect(() => {
    if (!serverId || directoryByServer.has(serverId)) return

    let cancelled = false
    getPath(undefined, serverId)
      .then(info => {
        if (cancelled) return
        const directory = globalScopeDirectory(info)
        if (directory) directoryByServer.set(serverId, directory)
        setRemote({ serverId, directory })
      })
      .catch(() => {
        if (!cancelled) setRemote({ serverId, directory: undefined })
      })

    return () => {
      cancelled = true
    }
  }, [serverId])

  if (!serverId) return globalScopeDirectory(pathInfo)
  return directoryByServer.get(serverId) ?? (remote?.serverId === serverId ? remote.directory : undefined)
}
