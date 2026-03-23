import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Mail, Lock } from 'lucide-react'
import { GoogleLogin } from '@react-oauth/google'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'

export function LoginPage() {
  const { login, googleLogin } = useAuth()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('inviteToken')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)

  const validate = () => {
    const e: Record<string, string> = {}
    if (!email) e.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address'
    if (!password) e.password = 'Password is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setIsLoading(true)
      await login(email, password)

      // If there's an invite token, accept it after login
      if (inviteToken) {
        try {
          const res = await api.post('/team/accept-invite', { token: inviteToken })
          toast.success(res.data.message || 'Joined organization successfully!')
        } catch (inviteErr: any) {
          toast.error(inviteErr.response?.data?.message || 'Failed to accept invite')
        }
      } else {
        toast.success('Welcome back!')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Login failed'
      toast.error(msg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/8 via-transparent to-transparent rounded-full blur-3xl animate-gradient-shift" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-end/8 via-transparent to-transparent rounded-full blur-3xl animate-gradient-shift" style={{ animationDelay: '3s' }} />
        <div className="absolute top-1/4 left-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse-glow" />
      </div>

      {/* Grid pattern overlay */}
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
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6 group">
            <motion.div
              whileHover={{ rotate: 15 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-primary/30 rounded-xl blur-lg group-hover:blur-xl transition-all" />
              <div className="relative bg-gradient-to-br from-accent-start to-accent-end p-2.5 rounded-xl">
                <Zap size={24} className="text-white" />
              </div>
            </motion.div>
            <span className="text-2xl font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">
              Convoia AI
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
          <p className="text-sm text-text-muted mt-1.5">Sign in to continue to your workspace</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl shadow-black/10"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })) }}
              error={errors.email}
              icon={<Mail size={16} />}
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })) }}
              error={errors.password}
              icon={<Lock size={16} />}
            />

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer group">
                <div className="relative">
                  <input type="checkbox" className="peer sr-only" />
                  <div className="w-4 h-4 border border-border rounded bg-surface peer-checked:bg-primary peer-checked:border-primary transition-all" />
                  <svg className="absolute top-0.5 left-0.5 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                Remember me
              </label>
              <button type="button" className="text-sm text-primary hover:text-primary-hover transition-colors">
                Forgot password?
              </button>
            </div>

            <Button type="submit" isLoading={isLoading} className="w-full">
              Sign In
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface/80 px-3 text-text-muted">or continue with</span>
              </div>
            </div>
            <div className="flex justify-center mt-4">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (!credentialResponse.credential) return
                  try {
                    await googleLogin(credentialResponse.credential)
                    toast.success('Welcome!')
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message || 'Google sign-in failed')
                  }
                }}
                onError={() => toast.error('Google sign-in failed')}
                theme="filled_black"
                shape="pill"
                size="large"
                width="320"
                text="continue_with"
              />
            </div>
          </div>
        </motion.div>

        <p className="text-center text-sm text-text-muted mt-6">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="text-primary hover:text-primary-hover font-semibold transition-colors">Sign up</Link>
        </p>
        <div className="flex justify-center gap-4 mt-3">
          <Link to="/privacy" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-xs text-text-muted hover:text-text-secondary transition-colors">Terms of Service</Link>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginPage;
