import { memo, useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, ChevronUpIcon, DownloadIcon } from './Icons'
import { Button } from './ui'
import { CodeBlock } from './CodeBlock'
import { exportSession } from '../api/session'
import { useSessionContext } from '../contexts/useSessionContext'
import { useModels } from '../hooks/useModels'
import { childSessionStore } from '../store/childSessionStore'
import { messageStore } from '../store/messageStore'
import { saveData } from '../utils/downloadUtils'
import { uiErrorHandler } from '../utils'
import { sessionDisplayTitle } from '../utils/sessionTitle'
import { splitSessionKey } from '../utils/sessionKey'
import {
  buildContextPageModel,
  formatContextCost,
  formatContextNumber,
  formatContextPercent,
  formatContextTime,
  sumSessionCost,
} from './contextPageModel'

interface ContextPanelProps {
  sessionId?: string | null
  serverId?: string
}

function useLiveSessionTick(sessionId: string | null) {
  const version = useRef(0)
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      const bump = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        version.current += 1
        onStoreChange()
      }
      const schedule = () => {
        if (sessionId && !messageStore.getIsStreaming(sessionId)) {
          bump()
          return
        }
        if (timer) return
        timer = setTimeout(bump, 200)
      }
      const unsubMessages = messageStore.subscribe(schedule)
      const unsubChildren = childSessionStore.subscribe(schedule)
      return () => {
        unsubMessages()
        unsubChildren()
        if (timer) clearTimeout(timer)
      }
    },
    [sessionId],
  )
  return useSyncExternalStore(
    subscribe,
    () => version.current,
    () => version.current,
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <dt className="text-[length:var(--fs-xs)] text-text-400">{label}</dt>
      <dd className="text-[length:var(--fs-sm)] font-medium text-text-100 break-words">{value}</dd>
    </div>
  )
}

export const ContextPanel = memo(function ContextPanel({ sessionId, serverId }: ContextPanelProps) {
  const { t } = useTranslation(['components', 'commands'])

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-text-400 text-[length:var(--fs-sm)]">
        {t('rightPanel.noActiveSession')}
      </div>
    )
  }

  return <ContextPanelBody sessionId={sessionId} serverId={serverId} />
})

