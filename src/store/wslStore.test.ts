import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reduceWslRestore, resolveWslBootTarget, type WslRestoreState } from './wslStore'
import type { WslServerItem, WslServersEvent, WslServersState } from '../features/wsl/types'

// wslStore 粘合真实 serverStore / multiServerStore 来验证「删除后完整回收」，
// 因此只 mock 掉 Tauri 边界（api/wsl 推送通道 + isTauri），其余走真实 store 逻辑。
let pushState: (event: WslServersEvent) => void = () => {}
// 评审 N1 竞态测试用：可控 resolve 的初始 getState（模拟"快照晚于事件到达"）
let resolveGetState: (state: WslServersState) => void = () => {}

vi.mock('../utils/tauri', async importOriginal => ({
  ...await importOriginal<typeof import('../utils/tauri')>(),
  isTauri: () => true,
}))
vi.mock('../api/wsl', () => ({
  wslApi: {
    getState: () =>
      new Promise<WslServersState>(resolve => {
        resolveGetState = resolve
      }),
  },
  subscribeWslState: (cb: (event: WslServersEvent) => void) => {
    pushState = cb
    return () => {}
  },
}))

function readyItem(id: string): WslServerItem {
  return {
    config: { id, distro: id.replace('wsl:', '') },
    runtime: { kind: 'ready', url: 'http://127.0.0.1:58231', username: null, password: null },
  }
}

function startingItem(id: string): WslServerItem {
  return { config: { id, distro: id.replace('wsl:', '') }, runtime: { kind: 'starting' } }
}

function makeState(servers: WslServerItem[]): WslServersState {
  return {
    runtime: null,
    installed: [],
    online: [],
    distroProbes: {},
    opencodeChecks: {},
    pendingRestart: false,
    servers,
    job: null,
  }
}

describe('wslStore deleted-server reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    pushState = () => {}
  })

  it('reclaims a WSL server that disappears from the pushed state (registered → deleted)', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')
    const { multiServerStore } = await import('./multiServerStore')

    // 让 Ubuntu 成为启动默认偏好，start() 会据此算出 bootTarget
    serverStore.setDefaultServer('wsl:Ubuntu')
    wslStore.start()

    // 就绪 → 注册进 serverStore、进白名单、成为 active
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    expect(serverStore.getServer('wsl:Ubuntu')).not.toBeNull()
    expect(multiServerStore.isSubscribed('wsl:Ubuntu')).toBe(true)

    // 后端推送里 Ubuntu 彻底消失（remove_wsl_server 直接从源列表删掉，不会再有 unready 事件）
    pushState({ type: 'state', state: makeState([]) })

    // (a) 从 serverStore 移除
    expect(serverStore.getServer('wsl:Ubuntu')).toBeNull()
    // (b) 从白名单摘除，幽灵分组不再尝试连接
    expect(multiServerStore.isSubscribed('wsl:Ubuntu')).toBe(false)
    // (c) 每-id 记账：默认偏好指向被删服务器时一并清除（serverStore 伴侣修复）
    expect(serverStore.getDefaultServerId()).toBeNull()
  })

  it('drops stale restore pointers so a re-added id is not hijacked back to active', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')

    wslStore.start()

    // Ubuntu 就绪并成为 active
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    serverStore.setActiveServer('wsl:Ubuntu')

    // Ubuntu 转 starting（未就绪）：active 死亡 → pendingRestoreId 记为 Ubuntu，并从列表移除
    pushState({ type: 'state', state: makeState([startingItem('wsl:Ubuntu')]) })
    expect(serverStore.getServer('wsl:Ubuntu')).toBeNull()
    expect(serverStore.getActiveServerId()).not.toBe('wsl:Ubuntu')

    // 彻底删除：推送里连 starting 条目都没有了 → 回收并清掉 pendingRestoreId 指针
    pushState({ type: 'state', state: makeState([]) })

    // 全新注册同名 distro（用户重新添加）：因指针已清，恢复状态机不应把它劫持回 active
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    expect(serverStore.getActiveServerId()).not.toBe('wsl:Ubuntu')
  })

  it('does not reclaim anything on the very first sync', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')
    const removeSpy = vi.spyOn(serverStore, 'removeServer')

    // 首次推送只含 Debian，_knownIds 为空 → 不得误删任何 id
    wslStore.start()
    pushState({ type: 'state', state: makeState([readyItem('wsl:Debian')]) })

    expect(removeSpy).not.toHaveBeenCalled()
    expect(serverStore.getServer('wsl:Debian')).not.toBeNull()
  })
})

