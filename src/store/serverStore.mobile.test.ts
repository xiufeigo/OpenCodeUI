import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('native mobile server configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 15)')
  })

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
    vi.restoreAllMocks()
  })

  it('starts without a local server and rejects API access before configuration', async () => {
    const { serverStore, exportServerSettingsBackup } = await import('./serverStore')
    expect(serverStore.getServers()).toEqual([])
    expect(serverStore.getActiveServer()).toBeNull()
    expect(exportServerSettingsBackup().activeServerId).toBeNull()
    expect(() => serverStore.getActiveServerId()).toThrow('No active OpenCode server')
    expect(() => serverStore.getActiveBaseUrl()).toThrow('No active OpenCode server')
    expect(() => serverStore.getServerBaseUrl('local')).toThrow('Server no longer exists')
    const { getSDKClient } = await import('../api/sdk')
    expect(() => getSDKClient()).toThrow('No active OpenCode server')
    expect(() => getSDKClient('local')).toThrow('Server no longer exists')
  })

  it('migrates the old local entry while preserving remote connections and credentials', async () => {
    const remote = { id: 'remote', name: 'Desktop', url: 'http://desktop.test', auth: { username: 'test', password: 'test-only' } }
    localStorage.setItem('opencode-servers', JSON.stringify([
      { id: 'local', name: 'Local', url: 'http://127.0.0.1:4096', isDefault: true }, remote,
    ]))
    localStorage.setItem('opencode-active-server', 'local')
    sessionStorage.setItem('opencode-active-server', 'local')
    localStorage.setItem('opencode-default-server', 'local')
    const { serverStore } = await import('./serverStore')
    expect(serverStore.getServers()).toEqual([remote])
    expect(serverStore.getActiveServerId()).toBe('remote')
    expect(JSON.parse(localStorage.getItem('opencode-servers')!)).toEqual([remote])
    expect(sessionStorage.getItem('opencode-active-server')).toBe('remote')
    expect(localStorage.getItem('opencode-default-server')).toBeNull()
  })

  it('clears a local-only configuration and stays empty after reloading', async () => {
    localStorage.setItem('opencode-servers', JSON.stringify([
      { id: 'local', name: 'Local', url: 'http://127.0.0.1:4096', isDefault: true },
    ]))
    sessionStorage.setItem('opencode-active-server', 'local')
    localStorage.setItem('opencode-active-server', 'local')
    const first = await import('./serverStore')
    expect(first.serverStore.getActiveServer()).toBeNull()
    expect(localStorage.getItem('opencode-active-server')).toBeNull()
    expect(sessionStorage.getItem('opencode-active-server')).toBeNull()
    vi.resetModules()
    const reloaded = await import('./serverStore')
    expect(reloaded.serverStore.getServers()).toEqual([])
  })

  it('activates the first remote and permits deleting the last server without restoring localhost', async () => {
    const { serverStore } = await import('./serverStore')
    const changed = vi.fn()
    serverStore.onServerChange(changed)
    const remote = serverStore.addServer({ name: 'Desktop', url: 'http://desktop.test/' })
    expect(serverStore.getActiveServerId()).toBe(remote.id)
    expect(changed).toHaveBeenCalledWith(remote.id, 'server-switch')
    changed.mockClear()
    expect(serverStore.removeServer(remote.id)).toBe(true)
    expect(serverStore.getServers()).toEqual([])
    expect(serverStore.getActiveServer()).toBeNull()
    expect(changed).not.toHaveBeenCalled()
    expect(localStorage.getItem('opencode-active-server')).toBeNull()
    vi.resetModules()
    expect((await import('./serverStore')).serverStore.getServers()).toEqual([])
  })

  it.each([
    { servers: [] },
    { servers: [{ id: 'local', name: 'Local', url: 'http://127.0.0.1:4096', isDefault: true }] },
  ])(
    'does not recreate a local server when importing a backup: $servers', async ({ servers }) => {
      const { importServerSettingsBackup } = await import('./serverStore')
      importServerSettingsBackup({ servers, activeServerId: 'local', defaultServerId: 'local' })
      expect(JSON.parse(localStorage.getItem('opencode-servers')!)).toEqual([])
      expect(localStorage.getItem('opencode-active-server')).toBeNull()
      expect(localStorage.getItem('opencode-default-server')).toBeNull()
    },
  )

  it('preserves a user-created loopback connection rather than filtering arbitrary URLs', async () => {
    const remote = { id: 'server-custom', name: 'Tunnel', url: 'http://127.0.0.1:8080' }
    localStorage.setItem('opencode-servers', JSON.stringify([remote]))
    expect((await import('./serverStore')).serverStore.getServers()).toEqual([remote])
  })

  it('can enable multi-server mode before a remote server has been added', async () => {
    const { multiServerStore } = await import('./multiServerStore')
    expect(() => multiServerStore.setEnabled(true)).not.toThrow()
    expect(multiServerStore.isEnabled()).toBe(true)
    expect(multiServerStore.getSubscribedServerIds()).toEqual([])
  })

  it('reports corrupted storage without inventing a local connection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    localStorage.setItem('opencode-servers', '{invalid')
    expect((await import('./serverStore')).serverStore.getServers()).toEqual([])
    expect(error).toHaveBeenCalledWith('Failed to load server settings:', expect.any(SyntaxError))
  })
})
