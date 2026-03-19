import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { XCircle, ArrowLeft, RefreshCw, Shield, MessageCircle } from 'lucide-react'
import { Button } from '../components/ui/Button'

export function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-full h-full bg-gradient-to-bl from-warning/6 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-full h-full bg-gradient-to-tr from-primary/6 via-transparent to-transparent rounded-full blur-3xl" />
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
          {/* Warning header strip */}
          <div className="h-1.5 bg-gradient-to-r from-text-muted/30 via-text-muted/50 to-text-muted/30" />

          <div className="p-8">
            <div className="space-y-6">
              {/* Icon */}
              <div className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                  className="relative w-20 h-20 mx-auto"
                >
                  <div className="absolute inset-0 bg-text-muted/10 rounded-full blur-xl" />
                  <div className="relative w-20 h-20 bg-surface-2 border-2 border-border rounded-full flex items-center justify-center">
                    <XCircle size={40} className="text-text-muted" strokeWidth={1.5} />
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <h1 className="text-2xl font-bold text-text-primary">Payment Cancelled</h1>
                  <p className="text-text-muted text-sm mt-2 max-w-xs mx-auto">
                    No worries — you haven't been charged. Your wallet balance remains unchanged.
                  </p>
                </motion.div>
              </div>

              {/* Info card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="bg-surface-2/60 border border-border/50 rounded-xl p-4 space-y-3"
              >
                <p className="text-sm font-medium text-text-secondary">What happened?</p>
                <ul className="space-y-2 text-sm text-text-muted">
                  <li className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 bg-text-muted/50 rounded-full mt-1.5 shrink-0" />
                    The checkout was cancelled or the session expired
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 bg-text-muted/50 rounded-full mt-1.5 shrink-0" />
                    No payment has been processed
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-1.5 h-1.5 bg-text-muted/50 rounded-full mt-1.5 shrink-0" />
                    You can try again anytime from your wallet
                  </li>
                </ul>
              </motion.div>

              {/* Security note */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex items-center gap-2 text-xs text-text-muted justify-center"
              >
                <Shield size={12} />
                <span>Your payment details were not saved</span>
              </motion.div>

              {/* Actions */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="space-y-3"
              >
                <div className="flex gap-3">
                  <Link to="/wallet" className="flex-1">
                    <Button variant="secondary" className="w-full">
                      <ArrowLeft size={16} />
                      Back to Wallet
                    </Button>
                  </Link>
                  <Link to="/wallet" className="flex-1" onClick={() => {
                    setTimeout(() => window.dispatchEvent(new CustomEvent('wallet:topup')), 100)
                  }}>
                    <Button className="w-full">
                      <RefreshCw size={16} />
                      Try Again
                    </Button>
                  </Link>
                </div>

                <Link to="/chat" className="block">
                  <Button variant="ghost" className="w-full text-text-muted hover:text-text-primary">
                    <MessageCircle size={16} />
                    Continue to Chat
                  </Button>
                </Link>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default PaymentCancelPage
