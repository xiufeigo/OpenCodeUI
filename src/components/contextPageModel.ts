import type { AssistantMessage, SessionMessageInfo } from '../types/api/message'

/** 模型目录里解析显示名所需的字段（官方 catalogModel 的子集） */
export interface ContextCatalogModel {
  id: string
  providerID: string
  name: string
  status?: string
  limit?: { context?: number }
}

export interface ContextCatalogProvider {
  id: string
  name: string
}

type AssistantWithTokens = AssistantMessage & { tokens: NonNullable<AssistantMessage['tokens']> }

/**
 * 当前上下文窗口对应的助手步骤。
 *
 * 与官方 `@opencode/client` 的 `lastAssistantWithUsage` 同一口径：
 * 最后一次已完成压缩之后、撤销边界之前，最近一条带 tokens 的助手消息。
 * 边界 id 找不到时不猜测，避免把已撤销的步骤算进窗口。
 */
export function lastAssistantWithUsage(
  messages: readonly SessionMessageInfo[],
  boundary?: string,
): AssistantWithTokens | undefined {
  const boundaryIndex = boundary ? messages.findIndex(message => message.id === boundary) : -1
  if (boundary && boundaryIndex === -1) return undefined
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex

  let compactionIndex = -1
  for (let index = end - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.type === 'compaction' && message.status === 'completed') {
      compactionIndex = index
      break
    }
  }

  for (let index = end - 1; index > compactionIndex; index--) {
    const message = messages[index]
    if (message.type !== 'assistant' || !message.tokens) continue
    return message as AssistantWithTokens
  }
  return undefined
}

function findCatalog(
  model: { id: string; providerID: string },
  models: readonly ContextCatalogModel[] | undefined,
  providers: readonly ContextCatalogProvider[] | undefined,
) {
  if (!models || !providers) return undefined
  const provider = [...providers].reverse().find(item => item.id === model.providerID)
  if (!provider) return undefined
  const entry = [...models]
    .reverse()
    .find(item => item.providerID === model.providerID && item.id === model.id && item.status !== 'deprecated')
  return {
    providerLabel: provider.name,
    modelLabel: entry?.name ?? model.id,
    limit: entry?.limit?.context,
  }
}

export interface ContextPageModel {
  sessionLabel: string
  messageCount: number
  userCount: number
  assistantCount: number
  providerLabel: string
  modelLabel: string
  /** 模型上下文上限；目录未命中时为 null */
  limit: number | null
  total: number | null
  /** 百分比整数；没有上限时为 null */
  usage: number | null
  input: number | null
  output: number | null
  reasoning: number | null
  cacheRead: number | null
  cacheWrite: number | null
  cost: number
  created: number | null
  lastActivity: number | null
  systemPrompt: string | null
}

export function buildContextPageModel(input: {
  messages: readonly SessionMessageInfo[]
  boundary?: string
  sessionTitle?: string
  sessionId?: string | null
  created?: number
  cost?: number
  models?: readonly ContextCatalogModel[]
  providers?: readonly ContextCatalogProvider[]
}): ContextPageModel {
  let userCount = 0
  let assistantCount = 0
  let systemPrompt: string | null = null

  for (let index = 0; index < input.messages.length; index++) {
    const message = input.messages[index]
    if (message.type === 'user') userCount++
    else if (message.type === 'assistant') assistantCount++
  }
  for (let index = input.messages.length - 1; index >= 0; index--) {
    const message = input.messages[index]
    if (message.type !== 'system') continue
    const trimmed = message.text.trim()
    systemPrompt = trimmed || null
    break
  }

  const step = lastAssistantWithUsage(input.messages, input.boundary)
  const catalog = step ? findCatalog(step.model, input.models, input.providers) : undefined
  const tokens = step?.tokens
  const total = tokens ? tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write : null
  const limit = catalog?.limit
  const usage = limit && total !== null ? Math.round((total / limit) * 100) : null

  return {
    sessionLabel: input.sessionTitle || input.sessionId || '—',
    messageCount: input.messages.length,
    userCount,
    assistantCount,
    providerLabel: catalog?.providerLabel ?? step?.model.providerID ?? '—',
    modelLabel: catalog?.modelLabel ?? step?.model.id ?? '—',
    limit: limit === undefined ? null : limit,
    total,
    usage,
    input: tokens ? tokens.input : null,
    output: tokens ? tokens.output : null,
    reasoning: tokens ? tokens.reasoning : null,
    cacheRead: tokens ? tokens.cache.read : null,
    cacheWrite: tokens ? tokens.cache.write : null,
    cost: input.cost ?? 0,
    created: input.created ?? null,
    lastActivity: step?.time.created ?? null,
    systemPrompt,
  }
}

/** 根会话成本含已加载的子会话；子会话只计自己。与官方 session.cost 同口径。 */
export function sumSessionCost(own: number, childCosts: readonly number[], isChild: boolean): number {
  if (isChild) return own
  return childCosts.reduce((total, cost) => total + cost, own)
}

export function formatContextNumber(value: number | null | undefined, locale: string): string {
  if (value === undefined || value === null) return '—'
  return value.toLocaleString(locale)
}

export function formatContextPercent(value: number | null | undefined, locale: string): string {
  if (value === undefined || value === null) return '—'
  return `${value.toLocaleString(locale)}%`
}

export function formatContextTime(value: number | null | undefined, locale: string): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(value)
}

export function formatContextCost(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(value)
}
