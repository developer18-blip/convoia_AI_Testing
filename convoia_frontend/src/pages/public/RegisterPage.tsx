import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Input } from '../../components/primitives/Input'
import { Button } from '../../components/primitives/Button'
import { SignalLine } from '../../components/primitives/SignalLine'
import { ComputationLine } from '../../components/primitives/ComputationLine'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { passwordStrength } from '../../lib/utils'

const industries = [
  { value: '', label: 'Select industry' },
  { value: 'legal', label: 'Legal' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'education', label: 'Education' },
  { value: 'technology', label: 'Technology' },
  { value: 'ecommerce', label: 'E-Commerce' },
  { value: 'other', label: 'Other' },
]

const roleOptions = [
  { value: 'org_owner', label: 'Organization Owner' },
  { value: 'manager', label: 'Manager' },
]

// Strength-bar colors mapped to our design tokens. passwordStrength() returns
// Tailwind class names, but we want semantic CSS variable colors inside the
// new theme boundary.
const STRENGTH_COLORS = ['var(--color-error)', 'var(--color-error)', 'var(--color-warning)', 'var(--color-info)', 'var(--color-success)']

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '0 36px 0 12px',
  height: 36,
  borderRadius: 'var(--radius-md)',
  border: '0.5px solid var(--border-default)',
  background: 'var(--surface-1)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-body)',
  appearance: 'none',
  cursor: 'pointer',
  outline: 'none',
}

function LabeledSelect({ label, value, onChange, options, error }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string }>
  error?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="input-field__label">{label}</label>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {error && <p className="input-field__error">{error}</p>}
    </div>
  )
}

