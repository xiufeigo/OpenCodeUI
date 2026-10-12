import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTerminalCheckpoint } from './terminalCheckpoint'

function harness(cursor = 0) {
  const queue: Array<() => void> = []
  let buffer = ''
  let ready = true
  const save = vi.fn()
  const onError = vi.fn()
  const checkpoint = createTerminalCheckpoint({
    cursor,
    write: (data, callback) => {
      queue.push(() => {
        buffer += data
        callback()
      })
    },
    read: () => ({ buffer, scrollY: 0, rows: 24, cols: 80 }),
    save,
    onError,
    isReady: () => ready,
  })
  return {
    checkpoint,
    save,
    onError,
    queue,
    setReady: (value: boolean) => {
      ready = value
    },
  }
}

describe('terminal output checkpoints', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('never checkpoints a cursor ahead of rendered output, including replay metadata', () => {
    const { checkpoint, queue, save } = harness(100)
    checkpoint.accept('中文😀')
    checkpoint.accept('\0{"cursor":104}')
    checkpoint.flush(true)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: '', cursor: 100 }))
    queue.shift()!()
    checkpoint.flush(true)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: '中文😀', cursor: 104 }))
    queue.shift()!()
    checkpoint.accept('DONE')
    checkpoint.flush(true)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: '中文😀', cursor: 104 }))
    queue.shift()!()
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: '中文😀DONE', cursor: 108 }))
    checkpoint.dispose()
  })

  it('throttles continuous output instead of waiting for output to stop', () => {
    const { checkpoint, queue, save } = harness()
    for (let i = 0; i < 20; i++) {
      checkpoint.accept('x')
      queue.shift()!()
      vi.advanceTimersByTime(100)
    }
    expect(save).toHaveBeenCalledTimes(2)
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: 'x'.repeat(20), cursor: 20 }))
    vi.advanceTimersByTime(3000)
    expect(save).toHaveBeenCalledTimes(2)
    checkpoint.dispose()
  })

  it('drains pending output before selecting the reconnect cursor', () => {
    const { checkpoint, queue } = harness(40)
    const reconnect = vi.fn()
    checkpoint.accept('result')
    checkpoint.drain(reconnect)
    expect(reconnect).not.toHaveBeenCalled()
    queue.shift()!()
    queue.shift()!()
    expect(reconnect).toHaveBeenCalledWith(46)
    checkpoint.dispose()
  })

  it('flushes on disposal but cannot be revived by a late write callback', () => {
    const { checkpoint, queue, save } = harness()
    checkpoint.accept('saved')
    queue.shift()!()
    checkpoint.accept('pending')
    checkpoint.dispose()
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ buffer: 'saved', cursor: 5 }))
    queue.shift()!()
    vi.advanceTimersByTime(2000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('preserves the previous checkpoint while its buffer is still being restored', () => {
    const { checkpoint, setReady, save } = harness(100)
    setReady(false)
    checkpoint.dispose()
    expect(save).not.toHaveBeenCalled()
  })

  it('surfaces storage failures and retries the dirty checkpoint', () => {
    const { checkpoint, queue, save, onError } = harness()
    const error = new Error('Quota exceeded')
    save.mockImplementationOnce(() => {
      throw error
    })
    checkpoint.accept('result')
    queue.shift()!()
    vi.advanceTimersByTime(1000)
    expect(onError).toHaveBeenCalledWith(error)
    checkpoint.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenLastCalledWith(null)
    checkpoint.dispose()
  })
})
