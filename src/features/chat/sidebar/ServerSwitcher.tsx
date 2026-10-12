import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../../components/ui/Dialog'
import { CheckIcon, ChevronDownIcon, CloseIcon, GlobeIcon, SettingsIcon, SystemIcon } from '../../../components/Icons'
import { useServerStore } from '../../../hooks/useServerStore'
import { useServerSelection } from '../../../hooks/useServerSelection'
import { LOCAL_SERVER_ID } from '../../../store/serverStore'

export function ServerSwitcher({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useTranslation(['settings', 'common'])
  const { servers, activeServer } = useServerStore()
  const selectServer = useServerSelection()
  const [isOpen, setIsOpen] = useState(false)
  const ActiveIcon = activeServer?.id === LOCAL_SERVER_ID ? SystemIcon : GlobeIcon

  return (
    <>
      <button
        type="button"
        aria-label={t('servers.switchServer')}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title={activeServer?.name}
        onClick={() => setIsOpen(true)}
        className="flex max-w-full items-center gap-2 rounded-lg py-2 pr-2 text-text-100 hover:bg-bg-200 transition-colors"
      >
        <ActiveIcon size={18} className="shrink-0 text-text-300" />
        <span className="truncate text-[length:var(--fs-heading-3)] font-semibold tracking-tight">
          {activeServer?.name ?? t('servers.selectServer')}
        </span>
        <ChevronDownIcon size={14} className="shrink-0 text-text-400" />
      </button>

      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title={t('servers.selectServer')} width={480} rawContent>
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-[length:var(--fs-heading-2)] font-semibold text-text-100">{t('servers.selectServer')}</h2>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={t('common:close')}
            className="rounded-lg p-2 text-text-400 hover:bg-bg-200 hover:text-text-100 transition-colors"
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto custom-scrollbar px-5 pb-5">
          <div className="overflow-hidden rounded-xl bg-bg-200/60 divide-y divide-border-100/50">
            {servers.map(server => {
              const Icon = server.id === LOCAL_SERVER_ID ? SystemIcon : GlobeIcon
              const isActive = server.id === activeServer?.id
              return (
                <button
                  key={server.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => {
                    selectServer(server.id)
                    setIsOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-bg-300/50 transition-colors"
                >
                  <Icon size={22} className="shrink-0 text-text-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--fs-base)] font-medium text-text-100">
                      {server.name}
                    </span>
                    <span className="mt-1 block truncate text-[length:var(--fs-sm)] text-text-400">{server.url}</span>
                  </span>
                  {isActive && <CheckIcon size={20} className="shrink-0 text-accent-main-100" />}
                </button>
              )
            })}
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                onOpenSettings()
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[length:var(--fs-sm)] text-text-300 hover:bg-bg-200 hover:text-text-100 transition-colors"
            >
              <SettingsIcon size={16} />
              {t('servers.manageServers')}
            </button>
          )}
        </div>
      </Dialog>
    </>
  )
}
