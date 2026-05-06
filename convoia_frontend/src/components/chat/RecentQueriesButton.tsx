import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { History } from 'lucide-react'
import { motion } from 'framer-motion'

interface RecentQuery {
  content: string
  createdAt: string
  model: string | null
  provider: string | null
}

interface Props {
  onSelect: (text: string) => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

// Inline relative-time formatter — no date-fns dep.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.floor((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// Provider dot palette — solid hex colors so they read on either theme
// without a separate dark/light branch. Mirrors the council-provider-badge
// color logic in styles/council.css for visual consistency.
const PROVIDER_DOT: Record<string, string> = {
  anthropic: '#d97706',
  openai:    '#10a37f',
  google:    '#4285f4',
  deepseek:  '#6366f1',
  perplexity:'#8b5cf6',
  xai:       '#94a3b8',
  mistral:   '#f97316',
  groq:      '#10a37f',
}
const DEFAULT_PROVIDER_DOT = '#94a3b8'

function providerDotColor(provider: string | null | undefined): string {
  if (!provider) return DEFAULT_PROVIDER_DOT
  return PROVIDER_DOT[provider.toLowerCase()] || DEFAULT_PROVIDER_DOT
}

// Mac vs non-Mac shortcut hint. navigator.platform is the broadly-supported
// detection; falls back to non-Mac if unavailable (SSR, locked-down browsers).
const IS_MAC = typeof navigator !== 'undefined' &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const SHORTCUT_HINT = IS_MAC ? '⌘ /' : 'Ctrl /'

// Popover position computed from button rect at open time. Portaled to
// document.body to escape an overflow:hidden ancestor (chat scroll
// container). top XOR bottom is set depending on whether there's room
// above the button — almost always above since the button lives in the
// chat input bar; below is the defensive fallback.
type PopoverPosition = { top?: number; bottom?: number; left: number; width: number }
const ESTIMATED_POPOVER_HEIGHT = 380

export function RecentQueriesButton({ onSelect }: Props) {
  const [queries, setQueries] = useState<RecentQuery[] | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null)
  const [flashIndex, setFlashIndex] = useState<number | null>(null)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchQueries = useCallback(async () => {
    try {
      const token = localStorage.getItem('convoia_token')
      if (!token) {
        setQueries([])
        return
      }
      const res = await fetch(`${API_URL}/users/me/recent-queries?limit=10`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setQueries(Array.isArray(json.data) ? json.data : [])
      setError(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load'
      setError(msg)
      setQueries((prev) => (prev === null ? [] : prev))
    }
  }, [])

  useEffect(() => { fetchQueries() }, [fetchQueries])

  useEffect(() => {
    if (open) fetchQueries()
  }, [open, fetchQueries])

  const computePosition = useCallback((): PopoverPosition | null => {
    if (!buttonRef.current) return null
    const rect = buttonRef.current.getBoundingClientRect()
    const width = Math.min(420, window.innerWidth - 32)
    // Right-edge of popover anchors to right-edge of button so the popover
    // opens leftward into the message area (button is on the LEFT side of
    // the input bar). 16px viewport-edge guard prevents off-screen-left
    // when the button is very close to the edge.
    const left = Math.max(16, rect.right - width)
    const fitsAbove = rect.top > ESTIMATED_POPOVER_HEIGHT + 16
    return fitsAbove
      ? { bottom: window.innerHeight - rect.top + 8, left, width }
      : { top: rect.bottom + 8, left, width }
  }, [])

  // useLayoutEffect ensures position is set in the same frame as open=true,
  // so the popover renders at its final coordinates on first paint instead
  // of flickering through (0,0) for one frame.
  useLayoutEffect(() => {
    if (!open) {
      setPopoverPosition(null)
      return
    }
    setPopoverPosition(computePosition())
    const onResize = () => setPopoverPosition(computePosition())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, computePosition])

  // Close on any *outside* scroll (ancestor scroll containers). Deferred via
  // rAF so the click that opens the popover (focus shift, layout settle)
  // doesn't trip the close handler. Ignores scroll events whose target is
  // inside the popover itself — otherwise scrolling within the popover's
  // own body (10-item list with overflow) would immediately close it.
  useEffect(() => {
    if (!open) return
    const onScroll = (e: Event) => {
      const target = e.target as Node | null
      if (target && popoverRef.current && popoverRef.current.contains(target)) {
        return // scrolling inside the popover — keep open
      }
      setOpen(false)
    }
    const rafId = requestAnimationFrame(() => {
      window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    })
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  // Click-outside dismissal
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current && !popoverRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Cmd/Ctrl + / focus-aware toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        const isTextareaFocused = document.activeElement?.tagName === 'TEXTAREA'
        if (isTextareaFocused || open) {
          e.preventDefault()
          setOpen((v) => !v)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Track whether content overflows + whether scrolled to bottom.
  // Drives the bottom fade-gradient indicator.
  useEffect(() => {
    if (!open) {
      setShowBottomFade(false)
      return
    }
    // Wait one frame for the popover to mount + size
    const id = requestAnimationFrame(() => {
      const el = scrollRef.current
      if (!el) return
      const update = () => {
        const overflows = el.scrollHeight > el.clientHeight + 1
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
        setShowBottomFade(overflows && !atBottom)
      }
      update()
      el.addEventListener('scroll', update, { passive: true })
      const ro = new ResizeObserver(update)
      ro.observe(el)
      // Stash cleanup on the el so the effect's outer return can find them
      ;(el as any).__rqCleanup = () => {
        el.removeEventListener('scroll', update)
        ro.disconnect()
      }
    })
    return () => {
      cancelAnimationFrame(id)
      const el = scrollRef.current as any
      if (el && el.__rqCleanup) {
        el.__rqCleanup()
        delete el.__rqCleanup
      }
    }
  }, [open, queries])

  // Click feedback: brief accent ring flash on the chosen row before populate.
  const handleSelect = useCallback((index: number, content: string) => {
    setFlashIndex(index)
    window.setTimeout(() => {
      onSelect(content)
      setOpen(false)
      setFlashIndex(null)
    }, 80)
  }, [onSelect])

  // Empty / loading state: hidden 38×38 spacer to reserve layout slot
  if (queries === null || queries.length === 0) {
    return (
      <div
        style={{ width: 38, height: 38, flexShrink: 0, visibility: 'hidden' }}
        aria-hidden
      />
    )
  }

  // Note: queries is guaranteed non-null + non-empty here (early return above
  // hides the button otherwise). showSkeletons is wired defensively in case
  // empty-state behavior is later relaxed to "always show button".
  const showSkeletons = false
  const rowsToRender: RecentQuery[] = queries

  const popoverContent = (
    <>
      {/* Backdrop — catches taps outside on touch devices */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent',
        }}
        aria-hidden
      />
      <motion.div
        ref={popoverRef}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        role="listbox"
        aria-label="Recent queries"
        style={{
          position: 'fixed',
          ...(popoverPosition?.top !== undefined ? { top: popoverPosition.top } : {}),
          ...(popoverPosition?.bottom !== undefined ? { bottom: popoverPosition.bottom } : {}),
          left: popoverPosition?.left ?? 16,
          width: popoverPosition?.width ?? 360,
          maxHeight: 'min(420px, 50vh)',
          // Outer container is overflow:hidden so only the body scrolls;
          // header stays pinned at the top regardless of scroll position.
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          // Composite background: subtle inner gradient over the glass surface
          // to give a hint of depth (faint top → transparent bottom).
          backgroundColor: 'var(--surface-glass, var(--surface-1, #ffffff))',
          backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 60%)',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          border: '1px solid var(--border-default, rgba(0,0,0,0.08))',
          borderRadius: 'var(--radius-lg, 12px)',
          // Layered shadow + ring for "lifted" feel; ring uses border var so
          // it adapts to theme.
          boxShadow: '0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10), 0 0 0 1px var(--border-default, rgba(0,0,0,0.06))',
          zIndex: 9999,
          color: 'var(--text-primary, #18181b)',
        }}
      >
        <style>{`
          @keyframes rq-shimmer {
            0% { background-position: -240px 0; }
            100% { background-position: 240px 0; }
          }
          .rq-skeleton {
            background: linear-gradient(
              90deg,
              var(--surface-2, rgba(0,0,0,0.04)) 0%,
              var(--surface-3, rgba(0,0,0,0.08)) 50%,
              var(--surface-2, rgba(0,0,0,0.04)) 100%
            );
            background-size: 480px 100%;
            animation: rq-shimmer 1.5s linear infinite;
            border-radius: 4px;
          }
          .rq-row { transition: background-color 120ms ease; }
          .rq-row:hover { background: var(--surface-hover, var(--surface-2, rgba(0,0,0,0.04))); }
          .rq-row + .rq-row { border-top: 1px solid var(--border-subtle, rgba(0,0,0,0.06)); }
          .rq-row--flash {
            background: var(--surface-3, rgba(0,0,0,0.08));
            box-shadow: inset 0 0 0 1.5px var(--accent-500, #7c3aed);
          }
          /* Custom thin scrollbar — webkit + firefox */
          .rq-scroll::-webkit-scrollbar { width: 6px; }
          .rq-scroll::-webkit-scrollbar-track { background: transparent; }
          .rq-scroll::-webkit-scrollbar-thumb {
            background: var(--border-default, rgba(0,0,0,0.08));
            border-radius: 3px;
          }
          .rq-scroll::-webkit-scrollbar-thumb:hover {
            background: var(--text-muted, #71717a);
          }
          .rq-scroll {
            scrollbar-width: thin;
            scrollbar-color: var(--border-default, rgba(0,0,0,0.08)) transparent;
          }
        `}</style>

        {/* Header — pinned (flex-shrink:0) */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
          gap: 8,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text-secondary, #3f3f46)',
            fontWeight: 500,
          }}>
            <History size={12} aria-hidden />
            <span>Recent</span>
            <span style={{
              color: 'var(--text-muted, #71717a)',
              fontSize: 12,
              fontWeight: 400,
            }}>
              ({Array.isArray(queries) ? queries.length : 0})
            </span>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: 'var(--text-muted, #71717a)',
            background: 'var(--surface-2, rgba(0,0,0,0.04))',
            border: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
            borderRadius: 6,
            padding: '2px 7px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.04em',
            lineHeight: 1.4,
          }}>
            {SHORTCUT_HINT}
          </span>
        </div>

        {/* Scrollable body */}
        {error ? (
          <div style={{
            padding: '16px 18px',
            fontSize: 13,
            color: 'var(--text-muted, #71717a)',
          }}>
            Couldn’t load recent queries.{' '}
            <button
              type="button"
              onClick={() => fetchQueries()}
              style={{
                background: 'none', border: 'none',
                color: 'var(--accent-500, #7c3aed)', cursor: 'pointer',
                textDecoration: 'underline', padding: 0, fontSize: 13,
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="rq-scroll"
            style={{
              flex: 1,
              minHeight: 0, // critical for flex children that scroll
              overflowY: 'auto',
              padding: 4,
            }}
          >
            {rowsToRender.map((row, i) => {
              if (showSkeletons) {
                return (
                  <div key={`skel-${i}`} style={{ padding: '14px 14px' }} aria-hidden>
                    <div className="rq-skeleton" style={{ height: 14, width: '88%', marginBottom: 6 }} />
                    <div className="rq-skeleton" style={{ height: 11, width: '42%' }} />
                  </div>
                )
              }
              const q = row as RecentQuery
              const isFlash = flashIndex === i
              return (
                <button
                  key={`${q.createdAt}-${i}`}
                  type="button"
                  role="option"
                  className={`rq-row${isFlash ? ' rq-row--flash' : ''}`}
                  onClick={() => handleSelect(i, q.content)}
                  title={q.content}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '16px 16px',
                    background: 'transparent', border: 'none',
                    borderRadius: 8, cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div style={{
                    fontSize: 13,
                    color: 'var(--text-primary, #18181b)',
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical' as const,
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                    marginBottom: 4,
                  }}>
                    {q.content}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--text-muted, #71717a)',
                    flexWrap: 'wrap',
                  }}>
                    <span
                      aria-hidden
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: providerDotColor(q.provider),
                        flexShrink: 0,
                      }}
                    />
                    {q.model && <span style={{ color: 'var(--text-tertiary, #52525b)' }}>{q.model}</span>}
                    {(q.model || q.provider) && <span aria-hidden>·</span>}
                    <span>{formatRelative(q.createdAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Bottom fade indicator — only when content overflows and not at bottom.
            Uses the popover's own surface color to fade rows into the bottom edge,
            signaling "scroll for more". */}
        {showBottomFade && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 1, // inside border
              right: 7, // leave space for scrollbar
              bottom: 1,
              height: 32,
              pointerEvents: 'none',
              background: 'linear-gradient(to top, var(--surface-glass, var(--surface-1, #ffffff)) 10%, rgba(255,255,255,0) 100%)',
              borderBottomLeftRadius: 'var(--radius-lg, 12px)',
              borderBottomRightRadius: 'var(--radius-lg, 12px)',
            }}
          />
        )}
      </motion.div>
    </>
  )

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Recent queries"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={`Recent queries (${SHORTCUT_HINT})`}
        style={{
          width: 38, height: 38, borderRadius: 12,
          background: open ? 'var(--surface-2, rgba(0,0,0,0.04))' : 'transparent',
          border: 'none',
          color: open ? 'var(--text-primary, #18181b)' : 'var(--text-muted, #71717a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, transition: 'all 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--surface-2, rgba(0,0,0,0.04))'
          e.currentTarget.style.color = 'var(--text-primary, #18181b)'
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted, #71717a)'
          }
        }}
      >
        <History size={18} />
      </button>

      {open && popoverPosition && createPortal(popoverContent, document.body)}
    </>
  )
}
