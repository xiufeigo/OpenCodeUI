import { describe, expect, it } from 'vitest'
import type { SessionMessageInfo } from '../types/api/message'
import { buildContextPageModel, lastAssistantWithUsage, sumSessionCost } from './contextPageModel'

const tokens = {
  input: 226,
  output: 268,
  reasoning: 67,
  cache: { read: 130688, write: 0 },
}

function assistant(id: string, created: number, usage: typeof tokens | undefined = tokens): SessionMessageInfo {
  return {
    id,
    type: 'assistant',
    time: { created },
    agent: 'default',
    model: { id: 'deepseek-v4.1-flash-free', providerID: 'opencode' },
    content: [{ type: 'text', text: 'ok' }],
    tokens: usage,
  }
}

describe('lastAssistantWithUsage', () => {
  it('uses the latest assistant step after a completed compaction', () => {
    const messages: SessionMessageInfo[] = [
      assistant('a1', 1, { input: 10, output: 1, reasoning: 0, cache: { read: 0, write: 0 } }),
      {
        id: 'c1',
        type: 'compaction',
        time: { created: 2 },
        status: 'completed',
        reason: 'auto',
        summary: 'summary',
        recent: '',
      },
      assistant('a2', 3),
    ]

    expect(lastAssistantWithUsage(messages)?.id).toBe('a2')
  })

  it('stops at the revert boundary and ignores a missing boundary', () => {
    const messages: SessionMessageInfo[] = [assistant('a1', 1), assistant('a2', 2)]

    expect(lastAssistantWithUsage(messages, 'a2')?.id).toBe('a1')
    expect(lastAssistantWithUsage(messages, 'missing')).toBeUndefined()
  })
})

describe('buildContextPageModel', () => {
  it('matches the official context page numbers for the latest step', () => {
    const messages: SessionMessageInfo[] = [
      { id: 'u1', type: 'user', time: { created: 1 }, text: 'hi' },
      {
        id: 'sys',
        type: 'system',
        time: { created: 2 },
        text: '  you are helpful  ',
      },
      assistant('a1', 3),
    ]

    const page = buildContextPageModel({
      messages,
      sessionTitle: 'OpenCode deepseek-v4.1-flash-free 上下文查询',
      sessionId: 'ses_1',
      created: 1_700_000_000_000,
      cost: 0.012,
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
    })

    expect(page.sessionLabel).toBe('OpenCode deepseek-v4.1-flash-free 上下文查询')
    expect(page.messageCount).toBe(3)
    expect(page.userCount).toBe(1)
    expect(page.assistantCount).toBe(1)
    expect(page.providerLabel).toBe('OpenCode')
    expect(page.modelLabel).toBe('DeepSeek V4.1 Flash Free')
    expect(page.limit).toBe(1_000_000)
    expect(page.total).toBe(131_249)
    expect(page.usage).toBe(13)
    expect(page.input).toBe(226)
    expect(page.output).toBe(268)
    expect(page.reasoning).toBe(67)
    expect(page.cacheRead).toBe(130_688)
    expect(page.cacheWrite).toBe(0)
    expect(page.systemPrompt).toBe('you are helpful')
    expect(page.cost).toBe(0.012)
  })

  it('falls back to provider and model ids when the catalog has no match', () => {
    const page = buildContextPageModel({
      messages: [assistant('a1', 1)],
      models: [],
      providers: [],
    })

    expect(page.providerLabel).toBe('opencode')
    expect(page.modelLabel).toBe('deepseek-v4.1-flash-free')
    expect(page.limit).toBeNull()
    expect(page.usage).toBeNull()
  })
})

describe('sumSessionCost', () => {
  it('adds loaded child costs for a root session only', () => {
    expect(sumSessionCost(1.5, [0.25, 0.25], false)).toBe(2)
    expect(sumSessionCost(1.5, [0.25], true)).toBe(1.5)
  })
})
