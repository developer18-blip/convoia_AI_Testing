import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, User, Building2, Mail, Lock, ArrowLeft, ArrowRight } from 'lucide-react'
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
  { value: 'other', label: 'Other' },
]

const roleOptions = [
  { value: 'org_owner', label: 'Organization Owner' },
  { value: 'manager', label: 'Manager' },
]

export function RegisterPage() {
  const { register } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('token')
  const inviteOrg = searchParams.get('org')
  const inviteRole = searchParams.get('role')

  // If invite token present, skip step 1 (account type selection)
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
      const data: Record<string, string> = {
        name: form.name,
        email: form.email,
        password: form.password,
      }
      if (inviteToken) {
        // Invite flow — role and org are set server-side via invite
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-full h-full bg-gradient-to-bl from-accent-end/8 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-full h-full bg-gradient-to-tr from-primary/8 via-transparent to-transparent rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6 group">
            <motion.div whileHover={{ rotate: 15 }} className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-xl blur-lg" />
              <div className="relative bg-gradient-to-br from-accent-start to-accent-end p-2.5 rounded-xl">
                <Zap size={24} className="text-white" />
              </div>
            </motion.div>
            <span className="text-2xl font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">Convoia AI</span>
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Create your account</h1>
          <div className="flex items-center justify-center gap-2 mt-3">
            <div className={cn('h-1 w-16 rounded-full transition-all duration-300', step >= 1 ? 'bg-gradient-to-r from-accent-start to-accent-mid' : 'bg-surface-2')} />
            <div className={cn('h-1 w-16 rounded-full transition-all duration-300', step >= 2 ? 'bg-gradient-to-r from-accent-start to-accent-mid' : 'bg-surface-2')} />
          </div>
          <p className="text-xs text-text-muted mt-2">Step {step} of 2</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl shadow-black/10"
        >
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary text-center mb-4">How will you use Convoia?</p>
              <div className="grid grid-cols-2 gap-4">
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setAccountType('individual'); setStep(2) }}
                  className={cn(
                    'p-6 rounded-2xl border-2 text-center transition-all',
                    accountType === 'individual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center">
                    <User size={28} className="text-primary" />
                  </div>
                  <p className="font-bold text-text-primary text-sm">Individual / Freelancer</p>
                  <p className="text-xs text-text-muted mt-1">Personal AI access, pay as you go</p>
                </motion.button>
                <motion.button
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { setAccountType('business'); setStep(2) }}
                  className={cn(
                    'p-6 rounded-2xl border-2 text-center transition-all',
                    accountType === 'business' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                >
                  <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-primary/15 to-accent-end/10 flex items-center justify-center">
                    <Building2 size={28} className="text-primary" />
                  </div>
                  <p className="font-bold text-text-primary text-sm">Team / Business</p>
                  <p className="text-xs text-text-muted mt-1">For companies and teams</p>
                </motion.button>
              </div>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {!inviteToken && (
                <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-2 transition-colors">
                  <ArrowLeft size={14} /> Back
                </button>
              )}

              {inviteToken && inviteOrg && (
                <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 mb-2 flex items-center gap-3">
                  <span className="text-lg">&#127881;</span>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Joining {decodeURIComponent(inviteOrg)}</p>
                    <p className="text-xs text-text-muted">You'll be added as {inviteRole}</p>
                  </div>
                </div>
              )}

              <Input label="Full name" placeholder="John Doe" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={errors.name} icon={<User size={16} />} />
              <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={errors.email} icon={<Mail size={16} />} />

              <div>
                <Input label="Password" type="password" placeholder="Create a password" value={form.password} onChange={(e) => updateField('password', e.target.value)} error={errors.password} icon={<Lock size={16} />} />
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

              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={agreed} onChange={(e) => { setAgreed(e.target.checked); setErrors((p) => ({ ...p, terms: '' })) }} className="mt-1 rounded border-border bg-surface text-primary focus:ring-primary" />
                <span className="text-sm text-text-secondary">
                  I agree to the <button type="button" className="text-primary hover:underline">Terms of Service</button> and <button type="button" className="text-primary hover:underline">Privacy Policy</button>
                </span>
              </label>
              {errors.terms && <p className="text-xs text-danger">{errors.terms}</p>}

              <Button type="submit" isLoading={isLoading} className="w-full">
                Create Account
                <ArrowRight size={16} />
              </Button>
            </form>
          )}
        </motion.div>

        <p className="text-center text-sm text-text-muted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary-hover font-semibold transition-colors">Sign in</Link>
        </p>
      </motion.div>
    </div>
  )
}

export default RegisterPage;
