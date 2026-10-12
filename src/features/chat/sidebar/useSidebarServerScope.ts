import { useMemo } from 'react'
import { useServerStore } from '../../../hooks/useServerStore'
import { useMultiServerStore } from '../../../store/multiServerStore'

/** 当前服务器始终可见；订阅白名单保留需要同时查看的其他服务器。 */
export function useSidebarServerScope() {
  const multiServerConfig = useMultiServerStore()
  const { activeServer, servers } = useServerStore()
  const serverIds = useMemo(() => {
    const ids = new Set(multiServerConfig.enabled ? multiServerConfig.subscribedServerIds : [])
    if (activeServer) ids.add(activeServer.id)
    return Array.from(ids).filter(id => servers.some(server => server.id === id))
  }, [multiServerConfig.enabled, multiServerConfig.subscribedServerIds, activeServer, servers])

  return { multiServerConfig, activeServer, serverIds }
}
