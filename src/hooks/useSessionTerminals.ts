import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPtySession, getPtySession, isPtyNotFoundError, listPtySessions, removePtySession } from '../api/pty'
import { layoutStore, type PanelTab, type PanelPosition, type TerminalTab } from '../store/layoutStore'
import { serverStore } from '../store/serverStore'
import { logger } from '../utils/logger'
import { terminalScopeKey, type TerminalScope } from '../utils/terminalScope'

export interface SessionTerminals {
  isRestoring: boolean
  error: string | null
  retry: () => void
  create: (position: PanelPosition) => Promise<void>
  close: (tab: PanelTab) => Promise<void>
}

/** One controller for both panels and shortcuts; requests always retain their original owner. */
export function useSessionTerminals(scope: TerminalScope): SessionTerminals {
  const { serverId, sessionId, directory } = scope
  const scopeKey = terminalScopeKey(scope)
  const [completedRequest, setCompletedRequest] = useState<string | null>(null)
  const [failure, setFailure] = useState<{ scopeKey: string; message: string } | null>(null)
  const [revision, setRevision] = useState(0)
  const requestKey = JSON.stringify([scopeKey, directory ?? null, revision])
  const isRestoring = completedRequest !== requestKey
  const error = !isRestoring && failure?.scopeKey === scopeKey ? failure.message : null
  const requestRef = useRef(0)
  const currentScopeRef = useRef(scopeKey)

  useLayoutEffect(() => {
    currentScopeRef.current = scopeKey
    layoutStore.syncTerminalSessions(
      scopeKey,
      layoutStore.getStoredTerminalSessions(scopeKey).map(tab => ({ ...tab, serverId })),
    )
  }, [scopeKey, serverId])

  const retry = useCallback(() => {
    setFailure(null)
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    const request = ++requestRef.current
    let cancelled = false
    const isCurrent = () => !cancelled && requestRef.current === request && currentScopeRef.current === scopeKey

    const restore = async () => {
      const stored = layoutStore.getStoredTerminalSessions(scopeKey)
      const restored = await Promise.all(
        stored.map(async (tab): Promise<TerminalTab> => {
          try {
            const pty = await getPtySession(tab.id, tab.directory, serverId)
            return { ...tab, serverId, status: pty.status === 'running' ? 'connecting' : 'exited' }
          } catch (cause) {
            if (isPtyNotFoundError(cause)) return { ...tab, status: 'exited' }
            throw cause
          }
        }),
      )

      // Unassigned terminals are available on the workspace page, never adopted by a chat.
      if (!sessionId) {
        const remote = await listPtySessions(directory, serverId)
        const claimed = layoutStore.getClaimedTerminalIds(serverId, scopeKey)
        const known = new Set(restored.map(tab => tab.id))
        for (const pty of remote) {
          if (claimed.has(pty.id) || known.has(pty.id)) continue
          restored.push({
            ...layoutStore.getLegacyTerminalSnapshot(directory, pty.id),
            id: pty.id,
            title: pty.title || 'Terminal',
            serverId,
            directory,
            terminalScopeKey: scopeKey,
            status: pty.status === 'running' ? 'connecting' : 'exited',
          })
        }
      }
      if (!isCurrent()) return
      // A create/close may finish while restoration is in flight. Keep that newer state.
      const latest = layoutStore.getStoredTerminalSessions(scopeKey)
      const storedIds = new Set(stored.map(tab => tab.id))
      const latestIds = new Set(latest.map(tab => tab.id))
      const merged = restored.filter(tab => !storedIds.has(tab.id) || latestIds.has(tab.id))
      merged.push(...latest.filter(tab => !storedIds.has(tab.id) && !merged.some(item => item.id === tab.id)))
      layoutStore.syncTerminalSessions(scopeKey, merged)
    }

    void restore()
      .catch(cause => {
        if (!isCurrent()) return
        logger.error('[Terminal] Restore failed:', cause)
        setFailure({ scopeKey, message: cause instanceof Error ? cause.message : String(cause) })
      })
      .finally(() => {
        if (isCurrent()) setCompletedRequest(requestKey)
      })

    const unsubscribe = serverStore.onServerChange(changedId => {
      if (changedId === serverId) retry()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [scopeKey, serverId, sessionId, directory, revision, requestKey, retry])

  const create = useCallback(
    async (position: PanelPosition) => {
      try {
        const pty = await createPtySession({ cwd: directory }, directory, serverId)
        layoutStore.addTerminalTab(
          {
            id: pty.id,
            title: pty.title || 'Terminal',
            serverId,
            directory,
            terminalScopeKey: scopeKey,
            status: 'connecting',
          },
          true,
          position,
        )
        if (currentScopeRef.current === scopeKey) retry()
      } catch (cause) {
        logger.error('[Terminal] Create failed:', cause)
        if (currentScopeRef.current === scopeKey)
          setFailure({ scopeKey, message: cause instanceof Error ? cause.message : String(cause) })
      }
    },
    [directory, serverId, scopeKey, retry],
  )

  const close = useCallback(
    async (tab: PanelTab) => {
      try {
        await removePtySession(tab.id, tab.directory, tab.serverId)
        layoutStore.removeTerminalTab(tab.id, tab.terminalScopeKey)
        if (currentScopeRef.current === tab.terminalScopeKey) retry()
      } catch (cause) {
        if (isPtyNotFoundError(cause)) {
          layoutStore.removeTerminalTab(tab.id, tab.terminalScopeKey)
          return
        }
        logger.error('[Terminal] Close failed:', cause)
        if (currentScopeRef.current === tab.terminalScopeKey)
          setFailure({
            scopeKey: tab.terminalScopeKey!,
            message: cause instanceof Error ? cause.message : String(cause),
          })
      }
    },
    [retry],
  )

  return { isRestoring, error, retry, create, close }
}
