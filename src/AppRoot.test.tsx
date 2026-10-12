import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoot } from './AppRoot'

const { state, workspaceRequest } = vi.hoisted(() => ({
  state: { activeServer: null as { id: string } | null },
  workspaceRequest: vi.fn(),
}))
vi.mock('./hooks/useServerStore', () => ({ useServerStore: () => state }))
vi.mock('./features/settings/components/ServersSettings', () => ({ ServersSettings: () => <div>Add a remote server</div> }))
vi.mock('./contexts', () => {
  function WorkspaceProvider({ children }: { children: React.ReactNode }) {
    useEffect(() => { workspaceRequest() }, [])
    return children
  }
  return { DirectoryProvider: WorkspaceProvider, SessionProvider: WorkspaceProvider, FullscreenProvider: WorkspaceProvider }
})
vi.mock('./App', () => ({ default: () => <div>Chat workspace</div> }))

describe('server configuration boundary', () => {
  beforeEach(() => {
    state.activeServer = null
    workspaceRequest.mockClear()
  })

  it('starts the workspace only after configuration and returns to setup when the last server is removed', () => {
    const { rerender } = render(<AppRoot />)
    expect(screen.getByText('Add a remote server')).toBeInTheDocument()
    expect(workspaceRequest).not.toHaveBeenCalled()
    state.activeServer = { id: 'remote' }
    rerender(<AppRoot />)
    expect(screen.getByText('Chat workspace')).toBeInTheDocument()
    expect(workspaceRequest).toHaveBeenCalledTimes(3)
    workspaceRequest.mockClear()
    state.activeServer = null
    rerender(<AppRoot />)
    expect(screen.getByText('Add a remote server')).toBeInTheDocument()
    expect(screen.queryByText('Chat workspace')).not.toBeInTheDocument()
    expect(workspaceRequest).not.toHaveBeenCalled()
  })
})
