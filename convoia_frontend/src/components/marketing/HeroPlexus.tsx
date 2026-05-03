import { useEffect, useMemo, useRef, useState } from 'react'
import Particles, { initParticlesEngine } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import type { Container, ISourceOptions } from '@tsparticles/engine'

// Lazy one-time engine init shared across mounts/remounts. tsparticles requires
// the slim plugin set to be registered before any <Particles> can mount.
let enginePromise: Promise<void> | null = null
function ensureEngineReady(): Promise<void> {
  if (!enginePromise) {
    enginePromise = initParticlesEngine(async (engine) => {
      await loadSlim(engine)
    })
  }
  return enginePromise
}

// tsparticles can't read CSS custom properties directly inside its WebGL/canvas
// pipeline — needs a hex/rgb string. Resolve on mount + observe theme changes.
function resolveAccentHex(): string {
  if (typeof window === 'undefined') return '#14B8CD'
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#14B8CD' // brand turquoise dark-mode fallback
}

const STATIC_DOT_COLS = 7
const STATIC_DOT_ROWS = 4

interface Ripple {
  id: number
  x: number
  y: number
}

export function HeroPlexus() {
  const [engineReady, setEngineReady] = useState(false)
  const [accentHex, setAccentHex] = useState<string>('#14B8CD')
  const [ripples, setRipples] = useState<Ripple[]>([])
  const containerRef = useRef<Container | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // prefers-reduced-motion — render a static SVG dot pattern instead of canvas.
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Init engine + initial accent read.
  useEffect(() => {
    if (reducedMotion) return
    setAccentHex(resolveAccentHex())
    let cancelled = false
    ensureEngineReady().then(() => {
      if (!cancelled) setEngineReady(true)
    })
    return () => { cancelled = true }
  }, [reducedMotion])

  // Re-resolve accent on theme switch (light↔dark↔system).
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const obs = new MutationObserver(() => setAccentHex(resolveAccentHex()))
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    return () => obs.disconnect()
  }, [])

  // Pause animation when hero scrolls out of viewport — saves CPU on long pages.
  useEffect(() => {
    if (!wrapperRef.current || reducedMotion) return
    const node = wrapperRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        const c = containerRef.current
        if (!c) return
        if (entry.isIntersecting) c.play()
        else c.pause()
      },
      { threshold: 0.05 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [engineReady, reducedMotion])

  // Cursor spotlight — write cursor position as CSS custom properties on the
  // .lp-hero parent so the .hero-spotlight pseudo-layer can render a radial
  // glow following the mouse. rAF-throttled so we don't hammer style updates
  // on every mousemove pixel. Toggles `lp-hero--cursor-active` for fade in/out.
  useEffect(() => {
    if (!wrapperRef.current) return
    const parent = wrapperRef.current.parentElement
    if (!parent) return

    let rafId: number | null = null
    const handleMove = (e: MouseEvent) => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        const rect = parent.getBoundingClientRect()
        const xPct = ((e.clientX - rect.left) / rect.width) * 100
        const yPct = ((e.clientY - rect.top) / rect.height) * 100
        parent.style.setProperty('--cursor-x', `${xPct}%`)
        parent.style.setProperty('--cursor-y', `${yPct}%`)
        rafId = null
      })
    }
    const handleEnter = () => parent.classList.add('lp-hero--cursor-active')
    const handleLeave = () => parent.classList.remove('lp-hero--cursor-active')

    parent.addEventListener('mousemove', handleMove)
    parent.addEventListener('mouseenter', handleEnter)
    parent.addEventListener('mouseleave', handleLeave)
    return () => {
      parent.removeEventListener('mousemove', handleMove)
      parent.removeEventListener('mouseenter', handleEnter)
      parent.removeEventListener('mouseleave', handleLeave)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  // Click ripple — emit a fading shock circle on hero click. Skip:
  //   - reduced motion (animation by definition)
  //   - clicks on buttons/links (don't fire ripples on CTAs)
  //   - mobile viewports (touch is unrelated UX, would fire on every tap)
  useEffect(() => {
    if (!wrapperRef.current || reducedMotion) return
    const parent = wrapperRef.current.parentElement
    if (!parent) return

    const handleClick = (e: MouseEvent) => {
      if (window.innerWidth < 768) return
      const target = e.target as HTMLElement
      if (target.closest('button, a')) return
      const rect = parent.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const id = Date.now() + Math.random()
      setRipples((prev) => [...prev, { id, x, y }])
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id))
      }, 850)
    }

    parent.addEventListener('click', handleClick)
    return () => parent.removeEventListener('click', handleClick)
  }, [reducedMotion])

  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: { enable: false },
      background: { color: 'transparent' },
      fpsLimit: 60,
      detectRetina: true,
      particles: {
        number: {
          value: 65,
          density: { enable: true, area: 800 },
        },
        color: { value: accentHex },
        opacity: {
          value: { min: 0.4, max: 0.85 },
          animation: { enable: true, speed: 0.4, sync: false },
        },
        size: {
          value: { min: 1.5, max: 3.5 },
        },
        shadow: {
          enable: true,
          color: accentHex,
          blur: 6,
        },
        move: {
          enable: true,
          speed: 0.55,
          direction: 'none',
          random: true,
          straight: false,
          outModes: { default: 'out' },
        },
        links: {
          enable: true,
          distance: 150,
          color: accentHex,
          opacity: 0.28,
          width: 1.2,
        },
      },
      interactivity: {
        // 'window' lets us track mouse via window events even though the
        // canvas is pointer-events:none. Click events scoped to hero are
        // handled separately above (we don't want global window clicks
        // triggering particle effects).
        detectsOn: 'window',
        events: {
          onHover: { enable: true, mode: 'grab' },
          resize: { enable: true },
        },
        modes: {
          // 'grab' draws faint lines from cursor to nearby particles — the
          // signature xAI/Anthropic interactive-network feel.
          grab: {
            distance: 200,
            links: { opacity: 0.65 },
          },
        },
      },
      responsive: [
        {
          maxWidth: 768,
          options: {
            particles: { number: { value: 25 } },
            interactivity: { events: { onHover: { enable: false } } },
          },
        },
      ],
    }),
    [accentHex],
  )

  if (reducedMotion) {
    return <StaticDotPattern accentHex={accentHex} />
  }

  return (
    <>
      {/* Cursor spotlight — radial gradient that follows mouse via CSS vars
          set by the mousemove effect above. Sits below particles in DOM order
          so they paint over the glow. */}
      <div className="hero-spotlight" aria-hidden="true" />

      <div ref={wrapperRef} className="hero-plexus" aria-hidden="true">
        {engineReady && (
          <Particles
            id="hero-plexus"
            options={options}
            particlesLoaded={async (container) => {
              containerRef.current = container || null
            }}
          />
        )}
      </div>

      {/* Click ripples — short-lived expanding rings. Auto-cleaned after
          animation completes. */}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="hero-ripple"
          style={{ left: r.x, top: r.y }}
          aria-hidden="true"
        />
      ))}
    </>
  )
}

interface StaticDotPatternProps {
  accentHex: string
}

function StaticDotPattern({ accentHex }: StaticDotPatternProps) {
  const dots = useMemo(
    () =>
      Array.from({ length: STATIC_DOT_COLS * STATIC_DOT_ROWS }, (_, i) => {
        const col = i % STATIC_DOT_COLS
        const row = Math.floor(i / STATIC_DOT_COLS)
        return {
          cx: ((col + 0.5) / STATIC_DOT_COLS) * 100,
          cy: ((row + 0.5) / STATIC_DOT_ROWS) * 100,
          key: i,
        }
      }),
    [],
  )

  return (
    <svg
      className="hero-plexus hero-plexus--static"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {dots.map((d) => (
        <circle key={d.key} cx={d.cx} cy={d.cy} r="0.4" fill={accentHex} opacity="0.45" />
      ))}
    </svg>
  )
}

export default HeroPlexus
