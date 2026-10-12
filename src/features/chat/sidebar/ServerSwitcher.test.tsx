import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServerSwitcher } from './ServerSwitcher'

const { selectServer, useServerStoreMock } = vi.hoisted(() => ({
  selectServer: vi.fn(),
  useServerStoreMock: vi.fn(),
}))

vi.mock('../../../hooks/useServerStore', () => ({ useServerStore: useServerStoreMock }))
vi.mock('../../../hooks/useServerSelection', () => ({ useServerSelection: () => selectServer }))

const servers = [
  { id: 'local', name: 'Local', url: '/api', isDefault: true },
  { id: 'remote', name: 'Home server', url: 'http://home.test:4096' },
]

describe('ServerSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useServerStoreMock.mockReturnValue({ servers, activeServer: servers[0] })
    document.documentElement.style.setProperty('--safe-area-inset-top', '32px')
  })
  afterEach(() => {
    cleanup()
    document.documentElement.removeAttribute('style')
  })

  it('opens a server dialog without navigating or losing the native safe area', () => {
    const url = window.location.href
    render(<ServerSwitcher />)
    const trigger = screen.getByRole('button', { name: 'Switch server' })
    expect(trigger).toHaveTextContent('Local')
    expect(trigger).not.toHaveAttribute('href')
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Select server' })
    expect(within(dialog).getByRole('button', { name: /Local/, pressed: true })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Home server/, pressed: false })).toBeInTheDocument()
    expect(window.location.href).toBe(url)
    expect(document.documentElement.style.getPropertyValue('--safe-area-inset-top')).toBe('32px')
  })

  it('selects a server through the shared flow, closes the dialog and reflects the active name', () => {
    const { rerender } = render(<ServerSwitcher />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch server' }))
    fireEvent.click(screen.getByRole('button', { name: /Home server/ }))

    expect(selectServer).toHaveBeenCalledWith('remote')
    expect(screen.getByRole('button', { name: 'Switch server' })).toHaveAttribute('aria-expanded', 'false')
    useServerStoreMock.mockReturnValue({ servers, activeServer: servers[1] })
    rerender(<ServerSwitcher />)
    expect(screen.getByRole('button', { name: 'Switch server' })).toHaveTextContent('Home server')
  })

  it('hands adding and managing servers to the existing settings', () => {
    const onOpenSettings = vi.fn()
    render(<ServerSwitcher onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: 'Switch server' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add / manage servers' }))

    expect(onOpenSettings).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Switch server' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes with Escape and can be opened again', () => {
    render(<ServerSwitcher />)
    const trigger = screen.getByRole('button', { name: 'Switch server' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })
})
