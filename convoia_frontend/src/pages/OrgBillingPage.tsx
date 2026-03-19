import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Shield, CreditCard, FileText, Zap, Check, Crown, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Modal } from '../components/ui/Modal'
import { useToast } from '../hooks/useToast'
import { formatNumber } from '../lib/utils'
import api from '../lib/api'

interface SubscriptionData {
  plan: string
  status: string
  monthlyTokenQuota: number
  tokensUsedThisMonth: number
  tokensRemaining: number
  percentUsed: number
  renewalDate: string | null
  stripeSubscriptionId: string | null
  planPrice: number
  planName: string
}

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 9,
    tokens: '500K',
    tokenCount: 500000,
    features: [
      '500,000 tokens/month',
      'All 16 AI models',
      'Usage analytics',
      'Email support',
      'API access',
    ],
    color: '#3B82F6',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    tokens: '2M',
    tokenCount: 2000000,
    features: [
      '2,000,000 tokens/month',
      'All models + priority access',
      'Team management (10 members)',
      'Budget controls',
      'Priority support',
      'Hourly sessions',
    ],
    color: '#7C3AED',
    popular: true,
  },
  {
    id: 'business',
    name: 'Business',
    price: 99,
    tokens: '10M',
    tokenCount: 10000000,
    features: [
      '10,000,000 tokens/month',
      'Unlimited team members',
      'Full org hierarchy',
      'Custom integrations',
      'SLA guarantee',
      'Dedicated support',
    ],
    color: '#F59E0B',
  },
]

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function OrgBillingPage() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sub, setSub] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)

  const fetchSubscription = async () => {
    try {
      const res = await api.get('/stripe/subscription')
      setSub(res.data.data)
    } catch {
      // No subscription yet — that's okay
      setSub({
        plan: 'free', status: 'inactive', monthlyTokenQuota: 0,
        tokensUsedThisMonth: 0, tokensRemaining: 0, percentUsed: 0,
        renewalDate: null, stripeSubscriptionId: null,
        planPrice: 0, planName: 'Free',
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSubscription()
  }, [])

  // Handle success/cancel URL params from Stripe redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      const plan = searchParams.get('plan') || ''
      toast.success(`Successfully upgraded to ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan!`)
      fetchSubscription()
      setSearchParams({}, { replace: true })
    }
    if (searchParams.get('cancelled') === 'true') {
      toast.info('Subscription setup was cancelled.')
      setSearchParams({}, { replace: true })
    }
  }, [searchParams])

  const handleUpgrade = async (planId: string) => {
    setUpgradeLoading(planId)
    try {
      const res = await api.post('/stripe/create-checkout', { plan: planId })
      const url = res.data.data?.checkoutUrl
      if (url) {
        window.location.href = url
      } else {
        toast.error('Failed to create checkout session')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to start checkout')
    } finally {
      setUpgradeLoading(null)
    }
  }

  const handleManageBilling = async () => {
    setPortalLoading(true)
    try {
      const res = await api.post('/stripe/create-portal')
      const url = res.data.data?.portalUrl
      if (url) {
        window.location.href = url
      } else {
        toast.error('Failed to open billing portal')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  const handleCancel = async () => {
    setCancelLoading(true)
    try {
      await api.post('/stripe/cancel-subscription')
      toast.success('Subscription will cancel at end of billing period')
      setShowCancelModal(false)
      fetchSubscription()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to cancel subscription')
    } finally {
      setCancelLoading(false)
    }
  }

  const currentPlan = sub?.plan || 'free'
  const planOrder = ['free', 'starter', 'pro', 'business']
  const currentPlanIndex = planOrder.indexOf(currentPlan)

  const getPlanBadgeColor = (plan: string) => {
    const colors: Record<string, string> = {
      free: '#6B7280', starter: '#3B82F6', pro: '#7C3AED', business: '#F59E0B',
    }
    return colors[plan] || '#6B7280'
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Billing</h2>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Billing</h2>

      {/* Current Plan Card */}
      <Card padding="lg" className="bg-gradient-to-r from-primary/10 to-indigo-600/10 border-primary/20">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={20} className="text-primary" />
              <h3 className="text-lg font-semibold text-text-primary">{sub?.planName || 'Free'} Plan</h3>
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: getPlanBadgeColor(currentPlan) + '20',
                  color: getPlanBadgeColor(currentPlan),
                  border: `1px solid ${getPlanBadgeColor(currentPlan)}40`,
                }}
              >
                {sub?.status === 'active' ? 'Active' : sub?.status === 'past_due' ? 'Past Due' : currentPlan === 'free' ? 'Free' : sub?.status}
              </span>
            </div>
            <p className="text-sm text-text-muted">
              {currentPlan === 'free'
                ? 'Upgrade to unlock more tokens and features'
                : `$${sub?.planPrice}/month ${sub?.renewalDate ? `\u00b7 Renews ${new Date(sub.renewalDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`}
            </p>
          </div>
          {currentPlan !== 'free' && (
            <Button variant="outline" onClick={handleManageBilling} isLoading={portalLoading}>
              <ExternalLink size={14} />
              Manage Billing
            </Button>
          )}
        </div>
      </Card>

      {/* Usage Stats */}
      {currentPlan !== 'free' && sub && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card padding="lg">
            <p className="text-sm text-text-muted mb-1">Token Usage</p>
            <p className="text-2xl font-semibold text-text-primary font-mono">
              {formatTokens(sub.tokensUsedThisMonth)}
              <span className="text-sm text-text-muted font-normal"> / {formatTokens(sub.monthlyTokenQuota)}</span>
            </p>
            <ProgressBar
              value={sub.tokensUsedThisMonth}
              max={sub.monthlyTokenQuota}
              size="sm"
              className="mt-2"
            />
            <p className="text-xs text-text-muted mt-1">{sub.percentUsed}% used</p>
          </Card>
          <Card padding="lg">
            <p className="text-sm text-text-muted mb-1">Tokens Remaining</p>
            <p className="text-2xl font-semibold text-emerald-400 font-mono">
              {formatTokens(sub.tokensRemaining)}
            </p>
            <p className="text-xs text-text-muted mt-1">resets on renewal</p>
          </Card>
          <Card padding="lg">
            <p className="text-sm text-text-muted mb-1">Monthly Cost</p>
            <p className="text-2xl font-semibold text-text-primary font-mono">
              ${sub.planPrice}
              <span className="text-sm text-text-muted font-normal">/mo</span>
            </p>
            <p className="text-xs text-text-muted mt-1">billed monthly</p>
          </Card>
        </div>
      )}

      {/* Token Usage Warning */}
      {sub && sub.percentUsed >= 80 && sub.percentUsed < 100 && (
        <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            You've used {sub.percentUsed}% of your monthly token quota. Consider upgrading for more capacity.
          </p>
        </div>
      )}

      {sub && sub.percentUsed >= 100 && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle size={18} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            You've exceeded your monthly token quota. Upgrade your plan to continue using AI models at full capacity.
          </p>
        </div>
      )}

      {/* Plan Cards */}
      {currentPlan !== 'business' && (
        <>
          <h3 className="text-lg font-semibold text-text-primary mt-8">
            {currentPlan === 'free' ? 'Choose a Plan' : 'Upgrade Your Plan'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLANS.map((plan) => {
              const planIndex = planOrder.indexOf(plan.id)
              const isCurrent = plan.id === currentPlan
              const isDowngrade = planIndex <= currentPlanIndex

              return (
                <div
                  key={plan.id}
                  className="relative rounded-2xl overflow-hidden"
                  style={{
                    border: isCurrent
                      ? `2px solid ${plan.color}`
                      : '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                  }}
                >
                  {plan.popular && (
                    <div
                      className="absolute top-0 left-0 right-0 text-center py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: plan.color }}
                    >
                      MOST POPULAR
                    </div>
                  )}
                  <div className={`p-6 ${plan.popular ? 'pt-9' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Crown size={16} style={{ color: plan.color }} />
                      <h4 className="text-sm font-semibold text-text-primary">{plan.name}</h4>
                      {isCurrent && <Badge size="sm" variant="success">Current</Badge>}
                    </div>

                    <div className="mt-4 mb-1">
                      <span
                        className="text-3xl font-bold font-mono"
                        style={{ color: plan.color }}
                      >
                        {plan.tokens}
                      </span>
                      <span className="text-sm text-text-muted ml-1">tokens/mo</span>
                    </div>

                    <p className="text-text-primary mb-5">
                      <span className="text-2xl font-bold">${plan.price}</span>
                      <span className="text-sm text-text-muted">/month</span>
                    </p>

                    <ul className="space-y-2 mb-6">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm text-text-secondary">
                          <Check size={14} className="mt-0.5 shrink-0" style={{ color: plan.color }} />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {isCurrent ? (
                      <Button variant="secondary" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : isDowngrade && currentPlan !== 'free' ? (
                      <Button variant="secondary" className="w-full" disabled>
                        Included in your plan
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleUpgrade(plan.id)}
                        isLoading={upgradeLoading === plan.id}
                        style={{
                          backgroundColor: plan.color,
                          borderColor: plan.color,
                        }}
                      >
                        Upgrade to {plan.name}
                        <ArrowRight size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Invoice History / Portal */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Invoice History</h3>
          {currentPlan !== 'free' && (
            <button
              onClick={handleManageBilling}
              className="text-xs text-primary hover:text-primary-hover flex items-center gap-1"
            >
              Open Billing Portal <ExternalLink size={12} />
            </button>
          )}
        </div>
        <div className="px-5 py-8 text-center text-text-muted text-sm">
          <FileText size={32} className="mx-auto mb-2 opacity-50" />
          {currentPlan === 'free'
            ? 'Subscribe to a plan to see invoices'
            : 'View and download invoices in the Stripe billing portal'}
        </div>
      </Card>

      {/* Cancel Subscription */}
      {currentPlan !== 'free' && sub?.status === 'active' && (
        <Card padding="lg" className="border-red-500/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-red-400">Cancel Subscription</h3>
              <p className="text-xs text-text-muted mt-1">
                Your plan will continue until the end of the current billing period.
              </p>
            </div>
            <Button variant="danger" onClick={() => setShowCancelModal(true)}>
              Cancel Plan
            </Button>
          </div>
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Subscription"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Are you sure you want to cancel your <strong>{sub?.planName}</strong> plan?
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-300">
              Your subscription will remain active until the end of the current billing period.
              After that, your organization will be downgraded to the Free tier.
            </p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
              Keep Plan
            </Button>
            <Button variant="danger" onClick={handleCancel} isLoading={cancelLoading}>
              Yes, Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default OrgBillingPage
