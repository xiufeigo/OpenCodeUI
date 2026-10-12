import { useCallback } from 'react'
import { useRouter } from './useRouter'
import { useServerStore } from './useServerStore'
import { messageStore } from '../store/messageStore'
import { multiServerStore } from '../store/multiServerStore'

/** 所有服务器选择入口共用路由和连接切换，健康检查只报告状态、不阻止切换。 */
export function useServerSelection() {
  const { activeServer, setActiveServer, checkHealth } = useServerStore()
  const { navigateHome, sessionId } = useRouter()

  return useCallback(
    (id: string) => {
      if (activeServer?.id === id) {
        multiServerStore.setFocusedServerId(id)
        return
      }
      if (!setActiveServer(id)) throw new Error(`Server no longer exists: ${id}`)

      multiServerStore.setFocusedServerId(id)
      if (sessionId) messageStore.clearSession(sessionId)
      // 显式更新 home 的服务器参数，避免旧 URL 将 active server 切回去。
      navigateHome(id)
      void checkHealth(id)
    },
    [activeServer?.id, setActiveServer, checkHealth, navigateHome, sessionId],
  )
}
