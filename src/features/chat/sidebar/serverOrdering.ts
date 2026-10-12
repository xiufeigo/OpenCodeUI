/** 可见顺序包含临时显示的当前服务器；持久化排序只调整已订阅的服务器。 */
export function reorderSubscribedServers({
  subscribedIds,
  visibleIds,
  draggedId,
  targetId,
}: {
  subscribedIds: string[]
  visibleIds: string[]
  draggedId: string
  targetId: string
}): string[] {
  if (!subscribedIds.includes(draggedId)) return subscribedIds
  const from = visibleIds.indexOf(draggedId)
  const to = visibleIds.indexOf(targetId)
  if (from === -1 || to === -1) throw new Error('Cannot reorder a server outside the sidebar scope')

  const visibleOrder = [...visibleIds]
  visibleOrder.splice(from, 1)
  visibleOrder.splice(to, 0, draggedId)
  const subscribed = new Set(subscribedIds)
  const reordered = visibleOrder.filter(id => subscribed.has(id))
  const visible = new Set(visibleIds)
  let index = 0
  // 尚未注册的订阅（如启动中的 WSL）保持原位置和订阅状态。
  return subscribedIds.map(id => (visible.has(id) ? reordered[index++] : id))
}
