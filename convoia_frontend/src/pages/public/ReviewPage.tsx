import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MarketingNav } from '../../components/marketing/MarketingNav'
import { MarketingFooter } from '../../components/marketing/MarketingFooter'
import { IntellectMark } from '../../components/brand/IntellectMark'
import { Button } from '../../components/primitives/Button'
import { Input } from '../../components/primitives/Input'
import { useAccent } from '../../contexts/AccentContext'
import { useAuth } from '../../hooks/useAuth'
import api from '../../lib/api'

const textareaStyle: CSSProperties = {
  minHeight: 140,
  padding: 12,
  background: 'var(--surface-1)',
  border: '0.5px solid var(--border-default)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-body)',
  resize: 'vertical',
  outline: 'none',
}

export function ReviewPage() {
  const { setActiveModel } = useAccent()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()

  useEffect(() => { setActiveModel('') }, [setActiveModel])

  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    try {
      await api.post('/reviews', { rating, title, content, role, company })
      setSubmitted(true)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string }
      setErrorMsg(
        axiosErr?.response?.data?.message ||
        axiosErr?.message ||
        'Something went wrong. Please try again or email hello@convoia.ai.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  // ── Auth gate: show sign-in CTA for guests ──
  if (!authLoading && !isAuthenticated) {
    return (
      <div>
        <MarketingNav />
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center',
        }}>
          <IntellectMark size={48} state="idle" />
          <h1 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>
            Sign in to leave a review.
          </h1>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 480 }}>
            We verify reviewers so the feedback you read here is real. Sign in or create a free account to write one.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link to="/login"><Button variant="primary">Sign in</Button></Link>
            <Link to="/register"><Button variant="outline">Create account</Button></Link>
          </div>
        </div>
        <MarketingFooter />
      </div>
    )
  }

  if (submitted) {
    return (
      <div>
        <MarketingNav />
        <div style={{
          minHeight: '60vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center',
        }}>
          <IntellectMark size={48} state="council" />
          <h1 className="text-h1" style={{ marginTop: 24, marginBottom: 12, color: 'var(--text-primary)' }}>Thank you.</h1>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)', marginBottom: 32, maxWidth: 480 }}>
            Your review has been submitted. We read every one. If we feature yours, we'll send you a free month of Scale.
          </p>
          <Link to="/"><Button variant="primary">Back to home</Button></Link>
        </div>
        <MarketingFooter />
      </div>
    )
  }

  return (
    <div>
      <MarketingNav />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="section-heading">WRITE A REVIEW</div>
          <h1 className="text-h1" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Tell us what you think.</h1>
          <p className="text-body-lg" style={{ color: 'var(--text-secondary)' }}>
            Your feedback shapes what we build next.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Identity confirmation — backend pulls name from the authenticated user record */}
          <div style={{
            padding: '12px 14px',
            background: 'var(--surface-2)',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'var(--accent)', color: 'var(--accent-on)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13,
            }}>
              {user?.name?.slice(0, 2).toUpperCase() || '??'}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                Posting as {user?.name}
              </div>
              <div className="mono-label" style={{ fontSize: 10, marginTop: 2 }}>{user?.email}</div>
            </div>
          </div>

          <Input label="Your role (optional)" placeholder="e.g. Engineering Lead" value={role} onChange={e => setRole(e.target.value)} />
          <Input label="Company (optional)" placeholder="e.g. Acme Corp" value={company} onChange={e => setCompany(e.target.value)} />

          <div className="input-field">
            <label className="input-field__label">Rating</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i)}
                  aria-label={`${i} star${i > 1 ? 's' : ''}`}
                  style={{
                    all: 'unset', cursor: 'pointer', padding: 4,
                    color: i <= rating ? '#F59E0B' : 'var(--text-muted)',
                    transition: 'color 0.2s',
                  }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <Input label="Review title" placeholder="e.g. Great AI platform for teams" value={title} onChange={e => setTitle(e.target.value)} required />

          <div className="input-field">
            <label className="input-field__label">Your review</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              minLength={30}
              placeholder="Tell us what you like, what could be better, what you'd recommend to others..."
              style={textareaStyle}
            />
            <p className="input-field__hint">Minimum 30 characters. We may feature selected reviews on our site.</p>
          </div>

          {errorMsg && (
            <p style={{
              padding: '10px 12px',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '0.5px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-danger, #EF4444)',
              fontSize: 'var(--text-body-sm)',
              margin: 0,
            }}>
              {errorMsg}
            </p>
          )}

          <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Review'}
          </Button>

          <p className="text-caption" style={{ color: 'var(--text-tertiary)', textAlign: 'center' }}>
            By submitting, you grant Convoia AI permission to display your review on our website.
          </p>
        </form>
      </div>
      <MarketingFooter />
    </div>
  )
}

export default ReviewPage
