import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { IntellectMark } from '../brand/IntellectMark'
import { Button } from '../primitives/Button'

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)

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
          <Link to="/pricing" className="m-nav__link">Pricing</Link>
          <Link to="/docs" className="m-nav__link">Docs</Link>
          <Link to="/changelog" className="m-nav__link">Changelog</Link>
          <a href="https://blog.convoia.ai" className="m-nav__link">Blog</a>
        </div>

        <div className="m-nav__actions">
          <Link to="/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button variant="primary" size="sm">Get started</Button>
          </Link>
        </div>
      </div>
    </nav>
  )
}
