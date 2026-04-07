import { useEffect, useRef, useState, useCallback } from 'react'

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
    const el = e.currentTarget as HTMLElement
    if (el.scrollTop <= 0) {
      startY.current = e.touches[0].clientY
      pulling.current = true
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!pulling.current) return
    pulling.current = false
    const diff = e.changedTouches[0].clientY - startY.current
    if (diff > 80) handleRefresh()
  }, [handleRefresh])

  return {
    isRefreshing,
    pullProps: { onTouchStart, onTouchEnd },
  }
}
