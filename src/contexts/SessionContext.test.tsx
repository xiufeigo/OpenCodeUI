import { act, render } from '@testing-library/react'
import { useContext, useEffect, type ContextType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventCallbacks } from '../types/api/event'
import { SessionContext } from './SessionContext.shared'
import { SessionProvider } from './SessionContext'
import type { ServerChangeReason } from '../store/serverStore'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

const {
  getSessionsMock,
  getSessionMock,
  createSessionMock,
  deleteSessionMock,
  subscribeToEventsMock,
  clearChildrenMock,
  clearFollowupQueueMock,
  clearSessionRuntimeStateMock,
  sessionErrorHandlerMock,
  autoDetectPathStyleMock,
  onServerChangeMock,
  directoryState,
} = vi.hoisted(() => ({
  getSessionsMock: vi.fn(),
  getSessionMock: vi.fn(),
  createSessionMock: vi.fn(),
  deleteSessionMock: vi.fn(),
  subscribeToEventsMock: vi.fn(),
  clearChildrenMock: vi.fn(),
  clearFollowupQueueMock: vi.fn(),
  clearSessionRuntimeStateMock: vi.fn(),
  sessionErrorHandlerMock: vi.fn(),
  autoDetectPathStyleMock: vi.fn(),
  onServerChangeMock: vi.fn(),
  directoryState: {
    currentDirectory: '/workspace/demo' as string | undefined,
    pathInfo: null as { directory: string } | null,
  },
}))
let latestEventCallbacks: Partial<EventCallbacks> = {}
let latestContext: ContextType<typeof SessionContext> = null
let latestServerChange: ((serverId: string, reason: ServerChangeReason) => void) | undefined

vi.mock('../api', () => ({
  getSessions: (...args: unknown[]) => getSessionsMock(...args),
  getSession: (...args: unknown[]) => getSessionMock(...args),
  createSession: (...args: unknown[]) => createSessionMock(...args),
  deleteSession: (...args: unknown[]) => deleteSessionMock(...args),
  subscribeToEvents: (...args: unknown[]) => subscribeToEventsMock(...args),
}))

vi.mock('./useDirectory', () => ({
  useDirectory: () => ({
    currentDirectory: directoryState.currentDirectory,
    pathInfo: directoryState.pathInfo,
  }),
}))

vi.mock('../store/childSessionStore', () => ({
  childSessionStore: {
    clearChildren: clearChildrenMock,
  },
}))

vi.mock('../store/inboxStore', () => ({
  inboxStore: {
    clearSession: clearFollowupQueueMock,
  },
}))

// v2 删除了 todoStore（连同整块 todo UI），这里不再 mock
vi.mock('../store/serverStore', () => ({
  serverStore: {
    onServerChange: (...args: unknown[]) => onServerChangeMock(...args),
    getActiveServerId: () => 'local',
    getActiveServer: () => ({ id: 'local' }),
  },
}))

vi.mock('../utils', () => ({
  sessionErrorHandler: (...args: unknown[]) => sessionErrorHandlerMock(...args),
  normalizeToForwardSlash: (value?: string) => value,
  isSameDirectory: (left?: string, right?: string) => left === right,
  autoDetectPathStyle: (...args: unknown[]) => autoDetectPathStyleMock(...args),
}))

vi.mock('../utils/sessionLifecycle', () => ({
  clearSessionRuntimeState: (...args: unknown[]) => clearSessionRuntimeStateMock(...args),
}))

function SessionContextProbe() {
  const context = useContext(SessionContext)

  useEffect(() => {
    latestContext = context
  }, [context])

  return null
}

