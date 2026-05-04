import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * useChatScroll — production-grade scroll state machine for the chat
 * message list. Replaces the previous mix of intervals + booleans + scroll
 * handlers in MessageArea, which had three concrete races: (a) a 200ms
 * forced setInterval scroll fighting the user's scroll-up, (b) a single
 * threshold without hysteresis flickering at the boundary, and (c) the
 * `userScrolledUp` flag being reset on every new message + every
 * isLoading→false transition, erasing user intent.
 *
 * Two states only:
 *   BOTTOM_PINNED — auto-scroll engaged, indicator hidden
 *   USER_DETACHED — auto-scroll disabled, indicator visible with new-count
 *
 * Transitions on threshold crossings (with hysteresis: 100px to detach,
 * 50px to re-attach), gated by a programmatic-scroll flag so our own
 * scrollTo() calls never trigger detach.
 */

export type ChatScrollState = 'BOTTOM_PINNED' | 'USER_DETACHED'

interface Options {
  /** Distance from bottom (px) at which a user scroll flips state to detached. Default 100. */
  detachThreshold?: number
  /** Distance from bottom (px) below which we re-attach (must be < detachThreshold). Default 50. */
  reattachThreshold?: number
  /** Minimum ms between auto-scroll bursts when content grows. Default 100. */
  scrollThrottleMs?: number
  /** Conversation id (or any stable key). When this changes, state resets to BOTTOM_PINNED + instant scroll-to-bottom. */
  resetKey?: string | null
}

interface Result {
  state: ChatScrollState
  scrollToBottom: (behavior?: ScrollBehavior) => void
  newContentCount: number
  isAtBottom: boolean
}

