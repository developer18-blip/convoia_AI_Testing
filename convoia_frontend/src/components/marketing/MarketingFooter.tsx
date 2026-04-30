import { Link } from 'react-router-dom'
import { IntellectMark } from '../brand/IntellectMark'

export function MarketingFooter() {
  return (
    <footer className="m-footer">
      <div className="m-footer__inner">
        <div className="m-footer__brand-col">
          <div className="m-footer__brand">
            <IntellectMark size={24} state="idle" />
            <div>
              <div className="m-footer__brand-name">Intellect AI</div>
              <div className="mono-label" style={{ fontSize: 10, marginTop: 2 }}>BY CONVOIA AI</div>
            </div>
          </div>
          <p className="text-body-sm" style={{ color: 'var(--text-tertiary)', marginTop: 12, maxWidth: 280 }}>
            The AI gateway that routes across every provider from a single interface.
          </p>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">PRODUCT</div>
          <Link to="/pricing" className="m-footer__link">Pricing</Link>
          <Link to="/changelog" className="m-footer__link">Changelog</Link>
          <Link to="/docs" className="m-footer__link">Documentation</Link>
          <Link to="/status" className="m-footer__link">Status</Link>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">COMPANY</div>
          <a href="https://blog.convoia.ai" className="m-footer__link">Blog</a>
          <Link to="/about" className="m-footer__link">About</Link>
          <Link to="/contact" className="m-footer__link">Contact</Link>
        </div>

        <div className="m-footer__links-col">
          <div className="mono-label">LEGAL</div>
          <Link to="/privacy" className="m-footer__link">Privacy</Link>
          <Link to="/terms" className="m-footer__link">Terms</Link>
          <Link to="/dpa" className="m-footer__link">DPA</Link>
        </div>
      </div>

      <div className="m-footer__bottom">
        <div className="mono-label">© 2026 CONVOIA AI · INTELLECT IS A PRODUCT OF CONVOIA AI</div>
        <div className="mono-label">
          <span style={{ color: 'var(--color-success)' }}>●</span> ALL SYSTEMS OPERATIONAL
        </div>
      </div>
    </footer>
  )
}
