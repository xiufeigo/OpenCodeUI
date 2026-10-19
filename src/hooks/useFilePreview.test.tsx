import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFilePreview } from './useFilePreview'

const { getFileContent, writeFileBytes, getServerTmpDirectory, createUploadId } = vi.hoisted(() => ({
  getFileContent: vi.fn(),
  writeFileBytes: vi.fn(),
  getServerTmpDirectory: vi.fn(),
  createUploadId: vi.fn(() => 'backup-id'),
}))

vi.mock('../api', () => ({
  getFileContent,
  writeFileBytes,
}))

vi.mock('../api/file', () => ({
  getServerTmpDirectory,
  createUploadId,
}))

describe('useFilePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerTmpDirectory.mockResolvedValue('/tmp/opencode')
  })

  it('加载文件内容', async () => {
    getFileContent.mockResolvedValue({ path: 'src/app.ts', content: 'hello', isBinary: false, bytes: new Uint8Array() })

    const { result } = renderHook(() =>
      useFilePreview({ path: 'src/app.ts', directory: '/repo', consumerId: 'preview-1' }),
    )

    await waitFor(() => {
      expect(result.current.content?.content).toBe('hello')
    })
    expect(getFileContent).toHaveBeenCalledWith('src/app.ts', '/repo', undefined)
  })

  it('不同工作区的同名文件各自读取（不串内容）', async () => {
    getFileContent.mockImplementation(async (path: string, directory: string) => ({
      path,
      content: `${directory} 的 ${path}`,
      isBinary: false,
      bytes: new Uint8Array(),
    }))

    const { result, rerender } = renderHook(
      ({ directory }: { directory: string }) =>
        useFilePreview({ path: 'src/session.ts', directory, consumerId: 'preview-1' }),
      { initialProps: { directory: '/repo-a' } },
    )

    await waitFor(() => {
      expect(result.current.content?.content).toBe('/repo-a 的 src/session.ts')
    })

    rerender({ directory: '/repo-b' })

    await waitFor(() => {
      expect(result.current.content?.content).toBe('/repo-b 的 src/session.ts')
    })
  })
})

describe('useFilePreview · save（保存事务）', () => {
  const enc = (text: string) => new TextEncoder().encode(text)
  const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes)
  const fileAt = (path: string, bytes: Uint8Array) => ({
    path,
    content: dec(bytes),
    isBinary: false,
    size: bytes.byteLength,
    bytes,
  })

  /**
   * 模拟"磁盘"：读到的是最近一次写进去的字节（没人写过就是初始内容）。
   * 这样写后校验（重读比对）才有意义，否则每次保存都会判成校验失败。
   */
  function mockDisk(initial: string) {
    const written = new Map<string, Uint8Array>()
    getFileContent.mockImplementation(async (path: string) => {
      const bytes = written.get(path) ?? enc(initial)
      return fileAt(path, bytes)
    })
    writeFileBytes.mockImplementation(async (target: string, payload: Uint8Array) => {
      // 备份路径不改变"磁盘内容"
      if (!target.includes('/backups/')) written.set(target, payload)
    })
    return { written }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    getServerTmpDirectory.mockResolvedValue('/tmp/opencode')
  })

  function setup() {
    return renderHook(() => useFilePreview({ path: 'src/app.ts', directory: '/repo', consumerId: 'preview-1' }))
  }

  it('拒绝写入工作区外的路径（fs.write 不受 location 限制，必须自己拦）', async () => {
    const { result } = renderHook(() =>
      useFilePreview({ path: '../../etc/passwd', directory: '/repo', consumerId: 'preview-1' }),
    )
    mockDisk('root')

    const failure = await act(() => result.current.save('hacked', undefined, true).catch(e => e))
    expect(failure.code).toBe('OUTSIDE_WORKSPACE')
    expect(writeFileBytes).not.toHaveBeenCalled()
  })

  it('文件已不存在时拒绝保存（不凭空创建文件）', async () => {
    const { result } = setup()
    getFileContent.mockRejectedValue(new Error('FileNotFoundError'))

    const failure = await act(() => result.current.save('next', undefined, true).catch(e => e))
    expect(failure.code).toBe('FILE_MISSING')
    expect(writeFileBytes).not.toHaveBeenCalled()
  })

  it('基线不一致且未 force → STALE_REVISION（由 UI 弹重载/覆盖）', async () => {
    const { result } = setup()
    mockDisk('agent changed this')

    const failure = await act(() => result.current.save('my edit', 'stale-hash').catch(e => e))
    expect(failure.code).toBe('STALE_REVISION')
    expect(writeFileBytes).not.toHaveBeenCalled()
  })

  it('force 时无视基线直接写，并先备份磁盘当前内容', async () => {
    const { result } = setup()
    mockDisk('disk content\n')

    await act(() => result.current.save('mine\n', 'stale-hash', true))

    const targets = writeFileBytes.mock.calls.map(call => call[0] as string)
    expect(targets[0]).toContain('/tmp/opencode/backups/')
    expect(targets[1]).toBe('src/app.ts')
  })

  it('CRLF 原文保存后仍是 CRLF（保真）', async () => {
    const { result } = setup()
    const { written } = mockDisk('a\r\nb\r\n')

    await act(() => result.current.save('a\nb\nc\n', undefined, true))

    expect(dec(written.get('src/app.ts')!)).toBe('a\r\nb\r\nc\r\n')
  })

  it('混合行尾默认拒绝（code=MIXED_EOL）；unifyEol=true 时按多数行尾统一', async () => {
    const { result } = setup()
    const { written } = mockDisk('a\r\nb\r\nc\n')

    const failure = await act(() => result.current.save('x\ny\nz\n', undefined, true).catch(e => e))
    expect(failure.code).toBe('MIXED_EOL')
    expect(written.size).toBe(0)

    await act(() => result.current.save('x\ny\nz\n', undefined, true, true))
    expect(dec(written.get('src/app.ts')!)).toBe('x\r\ny\r\nz\r\n')
  })

  it('写后校验不一致 → VERIFY_FAILED（保留 dirty 让用户重试）', async () => {
    const { result } = setup()
    getFileContent
      .mockResolvedValueOnce(fileAt('src/app.ts', enc('old\n')))
      .mockResolvedValueOnce(fileAt('src/app.ts', enc('someone else wrote this\n')))

    const failure = await act(() => result.current.save('mine\n', undefined, true).catch(e => e))
    expect(failure.code).toBe('VERIFY_FAILED')
  })
})
