import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { User, Building2, Mail, Lock, ArrowLeft, ArrowRight, Sparkles, Check } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { cn, passwordStrength } from '../../lib/utils'

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

const benefits = [
  'Access to 35+ AI models including GPT-5, Claude, Gemini',
  'Built-in web search for real-time information',
  'Image generation with DALL-E, Gemini & GPT Image',
  'Team management with token budgets',
  'Interactive charts & data visualization',
  'Persistent memory across conversations',
]

export function RegisterPage() {
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

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: '' }))
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

  return (
    <div className="min-h-screen flex">
      {/* Left — Feature Panel (hidden on mobile) */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #2563EB 0%, #4F46E5 40%, #7C3AED 100%)' }}>
        {/* Decorative */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-32 left-10 w-80 h-80 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-64 h-64 bg-white rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }} />

        <div className="relative z-10 flex flex-col justify-center px-16 xl:px-20 text-white w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="flex items-center gap-2 mb-6">
              <Sparkles size={20} />
              <span className="text-sm font-medium text-white/80 uppercase tracking-wider">Get Started Free</span>
            </div>

            <h2 className="text-4xl xl:text-5xl font-bold leading-tight mb-4">
              Build with the<br />
              best AI models.<br />
              <span className="text-white/70">Pay only for what you use.</span>
            </h2>

            <p className="text-lg text-white/60 mb-10 max-w-md">
              No subscriptions. No commitments. Start with free tokens and scale as you grow.
            </p>

            <div className="space-y-4">
              {benefits.map((b, i) => (
                <motion.div
                  key={b}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                    <Check size={14} />
                  </div>
                  <span className="text-sm text-white/85">{b}</span>
                </motion.div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="mt-14 bg-white/10 backdrop-blur-sm rounded-2xl px-6 py-5">
              <p className="text-sm text-white/80 italic leading-relaxed">
                "ConvoiaAI replaced 4 separate AI subscriptions for our team. The token system is brilliant — we only pay for what we actually use."
              </p>
              <div className="flex items-center gap-3 mt-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500" />
                <div>
                  <p className="text-sm font-semibold">Sarah Chen</p>
                  <p className="text-xs text-white/50">CTO, TechForward Inc.</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right — Form Side */}
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 xl:px-20 bg-background relative overflow-y-auto">
        <div className="absolute top-5 right-5 z-10">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-[440px] mx-auto py-10"
        >
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 mb-8">
            <img src="/logo.png" alt="ConvoiaAI" style={{ height: '36px', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </Link>

          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Create your account</h1>
          <p className="text-text-muted mt-2 mb-2">Start using AI in under 2 minutes</p>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            <div className={cn('h-1.5 flex-1 rounded-full transition-all duration-500', step >= 1 ? 'bg-primary' : 'bg-surface-2')} />
            <div className={cn('h-1.5 flex-1 rounded-full transition-all duration-500', step >= 2 ? 'bg-primary' : 'bg-surface-2')} />
            <span className="text-xs text-text-muted ml-2">Step {step}/2</span>
          </div>

          {/* Step 1: Account Type */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5"
            >
              <p className="text-sm text-text-secondary font-medium">How will you use ConvoiaAI?</p>

              <div className="grid grid-cols-2 gap-4">
                <motion.button
                  whileHover={{ y: -3, boxShadow: '0 12px 40px -12px rgba(124,58,237,0.3)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setAccountType('individual'); setStep(2) }}
                  className={cn(
                    'p-6 rounded-2xl border-2 text-left transition-all group',
                    accountType === 'individual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="w-12 h-12 mb-4 rounded-xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <User size={24} className="text-primary" />
                  </div>
                  <p className="font-bold text-text-primary text-sm">Individual</p>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Personal AI access with pay-as-you-go tokens</p>
                </motion.button>

                <motion.button
                  whileHover={{ y: -3, boxShadow: '0 12px 40px -12px rgba(124,58,237,0.3)' }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setAccountType('business'); setStep(2) }}
                  className={cn(
                    'p-6 rounded-2xl border-2 text-left transition-all group',
                    accountType === 'business' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="w-12 h-12 mb-4 rounded-xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Building2 size={24} className="text-primary" />
                  </div>
                  <p className="font-bold text-text-primary text-sm">Team / Business</p>
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">Manage AI access for your entire organization</p>
                </motion.button>
              </div>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-3 text-text-muted tracking-wider">or sign up instantly</span>
                </div>
              </div>

              <div className="flex justify-center">
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
                  width="420"
                  text="signup_with"
                />
              </div>
            </motion.div>
          )}

          {/* Step 2: Registration Form */}
          {step === 2 && (
            <motion.form
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onSubmit={handleSubmit}
              className="space-y-4"
            >
              {!inviteToken && (
                <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-1 transition-colors font-medium">
                  <ArrowLeft size={14} /> Change account type
                </button>
              )}

              {inviteToken && inviteOrg && (
                <div className="bg-primary/8 border border-primary/20 rounded-xl px-4 py-3 mb-3 flex items-center gap-3">
                  <span className="text-lg">🎉</span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Joining {decodeURIComponent(inviteOrg)}</p>
                    <p className="text-xs text-text-muted">You'll be added as {inviteRole}</p>
                  </div>
                </div>
              )}

              <Input label="Full name" placeholder="John Doe" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} icon={<User size={16} />} />
              <Input label="Work email" type="email" placeholder="name@company.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={errors.email} icon={<Mail size={16} />} />

              <div>
                <Input label="Password" type="password" placeholder="Min 8 characters" value={form.password} onChange={(e) => updateField('password', e.target.value)} error={errors.password} icon={<Lock size={16} />} />
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-all duration-300', i <= strength.score ? strength.color : 'bg-surface-2')} />
                      ))}
                    </div>
                    <p className={cn('text-xs mt-1 font-medium', strength.score <= 2 ? 'text-danger' : strength.score <= 3 ? 'text-warning' : 'text-success')}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              <Input label="Confirm password" type="password" placeholder="Confirm your password" value={form.confirmPassword} onChange={(e) => updateField('confirmPassword', e.target.value)} error={errors.confirmPassword} icon={<Lock size={16} />} />

              {accountType === 'business' && !inviteToken && (
                <>
                  <Input label="Organization name" placeholder="Acme Inc." value={form.organizationName} onChange={(e) => updateField('organizationName', e.target.value)} error={errors.organizationName} icon={<Building2 size={16} />} />
                  <Select label="Industry" options={industries} value={form.industry} onChange={(e) => updateField('industry', e.target.value)} />
                  <Select label="Your role" options={roleOptions} value={form.role} onChange={(e) => updateField('role', e.target.value)} />
                </>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors((p) => ({ ...p, terms: '' })) }} className="mt-0.5 rounded border-border bg-surface text-primary focus:ring-primary w-4 h-4" />
                <span className="text-sm text-text-secondary leading-relaxed">
                  I agree to the <Link to="/terms" target="_blank" className="text-primary hover:underline">Terms</Link> and <Link to="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</Link>
                </span>
              </label>
              {errors.terms && <p className="text-xs text-danger">{errors.terms}</p>}

              <Button type="submit" isLoading={isLoading} className="w-full !py-3 !text-base !font-semibold">
                Create Account
                <ArrowRight size={16} />
              </Button>
            </motion.form>
          )}

          <p className="text-center text-sm text-text-muted mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:text-primary-hover font-semibold transition-colors">Sign in</Link>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default RegisterPage