// 启动/恢复判定都是纯函数：不需要 mock Tauri，只验证判定契约
describe('resolveWslBootTarget', () => {
  it('prefers the wsl default server preference over the boot intent', () => {
    expect(resolveWslBootTarget({ defaultServerId: 'wsl:Ubuntu', bootIntentServerId: 'wsl:Debian' })).toBe('wsl:Ubuntu')
  })

  it('falls back to the boot intent server when there is no default preference', () => {
    expect(resolveWslBootTarget({ defaultServerId: null, bootIntentServerId: 'wsl:Debian' })).toBe('wsl:Debian')
  })

  it('ignores non-wsl ids from both sources', () => {
    expect(resolveWslBootTarget({ defaultServerId: 'remote', bootIntentServerId: 'local' })).toBeNull()
  })

  it('returns null when neither source is set', () => {
    expect(resolveWslBootTarget({ defaultServerId: null, bootIntentServerId: null })).toBeNull()
  })
})

const IDLE: WslRestoreState = { bootTarget: null, pendingRestoreId: null }

describe('reduceWslRestore', () => {
  it('records the active server as pending restore when it goes unready (died)', () => {
    const outcome = reduceWslRestore(IDLE, { kind: 'unready', serverId: 'wsl:Ubuntu', isActive: true })

    expect(outcome.state.pendingRestoreId).toBe('wsl:Ubuntu')
    expect(outcome.shouldRestore).toBe(false)
  })

  it('does not record when a non-active server goes unready', () => {
    const outcome = reduceWslRestore(IDLE, { kind: 'unready', serverId: 'wsl:Ubuntu', isActive: false })

    expect(outcome.state).toEqual(IDLE)
  })

  it('overwrites the pending restore with the most recent active death', () => {
    const first = reduceWslRestore(IDLE, { kind: 'unready', serverId: 'wsl:Ubuntu', isActive: true })
    const outcome = reduceWslRestore(first.state, { kind: 'unready', serverId: 'wsl:Debian', isActive: true })

    expect(outcome.state.pendingRestoreId).toBe('wsl:Debian')
  })

  it('restores a revived server that was active before it died', () => {
    const died = reduceWslRestore(IDLE, { kind: 'unready', serverId: 'wsl:Ubuntu', isActive: true })
    const outcome = reduceWslRestore(died.state, { kind: 'ready', serverId: 'wsl:Ubuntu', isActive: false })

    expect(outcome.shouldRestore).toBe(true)
    expect(outcome.state.pendingRestoreId).toBeNull()
  })

  it('does not restore when the revived server is already active but still consumes the memory', () => {
    const died = reduceWslRestore(IDLE, { kind: 'unready', serverId: 'wsl:Ubuntu', isActive: true })
    const outcome = reduceWslRestore(died.state, { kind: 'ready', serverId: 'wsl:Ubuntu', isActive: true })

    expect(outcome.shouldRestore).toBe(false)
    expect(outcome.state.pendingRestoreId).toBeNull()
  })

  it('restores and consumes the one-shot boot target when it becomes ready', () => {
    const state: WslRestoreState = { bootTarget: 'wsl:Ubuntu', pendingRestoreId: null }
    const outcome = reduceWslRestore(state, { kind: 'ready', serverId: 'wsl:Ubuntu', isActive: false })

    expect(outcome.shouldRestore).toBe(true)
    expect(outcome.state.bootTarget).toBeNull()
  })

  it('does not consume the boot target when a different server becomes ready', () => {
    const state: WslRestoreState = { bootTarget: 'wsl:Ubuntu', pendingRestoreId: 'wsl:Debian' }
    const outcome = reduceWslRestore(state, { kind: 'ready', serverId: 'wsl:Debian', isActive: false })

    expect(outcome.shouldRestore).toBe(true)
    expect(outcome.state.bootTarget).toBe('wsl:Ubuntu')
    expect(outcome.state.pendingRestoreId).toBeNull()
  })

  it('keeps the boot target across unready events of other servers', () => {
    const state: WslRestoreState = { bootTarget: 'wsl:Ubuntu', pendingRestoreId: null }
    const outcome = reduceWslRestore(state, { kind: 'unready', serverId: 'wsl:Debian', isActive: false })

    expect(outcome.state.bootTarget).toBe('wsl:Ubuntu')
    expect(outcome.shouldRestore).toBe(false)
  })

  it('consumes both memories when the same server hits boot target and pending restore', () => {
    const state: WslRestoreState = { bootTarget: 'wsl:Ubuntu', pendingRestoreId: 'wsl:Ubuntu' }
    const outcome = reduceWslRestore(state, { kind: 'ready', serverId: 'wsl:Ubuntu', isActive: false })

    expect(outcome.shouldRestore).toBe(true)
    expect(outcome.state).toEqual({ bootTarget: null, pendingRestoreId: null })
  })
})

