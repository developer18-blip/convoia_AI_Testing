import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DollarSign, Users, Zap, ArrowRight, Coins, BarChart3, UserPlus, ShoppingCart, Send, X } from 'lucide-react'
import { StatCard } from '../../../components/shared/StatCard'
import { Card } from '../../../components/ui/Card'
import { Avatar } from '../../../components/ui/Avatar'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { ProgressBar } from '../../../components/ui/ProgressBar'
import { AreaChart } from '../../../components/charts/AreaChart'
import { formatCurrency, formatTokens, getGreeting } from '../../../lib/utils'
import { useToast } from '../../../hooks/useToast'
import { useTokens } from '../../../contexts/TokenContext'
import api from '../../../lib/api'
import type { DashboardStats } from '../../../types'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

interface OrgMember {
  id: string
  name: string
  email?: string
  avatar?: string | null
  role: string
  queries: number
  cost: number
}

interface OwnerViewProps {
  stats: DashboardStats
  userName: string
  orgName: string
  plan: string
}

export function OwnerView({ stats, userName, orgName }: OwnerViewProps) {
  const navigate = useNavigate()
  const toast = useToast()
  const { tokenBalance, formattedBalance, totalPurchased, totalUsed, refresh: refreshTokens } = useTokens()
  const [members, setMembers] = useState<OrgMember[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Assign tokens modal
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [assignTo, setAssignTo] = useState('')
  const [assignAmount, setAssignAmount] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      api.get('/org/team'),
    ]).then(([membersRes]) => {
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data?.data || [])
    }).finally(() => setIsLoading(false))
  }, [])

  const totalSpend = Number(stats?.thisMonth?.cost ?? 0) || 0
  const lastMonthCost = Number(stats?.lastMonth?.cost ?? 0) || 0
  const costTrend = lastMonthCost > 0 ? ((totalSpend - lastMonthCost) / lastMonthCost) * 100 : 0
  const activeMembers = members.length

  // poolAvailable kept for assign modal max check
  const poolAvailable = tokenBalance

  const handleAssignTokens = async () => {
    if (!assignTo || !assignAmount) {
      toast.error('Select a member and enter token amount')
      return
    }
    setAssignLoading(true)
    try {
      await api.post('/token-wallet/allocate', {
        toUserId: assignTo,
        tokens: parseInt(assignAmount),
      })
      toast.success('Tokens assigned successfully')
      setShowAssignModal(false)
      setAssignTo('')
      setAssignAmount('')
      refreshTokens() // refresh balance from context
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to assign tokens')
    } finally {
      setAssignLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
          border: '1px solid var(--color-border)',
          borderLeft: '4px solid var(--color-accent-start)',
          borderRadius: '12px',
          padding: '20px 24px',
        }}
      >
        <h2 className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          {getGreeting()}, {userName.split(' ')[0]}
        </h2>
        <p className="text-sm mt-1 flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
          {orgName} <Badge size="sm" variant="primary">Owner</Badge>
        </p>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Org Spend"
          value={formatCurrency(totalSpend)}
          subtitle="this month"
          icon={<DollarSign size={20} />}
          trend={costTrend}
        />
        <StatCard
          title="Team Members"
          value={`${activeMembers}`}
          subtitle={`${activeMembers} active`}
          icon={<Users size={20} />}
        />
        <StatCard
          title="My Tokens"
          value={formattedBalance}
          subtitle={totalPurchased > 0 ? `${fmtTokens(totalUsed)} used` : 'Buy tokens to start'}
          icon={<Zap size={20} />}
        />
        <StatCard
          title="Total Purchased"
          value={fmtTokens(totalPurchased)}
          subtitle={totalUsed > 0 ? `${fmtTokens(totalUsed)} used` : 'lifetime'}
          icon={<Coins size={20} />}
        />
      </div>

      {/* Token Balance Section */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-2) 100%)',
          border: '1px solid var(--color-border)',
          borderTop: '3px solid var(--color-accent-start)',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div style={{ marginBottom: '16px' }}>
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)', marginBottom: '14px' }}>My Token Balance</h3>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {members.length > 0 && tokenBalance > 0 && (
              <button
                onClick={() => setShowAssignModal(true)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '10px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                  color: '#10B981', border: '1.5px solid rgba(16,185,129,0.3)',
                  background: 'rgba(16,185,129,0.06)', cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '160px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.12)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(16,185,129,0.06)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'; e.currentTarget.style.transform = 'translateY(0)' }}
              >
                <Send size={15} /> Assign Tokens
              </button>
            )}
            <button
              onClick={() => navigate('/tokens/buy')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '10px 24px', borderRadius: '12px', fontSize: '14px', fontWeight: 600,
                color: 'white', border: 'none',
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))',
                cursor: 'pointer', transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(124,58,237,0.25)',
                minWidth: '160px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(124,58,237,0.35)' }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(124,58,237,0.25)' }}
            >
              <ShoppingCart size={15} /> Buy Tokens
            </button>
          </div>
        </div>

        {tokenBalance > 0 || totalPurchased > 0 ? (
          <>
            <ProgressBar value={totalUsed} max={totalPurchased || 1} size="lg" />
            <div className="grid grid-cols-3 gap-4 mt-4 text-center">
              <div>
                <p className="text-lg font-semibold font-mono" style={{ color: 'var(--color-text-primary)' }}>{fmtTokens(totalUsed)}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Used</p>
              </div>
              <div>
                <p className="text-lg font-semibold font-mono" style={{ color: 'var(--color-warning)' }}>{fmtTokens(totalPurchased)}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Purchased</p>
              </div>
              <div>
                <p className="text-lg font-semibold font-mono" style={{ color: 'var(--color-success)' }}>{formattedBalance}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-muted)' }}>Available</p>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Zap size={32} className="mx-auto mb-3 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-muted)' }}>No tokens yet</p>
            <Button onClick={() => navigate('/tokens/buy')}>
              <ShoppingCart size={14} /> Buy Your First Tokens
            </Button>
          </div>
        )}
      </div>

      {/* Team Overview */}
      <Card padding="none">
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <h3 className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Top Members by Usage</h3>
          <button
            onClick={() => navigate('/team')}
            className="text-xs flex items-center gap-1 transition-colors"
            style={{ color: 'var(--color-primary)' }}
          >
            View Full Team <ArrowRight size={12} />
          </button>
        </div>
        <div>
          {isLoading ? (
            <div className="space-y-1 animate-pulse p-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded" style={{ background: 'var(--color-surface-2)' }} />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>No members found</div>
          ) : (
            [...members]
              .sort((a, b) => (Number(b.cost) || 0) - (Number(a.cost) || 0))
              .slice(0, 5)
              .map((m, i) => (
                <div
                  key={m.id}
                  onClick={() => navigate(`/team/${m.id}`)}
                  className="px-5 py-3 flex items-center gap-4 transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-surface-2)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <span className="text-sm font-mono w-6" style={{ color: 'var(--color-text-muted)' }}>#{i + 1}</span>
                  <Avatar name={m.name} src={m.avatar} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{m.name}</p>
                    <Badge size="sm">{m.role?.replace('_', ' ')}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono" style={{ color: 'var(--color-text-primary)' }}>{formatTokens(Number(m.queries) || 0)} queries</p>
                    <p className="text-xs font-mono" style={{ color: 'var(--color-primary)' }}>{formatCurrency(Number(m.cost) || 0)}</p>
                  </div>
                </div>
              ))
          )}
        </div>
      </Card>

      {/* 30-Day Spend Chart */}
      <Card padding="lg">
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--color-text-secondary)' }}>30-Day Organization Spend</h3>
        <AreaChart
          data={stats?.dailyUsage ?? []}
          xKey="date"
          yKey="cost"
          height={220}
          formatY={(v: number) => `$${(Number(v) || 0).toFixed(2)}`}
        />
      </Card>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate('/tokens/buy')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <ShoppingCart size={16} /> Buy Tokens
        </button>
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            background: 'rgba(16,185,129,0.12)',
            color: 'var(--color-success)',
            border: '1px solid rgba(16,185,129,0.25)',
          }}
        >
          <Send size={16} /> Assign Tokens
        </button>
        <button
          onClick={() => navigate('/team')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <UserPlus size={16} /> Invite Member
        </button>
        <button
          onClick={() => navigate('/org/analytics')}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
          style={{
            background: 'var(--color-primary-light)',
            color: 'var(--color-primary)',
            border: '1px solid var(--color-border)',
          }}
        >
          <BarChart3 size={16} /> View Analytics
        </button>
      </div>

      {/* ASSIGN TOKENS MODAL */}
      {showAssignModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '440px' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ color: 'var(--color-text-primary)', fontSize: '18px', fontWeight: 600, margin: 0 }}>Assign Tokens</h2>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Available info */}
            <div style={{ background: 'var(--color-surface-2)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', display: 'flex', justifyContent: 'space-between', border: '1px solid var(--color-border)' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Available in pool</span>
              <span style={{ color: 'var(--color-success)', fontWeight: 600, fontFamily: 'monospace' }}>{fmtTokens(poolAvailable)}</span>
            </div>

            {/* Select member */}
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none', marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">Select team member...</option>
              {members.filter(m => m.id !== undefined).map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.role?.replace('_', ' ')})</option>
              ))}
            </select>

            {/* Token amount */}
            <input
              type="number"
              placeholder="Number of tokens (e.g. 100000)"
              value={assignAmount}
              onChange={(e) => setAssignAmount(e.target.value)}
              min={1000}
              max={poolAvailable}
              style={{
                width: '100%', padding: '10px 14px', backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                borderRadius: '8px', color: 'var(--color-text-primary)', fontSize: '14px', outline: 'none', marginBottom: '20px',
                boxSizing: 'border-box',
              }}
            />

            {/* Quick assign amounts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
              {[50_000, 100_000, 500_000, 1_000_000].filter(a => a <= poolAvailable).map(amt => (
                <button
                  key={amt}
                  onClick={() => setAssignAmount(String(amt))}
                  style={{
                    padding: '8px 4px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer',
                    border: assignAmount === String(amt) ? '2px solid var(--color-success)' : '1px solid var(--color-border)',
                    backgroundColor: assignAmount === String(amt) ? 'rgba(16,185,129,0.12)' : 'transparent',
                    color: assignAmount === String(amt) ? 'var(--color-success)' : 'var(--color-text-muted)',
                  }}
                >
                  {fmtTokens(amt)}
                </button>
              ))}
            </div>

            <Button
              className="w-full"
              onClick={handleAssignTokens}
              isLoading={assignLoading}
              disabled={!assignTo || !assignAmount || parseInt(assignAmount) <= 0 || parseInt(assignAmount) > poolAvailable}
              style={{ backgroundColor: 'var(--color-success)' }}
            >
              <Send size={14} /> Assign {assignAmount ? fmtTokens(parseInt(assignAmount) || 0) : '0'} Tokens
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
