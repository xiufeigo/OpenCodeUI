import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServersSettings } from './ServersSettings'
import { serverStore } from '../../../store/serverStore'
import { paneLayoutStore } from '../../../store/paneLayoutStore'

const { useServerStoreMock, navigateHomeMock, clearSessionMock } = vi.hoisted(() => ({
  useServerStoreMock: vi.fn(),
  navigateHomeMock: vi.fn(),
  clearSessionMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      typeof values?.latency === 'number' ? `${key} ${values.latency}` : key,
  }),
}))

vi.mock('../../../hooks', () => ({
  useServerStore: useServerStoreMock,
}))

vi.mock('../../../hooks/useServerStore', () => ({
  useServerStore: useServerStoreMock,
}))

vi.mock('../../../hooks/useRouter', () => ({
  useRouter: () => ({ navigateHome: navigateHomeMock, sessionId: 'session-1' }),
}))

vi.mock('../../../store/messageStore', () => ({
  messageStore: { clearSession: clearSessionMock },
}))

const localServer = { id: 'local', name: 'Local', url: 'http://127.0.0.1:4096', isDefault: true }
const remoteServer = { id: 'remote', name: 'Remote', url: 'http://remote.test' }

describe('ServersSettings', () => {
  const checkHealthMock = vi.fn()
  const setActiveServerMock = vi.fn()

  beforeEach(() => {
    checkHealthMock.mockReset()
    setActiveServerMock.mockReset()
    setActiveServerMock.mockReturnValue(true)
    navigateHomeMock.mockReset()
    clearSessionMock.mockReset()
    useServerStoreMock.mockReturnValue({
      servers: [localServer, remoteServer],
      activeServer: localServer,
      addServer: vi.fn(),
      removeServer: vi.fn(),
      updateServer: vi.fn(),
      setActiveServer: setActiveServerMock,
      checkHealth: checkHealthMock,
      checkAllHealth: vi.fn(),
      getHealth: vi.fn(() => null),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('switches servers even when health verification fails', async () => {
    checkHealthMock.mockResolvedValueOnce({ status: 'error', error: 'Not an OpenCode server' })

    render(<ServersSettings />)

    fireEvent.click(screen.getByRole('button', { name: /Remote/ }))

    await waitFor(() => {
      expect(checkHealthMock).toHaveBeenCalledWith('remote')
    })
    expect(setActiveServerMock).toHaveBeenCalledWith('remote')
    expect(navigateHomeMock).toHaveBeenCalledWith('remote')
    expect(clearSessionMock).toHaveBeenCalledWith('session-1')
  })

  it('clears deleted-server panes and navigates to the remaining server', () => {
    const removeServer = vi.fn(() => true)
    useServerStoreMock.mockReturnValue({
      ...useServerStoreMock(), activeServer: remoteServer, removeServer,
    })
    vi.spyOn(serverStore, 'getActiveServer').mockReturnValue(localServer)
    vi.spyOn(paneLayoutStore, 'allLeaves').mockReturnValue([
      { type: 'leaf', id: 'remote-pane', sessionId: 'remote::session-1' },
      { type: 'leaf', id: 'local-pane', sessionId: 'local::session-2' },
    ])
    const clearPane = vi.spyOn(paneLayoutStore, 'clearSession').mockImplementation(() => {})
    render(<ServersSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'common:remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'common:delete' }))
    expect(removeServer).toHaveBeenCalledWith('remote')
    expect(clearPane).toHaveBeenCalledExactlyOnceWith('remote::session-1')
    expect(navigateHomeMock).toHaveBeenCalledWith('local')
  })
})
