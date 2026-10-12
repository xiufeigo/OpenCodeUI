import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerSelection } from './useServerSelection'

const { setActiveServer, checkHealth, navigateHome, clearSession, setFocusedServerId } = vi.hoisted(() => ({
  setActiveServer: vi.fn(),
  checkHealth: vi.fn(),
  navigateHome: vi.fn(),
  clearSession: vi.fn(),
  setFocusedServerId: vi.fn(),
}))

vi.mock('./useServerStore', () => ({
  useServerStore: () => ({ activeServer: { id: 'local' }, setActiveServer, checkHealth }),
}))
vi.mock('./useRouter', () => ({
  useRouter: () => ({ sessionId: 'local::session-1', serverId: 'local', navigateHome }),
}))
vi.mock('../store/messageStore', () => ({ messageStore: { clearSession } }))
vi.mock('../store/multiServerStore', () => ({ multiServerStore: { setFocusedServerId } }))

describe('useServerSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActiveServer.mockReturnValue(true)
    checkHealth.mockResolvedValue({ status: 'offline' })
  })

  it('updates the home server explicitly even when the old route names another server', () => {
    const { result } = renderHook(useServerSelection)
    act(() => result.current('remote'))

    expect(setActiveServer).toHaveBeenCalledWith('remote')
    expect(setFocusedServerId).toHaveBeenCalledWith('remote')
    expect(clearSession).toHaveBeenCalledWith('local::session-1')
    expect(navigateHome).toHaveBeenCalledWith('remote')
    expect(checkHealth).toHaveBeenCalledWith('remote')
  })

  it('leaves the current conversation intact when selecting the current server', () => {
    const { result } = renderHook(useServerSelection)
    act(() => result.current('local'))

    expect(setActiveServer).not.toHaveBeenCalled()
    expect(setFocusedServerId).toHaveBeenCalledWith('local')
    expect(clearSession).not.toHaveBeenCalled()
    expect(navigateHome).not.toHaveBeenCalled()
    expect(checkHealth).not.toHaveBeenCalled()
  })

  it('reports a removed server without clearing the conversation or navigating', () => {
    setActiveServer.mockReturnValue(false)
    const { result } = renderHook(useServerSelection)

    expect(() => result.current('removed')).toThrow('Server no longer exists: removed')
    expect(setFocusedServerId).not.toHaveBeenCalled()
    expect(clearSession).not.toHaveBeenCalled()
    expect(navigateHome).not.toHaveBeenCalled()
    expect(checkHealth).not.toHaveBeenCalled()
  })
})
