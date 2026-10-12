import { useTranslation } from 'react-i18next'
import App from './App'
import { DirectoryProvider, FullscreenProvider, SessionProvider } from './contexts'
import { ServersSettings } from './features/settings/components/ServersSettings'
import { useServerStore } from './hooks/useServerStore'

/** 工作区依赖真实服务器；尚未配置时只挂载连接设置，不发起工作区请求。 */
export function AppRoot() {
  const { t } = useTranslation('settings')
  const { activeServer } = useServerStore()

  if (!activeServer) {
    return (
      <main className="h-full overflow-y-auto bg-bg-100 text-text-100" style={{ paddingTop: 'var(--app-safe-top)' }}>
        <div className="mx-auto max-w-2xl px-5 py-8 space-y-6">
          <h1 className="text-[length:var(--fs-heading-1)] font-semibold">{t('servers.selectServer')}</h1>
          <ServersSettings />
        </div>
      </main>
    )
  }

  return (
    <DirectoryProvider>
      <SessionProvider>
        <FullscreenProvider>
          <App />
        </FullscreenProvider>
      </SessionProvider>
    </DirectoryProvider>
  )
}