export function useChatScroll(
  containerRef: RefObject<HTMLElement | null>,
  options: Options = {},
): Result {
  const {
    detachThreshold = 100,
    reattachThreshold = 50,
    scrollThrottleMs = 100,
    resetKey = null,
  } = options

  // React-rendered state + refs that mirror it. Refs are read inside the
  // synchronous scroll handler (avoids a re-render-per-event storm); the
  // setState call only fires on actual TRANSITIONS.
  const [state, setStateReact] = useState<ChatScrollState>('BOTTOM_PINNED')
  const stateRef = useRef<ChatScrollState>('BOTTOM_PINNED')

  const [newContentCount, setNewContentCount] = useState(0)
  const newContentCountRef = useRef(0)

  // Latest raw "is the user at the bottom right now" — used by callers
  // who want a non-transitioning check (e.g. send-message reset).
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)

  // Programmatic-scroll flag — set true synchronously before our own
  // scrollTo() calls, cleared after the smooth-scroll has plausibly
  // finished. The scroll event handler bails on the first line when
  // this is true so auto-scroll never triggers detach.
  const programmaticScrollRef = useRef(false)
  const programmaticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // rAF + throttle bookkeeping for layout-grow auto-scroll bursts.
  const rafIdRef = useRef<number | null>(null)
  const lastScrollAtRef = useRef(0)

  // Scroll-to-bottom — single source of truth. Sets the programmatic flag,
  // schedules a flag-clear after the smooth animation should be done,
  // and uses the container's own scrollTo() (NOT scrollIntoView) so we
  // own the behavior parameter and the "to" position is unambiguous.
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current
    if (!el) return
    programmaticScrollRef.current = true
    if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current)
    // Smooth scrolls take ~250-400ms in modern browsers; instant resolves
    // immediately but the scroll event fires async, so we still flag it.
    programmaticTimerRef.current = setTimeout(() => {
      programmaticScrollRef.current = false
    }, behavior === 'smooth' ? 450 : 100)

    el.scrollTo({ top: el.scrollHeight, behavior })

    // Re-pin state machine + clear pending count whenever we deliberately
    // jump to the bottom (this is the "indicator click" path AND the
    // initial-mount path). User scroll handler does its own transitions.
    if (stateRef.current !== 'BOTTOM_PINNED') {
      stateRef.current = 'BOTTOM_PINNED'
      setStateReact('BOTTOM_PINNED')
    }
    if (newContentCountRef.current !== 0) {
      newContentCountRef.current = 0
      setNewContentCount(0)
    }
    isAtBottomRef.current = true
    setIsAtBottom(true)
  }, [containerRef])

  // Scroll handler — passive listener, ref-only writes for raw position,
  // setState only on threshold crossings.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      // Bail on our own scroll calls — auto-scroll must never trigger detach.
      if (programmaticScrollRef.current) return

      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      const wasAtBottom = isAtBottomRef.current
      const nowAtBottom = distance <= 1 // browsers report 0.5px etc

      if (wasAtBottom !== nowAtBottom) {
        isAtBottomRef.current = nowAtBottom
        setIsAtBottom(nowAtBottom)
      }

      // BOTTOM_PINNED → USER_DETACHED when the user scrolls past detachThreshold.
      if (stateRef.current === 'BOTTOM_PINNED' && distance > detachThreshold) {
        stateRef.current = 'USER_DETACHED'
        setStateReact('USER_DETACHED')
        return
      }

      // USER_DETACHED → BOTTOM_PINNED when the user scrolls back inside reattachThreshold.
      // Also clears the new-content counter so the indicator goes away cleanly.
      if (stateRef.current === 'USER_DETACHED' && distance < reattachThreshold) {
        stateRef.current = 'BOTTOM_PINNED'
        setStateReact('BOTTOM_PINNED')
        if (newContentCountRef.current !== 0) {
          newContentCountRef.current = 0
          setNewContentCount(0)
        }
      }
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [containerRef, detachThreshold, reattachThreshold])

  // ResizeObserver on the container — fires when the inner content grows
  // (token streamed in) OR when the viewport shrinks (mobile keyboard).
  // ChatContext drives content growth via setMessages → React reflows
  // → ResizeObserver picks up the new scrollHeight. This is the layout-
  // grow signal we use instead of a setInterval.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return // SSR / very old browsers

    let lastScrollHeight = el.scrollHeight

    const onResize = () => {
      const sh = el.scrollHeight
      const grew = sh > lastScrollHeight
      lastScrollHeight = sh

      if (stateRef.current === 'BOTTOM_PINNED') {
        // Coalesce bursts: scroll at most once per scrollThrottleMs via rAF.
        if (rafIdRef.current !== null) return
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const now = Date.now()
          if (now - lastScrollAtRef.current < scrollThrottleMs) return
          lastScrollAtRef.current = now
          // Smooth feels right for token bursts; instant on viewport
          // shrink (keyboard) so the input stays anchored.
          scrollToBottom(grew ? 'smooth' : 'instant' as ScrollBehavior)
        })
      } else if (grew) {
        // Detached + content grew → bump the new-content counter so the
        // indicator can show "↓ N new". Don't bump on viewport shrink.
        newContentCountRef.current += 1
        setNewContentCount(newContentCountRef.current)
      }
    }

    const ro = new ResizeObserver(onResize)
    // Observe both the container and its first child — first child gives
    // us "content grew" reliably; container gives us "viewport changed".
    ro.observe(el)
    const child = el.firstElementChild as HTMLElement | null
    if (child) ro.observe(child)

    return () => {
      ro.disconnect()
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [containerRef, scrollThrottleMs, scrollToBottom])

  // Reset on conversation change — instant scroll, BOTTOM_PINNED, count cleared.
  // Two rAFs to land after layout: first paints the new content, second runs
  // after measurements settle (matches React's commit→layout→paint cadence).
  useEffect(() => {
    if (resetKey === undefined) return
    const el = containerRef.current
    if (!el) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom('instant' as ScrollBehavior)
      })
    })
  }, [resetKey, containerRef, scrollToBottom])

  // Cleanup the programmatic-scroll timer on unmount so we don't leak it
  // if the component dismounts mid-scroll.
  useEffect(() => {
    return () => {
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current)
    }
  }, [])

  return { state, scrollToBottom, newContentCount, isAtBottom }
}
