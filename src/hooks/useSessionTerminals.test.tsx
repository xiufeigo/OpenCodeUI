import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { layoutStore } from '../store/layoutStore'
import { terminalScopeKey, type TerminalScope } from '../utils/terminalScope'
import { useSessionTerminals } from './useSessionTerminals'

const api = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), list: vi.fn(), remove: vi.fn() }))
vi.mock('../api/pty', () => ({
  createPtySession: api.create,
  getPtySession: api.get,
  listPtySessions: api.list,
  removePtySession: api.remove,
  isPtyNotFoundError: (error: { _tag?: string }) => error?._tag === 'PtyNotFoundError',
}))
vi.mock('../store/serverStore', () => ({ serverStore: { onServerChange: () => () => {} } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }))

const a: TerminalScope = { serverId: 'server-a', sessionId: 'chat-a', directory: '/same' }
const b: TerminalScope = { ...a, sessionId: 'chat-b' }
function add(scope: TerminalScope, id: string) {
  const key = terminalScopeKey(scope)
  layoutStore.syncTerminalSessions(key, [])
  layoutStore.addTerminalTab({
    id,
    title: id,
    status: 'connected',
    serverId: scope.serverId,
    directory: scope.directory,
    terminalScopeKey: key,
  })
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('chat-owned terminals', () => {
  beforeEach(() => {
    layoutStore.syncTerminalSessions(undefined, [])
    localStorage.clear()
    vi.clearAllMocks()
    api.get.mockImplementation(async id => ({ id, status: 'running' }))
    api.list.mockResolvedValue([])
    api.remove.mockResolvedValue(true)
  })
  afterEach(() => cleanup())

  it('restores only the chat’s existing PTYs, with their original server and cwd', async () => {
    add(a, 'old-pty')
    const { result } = renderHook(() => useSessionTerminals({ ...a, directory: '/new' }))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(api.get).toHaveBeenCalledWith('old-pty', '/same', 'server-a')
    expect(api.list).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
    expect(layoutStore.getTerminalTabs().map(tab => tab.id)).toEqual(['old-pty'])
  })

  it('keeps different chats in the same directory independent', async () => {
    add(a, 'pty-a')
    add(b, 'pty-b')
    const { result, rerender } = renderHook(({ scope }) => useSessionTerminals(scope), { initialProps: { scope: a } })
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(layoutStore.getTerminalTabs().map(tab => tab.id)).toEqual(['pty-a'])
    rerender({ scope: b })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('pty-b', '/same', 'server-a'))
    expect(layoutStore.getTerminalTabs().map(tab => tab.id)).toEqual(['pty-b'])
  })

  it('keeps the server default directory when the chat later gains an explicit directory', async () => {
    add({ ...a, directory: undefined }, 'default-cwd')
    const { result } = renderHook(() => useSessionTerminals({ ...a, directory: '/new' }))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(api.get).toHaveBeenCalledWith('default-cwd', undefined, 'server-a')
    const tab = layoutStore.getState().panelTabs.find(item => item.id === 'default-cwd')!
    expect(tab.directory).toBeUndefined()
    await act(async () => result.current.close(tab))
    expect(api.remove).toHaveBeenCalledWith('default-cwd', undefined, 'server-a')
  })

  it('discards an old restoration response after focus changes', async () => {
    add(a, 'pty-a')
    add(b, 'pty-b')
    const late = deferred<{ id: string; status: string }>()
    api.get.mockImplementation(id => (id === 'pty-a' ? late.promise : Promise.resolve({ id, status: 'running' })))
    const { result, rerender } = renderHook(({ scope }) => useSessionTerminals(scope), { initialProps: { scope: a } })
    rerender({ scope: b })
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    await act(async () => late.resolve({ id: 'pty-a', status: 'running' }))
    expect(layoutStore.getTerminalTabs().map(tab => tab.id)).toEqual(['pty-b'])
  })

  it('records a late create under the originating chat, without injecting it into the focused chat', async () => {
    const late = deferred<{ id: string; title: string }>()
    api.create.mockReturnValue(late.promise)
    const { result, rerender } = renderHook(({ scope }) => useSessionTerminals(scope), { initialProps: { scope: a } })
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.create('right')
    })
    rerender({ scope: b })
    await act(async () => {
      late.resolve({ id: 'late-pty', title: 'Terminal' })
      await pending
    })
    expect(layoutStore.getTerminalTabs('right')).toEqual([])
    expect(layoutStore.getStoredTerminalSessions(terminalScopeKey(a)).map(tab => tab.id)).toEqual(['late-pty'])
    expect(api.create).toHaveBeenCalledWith({ cwd: '/same' }, '/same', 'server-a')
  })

  it('preserves cached history when a remote PTY no longer exists', async () => {
    add(a, 'gone')
    layoutStore.updateTerminalSnapshot('gone', { buffer: 'old result', cursor: 10 })
    api.get.mockRejectedValue({ _tag: 'PtyNotFoundError' })
    const { result } = renderHook(() => useSessionTerminals(a))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(layoutStore.getState().panelTabs.find(tab => tab.id === 'gone')).toMatchObject({
      status: 'exited',
      buffer: 'old result',
    })
    expect(api.create).not.toHaveBeenCalled()
  })

  it('shows a real failure and retains the tab when remote close fails', async () => {
    add(a, 'running')
    api.remove.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useSessionTerminals(a))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    const tab = layoutStore.getState().panelTabs.find(item => item.id === 'running')!
    await act(async () => result.current.close(tab))
    expect(result.current.error).toBe('offline')
    expect(layoutStore.getTerminalTabs().map(item => item.id)).toEqual(['running'])
  })

  it('does not expose chat-owned terminals on the workspace page', async () => {
    add(a, 'owned')
    api.list.mockResolvedValue([
      { id: 'owned', status: 'running' },
      { id: 'unassigned', status: 'running' },
    ])
    const { result } = renderHook(() => useSessionTerminals({ ...a, sessionId: null }))
    await waitFor(() => expect(result.current.isRestoring).toBe(false))
    expect(layoutStore.getTerminalTabs().map(tab => tab.id)).toEqual(['unassigned'])
  })
})
