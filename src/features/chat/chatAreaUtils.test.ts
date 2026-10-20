import { describe, expect, it } from 'vitest'
import { isChatAreaMountReady } from './chatAreaUtils'

describe('isChatAreaMountReady', () => {
  it('首页（无会话）直接挂载', () => {
    expect(isChatAreaMountReady({ hasSession: false, loadState: 'idle', messageCount: 0 })).toBe(true)
  })

  it('loaded / error：内容已落地，挂载', () => {
    expect(isChatAreaMountReady({ hasSession: true, loadState: 'loaded', messageCount: 3 })).toBe(true)
    expect(isChatAreaMountReady({ hasSession: true, loadState: 'error', messageCount: 0 })).toBe(true)
  })

  it('loading 且屏上已有内容：保持挂载', () => {
    // 卸载成 spinner 再重新挂载，视觉上就是「页面刷新了一下」——
    // SSE 重连的补偿拉取、stale 会话的重新加载都会短暂把 loadState 置回 loading
    expect(isChatAreaMountReady({ hasSession: true, loadState: 'loading', messageCount: 3 })).toBe(true)
  })

  it('loading 且没有内容：卸载，让转圈接管首次加载', () => {
    expect(isChatAreaMountReady({ hasSession: true, loadState: 'loading', messageCount: 0 })).toBe(false)
  })

  it('idle 且没有内容：卸载', () => {
    expect(isChatAreaMountReady({ hasSession: true, loadState: 'idle', messageCount: 0 })).toBe(false)
  })
})
