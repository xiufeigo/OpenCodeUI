import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInView, useNearViewport } from './useInView'

class IntersectionObserverMock {
  static instance: IntersectionObserverMock | null = null
  static instances: IntersectionObserverMock[] = []
  callback: IntersectionObserverCallback
  options: IntersectionObserverInit | undefined
  observed: Element[] = []
  disconnected = false

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    IntersectionObserverMock.instance = this
    IntersectionObserverMock.instances.push(this)
  }

  observe = vi.fn((target: Element) => {
    this.observed.push(target)
  })
  unobserve = vi.fn()
  disconnect = vi.fn(() => {
    this.disconnected = true
  })
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
    IntersectionObserverMock.instances = []
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

function NearHarness({ enabled, withScrollRoot = false }: { enabled: boolean; withScrollRoot?: boolean }) {
  const { ref, near } = useNearViewport('1000px 0px', enabled)
  const target = <div ref={ref} data-testid="target" />
  return (
    <div>
      {withScrollRoot ? <div data-chat-scroll-root="true">{target}</div> : target}
      <span data-testid="state">{String(near)}</span>
    </div>
  )
}

describe('useNearViewport', () => {
  const originalObserver = globalThis.IntersectionObserver

  beforeEach(() => {
    IntersectionObserverMock.instance = null
    IntersectionObserverMock.instances = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    globalThis.IntersectionObserver = originalObserver
  })

  it('观察消息滚动容器，并带上 rootMargin', () => {
    render(<NearHarness enabled withScrollRoot />)

    const observer = IntersectionObserverMock.instance
    expect(observer).not.toBeNull()
    expect(observer!.options?.rootMargin).toBe('1000px 0px')
    expect(observer!.options?.root).toBe(document.querySelector('[data-chat-scroll-root]'))
    expect(observer!.observed).toHaveLength(1)
  })

  it('不在聊天滚动容器里时退回视口 root', () => {
    render(<NearHarness enabled />)
    expect(IntersectionObserverMock.instance?.options?.root).toBeNull()
  })

  it('intersection 变化会切换 near', () => {
    render(<NearHarness enabled />)
    const observer = IntersectionObserverMock.instance!
    const target = screen.getByTestId('target')

    act(() => {
      observer.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], {} as IntersectionObserver)
    })
    expect(screen.getByTestId('state')).toHaveTextContent('true')

    act(() => {
      observer.callback(
        [{ isIntersecting: false, target } as unknown as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(screen.getByTestId('state')).toHaveTextContent('false')
  })

  it('enabled=false 时不建 observer，并当作在视口内', () => {
    render(<NearHarness enabled={false} />)
    expect(IntersectionObserverMock.instances).toHaveLength(0)
    expect(screen.getByTestId('state')).toHaveTextContent('true')
  })

  it('同一滚动容器的多个元素共用一个 observer', () => {
    render(
      <div data-chat-scroll-root="true">
        <NearHarness enabled />
        <NearHarness enabled />
      </div>,
    )
    expect(IntersectionObserverMock.instances).toHaveLength(1)
    expect(IntersectionObserverMock.instance?.observed).toHaveLength(2)
  })

  it('卸载时断开观察器', () => {
    const { unmount } = render(<NearHarness enabled />)
    const observer = IntersectionObserverMock.instance!
    unmount()
    expect(observer.disconnected).toBe(true)
  })
})
