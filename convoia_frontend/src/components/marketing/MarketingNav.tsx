import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { IntellectMark } from '../brand/IntellectMark'
import { Button } from '../primitives/Button'
import { ThemeToggle } from '../primitives/ThemeToggle'

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav className={`m-nav ${scrolled ? 'm-nav--scrolled' : ''}`}>
      <div className="m-nav__inner">
        <Link to="/" className="m-nav__brand">
          <IntellectMark size={28} state="idle" />
          <div className="m-nav__brand-text">
            <div className="m-nav__brand-name">Intellect</div>
            <div className="m-nav__brand-sub mono-label">AI GATEWAY</div>
          </div>
        </Link>

        <div className="m-nav__links">
          <Link to="/#features" className="m-nav__link">Features</Link>
          <Link to="/pricing" className="m-nav__link">Pricing</Link>
          <Link to="/#how-it-works" className="m-nav__link">How it works</Link>
          <Link to="/#reviews" className="m-nav__link">Reviews</Link>
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
          <Link to="/#features" onClick={() => setMobileOpen(false)}>Features</Link>
          <Link to="/pricing" onClick={() => setMobileOpen(false)}>Pricing</Link>
          <Link to="/#how-it-works" onClick={() => setMobileOpen(false)}>How it works</Link>
          <Link to="/#reviews" onClick={() => setMobileOpen(false)}>Reviews</Link>
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
