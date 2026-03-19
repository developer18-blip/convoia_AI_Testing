import { useState, useEffect } from 'react'
import { Wallet, CreditCard, Lock, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useToast } from '../../hooks/useToast'
import { useWallet } from '../../hooks/useWallet'
import { cn, formatCurrency } from '../../lib/utils'
import api from '../../lib/api'

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined
const stripePromise = PUBLISHABLE_KEY ? loadStripe(PUBLISHABLE_KEY) : null

const PRESETS = [5, 10, 25, 50, 100]

type PaymentMethod = 'checkout' | 'inline'

// ─── Inner checkout form (rendered inside <Elements>) ───────────────────────
function InlineCheckoutForm({
  amount,
  onSuccess,
  onCancel,
}: {
  amount: number
  onSuccess: () => void
  onCancel: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const toast = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setIsLoading(true)
    setError('')

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/payment/success` },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message ?? 'Payment failed. Please try again.')
      setIsLoading(false)
      return
    }

    if (result.paymentIntent?.status !== 'succeeded') {
      setError('Unexpected payment status. Please contact support.')
      setIsLoading(false)
      return
    }

    try {
      await api.post('/wallet/topup', {
        amount,
        stripePaymentId: result.paymentIntent.id,
        description: `Wallet top-up via Stripe`,
      })
      toast.success(`$${amount.toFixed(2)} added to your wallet!`)
      onSuccess()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Payment processed but wallet credit failed. Contact support with your payment ID: ' + result.paymentIntent.id)
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <div className="p-4 bg-surface-2 rounded-lg border border-border">
        <PaymentElement />
      </div>

      {error && <p className="text-danger text-sm">{error}</p>}

      <div className="flex gap-3 justify-end pt-1">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={isLoading}>
          Back
        </Button>
        <Button type="submit" isLoading={isLoading} disabled={!stripe || isLoading}>
          <Lock size={14} />
          Pay {formatCurrency(amount)}
        </Button>
      </div>

      <p className="text-xs text-text-muted text-center flex items-center justify-center gap-1.5">
        <Lock size={11} /> Secured by Stripe
      </p>
    </form>
  )
}

// ─── Main modal ─────────────────────────────────────────────────────────────
export function WalletTopUpModal() {
  const { showTopUp, setShowTopUp, refreshWallet, wallet } = useWallet()
  const toast = useToast()
  const [selected, setSelected] = useState<number | null>(10)
  const [customAmount, setCustomAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('checkout')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')
  const [succeeded, setSucceeded] = useState(false)

  const amount = customAmount ? parseFloat(customAmount) : selected
  const currentBalance = Number(wallet?.balance ?? 0) || 0
  const newBalance = currentBalance + (amount && !isNaN(amount) ? amount : 0)

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!showTopUp) {
      setClientSecret(null)
      setSucceeded(false)
      setError('')
      setSelected(10)
      setCustomAmount('')
      setPaymentMethod('checkout')
    }
  }, [showTopUp])

  const validateAmount = (): boolean => {
    if (!amount || isNaN(amount)) { setError('Please select or enter an amount'); return false }
    if (amount < 1) { setError('Minimum top up is $1.00'); return false }
    if (amount > 1000) { setError('Maximum top up is $1,000.00'); return false }
    return true
  }

  // Stripe Checkout Session — redirects to Stripe-hosted page (most secure)
  const handleStripeCheckout = async () => {
    if (!validateAmount()) return

    try {
      setIsCreating(true)
      setError('')
      const res = await api.post('/wallet/create-checkout-session', { amount })
      const { url } = res.data.data
      if (url) {
        window.location.href = url
      } else {
        setError('Failed to create checkout session. Please try again.')
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to initialize payment. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  // Inline Elements flow — embedded card form
  const handleInlinePayment = async () => {
    if (!validateAmount()) return

    try {
      setIsCreating(true)
      setError('')
      const res = await api.post('/wallet/create-payment-intent', { amount })
      setClientSecret(res.data.data.clientSecret)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg ?? 'Failed to initialize payment. Please try again.')
    } finally {
      setIsCreating(false)
    }
  }

  const handleProceedToPayment = () => {
    if (paymentMethod === 'checkout') {
      handleStripeCheckout()
    } else {
      handleInlinePayment()
    }
  }

  const handlePaymentSuccess = async () => {
    setSucceeded(true)
    await refreshWallet()
    toast.success(`${formatCurrency(amount ?? 0)} added to your wallet!`)
    setTimeout(() => setShowTopUp(false), 2000)
  }

  const handleClose = () => setShowTopUp(false)

  const stripeOptions = clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: 'night' as const,
          variables: { colorPrimary: '#6366f1', borderRadius: '8px' },
        },
      }
    : undefined

  return (
    <Modal isOpen={showTopUp} onClose={handleClose} title="Top Up Wallet" size="md">
      <div className="space-y-5">
        {/* ── Success screen ── */}
        {succeeded ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 size={48} className="text-success mx-auto" />
            <p className="text-lg font-semibold text-text-primary">Payment Successful!</p>
            <p className="text-sm text-text-muted">
              {formatCurrency(amount ?? 0)} has been added to your wallet.
            </p>
          </div>
        ) : clientSecret ? (
          /* ── Inline Stripe checkout (Elements) ── */
          stripePromise === null ? (
            <div className="flex items-center gap-3 p-4 bg-danger/10 border border-danger/20 rounded-lg">
              <AlertTriangle size={18} className="text-danger shrink-0" />
              <p className="text-sm text-danger">Stripe is not configured. Add <code>VITE_STRIPE_PUBLISHABLE_KEY</code> to your .env and restart the dev server.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 bg-surface-2 rounded-lg border border-border">
                <span className="text-sm text-text-muted">Paying</span>
                <span className="text-lg font-bold font-mono text-text-primary">{formatCurrency(amount ?? 0)}</span>
              </div>
              <Elements stripe={stripePromise} options={stripeOptions}>
                <InlineCheckoutForm
                  amount={amount ?? 0}
                  onSuccess={handlePaymentSuccess}
                  onCancel={() => setClientSecret(null)}
                />
              </Elements>
            </>
          )
        ) : (
          /* ── Amount selection ── */
          <>
            {/* Current balance */}
            <div className="text-center p-4 bg-surface-2 rounded-lg">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Wallet size={18} className="text-primary" />
                <p className="text-xs text-text-muted">Current Balance</p>
              </div>
              <p className="text-2xl font-bold font-mono text-text-primary">{formatCurrency(currentBalance)}</p>
            </div>

            {/* Preset amounts */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-3">Select amount</p>
              <div className="grid grid-cols-5 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => { setSelected(preset); setCustomAmount(''); setError('') }}
                    className={cn(
                      'py-2.5 rounded-lg text-sm font-medium transition-all border',
                      selected === preset && !customAmount
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface-2 text-text-secondary border-border hover:border-primary/40'
                    )}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom amount */}
            <Input
              label="Custom amount"
              type="number"
              placeholder="Enter amount"
              value={customAmount}
              onChange={(e) => { setCustomAmount(e.target.value); setSelected(null); setError('') }}
              icon={<span className="text-text-muted text-sm">$</span>}
            />

            {/* Payment method toggle */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">Payment method</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('checkout')}
                  className={cn(
                    'p-3 rounded-lg text-sm font-medium transition-all border text-left',
                    paymentMethod === 'checkout'
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-surface-2 text-text-secondary border-border hover:border-primary/20'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <ExternalLink size={14} />
                    <span className="font-semibold">Stripe Checkout</span>
                  </div>
                  <p className="text-xs text-text-muted">Secure hosted page</p>
                </button>
                <button
                  onClick={() => setPaymentMethod('inline')}
                  className={cn(
                    'p-3 rounded-lg text-sm font-medium transition-all border text-left',
                    paymentMethod === 'inline'
                      ? 'bg-primary/10 text-primary border-primary/40'
                      : 'bg-surface-2 text-text-secondary border-border hover:border-primary/20'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard size={14} />
                    <span className="font-semibold">Pay Inline</span>
                  </div>
                  <p className="text-xs text-text-muted">Enter card here</p>
                </button>
              </div>
            </div>

            {error && <p className="text-danger text-sm">{error}</p>}

            {/* Preview */}
            {amount && amount > 0 && !isNaN(amount) && (
              <div className="bg-surface-2 rounded-lg p-3 text-sm border border-border">
                <div className="flex justify-between">
                  <span className="text-text-muted">Adding</span>
                  <span className="text-success font-medium">+{formatCurrency(amount)}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-text-muted">New balance</span>
                  <span className="text-text-primary font-semibold font-mono">{formatCurrency(newBalance)}</span>
                </div>
              </div>
            )}

            {/* Stripe badge */}
            <div className="p-3 bg-surface-2 rounded-lg border border-border">
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <Lock size={12} />
                Secure payment via Stripe — 256-bit encryption
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleProceedToPayment}
                isLoading={isCreating}
                disabled={!amount || isNaN(amount) || amount < 1}
              >
                {paymentMethod === 'checkout' ? (
                  <>
                    <ExternalLink size={14} />
                    Continue to Stripe
                  </>
                ) : (
                  'Continue to Payment'
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
