import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2, Wallet, ArrowRight, Shield, Sparkles } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { formatCurrency } from '../lib/utils'
import { useWallet } from '../hooks/useWallet'
import api from '../lib/api'

interface SessionData {
  status: string
  amount: number
  walletCredited: boolean
  newBalance: number
  customerEmail: string | null
  createdAt: string
}

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const { refreshWallet } = useWallet()

  const [session, setSession] = useState<SessionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) {
      setError('No session ID found')
      setIsLoading(false)
      return
    }

    const verify = async () => {
      try {
        const res = await api.get(`/wallet/verify-session/${sessionId}`)
        setSession(res.data.data)
        await refreshWallet()
      } catch {
        setError('Unable to verify payment. If you were charged, your wallet will be credited automatically within a few minutes.')
      } finally {
        setIsLoading(false)
      }
    }

    verify()
  }, [sessionId, refreshWallet])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-full h-full bg-gradient-to-bl from-success/8 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-full h-full bg-gradient-to-tr from-primary/8 via-transparent to-transparent rounded-full blur-3xl" />
      </div>
      <div className="absolute inset-0 opacity-[0.015]" style={{
        backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
        backgroundSize: '32px 32px',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-surface/80 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl shadow-black/10 overflow-hidden">
          {/* Success header strip */}
          <div className="h-1.5 bg-gradient-to-r from-success via-emerald-400 to-success" />

          <div className="p-8">
            {isLoading ? (
              <div className="text-center py-8 space-y-4">
                <div className="w-16 h-16 mx-auto border-3 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-text-secondary text-sm">Verifying your payment...</p>
              </div>
            ) : error ? (
              <div className="text-center py-6 space-y-4">
                <div className="w-16 h-16 mx-auto bg-warning/10 rounded-full flex items-center justify-center">
                  <Shield size={32} className="text-warning" />
                </div>
                <h2 className="text-xl font-bold text-text-primary">Verification Pending</h2>
                <p className="text-sm text-text-muted max-w-sm mx-auto">{error}</p>
                <div className="flex gap-3 justify-center pt-4">
                  <Link to="/wallet">
                    <Button variant="secondary">Go to Wallet</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Handle unpaid sessions (user arrived at success URL without paying) */}
                {session?.status !== 'paid' ? (
                  <div className="text-center py-6 space-y-4">
                    <div className="w-16 h-16 mx-auto bg-warning/10 rounded-full flex items-center justify-center">
                      <Shield size={32} className="text-warning" />
                    </div>
                    <h2 className="text-xl font-bold text-text-primary">Payment Not Completed</h2>
                    <p className="text-sm text-text-muted">Your payment status is: <strong>{session?.status}</strong>. Please try again.</p>
                    <Link to="/wallet">
                      <Button>Go to Wallet</Button>
                    </Link>
                  </div>
                ) : <>
                {/* Animated checkmark */}
                <div className="text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                    className="relative w-20 h-20 mx-auto"
                  >
                    <div className="absolute inset-0 bg-success/20 rounded-full blur-xl animate-pulse" />
                    <div className="relative w-20 h-20 bg-gradient-to-br from-success to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-success/30">
                      <CheckCircle2 size={40} className="text-white" strokeWidth={2.5} />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <h1 className="text-2xl font-bold text-text-primary">Payment Successful!</h1>
                    <p className="text-text-muted text-sm mt-1">Your wallet has been topped up</p>
                  </motion.div>
                </div>

                {/* Amount card */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="bg-surface-2/80 border border-border/50 rounded-xl p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-text-muted">Amount Added</span>
                    <Sparkles size={16} className="text-success" />
                  </div>
                  <p className="text-3xl font-bold font-mono text-success">
                    +{formatCurrency(session?.amount ?? 0)}
                  </p>
                  <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Status</span>
                      <span className="text-success font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-success rounded-full" />
                        {session?.walletCredited ? 'Credited' : session?.status === 'paid' ? 'Confirmed' : session?.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">New Balance</span>
                      <span className="text-text-primary font-semibold font-mono">{formatCurrency(session?.newBalance ?? 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Transaction ID</span>
                      <span className="text-text-secondary font-mono">{sessionId?.slice(-12)}</span>
                    </div>
                  </div>
                </motion.div>

                {/* Security note */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                  className="flex items-center gap-2 text-xs text-text-muted justify-center"
                >
                  <Shield size={12} />
                  <span>Secured by Stripe — 256-bit encryption</span>
                </motion.div>

                {/* Actions */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="flex gap-3"
                >
                  <Link to="/wallet" className="flex-1">
                    <Button variant="secondary" className="w-full">
                      <Wallet size={16} />
                      View Wallet
                    </Button>
                  </Link>
                  <Link to="/chat" className="flex-1">
                    <Button className="w-full">
                      Start Chatting
                      <ArrowRight size={16} />
                    </Button>
                  </Link>
                </motion.div>
              </>}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default PaymentSuccessPage
