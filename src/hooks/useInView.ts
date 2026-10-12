import { useState, useEffect, useRef } from 'react'

export function useInView(options: IntersectionObserverInit & { triggerOnce?: boolean } = {}) {
  const [inView, setInView] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { root = null, rootMargin, threshold, triggerOnce } = options

  useEffect(() => {
    // triggerOnce 已触发过，不再观察
    if (triggerOnce && hasTriggered) return

    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      entries => {
        // 展开动画可能将离开/进入通知合并在一批；once 记住任一次进入，否则采用最终状态。
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (triggerOnce) {
              setHasTriggered(true)
              observer.unobserve(element)
              break
            }
          } else if (!triggerOnce) {
            setInView(false)
          }
        }
      },
      { root, rootMargin, threshold },
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [root, rootMargin, threshold, triggerOnce, hasTriggered])

  // triggerOnce 模式下，一旦触发过就永远返回 true
  return { ref, inView: (triggerOnce && hasTriggered) || inView }
}
