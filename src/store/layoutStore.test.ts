import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { terminalScopeKey } from '../utils/terminalScope'
import { LayoutStore } from './layoutStore'

const STORAGE_KEY_PANEL_LAYOUT = 'opencode-panel-layout'

describe('LayoutStore panel and terminal layout', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('persists global panel layout without persisting terminal tabs', () => {
    const store = new LayoutStore()

    store.addMcpTab('bottom')
    store.addTerminalTab({ id: 'term-1', title: 'Terminal 1', status: 'connected' }, true, 'right')
    store.openRightPanel('changes')

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY_PANEL_LAYOUT) ?? 'null')

    expect(persisted).toMatchObject({
      version: 2,
      rightPanelOpen: true,
      bottomPanelOpen: true,
    })
    expect(persisted.panelTabs).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'context', type: 'context', position: 'right' })]),
    )
    expect(persisted.panelTabs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'files', type: 'files', position: 'right' }),
        expect.objectContaining({ id: 'changes', type: 'changes', position: 'right' }),
        expect.objectContaining({ id: 'mcp', type: 'mcp', position: 'bottom' }),
      ]),
    )
    expect(persisted.panelTabs.some((tab: { id: string }) => tab.id === 'term-1')).toBe(false)

    const restored = new LayoutStore().getState()
    expect(restored.rightPanelOpen).toBe(true)
    expect(restored.bottomPanelOpen).toBe(true)
    expect(restored.panelTabs.some(tab => tab.id === 'mcp' && tab.position === 'bottom')).toBe(true)
    expect(restored.panelTabs.some(tab => tab.id === 'term-1')).toBe(false)
  })

  it('opens with files, changes, and context on the right', () => {
    const store = new LayoutStore()
    expect(store.getTabsForPosition('right').map(tab => tab.type)).toEqual(['files', 'changes', 'context'])
  })

  it('adds the context tab once when restoring a layout saved before it existed', () => {
    localStorage.setItem(
      STORAGE_KEY_PANEL_LAYOUT,
      JSON.stringify({
        version: 1,
        panelTabs: [
          { id: 'files', type: 'files', position: 'right' },
          { id: 'changes', type: 'changes', position: 'bottom' },
        ],
        activeTabId: { bottom: 'changes', right: 'files' },
        rightPanelOpen: true,
        bottomPanelOpen: false,
      }),
    )

    const store = new LayoutStore()
    expect(store.getTabsForPosition('right').map(tab => tab.type)).toEqual(['files', 'context'])
    expect(store.getTabsForPosition('bottom').map(tab => tab.type)).toEqual(['changes'])

    store.removeTab('context')
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY_PANEL_LAYOUT) ?? 'null')
    expect(persisted.version).toBe(2)
    expect(persisted.panelTabs.some((tab: { type: string }) => tab.type === 'context')).toBe(false)

    const restored = new LayoutStore()
    expect(restored.getState().panelTabs.some(tab => tab.type === 'context')).toBe(false)
  })

  it('keeps bottom and right panels open when syncing a directory with no terminal sessions', () => {
    const store = new LayoutStore()

    store.openBottomPanel()
    store.openRightPanel('files')
    store.syncTerminalSessions('dir-a', [])

    expect(store.getState().bottomPanelOpen).toBe(true)
    expect(store.getState().rightPanelOpen).toBe(true)
    expect(store.getTerminalTabs('bottom')).toEqual([])
    expect(store.getTerminalTabs('right')).toEqual([])
  })

  it('restores terminal positions for each directory when switching between projects', () => {
    const store = new LayoutStore()

    store.syncTerminalSessions('dir-a', [
      { id: 'term-a1', title: 'A1', status: 'connected' },
      { id: 'term-a2', title: 'A2', status: 'connected' },
    ])
    store.moveTab('term-a2', 'right')

    store.syncTerminalSessions('dir-b', [{ id: 'term-b1', title: 'B1', status: 'connected' }])
    store.syncTerminalSessions('dir-a', [
      { id: 'term-a1', title: 'A1', status: 'connected' },
      { id: 'term-a2', title: 'A2', status: 'connected' },
    ])

    expect(store.getTerminalTabs('bottom').map(tab => tab.id)).toEqual(['term-a1'])
    expect(store.getTerminalTabs('right').map(tab => tab.id)).toEqual(['term-a2'])
  })

  it('removes project terminal tabs when syncing global terminal sessions', () => {
    const store = new LayoutStore()

    store.syncTerminalSessions('dir-a', [{ id: 'term-a1', title: 'A1', status: 'connected' }])
    store.syncTerminalSessions(undefined, [])

    expect(store.getTerminalTabs('bottom')).toEqual([])
    expect(store.getState().panelTabs.some(tab => tab.id === 'term-a1')).toBe(false)
  })

  it('does not notify when a terminal snapshot is unchanged', () => {
    const store = new LayoutStore()
    store.syncTerminalSessions('dir-a', [{ id: 'term-a1', title: 'A1', status: 'connected' }])
    const snapshot = { buffer: 'pwd\r\n/workspace\r\n', scrollY: 2, cursor: 18, rows: 24, cols: 80 }

    store.updateTerminalSnapshot('term-a1', snapshot)
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    store.updateTerminalSnapshot('term-a1', snapshot)

    unsubscribe()
    expect(notifications).toBe(0)
  })

  it('falls back to a valid right tab when a stale terminal active id disappears after sync', () => {
    const store = new LayoutStore()

    store.syncTerminalSessions('dir-a', [{ id: 'term-a1', title: 'A1', status: 'connected' }])
    store.moveTab('term-a1', 'right')
    store.setActiveTab('right', 'term-a1')

    store.syncTerminalSessions('dir-b', [])

    expect(store.getState().activeTabId.right).toBe('files')
  })

  it('persists terminal snapshots and restores them on the next sync', () => {
    const store = new LayoutStore()

    store.syncTerminalSessions('dir-a', [{ id: 'term-a1', title: 'A1', status: 'connected' }])
    store.updateTerminalSnapshot('term-a1', {
      buffer: 'pwd\r\n/workspace\r\n',
      scrollY: 2,
      cursor: 18,
      rows: 24,
      cols: 80,
    })

    const persisted = JSON.parse(localStorage.getItem('opencode-terminal-layout') ?? 'null')
    expect(persisted.scopes['dir-a'].sessions['term-a1']).toMatchObject({
      buffer: 'pwd\r\n/workspace\r\n',
      scrollY: 2,
      cursor: 18,
      rows: 24,
      cols: 80,
    })

    const restored = new LayoutStore()
    restored.syncTerminalSessions('dir-a', [{ id: 'term-a1', title: 'A1', status: 'connected' }])

    expect(restored.getState().panelTabs.find(tab => tab.id === 'term-a1')).toMatchObject({
      buffer: 'pwd\r\n/workspace\r\n',
      scrollY: 2,
      cursor: 18,
      rows: 24,
      cols: 80,
    })
  })

  it('persists terminal clipboard interaction preferences', () => {
    const store = new LayoutStore()

    store.setTerminalCopyOnSelect(true)
    store.setTerminalRightClickPaste(true)

    expect(localStorage.getItem('opencode-terminal-copy-on-select')).toBe('true')
    expect(localStorage.getItem('opencode-terminal-right-click-paste')).toBe('true')

    const restored = new LayoutStore().getState()
    expect(restored.terminalCopyOnSelect).toBe(true)
    expect(restored.terminalRightClickPaste).toBe(true)
  })

  it('isolates snapshots and active tabs by server and chat, even with the same PTY id', () => {
    const store = new LayoutStore()
    const a = terminalScopeKey({ serverId: 'a', sessionId: 'chat', directory: '/same' })
    const b = terminalScopeKey({ serverId: 'b', sessionId: 'chat', directory: '/same' })
    store.syncTerminalSessions(a, [{ id: 'pty', title: 'A', status: 'connected', serverId: 'a' }])
    store.updateTerminalSnapshot('pty', { buffer: 'A output', cursor: 8 }, a)
    store.moveTab('pty', 'right')
    store.setActiveTab('right', 'pty')
    store.syncTerminalSessions(b, [{ id: 'pty', title: 'B', status: 'connected', serverId: 'b' }])
    store.updateTerminalSnapshot('pty', { buffer: 'B output', cursor: 8 }, b)
    // A's cleanup may run after B has become current.
    store.updateTerminalSnapshot('pty', { buffer: 'A final', cursor: 7 }, a)
    store.updateTerminalShellTitle('pty', 'A shell', false, a)
    expect(store.getState().panelTabs.find(tab => tab.id === 'pty')).toMatchObject({ title: 'B', buffer: 'B output' })
    const reloaded = new LayoutStore()
    reloaded.syncTerminalSessions(a, reloaded.getStoredTerminalSessions(a))
    expect(reloaded.getState().panelTabs.find(tab => tab.id === 'pty')).toMatchObject({
      position: 'right',
      serverId: 'a',
      title: 'A shell',
      buffer: 'A final',
      cursor: 7,
    })
    expect(reloaded.getState().activeTabId.right).toBe('pty')
  })

  it('does not repaint UI when persisting a running terminal checkpoint', () => {
    const store = new LayoutStore()
    store.syncTerminalSessions('chat-a', [{ id: 'pty', title: 'A', status: 'connected' }])
    let notifications = 0
    store.subscribe(() => notifications++)
    store.updateTerminalSnapshot('pty', { buffer: 'progress', cursor: 8 })
    expect(notifications).toBe(0)
    expect(new LayoutStore().getStoredTerminalSessions('chat-a')[0]).toMatchObject({ buffer: 'progress', cursor: 8 })
  })

  it('does not resurrect a terminal from its late cleanup after it has been removed', () => {
    const store = new LayoutStore()
    store.syncTerminalSessions('chat-a', [{ id: 'pty', title: 'A', status: 'connected' }])
    store.removeTerminalTab('pty', 'chat-a')
    store.syncTerminalSessions('chat-b', [])
    store.updateTerminalSnapshot('pty', { buffer: 'late output', cursor: 11 }, 'chat-a')
    expect(store.getStoredTerminalSessions('chat-a')).toEqual([])
  })

  it('retains legacy directory snapshots without assigning them to a chat', () => {
    localStorage.setItem(
      'opencode-terminal-layout',
      JSON.stringify({
        version: 1,
        directories: {
          '/workspace': {
            order: { bottom: ['old'], right: [] },
            activeTabId: { bottom: 'old', right: null },
            sessions: { old: { buffer: 'legacy output', cursor: 13 } },
          },
        },
      }),
    )
    const store = new LayoutStore()
    store.syncTerminalSessions('new-chat', [])
    expect(store.getStoredTerminalSessions('new-chat')).toEqual([])
    expect(store.getLegacyTerminalSnapshot('/workspace', 'old')).toMatchObject({ buffer: 'legacy output', cursor: 13 })
    expect(JSON.parse(localStorage.getItem('opencode-terminal-layout')!).version).toBe(2)
  })

  it('uses the resolved owner instead of a stale server in the saved snapshot', () => {
    const store = new LayoutStore()
    store.syncTerminalSessions('chat-a', [{ id: 'pty', title: 'A', status: 'connected', serverId: 'stale' }])
    store.updateTerminalSnapshot('pty', { buffer: 'saved history', cursor: 13 })
    store.syncTerminalSessions('chat-a', [{ id: 'pty', title: 'A', status: 'connecting', serverId: 'correct' }])
    expect(store.getState().panelTabs.find(tab => tab.id === 'pty')).toMatchObject({
      serverId: 'correct',
      buffer: 'saved history',
    })
  })

  it('retries checkpoint persistence after a storage failure instead of treating it as saved', () => {
    const store = new LayoutStore()
    store.syncTerminalSessions('chat-a', [{ id: 'pty', title: 'A', status: 'connected' }])
    const snapshot = { buffer: 'new progress', cursor: 12 }
    const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    expect(() => store.updateTerminalSnapshot('pty', snapshot)).toThrow('quota')
    save.mockRestore()
    store.updateTerminalSnapshot('pty', snapshot)
    expect(new LayoutStore().getStoredTerminalSessions('chat-a')[0]).toMatchObject(snapshot)
  })
})

