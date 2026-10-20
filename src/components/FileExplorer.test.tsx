import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileExplorer } from './FileExplorer'
import { layoutStore } from '../store/layoutStore'
import type { DesktopPlatform } from '../utils/tauri'

const {
  useFileExplorerMock,
  isTauriMock,
  isTauriMobileMock,
  getDesktopPlatformMock,
  revealItemInDirMock,
} = vi.hoisted(() => ({
  useFileExplorerMock: vi.fn(),
  isTauriMock: vi.fn(() => true),
  isTauriMobileMock: vi.fn(() => false),
  getDesktopPlatformMock: vi.fn((): DesktopPlatform => 'windows'),
  revealItemInDirMock: vi.fn(async (_path: string | string[]) => {}),
}))

vi.mock('../hooks', () => ({
  useFileExplorer: (options?: unknown) => useFileExplorerMock(options),
}))

vi.mock('../utils/tauri', () => ({
  isTauri: () => isTauriMock(),
  isTauriMobile: () => isTauriMobileMock(),
  getDesktopPlatform: () => getDesktopPlatformMock(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  revealItemInDir: (path: string | string[]) => revealItemInDirMock(path),
}))

vi.mock('../lib/internalDragCore', () => ({
  startInternalDrag: vi.fn(),
}))

describe('FileExplorer', () => {
  beforeEach(() => {
    isTauriMock.mockReturnValue(true)
    isTauriMobileMock.mockReturnValue(false)
    getDesktopPlatformMock.mockReturnValue('windows')
    revealItemInDirMock.mockClear()
    useFileExplorerMock.mockReturnValue({
      tree: [
        {
          name: 'app.ts',
          path: 'src/app.ts',
          absolute: 'C:/repo/src/app.ts',
          type: 'file',
          ignored: false,
        },
      ],
      isLoading: false,
      error: null,
      expandedPaths: new Set<string>(),
      toggleExpand: vi.fn(),
      refresh: vi.fn(),
      effectiveDirectory: 'C:/repo',
      fileStatus: new Map(),
    })
  })

  it('opens a file in a new panel tab instead of pushing a preview from the bottom', () => {
    const openFileTab = vi.spyOn(layoutStore, 'openFileTab')

    render(
      <FileExplorer
        panelTabId="files-1"
        directory="C:/repo"
        serverId="server-1"
        position="right"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'app.ts' }))

    expect(openFileTab).toHaveBeenCalledWith(
      { path: 'src/app.ts', name: 'app.ts', directory: 'C:/repo', serverId: 'server-1' },
      'right',
    )
  })

  it('reveals the selected file in the system explorer from the context menu', async () => {
    render(
      <FileExplorer
        panelTabId="files-1"
        directory="C:/repo"
        position="right"
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'app.ts' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reveal in File Explorer' }))

    await waitFor(() => {
      expect(revealItemInDirMock).toHaveBeenCalledWith('C:/repo/src/app.ts')
    })
  })

  it('hides the reveal action outside desktop Tauri', () => {
    isTauriMock.mockReturnValue(false)

    render(
      <FileExplorer
        panelTabId="files-1"
        directory="C:/repo"
        position="right"
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'app.ts' }))
    expect(screen.queryByRole('button', { name: 'Reveal in File Explorer' })).not.toBeInTheDocument()
  })

  it('uses Finder wording on macOS', async () => {
    getDesktopPlatformMock.mockReturnValue('macos')

    render(
      <FileExplorer
        panelTabId="files-1"
        directory="C:/repo"
        position="right"
      />,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: 'app.ts' }))
    expect(screen.getByRole('button', { name: 'Reveal in Finder' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reveal in Finder' }))
    })

    await waitFor(() => {
      expect(revealItemInDirMock).toHaveBeenCalledWith('C:/repo/src/app.ts')
    })
  })
})
