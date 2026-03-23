import { useState, useRef, useEffect, type KeyboardEvent, type ClipboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Zap, Mail, ArrowLeft, RefreshCw } from 'lucide-react'
import { ThemeToggle } from '../../components/shared/ThemeToggle'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../hooks/useToast'
import api from '../../lib/api'

export function VerifyEmailPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const email = localStorage.getItem('convoia_pending_email') || ''
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const [isLoading, setIsLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!email) {
      navigate('/register')
    }
    // Focus first input
    inputRefs.current[0]?.focus()
  }, [email, navigate])

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return // Only digits

    const newCode = [...code]
    newCode[index] = value.slice(-1) // Only last digit
    setCode(newCode)

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (newCode.every(d => d !== '') && newCode.join('').length === 6) {
      handleVerify(newCode.join(''))
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pastedData.length === 6) {
      const newCode = pastedData.split('')
      setCode(newCode)
      inputRefs.current[5]?.focus()
      handleVerify(pastedData)
    }
  }

  const handleVerify = async (verificationCode?: string) => {
    const codeStr = verificationCode || code.join('')
    if (codeStr.length !== 6) {
      toast.error('Please enter the full 6-digit code')
      return
    }

    try {
      setIsLoading(true)
      const res = await api.post('/auth/verify-email', { email, code: codeStr })
      const { token, refreshToken, user } = res.data.data

      localStorage.setItem('convoia_token', token)
      localStorage.setItem('convoia_refresh_token', refreshToken)
      localStorage.setItem('convoia_user', JSON.stringify(user))
      localStorage.removeItem('convoia_pending_email')

      toast.success('Email verified! Welcome to Convoia AI.')
      // Small delay so the user sees the success message
      setTimeout(() => {
        window.location.href = '/dashboard'
      }, 500)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Verification failed'
      toast.error(msg)
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    try {
      await api.post('/auth/resend-verification', { email })
      toast.success('New verification code sent! Check your email.')
      setResendCooldown(60)
      setCode(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resend code')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/8 via-transparent to-transparent rounded-full blur-3xl animate-gradient-shift" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-accent-end/8 via-transparent to-transparent rounded-full blur-3xl animate-gradient-shift" style={{ animationDelay: '3s' }} />
      </div>

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm relative z-10"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 mb-6 group">
            <motion.div whileHover={{ rotate: 15 }} className="relative">
              <div className="absolute inset-0 bg-primary/30 rounded-xl blur-lg" />
              <div className="relative bg-gradient-to-br from-accent-start to-accent-end p-2.5 rounded-xl">
                <Zap size={24} className="text-white" />
              </div>
            </motion.div>
            <span className="text-2xl font-bold bg-gradient-to-r from-accent-start to-accent-end bg-clip-text text-transparent">
              Convoia AI
            </span>
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Verify your email</h1>
          <p className="text-sm text-text-muted mt-2">
            We sent a 6-digit code to
          </p>
          <p className="text-sm font-semibold text-primary mt-1">{email}</p>
        </div>

        {/* Code Input */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl shadow-black/10"
        >
          {/* OTP Inputs */}
          <div className="flex justify-center gap-2.5 mb-6">
            {code.map((digit, index) => (
              <motion.input
                key={index}
                ref={(el) => { inputRefs.current[index] = el }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-surface transition-all duration-200 outline-none"
                style={{
                  borderColor: digit ? 'var(--color-primary)' : 'var(--color-border)',
                  color: 'var(--color-text-primary)',
                  caretColor: 'var(--color-primary)',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-primary-bg)' }}
                onBlur={(e) => { e.target.style.borderColor = digit ? 'var(--color-primary)' : 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
              />
            ))}
          </div>

          {/* Verify Button */}
          <Button
            onClick={() => handleVerify()}
            isLoading={isLoading}
            className="w-full"
            disabled={code.some(d => d === '')}
          >
            <Mail size={16} />
            Verify Email
          </Button>

          {/* Resend */}
          <div className="text-center mt-5">
            <p className="text-xs text-text-muted mb-2">Didn't receive the code?</p>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
              style={{
                color: resendCooldown > 0 ? 'var(--color-text-muted)' : 'var(--color-primary)',
                cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                background: 'none',
                border: 'none',
              }}
            >
              <RefreshCw size={14} />
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </div>

          {/* Dev hint */}
          <p className="text-center text-[11px] text-text-muted mt-4 opacity-60">
            Check your backend terminal for the code (logged in dev mode)
          </p>
        </motion.div>

        {/* Back to login */}
        <p className="text-center mt-6">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft size={14} /> Back to login
          </Link>
        </p>
      </motion.div>
    </div>
  )
}

export default VerifyEmailPage
