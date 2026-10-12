import { describe, expect, it } from 'vitest'
import { reorderSubscribedServers } from './serverOrdering'

describe('subscribed server ordering', () => {
  it('moves a subscribed server to the end when the drop target is the temporary current server', () => {
    const subscribedIds = ['a', 'b']
    expect(
      reorderSubscribedServers({
        subscribedIds,
        visibleIds: ['a', 'b', 'current'],
        draggedId: 'a',
        targetId: 'current',
      }),
    ).toEqual(['b', 'a'])
    expect(subscribedIds).toEqual(['a', 'b'])
  })

  it('keeps unregistered subscriptions without permanently subscribing the current server', () => {
    expect(
      reorderSubscribedServers({
        subscribedIds: ['a', 'wsl:starting', 'b'],
        visibleIds: ['a', 'b', 'current'],
        draggedId: 'a',
        targetId: 'current',
      }),
    ).toEqual(['b', 'wsl:starting', 'a'])
  })

  it('preserves ordinary subscription reordering', () => {
    expect(
      reorderSubscribedServers({
        subscribedIds: ['a', 'b', 'c'],
        visibleIds: ['a', 'b', 'c'],
        draggedId: 'c',
        targetId: 'a',
      }),
    ).toEqual(['c', 'a', 'b'])
  })

  it('keeps the temporary current server outside the persisted order', () => {
    expect(
      reorderSubscribedServers({
        subscribedIds: ['a', 'b'],
        visibleIds: ['a', 'b', 'current'],
        draggedId: 'current',
        targetId: 'a',
      }),
    ).toEqual(['a', 'b'])
  })
})