describe('SessionProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    latestContext = null
    latestEventCallbacks = {}
    directoryState.currentDirectory = '/workspace/demo'
    directoryState.pathInfo = null
    getSessionsMock.mockReset()
    getSessionMock.mockReset()
    createSessionMock.mockReset()
    deleteSessionMock.mockReset()
    subscribeToEventsMock.mockReset()
    clearChildrenMock.mockReset()
    clearFollowupQueueMock.mockReset()
    clearSessionRuntimeStateMock.mockReset()
    sessionErrorHandlerMock.mockReset()
    autoDetectPathStyleMock.mockReset()
    onServerChangeMock.mockReset()
    latestServerChange = undefined
    subscribeToEventsMock.mockImplementation((callbacks: EventCallbacks) => {
      latestEventCallbacks = callbacks
      return vi.fn()
    })
    onServerChangeMock.mockImplementation(listener => {
      latestServerChange = listener as (serverId: string, reason: ServerChangeReason) => void
      return vi.fn()
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('queues a reconnect refresh while the latest request is still pending', async () => {
    const firstRequest = createDeferred<Array<{ id: string; directory: string }>>()
    const secondRequest = createDeferred<Array<{ id: string; directory: string }>>()
    const thirdRequest = createDeferred<Array<{ id: string; directory: string }>>()

    getSessionsMock
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise)
      .mockImplementationOnce(() => thirdRequest.promise)

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(latestContext).not.toBeNull()

    act(() => {
      latestContext!.setSearch('branch')
    })

    await act(async () => {
      vi.advanceTimersByTime(300)
      await Promise.resolve()
    })

    await act(async () => {
      firstRequest.resolve([{ id: 'session-1', directory: '/workspace/demo' }])
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      latestEventCallbacks.onReconnected?.('network')
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      secondRequest.resolve([{ id: 'session-2', directory: '/workspace/demo' }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(3)

    await act(async () => {
      thirdRequest.resolve([{ id: 'session-3', directory: '/workspace/demo' }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-3'])
  })

  it('retries the initial session list fetch after a startup failure', async () => {
    getSessionsMock
      .mockRejectedValueOnce(new Error('service not ready'))
      .mockResolvedValueOnce([{ id: 'session-1', directory: '/workspace/demo' }])

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runOnlyPendingTimers()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(2)
    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-1'])
  })

  it('removes deleted sessions from context and clears runtime state', async () => {
    getSessionsMock.mockResolvedValue([
      { id: 'session-1', directory: '/workspace/demo' },
      { id: 'session-2', directory: '/workspace/demo' },
    ])

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-1', 'session-2'])

    act(() => {
      latestEventCallbacks.onSessionDeleted?.({ sessionID: 'session-1' })
    })

    expect(clearSessionRuntimeStateMock).toHaveBeenCalledWith('session-1')
    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-2'])
  })

  it('refetches on server endpoint changes even while the old request is in flight', async () => {
    const staleRequest = createDeferred<Array<{ id: string; directory: string }>>()
    const freshRequest = createDeferred<Array<{ id: string; directory: string }>>()

    getSessionsMock
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => freshRequest.promise)

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      // active 服务器自身端点变化（serverId = active）才应触发重拉
      latestServerChange?.('local', 'server-runtime-updated')
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(2)

    await act(async () => {
      freshRequest.resolve([{ id: 'fresh', directory: '/workspace/demo' }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual(['fresh'])

    await act(async () => {
      staleRequest.resolve([{ id: 'stale', directory: '/workspace/demo' }])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual(['fresh'])
  })

  it('keeps the session list untouched when a non-active server endpoint changes', async () => {
    getSessionsMock.mockResolvedValue([{ id: 'session-1', directory: '/workspace/demo' }])

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(1)
    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-1'])

    // 非 active 服务器（remote）端点变化：与 active 会话列表无关，不得清空/重拉
    await act(async () => {
      latestServerChange?.('remote', 'server-runtime-updated')
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledTimes(1)
    expect(latestContext?.sessions.map(session => session.id)).toEqual(['session-1'])
  })

  it('lists only the home directory when Global has no project selected', async () => {
    directoryState.currentDirectory = undefined
    directoryState.pathInfo = { directory: '/home/user/' }
    getSessionsMock.mockResolvedValue([{ id: 'home-session', location: { directory: '/home/user' } }])

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(getSessionsMock).toHaveBeenCalledWith(expect.objectContaining({ directory: '/home/user', parentID: null }))
    expect(getSessionsMock.mock.calls.some(call => call[0]?.directory == null)).toBe(false)
  })

  it('does not fetch every session before the home directory is known', async () => {
    directoryState.currentDirectory = undefined
    directoryState.pathInfo = null

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
    })

    expect(getSessionsMock).not.toHaveBeenCalled()
  })

  it('ignores sessions created outside the global home directory', async () => {
    directoryState.currentDirectory = undefined
    directoryState.pathInfo = { directory: '/home/user' }
    getSessionsMock.mockResolvedValue([])
    getSessionMock.mockImplementation(async (id: string) => ({
      id,
      location: { directory: id === 'home-session' ? '/home/user' : '/workspace/demo' },
    }))

    render(
      <SessionProvider>
        <SessionContextProbe />
      </SessionProvider>,
    )

    await act(async () => {
      vi.runAllTimers()
      await Promise.resolve()
      await Promise.resolve()
    })

    await act(async () => {
      latestEventCallbacks.onSessionCreated?.({
        sessionID: 'other-session',
        location: { directory: '/workspace/demo' },
      } as never)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual([])

    await act(async () => {
      latestEventCallbacks.onSessionCreated?.({
        sessionID: 'home-session',
        location: { directory: '/home/user' },
      } as never)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(latestContext?.sessions.map(session => session.id)).toEqual(['home-session'])
  })
})
