import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileExplorer } from './useFileExplorer'
import { changeScopeStore } from '../store/changeScopeStore'

const { listDirectory, getFileContent, getFileStatus, getSessionDiff, getVcsDiff, writeFileBytes, getServerTmpDirectory, createUploadId } =
  vi.hoisted(() => ({
  listDirectory: vi.fn(),
  getFileContent: vi.fn(),
  getFileStatus: vi.fn(),
  getSessionDiff: vi.fn(),
    getVcsDiff: vi.fn(),
    writeFileBytes: vi.fn(),
    getServerTmpDirectory: vi.fn(),
    createUploadId: vi.fn(() => "backup-id"),
  }))

vi.mock('../api', () => ({
  listDirectory,
  getFileContent,
  getFileStatus,
  getSessionDiff,
  getVcsDiff,
  writeFileBytes,
}))

vi.mock('../api/file', () => ({
  getServerTmpDirectory,
  createUploadId,
}))

describe('useFileExplorer change scope', () => {
  beforeEach(() => {
    changeScopeStore.clearAll()
    vi.clearAllMocks()

    listDirectory.mockResolvedValue([
      { name: 'src', path: 'src', absolute: '/repo/src', type: 'directory', ignored: false },
      { name: 'git.ts', path: 'src/git.ts', absolute: '/repo/src/git.ts', type: 'file', ignored: false },
      { name: 'turn.ts', path: 'src/turn.ts', absolute: '/repo/src/turn.ts', type: 'file', ignored: false },
    ])
    getFileContent.mockResolvedValue({ type: 'text', content: 'test' })
    getFileStatus.mockResolvedValue([])
    getVcsDiff.mockResolvedValue([
      {
        file: 'src/git.ts',
        before: 'const git = 1',
        after: 'const git = 2',
        additions: 1,
        deletions: 1,
      },
    ])
    getSessionDiff.mockResolvedValue([
      {
        file: 'src/turn.ts',
        before: '',
        after: 'const turn = 1',
        additions: 1,
        deletions: 0,
      },
    ])
  })

  it('updates file statuses when the shared change mode changes', async () => {
    // 与官方 review 对齐：turn → session.diff（不传 directory），git → vcs.diff(working)
    changeScopeStore.setMode('session-1', 'turn')
    const { result } = renderHook(() => useFileExplorer({ directory: '/repo', autoLoad: true, sessionId: 'session-1' }))

    await waitFor(() => {
      expect(result.current.fileStatus.get('src/turn.ts')?.status).toBe('added')
    })

    expect(getSessionDiff).toHaveBeenCalledWith('session-1', undefined)

    act(() => {
      changeScopeStore.setMode('session-1', 'git')
    })

    await waitFor(() => {
      expect(result.current.fileStatus.get('src/git.ts')?.status).toBe('modified')
    })

    expect(result.current.fileStatus.get('src/turn.ts')).toBeUndefined()
    expect(getVcsDiff).toHaveBeenCalledWith('working', '/repo', undefined)
  })

  it('restores expanded folders per directory when switching projects', async () => {
    listDirectory.mockImplementation(async (parentPath: string, directory: string) => {
      if (parentPath === '') {
        return [{ name: 'src', path: 'src', absolute: `${directory}/src`, type: 'directory', ignored: false }]
      }

      if (parentPath === 'src') {
        return [
          {
            name: directory === '/repo-a' ? 'a.ts' : 'b.ts',
            path: `src/${directory === '/repo-a' ? 'a.ts' : 'b.ts'}`,
            absolute: `${directory}/src/${directory === '/repo-a' ? 'a.ts' : 'b.ts'}`,
            type: 'file',
            ignored: false,
          },
        ]
      }

      return []
    })

    const { result, rerender } = renderHook(
      ({ directory }) => useFileExplorer({ directory, autoLoad: true }),
      { initialProps: { directory: '/repo-a' } },
    )

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1)
    })

    act(() => {
      result.current.toggleExpand('src')
    })

    await waitFor(() => {
      expect(result.current.expandedPaths.has('src')).toBe(true)
      expect(result.current.tree[0]?.children?.[0]?.path).toBe('src/a.ts')
    })

    rerender({ directory: '/repo-b' })

    await waitFor(() => {
      expect(result.current.tree[0]?.absolute).toBe('/repo-b/src')
      expect(result.current.tree[0]?.children?.[0]?.path).toBeUndefined()
      expect(result.current.expandedPaths.has('src')).toBe(false)
    })

    rerender({ directory: '/repo-a' })

    await waitFor(() => {
      expect(result.current.tree[0]?.absolute).toBe('/repo-a/src')
      expect(result.current.expandedPaths.has('src')).toBe(true)
      expect(result.current.tree[0]?.children?.[0]?.path).toBe('src/a.ts')
    })
  })

  it('ignores stale child loads after switching directories', async () => {
    let resolveRepoAChildren: (nodes: Array<{ name: string; path: string; absolute: string; type: 'file'; ignored: boolean }>) => void

    listDirectory.mockImplementation((parentPath: string, directory: string) => {
      if (parentPath === '') {
        return Promise.resolve([{ name: 'src', path: 'src', absolute: `${directory}/src`, type: 'directory', ignored: false }])
      }

      if (parentPath === 'src' && directory === '/repo-a') {
        return new Promise(resolve => {
          resolveRepoAChildren = resolve
        })
      }

      if (parentPath === 'src' && directory === '/repo-b') {
        return Promise.resolve([
          { name: 'b.ts', path: 'src/b.ts', absolute: '/repo-b/src/b.ts', type: 'file', ignored: false },
        ])
      }

      return Promise.resolve([])
    })

    const { result, rerender } = renderHook(
      ({ directory }) => useFileExplorer({ directory, autoLoad: true }),
      { initialProps: { directory: '/repo-a' } },
    )

    await waitFor(() => {
      expect(result.current.tree[0]?.absolute).toBe('/repo-a/src')
    })

    act(() => {
      result.current.toggleExpand('src')
    })

    rerender({ directory: '/repo-b' })

    await waitFor(() => {
      expect(result.current.tree[0]?.absolute).toBe('/repo-b/src')
    })

    act(() => {
      result.current.toggleExpand('src')
    })

    await waitFor(() => {
      expect(result.current.tree[0]?.children?.[0]?.path).toBe('src/b.ts')
    })

    await act(async () => {
      resolveRepoAChildren!([
        { name: 'a.ts', path: 'src/a.ts', absolute: '/repo-a/src/a.ts', type: 'file', ignored: false },
      ])
    })

    expect(result.current.tree[0]?.absolute).toBe('/repo-b/src')
    expect(result.current.tree[0]?.children?.map(child => child.path)).toEqual(['src/b.ts'])
  })

  // issue #176：部分服务器（Windows v2）目录条目带尾斜杠（如 `castle-village-3d/`），
  // 不剥掉会让子条目拼出 `castle-village-3d//castle-village-3d/index.html` 的重复路径
  it('strips trailing slashes from directory entries so child paths are not duplicated', async () => {
    listDirectory.mockImplementation(async (parentPath: string, directory: string) => {
      if (parentPath === '') {
        return [{ name: 'castle-village-3d', path: 'castle-village-3d/', absolute: `${directory}/castle-village-3d`, type: 'directory', ignored: false }]
      }
      if (parentPath === 'castle-village-3d') {
        return [
          {
            name: 'index.html',
            path: 'castle-village-3d/index.html',
            absolute: `${directory}/castle-village-3d/index.html`,
            type: 'file',
            ignored: false,
          },
        ]
      }
      return []
    })

    const { result } = renderHook(() => useFileExplorer({ directory: '/repo', autoLoad: true }))

    await waitFor(() => {
      expect(result.current.tree).toHaveLength(1)
    })

    // 根节点 path 不带尾斜杠，展开列子目录传的也是干净路径
    expect(result.current.tree[0]?.path).toBe('castle-village-3d')

    act(() => {
      result.current.toggleExpand('castle-village-3d')
    })

    await waitFor(() => {
      expect(result.current.tree[0]?.children?.[0]?.path).toBe('castle-village-3d/index.html')
    })

    expect(listDirectory).toHaveBeenCalledWith('castle-village-3d', '/repo', undefined)
  })
})
