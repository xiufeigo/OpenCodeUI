import { parsePtyFrame } from './ptyProtocol'

export interface TerminalSnapshot {
  buffer: string
  scrollY: number
  cursor: number
  rows: number
  cols: number
}

const CHECKPOINT_INTERVAL_MS = 1000

export function createTerminalCheckpoint(options: {
  cursor: number
  write: (data: string, callback: () => void) => void
  read: () => Omit<TerminalSnapshot, 'cursor'>
  save: (snapshot: TerminalSnapshot) => void
  onError: (error: unknown | null) => void
  onReplayGap?: () => void
  isReady: () => boolean
}) {
  let receivedCursor = options.cursor
  let committedCursor = options.cursor
  let timer: ReturnType<typeof setTimeout> | undefined
  let dirty = false
  let disposed = false

  function flush(force = false) {
    if (disposed || !options.isReady() || (!force && !dirty)) return
    try {
      options.save({ ...options.read(), cursor: committedCursor })
      dirty = false
      options.onError(null)
    } catch (error) {
      options.onError(error)
    }
  }

  function accept(chunk: string | ArrayBuffer) {
    if (disposed) return
    const frame = parsePtyFrame(chunk)
    if (!frame) return
    if (frame.kind === 'control' && frame.cursor > receivedCursor) options.onReplayGap?.()
    receivedCursor = frame.kind === 'control' ? frame.cursor : receivedCursor + frame.data.length
    const cursor = receivedCursor
    // A control frame must also wait behind queued writes; offsets measure UTF-16 units.
    options.write(frame.kind === 'data' ? frame.data : '', () => {
      if (disposed) return
      committedCursor = cursor
      dirty = true
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        flush()
      }, CHECKPOINT_INTERVAL_MS)
    })
  }

  return {
    accept,
    flush,
    drain(callback: (cursor: number) => void) {
      options.write('', () => {
        if (!disposed) callback(committedCursor)
      })
    },
    dispose() {
      flush(true)
      disposed = true
      clearTimeout(timer)
    },
  }
}
