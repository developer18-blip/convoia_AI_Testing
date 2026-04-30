import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { User, Building2, Mail, Lock, Eye, EyeOff, ArrowLeft, Sparkles, Check } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { nativeGoogleSignIn } from '../../lib/capacitor'
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

export function MobileRegisterPage() {
  const { register, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('token')
  const inviteOrg = searchParams.get('org')
  const inviteRole = searchParams.get('role')

  const [step, setStep] = useState(inviteToken ? 2 : 1)
  const [accountType, setAccountType] = useState<'individual' | 'business' | null>(inviteToken ? 'individual' : null)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', organizationName: '', industry: '', role: 'org_owner' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const updateField = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: '' }))
  }

  const strength = passwordStrength(form.password)
  const strengthColors = ['#EF4444', '#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981']

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Name is required'
    if (!form.email) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 8) e.password = 'Minimum 8 characters'
    else if (strength.score < 4) e.password = 'Needs uppercase, lowercase, number & special char'
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

  const inputStyle = (hasError: boolean) => ({
    width: '100%', padding: '14px 14px 14px 42px', borderRadius: '14px', fontSize: '15px',
    border: hasError ? '1.5px solid #EF4444' : '1.5px solid #E8E5F0',
    background: '#F8F7FF', color: '#1A1A2E', outline: 'none',
    transition: 'border-color 200ms',
  })

  const selectStyle = {
    width: '100%', padding: '14px 14px 14px 42px', borderRadius: '14px', fontSize: '15px',
    border: '1.5px solid #E8E5F0', background: '#F8F7FF', color: '#1A1A2E', outline: 'none',
    appearance: 'none' as const, WebkitAppearance: 'none' as const,
  }

  return (
    <div className="mobile-app" style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      background: '#F8F7FF',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Purple gradient hero */}
      <div style={{
        background: 'linear-gradient(160deg, #5B21B6 0%, #7C3AED 50%, #8B5CF6 100%)',
        padding: '36px 24px 56px',
        position: 'relative', overflow: 'hidden',
        borderRadius: '0 0 32px 32px',
      }}>
        {/* Decorative */}
        <div style={{ position: 'absolute', top: '-30px', right: '-30px', width: '140px', height: '140px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
        <div style={{ position: 'absolute', bottom: '-40px', left: '20%', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
          <img src="/logo.png?v=2" alt="ConvoiaAI" style={{ height: '36px', objectFit: 'contain', filter: 'brightness(10)' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        </div>

        <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'white', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
          Create your account
        </h1>
        <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)', margin: 0 }}>
          Start using AI in under 2 minutes
        </p>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: step >= 1 ? 'white' : 'rgba(255,255,255,0.25)', transition: 'background 300ms' }} />
          <div style={{ flex: 1, height: '4px', borderRadius: '2px', background: step >= 2 ? 'white' : 'rgba(255,255,255,0.25)', transition: 'background 300ms' }} />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginLeft: '4px' }}>
            Step {step}/2
          </span>
        </div>
      </div>

      {/* Form card */}
      <div style={{
        flex: 1, padding: '0 20px 32px', marginTop: '-28px', position: 'relative', zIndex: 1,
        overflowY: 'auto',
      }}>
        <div style={{
          background: 'white', borderRadius: '24px', padding: '28px 24px',
          boxShadow: '0 8px 40px rgba(124,58,237,0.12)',
        }}>

          {/* Step 1: Account Type */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#4A4A6A', marginBottom: '16px' }}>
                How will you use ConvoiaAI?
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                {/* Individual */}
                <button onClick={() => { setAccountType('individual'); setStep(2) }}
                  style={{
                    padding: '20px 16px', borderRadius: '20px', border: '2px solid #E8E5F0',
                    background: 'white', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 200ms',
                  }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px', marginBottom: '14px',
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.05))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <User size={24} color="#7C3AED" />
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A2E', margin: '0 0 4px' }}>Individual</p>
                  <p style={{ fontSize: '12px', color: '#8E8EA0', margin: 0, lineHeight: 1.4 }}>
                    Personal AI with pay-as-you-go
                  </p>
                </button>

                {/* Business */}
                <button onClick={() => { setAccountType('business'); setStep(2) }}
                  style={{
                    padding: '20px 16px', borderRadius: '20px', border: '2px solid #E8E5F0',
                    background: 'white', cursor: 'pointer', textAlign: 'left',
                    transition: 'all 200ms',
                  }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px', marginBottom: '14px',
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.05))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Building2 size={24} color="#7C3AED" />
                  </div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#1A1A2E', margin: '0 0 4px' }}>Team / Business</p>
                  <p style={{ fontSize: '12px', color: '#8E8EA0', margin: 0, lineHeight: 1.4 }}>
                    Manage AI for your org
                  </p>
                </button>
              </div>

              {/* Divider */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
                <div style={{ flex: 1, height: '1px', background: '#E8E5F0' }} />
                <span style={{ fontSize: '11px', color: '#8E8EA0', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  or sign up instantly
                </span>
                <div style={{ flex: 1, height: '1px', background: '#E8E5F0' }} />
              </div>

              {/* Google — native Play Services first, system-browser fallback */}
              <button
                onClick={async () => {
                  try {
                    const native = await nativeGoogleSignIn()
                    if (native?.idToken) {
                      await googleLogin(native.idToken)
                      toast.success('Welcome!')
                      return
                    }
                  } catch (err: any) {
                    console.warn('Native Google sign-in failed, falling back to browser:', err?.message)
                  }
                  const baseUrl = import.meta.env.VITE_API_URL || 'https://convoia.ai/api'
                  window.open(`${baseUrl}/auth/google/mobile`, '_system')
                }}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', fontSize: '15px', fontWeight: 600,
                  border: '1.5px solid #E8E5F0', background: 'white', color: '#1A1A2E',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                }}>
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign up with Google
              </button>

              {/* Benefits */}
              <div style={{ marginTop: '24px', padding: '16px', borderRadius: '16px', background: '#F8F7FF' }}>
                {[
                  'Access 35+ AI models in one place',
                  'Image generation with DALL-E & Gemini',
                  'Team management with budgets',
                ].map(b => (
                  <div key={b} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '6px', background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={12} color="#7C3AED" />
                    </div>
                    <span style={{ fontSize: '12px', color: '#4A4A6A', fontWeight: 500 }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Registration Form */}
          {step === 2 && (
            <form onSubmit={handleSubmit}>
              {/* Back button */}
              {!inviteToken && (
                <button type="button" onClick={() => setStep(1)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '16px' }}>
                  <ArrowLeft size={14} /> Change account type
                </button>
              )}

              {/* Invite banner */}
              {inviteToken && inviteOrg && (
                <div style={{
                  background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
                  borderRadius: '14px', padding: '14px 16px', marginBottom: '16px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                }}>
                  <span style={{ fontSize: '20px' }}>🎉</span>
                  <div>
                    <p style={{ fontSize: '13px', fontWeight: 700, color: '#1A1A2E', margin: 0 }}>Joining {decodeURIComponent(inviteOrg)}</p>
                    <p style={{ fontSize: '11px', color: '#8E8EA0', margin: '2px 0 0' }}>You'll be added as {inviteRole}</p>
                  </div>
                </div>
              )}

              {/* Full name */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Full name</label>
                <div style={{ position: 'relative' }}>
                  <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                  <input value={form.name} placeholder="John Doe"
                    onChange={e => updateField('name', e.target.value)}
                    style={inputStyle(!!errors.name)}
                    onFocus={e => { if (!errors.name) e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { if (!errors.name) e.target.style.borderColor = '#E8E5F0' }}
                  />
                </div>
                {errors.name && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.name}</p>}
              </div>

              {/* Email */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Work email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                  <input type="email" value={form.email} placeholder="name@company.com"
                    onChange={e => updateField('email', e.target.value)}
                    style={inputStyle(!!errors.email)}
                    onFocus={e => { if (!errors.email) e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { if (!errors.email) e.target.style.borderColor = '#E8E5F0' }}
                  />
                </div>
                {errors.email && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.email}</p>}
              </div>

              {/* Password */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                  <input type={showPassword ? 'text' : 'password'} value={form.password} placeholder="Min 8 characters"
                    onChange={e => updateField('password', e.target.value)}
                    style={{ ...inputStyle(!!errors.password), paddingRight: '44px' }}
                    onFocus={e => { if (!errors.password) e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { if (!errors.password) e.target.style.borderColor = '#E8E5F0' }}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8E8EA0', cursor: 'pointer', padding: '4px' }}>
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {form.password && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ display: 'flex', gap: '3px' }}>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{
                          flex: 1, height: '4px', borderRadius: '2px',
                          background: i <= strength.score ? strengthColors[strength.score] : '#E8E5F0',
                          transition: 'background 300ms',
                        }} />
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', marginTop: '4px', fontWeight: 600, color: strengthColors[strength.score] }}>
                      {strength.label}
                    </p>
                  </div>
                )}
                {errors.password && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Confirm password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                  <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword} placeholder="Confirm your password"
                    onChange={e => updateField('confirmPassword', e.target.value)}
                    style={{ ...inputStyle(!!errors.confirmPassword), paddingRight: '44px' }}
                    onFocus={e => { if (!errors.confirmPassword) e.target.style.borderColor = '#7C3AED' }}
                    onBlur={e => { if (!errors.confirmPassword) e.target.style.borderColor = '#E8E5F0' }}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#8E8EA0', cursor: 'pointer', padding: '4px' }}>
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirmPassword && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.confirmPassword}</p>}
              </div>

              {/* Business fields */}
              {accountType === 'business' && !inviteToken && (
                <>
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Organization name</label>
                    <div style={{ position: 'relative' }}>
                      <Building2 size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0' }} />
                      <input value={form.organizationName} placeholder="Acme Inc."
                        onChange={e => updateField('organizationName', e.target.value)}
                        style={inputStyle(!!errors.organizationName)}
                        onFocus={e => { if (!errors.organizationName) e.target.style.borderColor = '#7C3AED' }}
                        onBlur={e => { if (!errors.organizationName) e.target.style.borderColor = '#E8E5F0' }}
                      />
                    </div>
                    {errors.organizationName && <p style={{ fontSize: '12px', color: '#EF4444', margin: '4px 0 0 4px' }}>{errors.organizationName}</p>}
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Industry</label>
                    <div style={{ position: 'relative' }}>
                      <Building2 size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0', pointerEvents: 'none' }} />
                      <select value={form.industry} onChange={e => updateField('industry', e.target.value)} style={selectStyle}>
                        {industries.map(ind => <option key={ind.value} value={ind.value}>{ind.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#4A4A6A', marginBottom: '6px' }}>Your role</label>
                    <div style={{ position: 'relative' }}>
                      <User size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#8E8EA0', pointerEvents: 'none' }} />
                      <select value={form.role} onChange={e => updateField('role', e.target.value)} style={selectStyle}>
                        {roleOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Terms */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '6px', marginTop: '4px' }}>
                <div onClick={(e) => { e.preventDefault(); setAgreed(!agreed); setErrors(p => ({ ...p, terms: '' })) }}
                  style={{
                    width: '22px', height: '22px', borderRadius: '7px', flexShrink: 0, marginTop: '1px',
                    border: agreed ? 'none' : '1.5px solid #E8E5F0',
                    background: agreed ? '#7C3AED' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 200ms',
                  }}>
                  {agreed && <Check size={14} color="white" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: '13px', color: '#4A4A6A', lineHeight: 1.5 }}>
                  I agree to the{' '}
                  <Link to="/terms" target="_blank" style={{ color: '#7C3AED', fontWeight: 600, textDecoration: 'none' }}>Terms</Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" style={{ color: '#7C3AED', fontWeight: 600, textDecoration: 'none' }}>Privacy Policy</Link>
                </span>
              </label>
              {errors.terms && <p style={{ fontSize: '12px', color: '#EF4444', margin: '2px 0 0 32px' }}>{errors.terms}</p>}

              {/* Submit */}
              <button type="submit" disabled={isLoading}
                style={{
                  width: '100%', padding: '16px', borderRadius: '16px', border: 'none', marginTop: '16px',
                  background: 'linear-gradient(135deg, #7C3AED, #5B21B6)',
                  color: 'white', fontSize: '16px', fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer',
                  opacity: isLoading ? 0.7 : 1, transition: 'opacity 200ms',
                  boxShadow: '0 4px 20px rgba(124,58,237,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                {isLoading ? (
                  <div style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                ) : (
                  <>
                    <Sparkles size={18} />
                    Create Account
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Login link */}
        <p style={{ textAlign: 'center', fontSize: '14px', color: '#8E8EA0', marginTop: '24px' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#7C3AED', fontWeight: 700, textDecoration: 'none' }}>
            Sign in
          </Link>
        </p>
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default MobileRegisterPage
