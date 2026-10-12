import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RELEASES_API_URL,
  RELEASES_PAGE_URL,
  UpdateStore,
  compareVersions,
  hasUpdateAvailable,
  importUpdateSettingsBackup,
  shouldShowUpdateToast,
} from './updateStore'

const STORAGE_KEY = 'opencode:update-check:xiufeigo/OpenCodeUI'
const release = {
  version: '0.5.2',
  tagName: 'v0.5.2',
  url: 'https://github.com/xiufeigo/OpenCodeUI/releases/tag/v0.5.2',
  publishedAt: null,
  name: null,
}

describe('updateStore helpers', () => {
  it('compares versions with optional v prefix', () => {
    expect(compareVersions('v0.5.2', '0.5.1')).toBeGreaterThan(0)
    expect(compareVersions('0.5.1', 'v0.5.1')).toBe(0)
    expect(compareVersions('0.5', '0.5.1')).toBeLessThan(0)
  })

  it('detects whether an update toast should be shown', () => {
    const baseState = {
      currentVersion: '0.5.1',
      latestRelease: {
        version: '0.5.2',
        tagName: 'v0.5.2',
        url: 'https://example.com',
        publishedAt: null,
        name: null,
      },
      lastCheckedAt: Date.now(),
      dismissedVersion: null,
      hiddenToastVersion: null,
      checking: false,
      error: null,
    }

    expect(hasUpdateAvailable(baseState)).toBe(true)
    expect(shouldShowUpdateToast(baseState)).toBe(true)
    expect(shouldShowUpdateToast({ ...baseState, hiddenToastVersion: '0.5.2' })).toBe(false)
    expect(shouldShowUpdateToast({ ...baseState, dismissedVersion: '0.5.2' })).toBe(false)
  })
})

describe('UpdateStore', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('loads the latest release and persists dismissal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v0.5.2',
          html_url: release.url,
          published_at: '2026-04-15T00:00:00Z',
          name: 'OpenCodeUI v0.5.2',
        }),
      }),
    )

    const store = new UpdateStore('0.5.1')
    await store.checkForUpdates({ force: true })

    expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/xiufeigo/OpenCodeUI/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    })
    expect(store.getSnapshot().latestRelease?.url).toBe(release.url)
    expect(store.getSnapshot().latestRelease?.version).toBe('0.5.2')
    expect(hasUpdateAvailable(store.getSnapshot())).toBe(true)

    store.dismissCurrentVersion()

    expect(store.getSnapshot().dismissedVersion).toBe('0.5.2')
    expect(shouldShowUpdateToast(store.getSnapshot())).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toContain('0.5.2')
  })

  it('checks the fork immediately despite a fresh upstream cache', async () => {
    localStorage.setItem(
      'opencode:update-check',
      JSON.stringify({
        latestRelease: { ...release, url: 'https://github.com/lehhair/OpenCodeUI/releases/tag/v0.5.2' },
        lastCheckedAt: Date.now(),
        dismissedVersion: '0.5.2',
      }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v0.5.2' }) }))
    const store = new UpdateStore('0.5.1')
    expect(store.getSnapshot().latestRelease).toBeNull()
    expect(store.getSnapshot().dismissedVersion).toBeNull()
    await store.checkForUpdates()
    expect(fetch).toHaveBeenCalledWith(RELEASES_API_URL, expect.any(Object))
    expect(store.getSnapshot().latestRelease?.url).toBe(RELEASES_PAGE_URL)
    expect(shouldShowUpdateToast(store.getSnapshot())).toBe(true)
  })

  it('discards upstream release metadata imported from a settings backup', () => {
    importUpdateSettingsBackup({
      latestRelease: { ...release, url: 'https://github.com/lehhair/OpenCodeUI/releases/tag/v0.5.2' },
      lastCheckedAt: Date.now(),
      dismissedVersion: '0.5.2',
    })
    const state = new UpdateStore('0.5.1').getSnapshot()
    expect(state.latestRelease).toBeNull()
    expect(state.lastCheckedAt).toBeNull()
    expect(state.dismissedVersion).toBeNull()
  })

  it('retains valid fork release metadata and dismissal in backups', () => {
    const checkedAt = Date.now()
    importUpdateSettingsBackup({ latestRelease: release, lastCheckedAt: checkedAt, dismissedVersion: '0.5.2' })
    const state = new UpdateStore('0.5.1').getSnapshot()
    expect(state.latestRelease).toEqual(release)
    expect(state.lastCheckedAt).toBe(checkedAt)
    expect(state.dismissedVersion).toBe('0.5.2')
  })

  it('reports an invalid source and HTTP errors without showing an upstream release', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ tag_name: 'v0.5.2', html_url: 'https://github.com/lehhair/OpenCodeUI/releases/latest' }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404 }),
    )
    const store = new UpdateStore('0.5.1')
    await store.checkForUpdates()
    expect(store.getSnapshot().error).toBe('Release URL does not belong to the configured repository')
    expect(store.getSnapshot().latestRelease).toBeNull()
    await store.checkForUpdates()
    expect(store.getSnapshot().error).toBe('HTTP 404')
    expect(store.getSnapshot().latestRelease).toBeNull()
  })
})