// 打开的文件 = 面板里的一个 'file' 标签页
describe('LayoutStore file tab', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('同一路径在不同工作区是两个独立标签', () => {
    const store = new LayoutStore()
    store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-a' }, 'right')
    store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-b' }, 'right')

    const fileTabs = store.getState().panelTabs.filter(item => item.type === 'file')
    expect(fileTabs).toHaveLength(2)
    expect(store.getState().activeTabId.right).toBe(fileTabs[1].id)
  })

  it('同一工作区内重复打开复用同一个标签', () => {
    const store = new LayoutStore()
    const first = store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-a' }, 'right')
    const second = store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-a' }, 'right')

    expect(second).toBe(first)
    expect(store.getState().panelTabs.filter(item => item.type === 'file')).toHaveLength(1)
  })

  it('目录写法不同（反斜杠）仍视为同一工作区的同一个文件', () => {
    const store = new LayoutStore()
    store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: 'C:\\repo\\a' }, 'right')
    store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: 'C:/repo/a' }, 'right')

    const fileTabs = store.getState().panelTabs.filter(item => item.type === 'file')
    expect(fileTabs).toHaveLength(1)
    expect(fileTabs[0].previewFile?.directory).toBe('C:/repo/a')
  })

  it('文件标签插在目录树标签之后，并成为活动标签', () => {
    const store = new LayoutStore()
    const id = store.openFileTab({ path: 'a.ts', name: 'a.ts', directory: '/repo' }, 'right')

    const tabs = store.getState().panelTabs
    const filesIndex = tabs.findIndex(item => item.type === 'files')
    const fileIndex = tabs.findIndex(item => item.id === id)
    expect(fileIndex).toBe(filesIndex + 1)
    expect(store.getState().activeTabId.right).toBe(id)
  })

  it('关闭一个工作区的文件标签不影响另一个工作区', () => {
    const store = new LayoutStore()
    const a = store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-a' }, 'right')
    const b = store.openFileTab({ path: 'src/app.ts', name: 'app.ts', directory: '/repo-b' }, 'right')

    store.removeTab(b)
    const fileTabs = store.getState().panelTabs.filter(item => item.type === 'file')
    expect(fileTabs).toHaveLength(1)
    expect(fileTabs[0].id).toBe(a)
  })

  it('关闭文件标签后回到打开它的那一页（目录树）', () => {
    const store = new LayoutStore()
    // 目录树是活动标签时打开文件
    store.setActiveTab('right', 'files')
    const id = store.openFileTab({ path: 'a.ts', name: 'a.ts', directory: '/repo' }, 'right')
    expect(store.getState().activeTabId.right).toBe(id)

    store.removeTab(id)
    expect(store.getState().activeTabId.right).toBe('files')
  })

  it('同一个文件在右侧和底部是两个独立标签', () => {
    const store = new LayoutStore()
    const right = store.openFileTab({ path: 'a.ts', name: 'a.ts', directory: '/repo' }, 'right')
    const bottom = store.openFileTab({ path: 'a.ts', name: 'a.ts', directory: '/repo' }, 'bottom')

    expect(bottom).not.toBe(right)
    expect(store.getState().panelTabs.filter(item => item.type === 'file')).toHaveLength(2)
    expect(store.getState().activeTabId.right).toBe(right)
    expect(store.getState().activeTabId.bottom).toBe(bottom)
  })
})