function ContextPanelBody({ sessionId, serverId }: { sessionId: string; serverId?: string }) {
  const { t, i18n } = useTranslation(['components', 'commands'])
  const { sessions } = useSessionContext()
  const { models, providers } = useModels(serverId)
  useLiveSessionTick(sessionId)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'

  const state = messageStore.getSessionState(sessionId)
  const rawId = splitSessionKey(sessionId).sessionId
  const info = sessions.find(session => session.id === rawId)
  const storedTitle = state?.title || info?.title
  const sessionTitle = storedTitle
    ? sessionDisplayTitle(
        { title: storedTitle, parentID: info?.parentID },
        {
          newSession: t('commands:sessions.newSession'),
          childSession: t('commands:sessions.childSession'),
        },
      )
    : rawId
  const isChild = Boolean(info?.parentID || childSessionStore.getSessionInfo(sessionId))
  const ownCost = state?.cost ?? info?.cost ?? 0
  const childCosts = isChild
    ? []
    : childSessionStore.getChildSessionIds(sessionId).map(childKey => messageStore.getSessionState(childKey)?.cost ?? 0)
  const created = info?.time.created ?? childSessionStore.getSessionInfo(sessionId)?.createdAt
  const page = buildContextPageModel({
    messages: state?.messages ?? [],
    boundary: state?.revertState?.messageId,
    sessionTitle,
    sessionId: rawId,
    created,
    cost: sumSessionCost(ownCost, childCosts, isChild),
    models,
    providers,
  })

  const rows = [
    { label: t('contextPanel.session'), value: page.sessionLabel },
    { label: t('contextPanel.messages'), value: formatContextNumber(page.messageCount, locale) },
    { label: t('contextPanel.provider'), value: page.providerLabel },
    { label: t('contextPanel.model'), value: page.modelLabel },
    { label: t('contextPanel.limit'), value: formatContextNumber(page.limit, locale) },
    { label: t('contextPanel.totalTokens'), value: formatContextNumber(page.total, locale) },
    { label: t('contextPanel.usage'), value: formatContextPercent(page.usage, locale) },
    { label: t('contextPanel.inputTokens'), value: formatContextNumber(page.input, locale) },
    { label: t('contextPanel.outputTokens'), value: formatContextNumber(page.output, locale) },
    { label: t('contextPanel.reasoningTokens'), value: formatContextNumber(page.reasoning, locale) },
    {
      label: t('contextPanel.cacheTokens'),
      value: `${formatContextNumber(page.cacheRead, locale)} / ${formatContextNumber(page.cacheWrite, locale)}`,
    },
    { label: t('contextPanel.userMessages'), value: formatContextNumber(page.userCount, locale) },
    { label: t('contextPanel.assistantMessages'), value: formatContextNumber(page.assistantCount, locale) },
    { label: t('contextPanel.totalCost'), value: formatContextCost(page.cost, locale) },
    { label: t('contextPanel.sessionCreated'), value: formatContextTime(page.created, locale) },
    { label: t('contextPanel.lastActivity'), value: formatContextTime(page.lastActivity, locale) },
  ]

  const messages = messageStore.getSessionState(sessionId)?.messages ?? []

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      const transfer = await exportSession(sessionId, undefined, serverId)
      const raw = messageStore.getSessionState(sessionId)?.title || ''
      const name = raw
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
      saveData(
        new TextEncoder().encode(JSON.stringify(transfer, null, 2)),
        `${name || splitSessionKey(sessionId).sessionId}.json`,
        'application/json',
      )
    } catch (error) {
      uiErrorHandler('export session', error)
    } finally {
      setExporting(false)
    }
  }, [serverId, sessionId])

  return (
    <div data-testid="context-panel" className="@container h-full overflow-y-auto">
      <div className="flex flex-col gap-6 px-4 pt-4 pb-6">
        <dl className="grid grid-cols-1 gap-4 @min-[32rem]:grid-cols-2">
          {rows.map(row => (
            <Stat key={row.label} label={row.label} value={row.value} />
          ))}
        </dl>

        {page.systemPrompt && (
          <section className="flex flex-col gap-2">
            <h3 className="text-[length:var(--fs-xs)] text-text-400">{t('contextPanel.systemPrompt')}</h3>
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border-200/70 bg-bg-000 px-3 py-2 text-[length:var(--fs-xs)] text-text-200">
              {page.systemPrompt}
            </pre>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[length:var(--fs-xs)] text-text-400">{t('contextPanel.rawMessages')}</h3>
            <Button type="button" variant="ghost" size="sm" isLoading={exporting} onClick={() => void handleExport()}>
              <DownloadIcon size={12} />
              <span>{t('contextPanel.exportSession')}</span>
            </Button>
          </div>
          <div className="space-y-1">
            {messages.map(message => {
              const isExpanded = expandedId === message.id
              return (
                <div key={message.id} className="overflow-hidden rounded-lg border border-border-200/50">
                  <button
                    type="button"
                    onClick={() => setExpandedId(current => (current === message.id ? null : message.id))}
                    className="flex w-full items-center justify-between gap-3 bg-bg-100 px-3 py-2 text-left hover:bg-bg-200/40"
                  >
                    <span className="min-w-0 truncate font-mono text-[length:var(--fs-xs)] text-text-200">
                      {message.type} · {message.id}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-text-400">
                      <span className="text-[length:var(--fs-xxs)] tabular-nums">
                        {formatContextTime(message.time.created, locale)}
                      </span>
                      {isExpanded ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-border-200/50 bg-bg-000 p-3">
                      <CodeBlock code={JSON.stringify(message, null, 2)} language="json" maxHeight={420} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
