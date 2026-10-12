import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInView } from './useInView'

class IntersectionObserverMock {
  static instance: IntersectionObserverMock | null = null
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverMock.instance = this
  }

  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

function InViewHarness({ triggerOnce = false }: { triggerOnce?: boolean }) {
  const { ref, inView } = useInView({ triggerOnce })

  return (
    <div>
      <div ref={ref} data-testid="target" />
      <span data-testid="state">{String(inView)}</span>
    </div>
  )
}

describe('useInView', () => {
  const originalObserver = globalThis.IntersectionObserver

  beforeEach(() => {
    IntersectionObserverMock.instance = null
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.IntersectionObserver = originalObserver
  })

  it('updates inView when the element intersects', () => {
    render(<InViewHarness />)

    act(() => {
      IntersectionObserverMock.instance?.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    expect(screen.getByTestId('state')).toHaveTextContent('true')
  })

  it.each([
    [false, true],
    [true, false],
  ])('remembers an intersection anywhere in a triggerOnce batch (%s, %s)', (first, last) => {
    render(<InViewHarness triggerOnce />)
    const observer = IntersectionObserverMock.instance!

    act(() => {
      observer.callback(
        [first, last].map(isIntersecting => ({ isIntersecting }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      )
    })

    expect(screen.getByTestId('state')).toHaveTextContent('true')
    expect(observer.unobserve).toHaveBeenCalledWith(screen.getByTestId('target'))
    expect(observer.disconnect).toHaveBeenCalled()
  })

  it.each([
    [false, true],
    [true, false],
  ])('uses the latest entry when continuously observing (%s, %s)', (first, last) => {
    render(<InViewHarness />)

    act(() => {
      IntersectionObserverMock.instance!.callback(
        [first, last].map(isIntersecting => ({ isIntersecting }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      )
    })

    expect(screen.getByTestId('state')).toHaveTextContent(String(last))
    expect(IntersectionObserverMock.instance!.unobserve).not.toHaveBeenCalled()
  })

  it('keeps the current state when a notification batch is empty', () => {
    render(<InViewHarness />)
    const observer = IntersectionObserverMock.instance!

    act(() => {
      observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
      observer.callback([], {} as IntersectionObserver)
    })

    expect(screen.getByTestId('state')).toHaveTextContent('true')
  })
})