// 评审 I6：pendingRestoreId 的用户意志过期——崩溃恢复的正向路径与放弃路径
describe('wslStore crash-restore intent lifecycle', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    pushState = () => {}
  })

  it('restores active back to a crashed WSL server that revives while user waits', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')
    wslStore.start()

    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    serverStore.setActiveServer('wsl:Ubuntu')
    // sidecar 崩溃：active 死亡 → 记 pendingRestoreId 并回退
    pushState({ type: 'state', state: makeState([startingItem('wsl:Ubuntu')]) })
    expect(serverStore.getActiveServerId()).not.toBe('wsl:Ubuntu')

    // 用户没动过 → 复活即恢复（正向功能必须保持）
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    expect(serverStore.getActiveServerId()).toBe('wsl:Ubuntu')
  })

  it('abandons the restore intent when the user switches to another server before revive', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')
    // 预置一个非 WSL 服务器作为用户主动切换的目标
    serverStore.upsertServer({ id: 'remote', name: 'remote', url: 'http://127.0.0.1:59999' })
    wslStore.start()

    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    serverStore.setActiveServer('wsl:Ubuntu')
    pushState({ type: 'state', state: makeState([startingItem('wsl:Ubuntu')]) })

    // 用户主动切走（同步循环之外）→ 恢复意图作废
    serverStore.setActiveServer('remote')
    expect(serverStore.getActiveServerId()).toBe('remote')

    // Ubuntu 复活 → 不得把用户劫持回去
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    expect(serverStore.getActiveServerId()).toBe('remote')
  })
})

// 评审 N1：事件推送与初始 getState 快照乱序——陈旧快照不得触发删除对账回收
describe('wslStore initial-snapshot ordering', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    pushState = () => {}
    resolveGetState = () => {}
  })

  it('discards a stale getState snapshot that resolves after live events', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')
    const { multiServerStore } = await import('./multiServerStore')

    wslStore.start()
    serverStore.setDefaultServer('wsl:Ubuntu')
    // 实时事件先到：Ubuntu 就绪登记，对账基线记入该 id
    pushState({ type: 'state', state: makeState([readyItem('wsl:Ubuntu')]) })
    expect(serverStore.getServer('wsl:Ubuntu')).not.toBeNull()

    // 更早发出的初始 getState 此刻才 resolve，且是不含 Ubuntu 的陈旧快照
    resolveGetState(makeState([]))
    await new Promise(resolve => setTimeout(resolve, 0))

    // 陈旧快照必须被丢弃：服务器、白名单订阅、默认偏好都不许被"误删除"回收
    expect(serverStore.getServer('wsl:Ubuntu')).not.toBeNull()
    expect(multiServerStore.isSubscribed('wsl:Ubuntu')).toBe(true)
    expect(serverStore.getDefaultServerId()).toBe('wsl:Ubuntu')
  })

  it('still applies the initial snapshot when no live event has arrived', async () => {
    const { wslStore } = await import('./wslStore')
    const { serverStore } = await import('./serverStore')

    wslStore.start()
    resolveGetState(makeState([readyItem('wsl:Debian')]))
    await new Promise(resolve => setTimeout(resolve, 0))

    // 防过度清理：没有事件落地过，初始快照仍是唯一数据源，必须正常生效
    expect(serverStore.getServer('wsl:Debian')).not.toBeNull()
  })
})
