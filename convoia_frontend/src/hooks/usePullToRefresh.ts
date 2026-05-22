import { useRef, useState, useCallback } from 'react'

/**
 * Pull-to-refresh hook for mobile screens.
 * Returns { isRefreshing, pullProps } — spread pullProps on the scrollable container.
 */
export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try { await onRefresh() } catch { /* silent */ }
    finally { setIsRefreshing(false) }
  }, [onRefresh, isRefreshing])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // The element these handlers are bound to is usually NOT the scroller — the
    // scrollable ancestor (e.g. .mobile-app-content) is. Walk up to find it, so
    // the pull only arms when the page is genuinely scrolled to the very top.
    // (Reading scrollTop off the inner div — which never scrolls — made it arm
    // everywhere, firing a refresh on any downward drag mid-page.)
    let el: HTMLElement | null = e.currentTarget as HTMLElement
    let scrollTop = 0
    while (el) {
      const oy = getComputedStyle(el).overflowY
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
        scrollTop = el.scrollTop
        break
      }
      el = el.parentElement
    }
    if (scrollTop <= 0) {
      startY.current = e.touches[0].clientY
      pulling.current = true
    } else {
      pulling.current = false
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return
    pulling.current = false
    const diff = e.changedTouches[0].clientY - startY.current
    // Require a deliberate downward pull (and ignore upward/idle releases).
    if (diff > 90) handleRefresh()
  }, [handleRefresh])

  return {
    isRefreshing,
    pullProps: { onTouchStart, onTouchEnd },
  }
}
