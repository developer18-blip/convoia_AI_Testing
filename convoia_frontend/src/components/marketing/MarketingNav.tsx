import { useState, useEffect } from 'react'
import type { MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { IntellectMark } from '../brand/IntellectMark'
import { Button } from '../primitives/Button'
import { ThemeToggle } from '../primitives/ThemeToggle'

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleScrollLink = (e: MouseEvent, sectionId: string) => {
    e.preventDefault()
    setMobileOpen(false)

    if (location.pathname !== '/') {
      navigate('/')
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      return
    }

    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.history.pushState(null, '', `/#${sectionId}`)
  }

  return (
    <nav className={`m-nav ${scrolled ? 'm-nav--scrolled' : ''}`}>
      <div className="m-nav__inner">
        <Link to="/" className="m-nav__brand">
          <IntellectMark size={28} state="idle" />
          <div className="m-nav__brand-text">
            <div className="m-nav__brand-name">Intellect AI</div>
            <div className="m-nav__brand-sub mono-label">BY CONVOIA AI</div>
          </div>
        </Link>

        <div className="m-nav__links">
          <a href="/#features" className="m-nav__link" onClick={(e) => handleScrollLink(e, 'features')}>Features</a>
          <Link to="/pricing" className="m-nav__link">Pricing</Link>
          <a href="/#how-it-works" className="m-nav__link" onClick={(e) => handleScrollLink(e, 'how-it-works')}>How it works</a>
          <a href="/#reviews" className="m-nav__link" onClick={(e) => handleScrollLink(e, 'reviews')}>Reviews</a>
        </div>

        <div className="m-nav__actions">
          <ThemeToggle />
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">Get started</Button>
          </Link>
        </div>

        <button
          className="m-nav__mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {mobileOpen ? (
              <><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>
            ) : (
              <><path d="M3 12h18" /><path d="M3 6h18" /><path d="M3 18h18" /></>
            )}
          </svg>
        </button>
      </div>

      {mobileOpen && (
        <div className="m-nav__mobile-menu">
          <a href="/#features" onClick={(e) => handleScrollLink(e, 'features')}>Features</a>
          <Link to="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
          <a href="/#how-it-works" onClick={(e) => handleScrollLink(e, 'how-it-works')}>How it works</a>
          <a href="/#reviews" onClick={(e) => handleScrollLink(e, 'reviews')}>Reviews</a>
          <div style={{ height: 1, background: 'var(--border-default)', margin: '8px 0' }} />
          <Link to="/login" onClick={() => setMobileOpen(false)}>Sign in</Link>
          <Link to="/register" onClick={() => setMobileOpen(false)} style={{ color: 'var(--accent)' }}>
            Get started →
          </Link>
          <div style={{ marginTop: 16 }}>
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  )
}
