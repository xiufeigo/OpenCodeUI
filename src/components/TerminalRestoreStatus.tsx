import { useTranslation } from 'react-i18next'
import type { SessionTerminals } from '../hooks/useSessionTerminals'

export function TerminalRestoreStatus({ terminals }: { terminals: SessionTerminals }) {
  const { t } = useTranslation(['components', 'common'])
  if (!terminals.error && !terminals.isRestoring) return null
  return (
    <div
      role={terminals.error ? 'alert' : 'status'}
      className="shrink-0 px-3 py-2 text-text-300 text-[length:var(--fs-sm)]"
    >
      {terminals.error ? (
        <>
          {t('terminal.restoreFailed')}: {terminals.error}{' '}
          <button className="underline" onClick={terminals.retry}>
            {t('common:retry')}
          </button>
        </>
      ) : (
        t('terminal.restoringSessions')
      )}
    </div>
  )
}