export function RegisterPage() {
  const { register, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('token')
  const inviteOrg = searchParams.get('org')
  const inviteRole = searchParams.get('role')

  const [step, setStep] = useState(inviteToken ? 2 : 1)
  const [accountType, setAccountType] = useState<'individual' | 'business' | null>(inviteToken ? 'individual' : null)
  const [form, setForm] = useState({
    name: '', email: '', password: '', confirmPassword: '',
    organizationName: '', industry: '', role: 'org_owner',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const strength = passwordStrength(form.password)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Minimum 8 characters'
    else if (strength.score < 4) e.password = 'Password needs uppercase, lowercase, number, and special character'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    if (!agreed) e.terms = 'You must agree to the terms'
    if (accountType === 'business' && !inviteToken) {
      if (!form.organizationName.trim()) e.organizationName = 'Organization name is required'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!validate()) return
    try {
      setIsLoading(true)
      const data: Record<string, string> = { name: form.name, email: form.email, password: form.password }
      if (inviteToken) {
        data.role = 'employee'
        data.inviteToken = inviteToken
      } else if (accountType === 'individual') {
        data.role = 'employee'
      } else {
        data.role = form.role
        data.organizationName = form.organizationName
        if (form.industry) data.industry = form.industry
      }
      await register(data)
      toast.success('Account created successfully!')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Registration failed'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  // Cmd/Ctrl+Enter submits the form (only on step 2)
  useEffect(() => {
    if (step !== 2) return
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        document.querySelector<HTMLFormElement>('form.auth-register-form')?.requestSubmit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [step])

  return (
    <AuthLayout
        wide={step === 2 && accountType === 'business'}
        title={step === 1 ? 'Create your account' : 'Your details'}
        subtitle={step === 1 ? 'Start routing across 40+ AI models in 60 seconds' : 'Fill in your information to continue'}
        footer={
          <span>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 500, textDecoration: 'none' }}>
              Sign in
            </Link>
          </span>
        }
      >
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ height: 3, flex: 1, borderRadius: 2, background: 'var(--accent)', transition: 'all 0.4s' }} />
          <div style={{ height: 3, flex: 1, borderRadius: 2, background: step >= 2 ? 'var(--accent)' : 'var(--surface-3)', transition: 'all 0.4s' }} />
          <span className="mono-label" style={{ marginLeft: 4, fontSize: 10 }}>STEP {step}/2</span>
        </div>

        {/* Invite banner */}
        {inviteToken && inviteOrg && (
          <div style={{
            background: 'var(--accent-soft)',
            border: '0.5px solid var(--accent-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ fontSize: 18 }}>🎉</span>
            <div>
              <div className="text-body-sm" style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                Joining {decodeURIComponent(inviteOrg)}
              </div>
              <div className="text-caption" style={{ color: 'var(--text-secondary)' }}>
                You'll be added as {inviteRole}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <>
            <div className="text-body-sm" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
              How will you use Intellect?
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <button
                type="button"
                onClick={() => { setAccountType('individual'); setStep(2) }}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: 20,
                  borderRadius: 'var(--radius-lg)',
                  border: '0.5px solid var(--border-default)',
                  background: 'var(--surface-1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-border)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Individual</div>
                <div className="text-caption" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  Personal AI access with pay-as-you-go tokens
                </div>
              </button>

              <button
                type="button"
                onClick={() => { setAccountType('business'); setStep(2) }}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: 20,
                  borderRadius: 'var(--radius-lg)',
                  border: '0.5px solid var(--border-default)',
                  background: 'var(--surface-1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-border)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-default)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
                  </svg>
                </div>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>Team / Business</div>
                <div className="text-caption" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
                  Manage AI access for your entire organization
                </div>
              </button>
            </div>

            <div style={{ position: 'relative', margin: '8px 0', textAlign: 'center' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center' }}>
                <div style={{ width: '100%', borderTop: '0.5px solid var(--border-subtle)' }} />
              </div>
              <span className="mono-label" style={{ position: 'relative', background: 'var(--surface-1)', padding: '0 12px', fontSize: 10 }}>
                OR SIGN UP INSTANTLY
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (!credentialResponse.credential) return
                  try {
                    await googleLogin(credentialResponse.credential)
                    toast.success('Account created!')
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message || 'Google sign-up failed')
                  }
                }}
                onError={() => toast.error('Google sign-up failed')}
                theme="outline"
                shape="rectangular"
                size="large"
                width="360"
                text="signup_with"
              />
            </div>
          </>
        )}

        {step === 2 && (
          <form className="auth-register-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!inviteToken && (
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                  color: 'var(--text-tertiary)', fontSize: 'var(--text-body-sm)',
                  alignSelf: 'flex-start',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Change account type
              </button>
            )}

            <Input
              label="Full name"
              placeholder="Anirudh Rai"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              error={errors.name}
              required
              autoFocus
              autoComplete="name"
            />
            <Input
              label="Work email"
              type="email"
              placeholder="name@company.com"
              value={form.email}
              onChange={(e) => updateField('email', e.target.value)}
              error={errors.email}
              required
              autoComplete="email"
            />

            <div>
              <Input
                label="Password"
                type="password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                error={errors.password}
                required
                autoComplete="new-password"
              />
              {form.password && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} style={{
                        height: 3, flex: 1, borderRadius: 2,
                        background: i <= strength.score ? STRENGTH_COLORS[strength.score] : 'var(--surface-3)',
                        transition: 'background 0.3s',
                      }} />
                    ))}
                  </div>
                  <p className="text-caption" style={{
                    marginTop: 4,
                    color: STRENGTH_COLORS[strength.score],
                    fontWeight: 500,
                  }}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            <Input
              label="Confirm password"
              type="password"
              placeholder="Confirm your password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              error={errors.confirmPassword}
              required
              autoComplete="new-password"
            />

            {accountType === 'business' && !inviteToken && (
              <>
                <Input
                  label="Organization name"
                  placeholder="Acme Inc."
                  value={form.organizationName}
                  onChange={(e) => updateField('organizationName', e.target.value)}
                  error={errors.organizationName}
                />
                <LabeledSelect label="Industry" value={form.industry} onChange={(v) => updateField('industry', v)} options={industries} />
                <LabeledSelect label="Your role" value={form.role} onChange={(v) => updateField('role', v)} options={roleOptions} />
              </>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => { setAgreed(e.target.checked); setErrors(p => ({ ...p, terms: '' })) }}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: 'var(--accent)' }}
              />
              <span className="text-body-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                I agree to the{' '}
                <Link to="/terms" target="_blank" style={{ color: 'var(--accent)' }}>Terms</Link>
                {' '}and{' '}
                <Link to="/privacy" target="_blank" style={{ color: 'var(--accent)' }}>Privacy Policy</Link>
              </span>
            </label>
            {errors.terms && <p className="input-field__error">{errors.terms}</p>}

            <SignalLine />

            <Button type="submit" variant="primary" size="lg" loading={isLoading} disabled={isLoading}>
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>

            {isLoading && <ComputationLine label="PROVISIONING WORKSPACE" />}
          </form>
        )}
      </AuthLayout>
  )
}

export default RegisterPage
