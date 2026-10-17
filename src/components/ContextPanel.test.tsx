import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiSession } from '../api'
import { SessionContext, type SessionContextValue } from '../contexts/SessionContext.shared'
import i18n from '../i18n'
import { messageStore } from '../store/messageStore'
import type { SessionMessageInfo } from '../types/api/message'
import { ContextPanel } from './ContextPanel'

vi.mock('../hooks/useModels', () => ({
  useModels: () => ({
    models: [
      {
        id: 'deepseek-v4.1-flash-free',
        providerID: 'opencode',
        name: 'DeepSeek V4.1 Flash Free',
        status: 'active',
        limit: { context: 1_000_000 },
      },
    ],
    providers: [{ id: 'opencode', name: 'OpenCode' }],
    isLoading: false,
    error: null,
    refetch: async () => undefined,
  }),
}))

const messages: SessionMessageInfo[] = [
  { id: 'u1', type: 'user', time: { created: 1 }, text: 'hi' },
  {
    id: 'a1',
    type: 'assistant',
    time: { created: 2 },
    agent: 'default',
    model: { id: 'deepseek-v4.1-flash-free', providerID: 'opencode' },
    content: [{ type: 'text', text: 'ok' }],
    tokens: { input: 226, output: 268, reasoning: 67, cache: { read: 130688, write: 0 } },
  },
]

const session = {
  id: 'ses_1',
  title: 'OpenCode deepseek-v4.1-flash-free 上下文查询',
  cost: 0,
  projectID: 'project',
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: Date.UTC(2026, 9, 17, 6, 45), updated: Date.UTC(2026, 9, 17, 6, 45) },
  location: { directory: '/repo' },
} as ApiSession

function renderPanel(sessionId: string | null) {
  const value: SessionContextValue = {
    sessions: [session],
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    search: '',
    setSearch: () => undefined,
    refresh: async () => undefined,
    loadMore: async () => undefined,
    createSession: async () => session,
    deleteSession: async () => undefined,
  }
  return render(
    <SessionContext.Provider value={value}>
      <ContextPanel sessionId={sessionId} serverId="local" />
    </SessionContext.Provider>,
  )
}

describe('ContextPanel', () => {
  const previousLanguage = i18n.language

  beforeEach(async () => {
    messageStore.clearAll()
    await i18n.changeLanguage('zh-CN')
  })

  afterEach(async () => {
    messageStore.clearAll()
    await i18n.changeLanguage(previousLanguage)
  })

  it('shows live session context stats on the official field list', () => {
    messageStore.setMessages('local::ses_1', messages, { title: session.title, directory: '/repo' })
    renderPanel('local::ses_1')

    expect(screen.getByText('会话').parentElement).toHaveTextContent(session.title!)
    expect(screen.getByText('消息数').parentElement).toHaveTextContent('2')
    expect(screen.getByText('提供商').parentElement).toHaveTextContent('OpenCode')
    expect(screen.getByText('模型').parentElement).toHaveTextContent('DeepSeek V4.1 Flash Free')
    expect(screen.getByText('上下文限制').parentElement).toHaveTextContent('1,000,000')
    expect(screen.getByText('词元总数').parentElement).toHaveTextContent('131,249')
    expect(screen.getByText('使用率').parentElement).toHaveTextContent('13%')
    expect(screen.getByText('输入词元').parentElement).toHaveTextContent('226')
    expect(screen.getByText('输出词元').parentElement).toHaveTextContent('268')
    expect(screen.getByText('推理词元').parentElement).toHaveTextContent('67')
    expect(screen.getByText('缓存词元（读/写）').parentElement).toHaveTextContent('130,688 / 0')
    expect(screen.getByText('导出会话')).toBeInTheDocument()
  })

  it('asks for a session when none is focused', () => {
    renderPanel(null)
    expect(screen.getByText('没有活跃会话')).toBeInTheDocument()
  })
})
