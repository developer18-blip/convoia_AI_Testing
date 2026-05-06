import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, AlertOctagon, X, Zap } from 'lucide-react'
import type { TokenLevel } from '../../lib/tokenThresholds'

interface Props {
  level: Exclude<TokenLevel, 'normal'>
  formattedBalance: string
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  onRefill: () => void
}

interface Position {
  top: number
  left: number
  width: number
}

const POPOVER_WIDTH = 320
const VIEWPORT_GUARD = 16

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function LowTokenPopover({ level, formattedBalance, anchorRef, onClose, onRefill }: Props) {
  const [position, setPosition] = useState<Position | null>(null)
  const isCritical = level === 'critical'
  const skipMotion = reducedMotion()

  // Compute position from chip rect. Anchor BELOW the chip (slides down) since
  // the chip lives in the header at the top of the viewport. Right-align so
  // the popover doesn't overflow the right edge when the chip is near the
  // edge of the viewport.
  useLayoutEffect(() => {
    const compute = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_GUARD * 2)
      const left = Math.max(
        VIEWPORT_GUARD,
        Math.min(window.innerWidth - width - VIEWPORT_GUARD, rect.right - width),
      )
      setPosition({ top: rect.bottom + 8, left, width })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [anchorRef])

  // Esc dismisses
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!position) return null

  // Color tokens — borrow from existing palette. Warning = amber, critical = red.
  const accent = isCritical ? '#ef4444' : '#f59e0b'
  const accentBgFaint = isCritical ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)'
  const Icon = isCritical ? AlertOctagon : AlertTriangle
  const title = isCritical ? 'Tokens almost depleted' : 'Tokens running low'

  return createPortal(
    <>
      {/* Transparent backdrop — outside-click dismisses */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'transparent' }}
        aria-hidden
      />
      <motion.div
        role="alertdialog"
        aria-labelledby="low-token-title"
        aria-describedby="low-token-desc"
        initial={skipMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.97 }}
        animate={skipMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: skipMotion ? 0.12 : 0.25, ease: 'easeOut' }}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          width: position.width,
          zIndex: 9999,
          background: 'var(--surface-glass, var(--surface-1, #ffffff))',
          backdropFilter: 'blur(16px) saturate(140%)',
          WebkitBackdropFilter: 'blur(16px) saturate(140%)',
          border: `1px solid ${accent}`,
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: `0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10), 0 0 0 1px ${accent}33`,
          color: 'var(--text-primary, #18181b)',
          overflow: 'hidden',
        }}
      >
        {/* Header strip: icon + title + dismiss */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '14px 14px 10px',
          background: accentBgFaint,
        }}>
          <Icon size={18} style={{ color: accent, flexShrink: 0, marginTop: 1 }} aria-hidden />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id="low-token-title"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary, #18181b)',
                lineHeight: 1.3,
              }}
            >
              {title}
            </div>
            <div
              id="low-token-desc"
              style={{
                marginTop: 4,
                fontSize: 12,
                color: 'var(--text-secondary, #3f3f46)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>Refill now to avoid interruption ·</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
                fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                color: accent,
                fontWeight: 600,
              }}>
                <Zap size={11} aria-hidden />
                {formattedBalance}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss"
            style={{
              flexShrink: 0,
              width: 24, height: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              color: 'var(--text-muted, #71717a)',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2, rgba(0,0,0,0.04))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* CTA */}
        <div style={{ padding: '12px 14px 14px' }}>
          <button
            type="button"
            onClick={onRefill}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: accent,
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'transform 120ms ease, filter 120ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.08)' }}
            onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)' }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.98)' }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            <Zap size={13} fill="currentColor" />
            Refill Tokens
          </button>
        </div>
      </motion.div>
    </>,
    document.body,
  )
}
