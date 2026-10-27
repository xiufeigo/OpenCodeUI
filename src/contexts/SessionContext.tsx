import { useState, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { createSession as apiCreateSession, deleteSession as apiDeleteSession, getSession } from '../api'
import { serverStore } from '../store/serverStore'
import { pinnedSessionsStore } from '../store/pinnedSessionsStore'
import { sessionIndexStore } from '../store/sessionIndexStore'
import { useDirectory } from './useDirectory'
import { isSameDirectory, normalizeToForwardSlash } from '../utils'
import { sessionListDirectory } from '../utils/globalSessionScope'
import { clearSessionRuntimeState } from '../utils/sessionLifecycle'
import { SessionContext, type SessionContextValue } from './SessionContext.shared'
import type { Session } from '../types/api/session'

/** 列表首屏条数；「显示更多」每次多露出这么多 */
const LIST_PAGE_SIZE = 30

/** 稳定引用：useSyncExternalStore 每次渲染拿到同一个 subscribe，避免反复解绑 */
const subscribeServerStore = serverStore.subscribe.bind(serverStore)
const getActiveServerId = () => serverStore.getActiveServerId()

/**
 * 会话列表数据源。
 *
 * 列表本身来自 `sessionIndexStore`（每个服务器一份根会话索引，30s 内复用），
 * 这里只做三件事：按当前作用域过滤、按搜索词过滤、按需要切片。
 *
 * 作用域跟 globalSessionScope 一致：选中项目时用该项目；「全局」
 * （currentDirectory 为空）用服务器默认目录（主目录 / 启动目录），
 * 不能退回「不传 directory = 全服务器」。作用域还没解析出来时先不要露列表。
 *
 * 搜索走官方 home 的口径：只在索引里按标题匹配；输入看起来是会话 ID
 * （长度 > 20 且 `ses_` 开头）时直接回读那一条，补上索引可能没有的会话。
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { currentDirectory, pathInfo } = useDirectory()
  // 全局不能省略 directory，否则索引里的其它项目会话会进侧栏。
  const scopeDirectory = useMemo(() => sessionListDirectory(currentDirectory, pathInfo), [currentDirectory, pathInfo])
  const serverId = useSyncExternalStore(subscribeServerStore, getActiveServerId, getActiveServerId)

  const snapshot = useSyncExternalStore(
    sessionIndexStore.subscribe,
    () => sessionIndexStore.getSnapshot(serverId),
    () => sessionIndexStore.getSnapshot(serverId),
  )

  const [search, setSearch] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  /** 输入完整会话 ID 时回读到的会话（官方 home 的 exact lookup） */
  const [lookedUp, setLookedUp] = useState<{ serverId: string; session: Session } | null>(null)
  // 「显示更多」的展开量跟作用域/搜索词绑定：切过去时从第一页开始，不会把
  // 上一个目录的展开量短暂套到新目录上（会出现多显示一截再收回的跳动）
  const listKey = `${scopeDirectory ?? ''}\0${search}`
  const [slice, setSlice] = useState({ key: listKey, limit: LIST_PAGE_SIZE })
  const limit = slice.key === listKey ? slice.limit : LIST_PAGE_SIZE

  const grow = useCallback(() => {
    setSlice({ key: listKey, limit: limit + LIST_PAGE_SIZE })
  }, [listKey, limit])

  // 挂载 / 切服务器：确保索引可用（30s 内命中则不请求）
  useEffect(() => {
    void sessionIndexStore.ensure(serverId)
  }, [serverId])

  const directorySessions = useMemo(() => {
    // 全局主目录还没到：不要先把全服务器会话当成列表
    if (!scopeDirectory) return []
    return snapshot.sessions.filter(session => isSameDirectory(scopeDirectory, session.location?.directory))
  }, [snapshot.sessions, scopeDirectory])

  // 当前作用域在索引里一条都没有、而服务端还有没拉到的页：按目录兜底补一次。
  // 索引只保证最近若干页，家目录或旧项目可能整段被挤出；补拉后就有数据了。
  const needsDirectoryFetch = !!scopeDirectory && snapshot.ready && snapshot.hasMore && directorySessions.length === 0
  useEffect(() => {
    if (!needsDirectoryFetch || !scopeDirectory) return
    void sessionIndexStore.ensureDirectory(serverId, scopeDirectory)
  }, [needsDirectoryFetch, scopeDirectory, serverId])

  // 官方 home 的搜索口径：本地标题匹配 + 会话 ID 精确回读。
  // 不做服务端标题搜索，也不按键打接口；只有输入像完整 ID 时才 lookup 一次。
  const searchTerm = search.trim()
  const looksLikeSessionID = searchTerm.length > 20 && searchTerm.startsWith('ses_')
  useEffect(() => {
    if (!looksLikeSessionID) {
      setLookedUp(previous => (previous === null ? previous : null))
      return
    }
    let cancelled = false
    void getSession(searchTerm, undefined, serverId)
      .then(session => {
        if (!cancelled) setLookedUp({ serverId, session })
      })
      .catch(() => {
        if (!cancelled) setLookedUp(null)
      })
    return () => {
      cancelled = true
    }
  }, [searchTerm, looksLikeSessionID, serverId])

  const filteredSessions = useMemo(() => {
    const value = search.trim().toLowerCase()
    if (!value) return directorySessions

    const local = directorySessions.filter(session => {
      const title = (session.title ?? '').toLowerCase()
      return title.includes(value) || session.id.toLowerCase().includes(value)
    })

    // 官方 home：ID 回读到的会话即使不在索引/当前目录里也放到最前面，
    // 用户是拿着完整 ID 来找的。归档会话不进列表。
    const exact = lookedUp?.serverId === serverId ? lookedUp.session : undefined
    if (!exact || typeof exact.time?.archived === 'number' || local.some(item => item.id === exact.id)) {
      return local
    }
    return [exact, ...local]
  }, [directorySessions, search, lookedUp, serverId])

  const sessions = useMemo(() => filteredSessions.slice(0, limit), [filteredSessions, limit])
  const searching = search.trim().length > 0
  const hasMore = filteredSessions.length > limit || (!searching && snapshot.hasMore)
  // 全局目录还没解析出来时保持 loading，避免先闪一帧别的项目。
  // 首帧还没发起请求时也别显示空态；请求失败后交给空态/重试入口。
  const isLoading = !scopeDirectory || (!snapshot.ready && !snapshot.error)

  const refresh = useCallback(async () => {
    await sessionIndexStore.ensure(serverId, { force: true })
  }, [serverId])

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    setIsLoadingMore(true)
    try {
      // 本地还有没露出的先露出；本地见底了再向服务端要下一页
      if (filteredSessions.length > limit) {
        grow()
        return
      }
      if (!snapshot.hasMore) return
      // 服务端翻页是全服务器的：某一页可能一条都不属于当前作用域。
      // 以「当前作用域有没有变多」为准，最多连翻三页，别让点击看起来没反应。
      const before = filteredSessions.length
      for (let page = 0; page < 3; page++) {
        await sessionIndexStore.loadMore(serverId)
        const latest = sessionIndexStore.getSnapshot(serverId)
        const inDirectory = scopeDirectory
          ? latest.sessions.filter(item => isSameDirectory(scopeDirectory, item.location?.directory)).length
          : 0
        if (inDirectory > before || !latest.hasMore) break
      }
      grow()
    } finally {
      setIsLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, filteredSessions.length, limit, grow, snapshot.hasMore, serverId, scopeDirectory])

  const createSession = useCallback(
    async (title?: string) => {
      // 全局下新建落在主目录，而不是省略 directory（那会跟「全部目录」混在一起）
      const targetDir = normalizeToForwardSlash(scopeDirectory) || undefined
      const newSession = await apiCreateSession({ title, directory: targetDir })
      // 直接进索引，不等 SSE（新建会话已经是完整元信息）
      if (!newSession.parentID) sessionIndexStore.upsert(serverId, newSession)
      return newSession
    },
    [scopeDirectory, serverId],
  )

  const deleteSession = useCallback(
    async (id: string) => {
      const targetDir = normalizeToForwardSlash(scopeDirectory) || undefined
      await apiDeleteSession(id, targetDir)
      pinnedSessionsStore.unpin(id)
      clearSessionRuntimeState(id)
      sessionIndexStore.remove(serverId, id)
    },
    [scopeDirectory, serverId],
  )

  const value = useMemo<SessionContextValue>(
    () => ({
      sessions,
      isLoading,
      isLoadingMore,
      hasMore,
      search,
      setSearch,
      refresh,
      loadMore,
      createSession,
      deleteSession,
    }),
    [sessions, isLoading, isLoadingMore, hasMore, search, refresh, loadMore, createSession, deleteSession],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
