import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverStore } from '../../../store/serverStore'
import { multiServerStore } from '../../../store/multiServerStore'
import { createSessionPlaceholder } from '../../../utils/sessionPlaceholder'
import { useSidebarServerScope } from './useSidebarServerScope'
import { SearchResults } from './SearchResults'

const { getSessionsMock } = vi.hoisted(() => ({ getSessionsMock: vi.fn() }))

vi.mock('../../../api', () => ({ getSessions: getSessionsMock }))
vi.mock('../../../api/events', () => {
  const connectionInfo = { state: 'connected', error: null }
  return {
    subscribeToServerConnectionState: () => () => {},
    getServerConnectionInfo: () => connectionInfo,
  }
})
vi.mock('../../../contexts/useDirectory', () => ({
  useDirectory: () => ({ setCurrentDirectory: vi.fn() }),
}))

const local = { id: 'local', name: 'Local', url: '/api', isDefault: true }
const remote = { id: 'remote', name: 'Remote', url: 'http://remote.test' }
const wsl = { id: 'wsl:Ubuntu', name: 'Ubuntu', url: 'http://127.0.0.1:5000' }

describe('sidebar server scope', () => {
  beforeEach(() => {
    localStorage.clear()
    serverStore.upsertServer(local)
    serverStore.setActiveServer(local.id)
    for (const server of serverStore.getServers()) {
      if (server.id !== local.id) serverStore.removeServer(server.id)
    }
    serverStore.upsertServer(remote)
    multiServerStore.setEnabled(true)
    multiServerStore.setSubscribedServerIds([])
    getSessionsMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows the current server with an empty whitelist and follows server switches', () => {
    const { result } = renderHook(useSidebarServerScope)
    expect(result.current.serverIds).toEqual(['local'])

    act(() => {
      serverStore.setActiveServer('remote')
    })
    expect(result.current.serverIds).toEqual(['remote'])
    expect(multiServerStore.getSubscribedServerIds()).toEqual([])
  })

  it('keeps subscribed servers in order while including an unsubscribed current server', () => {
    multiServerStore.setSubscribedServerIds(['remote'])
    const { result } = renderHook(useSidebarServerScope)
    expect(result.current.serverIds).toEqual(['remote', 'local'])

    act(() => {
      serverStore.setActiveServer('remote')
    })
    expect(result.current.serverIds).toEqual(['remote'])
    act(() => {
      multiServerStore.setSubscribed('remote', false)
    })
    expect(result.current.serverIds).toEqual(['remote'])
    act(() => {
      serverStore.setActiveServer('local')
    })
    expect(result.current.serverIds).toEqual(['local'])
  })

  it('reacts to delayed server registration and removes unregistered servers', () => {
    multiServerStore.setSubscribedServerIds([wsl.id, 'deleted'])
    const { result } = renderHook(useSidebarServerScope)
    expect(result.current.serverIds).toEqual(['local'])

    act(() => {
      serverStore.upsertServer(wsl)
    })
    expect(result.current.serverIds).toEqual([wsl.id, 'local'])
    act(() => {
      serverStore.removeServer(wsl.id)
    })
    expect(result.current.serverIds).toEqual(['local'])
  })

  it('returns to the remaining server when the current server is deleted', () => {
    serverStore.setActiveServer('remote')
    const { result } = renderHook(useSidebarServerScope)
    act(() => {
      serverStore.removeServer('remote')
    })
    expect(result.current.serverIds).toEqual(['local'])
  })

  it('uses only the current server when multi-server mode is disabled', () => {
    multiServerStore.setSubscribedServerIds(['remote'])
    multiServerStore.setEnabled(false)
    const { result } = renderHook(useSidebarServerScope)
    expect(result.current.serverIds).toEqual(['local'])
    act(() => {
      serverStore.setActiveServer('remote')
    })
    expect(result.current.serverIds).toEqual(['remote'])
  })

  it('does not invent a server when none is registered', () => {
    serverStore.updateServer('local', { isDefault: false })
    serverStore.removeServer('local')
    serverStore.removeServer('remote')
    const { result } = renderHook(useSidebarServerScope)
    expect(result.current.activeServer).toBeNull()
    expect(result.current.serverIds).toEqual([])
  })

  it('searches and selects sessions from the same current-server scope after switching', async () => {
    vi.useFakeTimers()
    getSessionsMock.mockImplementation((_params, serverId: string) =>
      Promise.resolve([
        createSessionPlaceholder({ id: 'greeting', title: `${serverId} greeting`, directory: '/workspace/demo' }),
      ]),
    )
    const onSelectSession = vi.fn()
    function SidebarSearch() {
      const { multiServerConfig, serverIds } = useSidebarServerScope()
      return (
        <SearchResults
          serverIds={serverIds}
          showServerHeaders={multiServerConfig.enabled}
          search="greeting"
          selectedSessionId={null}
          onSelectSession={onSelectSession}
        />
      )
    }
    render(<SidebarSearch />)
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(getSessionsMock).toHaveBeenCalledExactlyOnceWith({ search: 'greeting', limit: 50 }, 'local')
    expect(screen.getByRole('button', { name: /local greeting/ })).toBeInTheDocument()

    act(() => {
      serverStore.setActiveServer('remote')
    })
    expect(screen.queryByRole('button', { name: /local greeting/ })).not.toBeInTheDocument()
    await act(() => vi.advanceTimersByTimeAsync(300))
    expect(getSessionsMock).toHaveBeenLastCalledWith({ search: 'greeting', limit: 50 }, 'remote')
    fireEvent.click(screen.getByRole('button', { name: /remote greeting/ }))
    expect(onSelectSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'greeting', serverId: 'remote' }))
  })
})
