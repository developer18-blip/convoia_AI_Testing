import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { ConvoiaMark } from '../brand/ConvoiaMark'
import { useToast } from '../../hooks/useToast'

export function MarketingFooter() {
  const footerRef = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)
  const [email, setEmail] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const toast = useToast()

  // Trigger the atmospheric glow fade-in once the footer scrolls into view.
  // One-shot — disconnects after first intersection so the gradient stays
  // visible permanently after triggering.
  useEffect(() => {
    if (!footerRef.current) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const node = footerRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // TODO(footer): wire to backend when /api/newsletter/subscribe exists
  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email')
      return
    }
    setSubscribing(true)
    // Simulate async to give the user feedback that something happened
    setTimeout(() => {
      toast.success("Thanks — we'll keep you posted.")
      setEmail('')
      setSubscribing(false)
    }, 400)
  }

  return (
    <footer ref={footerRef} className={`m-footer${inView ? ' m-footer--in-view' : ''}`}>
      <div className="m-footer__inner">
        <div className="m-footer__brand-col">
          <div className="m-footer__brand">
            <ConvoiaMark size={24} state="idle" />
            <div>
              <div className="m-footer__brand-name">Convoia AI</div>
            </div>
          </div>
          <p className="text-body-sm" style={{ color: 'var(--text-tertiary)', marginTop: 12, maxWidth: 280 }}>
            The AI gateway that routes across every provider from a single interface.
          </p>

          <form className="m-footer__newsletter" onSubmit={handleSubscribe}>
            <div className="mono-label">STAY IN THE LOOP</div>
            <div className="m-footer__newsletter-row">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="m-footer__newsletter-input"
                aria-label="Email for newsletter"
                required
                disabled={subscribing}
              />
              <button
                type="submit"
                className="m-footer__newsletter-btn"
                aria-label="Subscribe"
                disabled={subscribing}
              >
                <ArrowRight size={14} />
              </button>
            </div>
            <p className="m-footer__newsletter-hint">Product updates and gateway news. No spam.</p>
          </form>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">PRODUCT</div>
          <Link to="/pricing" className="m-footer__link">Pricing</Link>
          <Link to="/models" className="m-footer__link">Models</Link>
          <Link to="/changelog" className="m-footer__link">Changelog</Link>
          <Link to="/status" className="m-footer__link">Status</Link>
          <Link to="/roadmap" className="m-footer__link">Roadmap</Link>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">DEVELOPERS</div>
          <Link to="/api-docs" className="m-footer__link">API Reference</Link>
          <Link to="/docs" className="m-footer__link">Documentation</Link>
          <Link to="/sdks" className="m-footer__link">SDKs</Link>
          <Link to="/integrations" className="m-footer__link">Integrations</Link>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">COMPANY</div>
          <a href="https://blog.convoia.ai" className="m-footer__link">Blog</a>
          <Link to="/about" className="m-footer__link">About</Link>
          <a href="mailto:careers@convoia.ai" className="m-footer__link">Careers</a>
          <a href="mailto:hello@convoia.ai" className="m-footer__link">Contact</a>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">LEGAL</div>
          <Link to="/privacy" className="m-footer__link">Privacy</Link>
          <Link to="/terms" className="m-footer__link">Terms</Link>
          <Link to="/dpa" className="m-footer__link">DPA</Link>
          <a href="mailto:security@convoia.ai" className="m-footer__link">Security</a>
          <Link to="/cookies" className="m-footer__link">Cookies</Link>
        </div>
      </div>

      <div className="m-footer__bottom">
        <div className="mono-label">© 2026 CONVOIA AI</div>
        <div className="mono-label">
          <span style={{ color: 'var(--color-success)' }}>●</span> ALL SYSTEMS OPERATIONAL
        </div>
      </div>
    </footer>
  )
}
