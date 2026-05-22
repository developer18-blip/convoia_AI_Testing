import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Activity, DollarSign, UserPlus, Mail, Copy, Check, X,
  MoreHorizontal, Shield, ArrowRight, Search, RefreshCw, Trash2, ChevronDown, Zap,
  ArrowDownCircle, Ban, AlertTriangle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { StatCard } from '../components/shared/StatCard'
import { Card } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Toggle } from '../components/ui/Toggle'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { useTokens } from '../contexts/TokenContext'
import { useModels } from '../hooks/useModels'
import { formatCurrency, formatNumber, formatTokens, formatDate, cn } from '../lib/utils'
import type { AIModel } from '../types'
import api from '../lib/api'

interface TeamMember {
  id: string
  name: string
  email: string
  avatar?: string | null
  role: string
  isActive: boolean
  joinedAt: string
  manager: string | null
  stats: {
    totalQueries: number
    monthlyTokens: number
    monthlyCost: number
  }
  budget: {
    monthlyCap: number
    currentUsage: number
    alertThreshold: number
    percentUsed: number
    autoDowngrade?: boolean
    fallbackModelId?: string | null
  } | null
}

interface OrgInvite {
  id: string
  email: string
  role: string
  status: string
  invitedBy: string
  acceptedBy: string | null
  expiresAt: string
  createdAt: string
}

interface InviteResult {
  id: string
  email: string
  role: string
  inviteUrl: string
  token: string
  expiresAt: string
  status: string
}

export function TeamPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { tokenBalance, formattedBalance, refresh: refreshTokens } = useTokens()
  const { models } = useModels()
  const isOwner = user?.role === 'org_owner' || user?.role === 'platform_admin'
  const canAssignTokens = isOwner || user?.role === 'manager'

  // Data state
  const [members, setMembers] = useState<TeamMember[]>([])
  const [invites, setInvites] = useState<OrgInvite[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  // Invite modal
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('employee')
  const [isInviting, setIsInviting] = useState(false)

  // Invite result modal
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Confirm dialog
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string; name: string } | null>(null)
  const [isActioning, setIsActioning] = useState(false)

  // Budget modal
  const [budgetTarget, setBudgetTarget] = useState<TeamMember | null>(null)
  const [budgetCap, setBudgetCap] = useState('')
  const [budgetAutoDowngrade, setBudgetAutoDowngrade] = useState(true)
  const [budgetFallbackId, setBudgetFallbackId] = useState('')
  const [isSavingBudget, setIsSavingBudget] = useState(false)

  // Open the budget modal pre-filled from a member's existing budget (or defaults).
  const openBudgetModal = (m: TeamMember) => {
    setBudgetTarget(m)
    setBudgetCap(String(m.budget?.monthlyCap || ''))
    setBudgetAutoDowngrade(m.budget?.autoDowngrade ?? true)
    setBudgetFallbackId(m.budget?.fallbackModelId ?? '')
  }

  // Role change modal
  const [roleChangeTarget, setRoleChangeTarget] = useState<TeamMember | null>(null)
  const [newRole, setNewRole] = useState('')

  // Section collapse state — persisted per-section in localStorage; default expanded
  const [invitesExpanded, setInvitesExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('convoia_settings_team_pendinginvites_expanded')
      return stored === null ? true : stored === 'true'
    } catch { return true }
  })
  const [membersExpanded, setMembersExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('convoia_settings_team_members_expanded')
      return stored === null ? true : stored === 'true'
    } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('convoia_settings_team_pendinginvites_expanded', String(invitesExpanded)) } catch {}
  }, [invitesExpanded])
  useEffect(() => {
    try { localStorage.setItem('convoia_settings_team_members_expanded', String(membersExpanded)) } catch {}
  }, [membersExpanded])
  // Assign tokens modal
  const [assignTokensTarget, setAssignTokensTarget] = useState<TeamMember | null>(null)
  const [assignTokensAmount, setAssignTokensAmount] = useState('')
  const [isAssigningTokens, setIsAssigningTokens] = useState(false)

  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const [membersRes, invitesRes] = await Promise.allSettled([
        api.get('/team/members'),
        api.get('/team/invites'),
      ])
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data.data || [])
      if (invitesRes.status === 'fulfilled') setInvites(invitesRes.value.data.data || [])
    } catch {
      setError('Failed to load team data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Filtered members — sorted alphabetically by name (A→Z, locale-aware, case-insensitive)
  const filteredMembers = useMemo(() => {
    let result = members
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      )
    }
    if (roleFilter !== 'all') {
      result = result.filter((m) => m.role === roleFilter)
    }
    return [...result].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    )
  }, [members, searchQuery, roleFilter])

  const pendingInvites = invites.filter((i) => i.status === 'pending')

  // Stats
  const totalSpend = members.reduce((s, m) => s + (m.stats?.monthlyCost || 0), 0)
  const activeToday = members.filter((m) => m.isActive).length

  // ── Handlers ────────────────────────────────

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    try {
      setIsInviting(true)
      const res = await api.post('/team/invite', { email: inviteEmail.trim().toLowerCase(), role: inviteRole })
      setInviteResult(res.data.data)
      setShowInvite(false)
      setInviteEmail('')
      toast.success('Invite created successfully')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create invite')
    } finally {
      setIsInviting(false)
    }
  }

  const handleCopyLink = async () => {
    if (!inviteResult?.inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteResult.inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      setIsActioning(true)
      await api.delete(`/team/invite/${inviteId}`)
      toast.success('Invite revoked')
      setConfirmAction(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to revoke invite')
    } finally {
      setIsActioning(false)
    }
  }

  const handleResendInvite = async (inviteId: string) => {
    try {
      await api.post(`/team/invite/${inviteId}/resend`)
      toast.success('Invite resent with extended expiry')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resend invite')
    }
  }

  const handleRemoveMember = async (userId: string, permanent = false) => {
    try {
      setIsActioning(true)
      await api.delete(`/team/members/${userId}${permanent ? '?permanent=true' : ''}`)
      toast.success(permanent ? 'Member permanently deleted' : 'Member removed from organization')
      setConfirmAction(null)
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to remove member')
    } finally {
      setIsActioning(false)
    }
  }

  const handleSaveBudget = async () => {
    if (!budgetTarget || !budgetCap) return
    try {
      setIsSavingBudget(true)
      await api.put('/budget/set', {
        userId: budgetTarget.id,
        monthlyCap: parseFloat(budgetCap),
        autoDowngrade: budgetAutoDowngrade,
        // Block mode (auto-downgrade off) clears any fallback; downgrade mode keeps it.
        fallbackModelId: budgetAutoDowngrade ? budgetFallbackId || null : null,
      })
      toast.success(`Budget updated for ${budgetTarget.name}`)
      setBudgetTarget(null)
      setBudgetCap('')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update budget')
    } finally {
      setIsSavingBudget(false)
    }
  }

  const handleChangeRole = async () => {
    if (!roleChangeTarget || !newRole) return
    try {
      await api.patch(`/team/members/${roleChangeTarget.id}/role`, { role: newRole })
      toast.success(`Role updated to ${newRole}`)
      setRoleChangeTarget(null)
      setNewRole('')
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change role')
    }
  }

  const handleAssignTokens = async () => {
    if (!assignTokensTarget || !assignTokensAmount) return
    const tokens = parseInt(assignTokensAmount)
    if (!tokens || tokens <= 0) {
      toast.error('Enter a positive token amount')
      return
    }
    if (tokens > tokenBalance) {
      toast.error(`Insufficient balance. You have ${formattedBalance}.`)
      return
    }
    try {
      setIsAssigningTokens(true)
      await api.post('/token-wallet/allocate', { toUserId: assignTokensTarget.id, tokens })
      toast.success(`${formatTokens(tokens)} tokens assigned to ${assignTokensTarget.name}`)
      setAssignTokensTarget(null)
      setAssignTokensAmount('')
      refreshTokens()
      fetchData()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to assign tokens')
    } finally {
      setIsAssigningTokens(false)
    }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={fetchData} />

  const roleOptions = user?.role === 'manager'
    ? [{ value: 'employee', label: 'Employee' }]
    : [{ value: 'employee', label: 'Employee' }, { value: 'manager', label: 'Manager' }]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-text-primary">Team Management</h2>
          <Badge size="sm">{members.length} members</Badge>
        </div>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus size={16} /> Invite Member
        </Button>
      </div>

      {/* Stats (org_owner only) */}
      {isOwner && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="Total Members" value={String(members.length)} icon={<Users size={20} />} />
          <StatCard title="Active Today" value={String(activeToday)} icon={<Activity size={20} />} />
          <StatCard title="Total Spend" value={formatCurrency(totalSpend)} subtitle="all time" icon={<DollarSign size={20} />} />
          <StatCard title="Avg / Member" value={formatCurrency(members.length ? totalSpend / members.length : 0)} subtitle="all time" icon={<DollarSign size={20} />} />
        </div>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card padding="none">
          <button
            type="button"
            onClick={() => setInvitesExpanded((v) => !v)}
            aria-expanded={invitesExpanded}
            aria-controls="pending-invites-content"
            className={`w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2/50 transition-colors text-left min-h-[44px] ${invitesExpanded ? 'border-b border-border' : ''}`}
          >
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              <h3 className="text-sm font-medium text-text-secondary">
                Pending Invites ({pendingInvites.length})
              </h3>
            </div>
            <ChevronDown
              size={16}
              className="text-text-muted transition-transform duration-150 ease-out"
              style={{ transform: invitesExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          <AnimatePresence initial={false}>
            {invitesExpanded && (
              <motion.div
                id="pending-invites-content"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="divide-y divide-border/50">
                  {pendingInvites.map((inv) => (
                    <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">{inv.email}</p>
                        <p className="text-xs text-text-muted">
                          <Badge size="sm" variant="primary">{inv.role}</Badge>
                          <span className="ml-2">Invited by {inv.invitedBy}</span>
                          <span className="ml-2 text-text-dim">
                            Expires {formatDate(inv.expiresAt)}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleResendInvite(inv.id)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/5 transition-colors"
                          title="Resend invite"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: 'revoke', id: inv.id, name: inv.email })}
                          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/5 transition-colors"
                          title="Revoke invite"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Members Table */}
      <Card padding="none">
        <div className={`flex items-center justify-between px-5 py-4 gap-3 flex-wrap ${membersExpanded ? 'border-b border-border' : ''}`}>
          <button
            type="button"
            onClick={() => setMembersExpanded((v) => !v)}
            aria-expanded={membersExpanded}
            aria-controls="team-members-content"
            className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity min-h-[44px]"
          >
            <Users size={16} className="text-primary" />
            <h3 className="text-sm font-medium text-text-secondary">
              Team Members ({members.length})
            </h3>
            <ChevronDown
              size={16}
              className="text-text-muted transition-transform duration-150 ease-out ml-1"
              style={{ transform: membersExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary w-48"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 text-sm bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="all">All Roles</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="org_owner">Owner</option>
            </select>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {membersExpanded && (
            <motion.div
              id="team-members-content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              {filteredMembers.length === 0 ? (
                <EmptyState
                  icon={<Users size={40} />}
                  title="No team members"
                  description={searchQuery ? 'No members match your search.' : 'Invite team members to get started.'}
                  action={!searchQuery ? { label: 'Invite', onClick: () => setShowInvite(true) } : undefined}
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
              <thead>
                <tr style={{ background: 'var(--color-primary)', color: 'white' }}>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ borderRadius: '8px 0 0 0' }}>Member</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Queries</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Tokens</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider">Budget</th>
                  {isOwner && (
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider">Cost</th>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider w-12" style={{ borderRadius: '0 8px 0 0' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => navigate(`/team/${m.id}`)}
                    className="border-b border-border/50 hover:bg-surface-2 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} src={m.avatar} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-text-primary">{m.name}</p>
                          <p className="text-xs text-text-muted">{m.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        size="sm"
                        variant={m.role === 'manager' ? 'info' : m.role === 'org_owner' ? 'primary' : 'default'}
                      >
                        {m.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">
                      {formatNumber(m.stats?.totalQueries || 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">
                      {formatTokens(m.stats?.monthlyTokens || 0)}
                    </td>
                    <td className="px-4 py-3 w-36">
                      {m.budget ? (
                        <div>
                          <ProgressBar value={m.budget.currentUsage} max={m.budget.monthlyCap} size="sm" />
                          <p className="text-[10px] text-text-muted mt-1">
                            {Math.round(m.budget.percentUsed)}% used
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openBudgetModal(m)
                          }}
                          className="text-xs text-primary hover:text-primary-hover"
                        >
                          Set Budget
                        </button>
                      )}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-sm font-mono text-primary text-right">
                        {formatCurrency(m.stats?.monthlyCost || 0)}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <MemberActions
                          member={m}
                          isOwner={isOwner}
                          onViewProfile={() => navigate(`/team/${m.id}`)}
                          onSetBudget={() => openBudgetModal(m)}
                          onAssignTokens={
                            canAssignTokens && m.id !== user?.id && m.role !== 'org_owner'
                              ? () => { setAssignTokensTarget(m); setAssignTokensAmount('') }
                              : undefined
                          }
                          onChangeRole={() => { setRoleChangeTarget(m); setNewRole(m.role) }}
                          onRemove={() => setConfirmAction({ type: 'remove', id: m.id, name: m.name })}
                          onDelete={isOwner ? () => setConfirmAction({ type: 'delete', id: m.id, name: m.name }) : undefined}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* ── INVITE MODAL ────────────────────────── */}
      <Modal isOpen={showInvite} onClose={() => setShowInvite(false)} title="Invite Team Member">
        <div className="space-y-4">
          <Input
            label="Email address"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@company.com"
            icon={<Mail size={16} />}
          />
          <Select
            label="Role"
            options={roleOptions}
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} isLoading={isInviting}>
              Send Invite
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── INVITE RESULT MODAL ─────────────────── */}
      <Modal
        isOpen={!!inviteResult}
        onClose={() => { setInviteResult(null); setCopied(false) }}
        title="Invite Created!"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Share this link with <strong className="text-text-primary">{inviteResult?.email}</strong>.
            They can register with this link and will automatically join your organization as{' '}
            <strong className="text-primary">{inviteResult?.role}</strong>.
          </p>

          {/* Invite URL display */}
          <div className="bg-background border border-border rounded-lg p-3 font-mono text-xs text-primary break-all">
            {inviteResult?.inviteUrl}
          </div>

          <Button
            onClick={handleCopyLink}
            variant={copied ? 'secondary' : 'primary'}
            className="w-full"
          >
            {copied ? (
              <>
                <Check size={16} /> Copied!
              </>
            ) : (
              <>
                <Copy size={16} /> Copy Invite Link
              </>
            )}
          </Button>

          <p className="text-xs text-text-dim text-center">
            Link expires in 7 days ({inviteResult?.expiresAt ? formatDate(inviteResult.expiresAt) : ''})
          </p>

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { setInviteResult(null); setCopied(false) }}
          >
            Done
          </Button>
        </div>
      </Modal>

      {/* ── BUDGET MODAL ────────────────────────── */}
      <Modal
        isOpen={!!budgetTarget}
        onClose={() => setBudgetTarget(null)}
        title={`Set Budget for ${budgetTarget?.name ?? ''}`}
      >
        <div className="space-y-4">
          {budgetTarget?.budget && (
            <div className="mb-2">
              <p className="text-xs text-text-muted mb-2">Current usage</p>
              <ProgressBar
                value={budgetTarget.budget.currentUsage}
                max={budgetTarget.budget.monthlyCap}
                size="md"
              />
              <p className="text-xs text-text-muted mt-1">
                {formatCurrency(budgetTarget.budget.currentUsage)} / {formatCurrency(budgetTarget.budget.monthlyCap)}
              </p>
            </div>
          )}
          <Input
            label="Monthly Cap ($)"
            type="number"
            value={budgetCap}
            onChange={(e) => setBudgetCap(e.target.value)}
            placeholder="e.g. 50"
          />

          {/* Auto-downgrade toggle */}
          <div className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface-2/40 px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">Auto-downgrade at cap</p>
              <p className="text-xs text-text-muted mt-0.5">
                Switch to a cheaper model instead of blocking access.
              </p>
            </div>
            <Toggle checked={budgetAutoDowngrade} onChange={setBudgetAutoDowngrade} label="Auto-downgrade at cap" />
          </div>

          {/* Fallback model — only relevant in downgrade mode */}
          {budgetAutoDowngrade && (
            <FallbackModelPicker
              models={models}
              value={budgetFallbackId}
              onChange={setBudgetFallbackId}
            />
          )}

          {/* Live "what happens at the cap" explainer */}
          <BudgetOutcomeNote
            cap={parseFloat(budgetCap) || 0}
            autoDowngrade={budgetAutoDowngrade}
            fallbackName={models.find((m) => m.id === budgetFallbackId)?.name}
          />

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setBudgetTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveBudget} isLoading={isSavingBudget}>Save Budget</Button>
          </div>
        </div>
      </Modal>

      {/* ── ASSIGN TOKENS MODAL ─────────────────── */}
      <Modal
        isOpen={!!assignTokensTarget}
        onClose={() => setAssignTokensTarget(null)}
        title={`Assign Tokens to ${assignTokensTarget?.name ?? ''}`}
      >
        <div className="space-y-4">
          <div className="bg-surface-2 border border-border rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-text-muted">Your available balance</p>
              <p className="text-lg font-mono text-primary">{formattedBalance}</p>
            </div>
            <Zap size={24} className="text-primary opacity-60" />
          </div>
          <Input
            label="Tokens to assign"
            type="number"
            value={assignTokensAmount}
            onChange={(e) => setAssignTokensAmount(e.target.value)}
            placeholder="e.g. 100000"
          />
          <p className="text-xs text-text-muted">
            Tokens are transferred from your wallet to {assignTokensTarget?.name ?? 'this member'}'s allocation.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setAssignTokensTarget(null)}>Cancel</Button>
            <Button onClick={handleAssignTokens} isLoading={isAssigningTokens}>Assign Tokens</Button>
          </div>
        </div>
      </Modal>

      {/* ── ROLE CHANGE MODAL ───────────────────── */}
      <Modal
        isOpen={!!roleChangeTarget}
        onClose={() => setRoleChangeTarget(null)}
        title={`Change Role for ${roleChangeTarget?.name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Current role: <Badge size="sm" variant="primary">{roleChangeTarget?.role?.replace('_', ' ')}</Badge>
          </p>
          <Select
            label="New Role"
            options={[
              { value: 'employee', label: 'Employee' },
              { value: 'manager', label: 'Manager' },
            ]}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setRoleChangeTarget(null)}>Cancel</Button>
            <Button onClick={handleChangeRole}>Update Role</Button>
          </div>
        </div>
      </Modal>

      {/* ── CONFIRM DIALOG ──────────────────────── */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'revoke' ? 'Revoke Invite' : confirmAction?.type === 'delete' ? 'Delete Member Permanently' : 'Remove Member'}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            {confirmAction?.type === 'revoke'
              ? `Are you sure you want to revoke the invite for ${confirmAction?.name}?`
              : confirmAction?.type === 'delete'
              ? `Are you sure you want to PERMANENTLY DELETE ${confirmAction?.name}? This will remove their account and ALL data (usage logs, conversations, tokens, wallet) from the database. This action CANNOT be undone.`
              : `Are you sure you want to remove ${confirmAction?.name} from the organization? They will lose access immediately but their account will remain.`}
          </p>
          {confirmAction?.type === 'delete' && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: '#EF4444' }}>
              This permanently deletes the user, their conversations, usage history, tokens, and wallet data.
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>Cancel</Button>
            {confirmAction?.type === 'remove' && (
              <Button
                variant="danger"
                isLoading={isActioning}
                onClick={() => handleRemoveMember(confirmAction.id, false)}
              >
                Remove from Org
              </Button>
            )}
            <Button
              variant="danger"
              isLoading={isActioning}
              onClick={() => {
                if (confirmAction?.type === 'revoke') handleRevokeInvite(confirmAction.id)
                else if (confirmAction?.type === 'remove') handleRemoveMember(confirmAction.id, false)
                else if (confirmAction?.type === 'delete') handleRemoveMember(confirmAction.id, true)
              }}
            >
              {confirmAction?.type === 'revoke' ? 'Revoke' : confirmAction?.type === 'delete' ? 'Delete Permanently' : 'Remove'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ── Member Actions Dropdown ────────────────────
function MemberActions({
  member,
  isOwner,
  onViewProfile,
  onSetBudget,
  onAssignTokens,
  onChangeRole,
  onRemove,
  onDelete,
}: {
  member: TeamMember
  isOwner: boolean
  onViewProfile: () => void
  onSetBudget: () => void
  onAssignTokens?: () => void
  onChangeRole: () => void
  onRemove: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const [dropUp, setDropUp] = useState(false)

  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceBelow < 250)
      setMenuPos({
        top: spaceBelow < 250 ? rect.top : rect.bottom + 4,
        left: rect.right - 192, // 192 = w-48 (12rem)
      })
    }
    setOpen(!open)
  }

  return (
    <div className="relative" ref={btnRef}>
      <button
        onClick={handleOpen}
        className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed w-48 bg-surface border border-border rounded-lg shadow-xl z-50 py-1"
            style={{ top: dropUp ? undefined : menuPos.top, bottom: dropUp ? (window.innerHeight - menuPos.top) : undefined, left: menuPos.left }}>
            <button
              onClick={() => { onViewProfile(); setOpen(false) }}
              className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
            >
              <ArrowRight size={14} /> View Profile
            </button>
            <button
              onClick={() => { onSetBudget(); setOpen(false) }}
              className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
            >
              <Shield size={14} /> Set Budget
            </button>
            {onAssignTokens && (
              <button
                onClick={() => { onAssignTokens(); setOpen(false) }}
                className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
              >
                <Zap size={14} /> Assign Tokens
              </button>
            )}
            {isOwner && member.role !== 'org_owner' && (
              <button
                onClick={() => { onChangeRole(); setOpen(false) }}
                className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
              >
                <Users size={14} /> Change Role
              </button>
            )}
            {member.role !== 'org_owner' && (
              <>
                <button
                  onClick={() => { onRemove(); setOpen(false) }}
                  className="w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface-2 transition-colors flex items-center gap-2"
                >
                  <Trash2 size={14} /> Remove from Org
                </button>
                {isOwner && onDelete && (
                  <button
                    onClick={() => { onDelete(); setOpen(false) }}
                    className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/5 transition-colors flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Delete Permanently
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Live "what happens at the cap" explainer ───
function BudgetOutcomeNote({
  cap,
  autoDowngrade,
  fallbackName,
}: {
  cap: number
  autoDowngrade: boolean
  fallbackName?: string
}) {
  let icon: React.ReactNode
  let text: string
  let tint: { bg: string; border: string; color: string }

  if (cap <= 0) {
    icon = <DollarSign size={16} />
    text = 'Set a monthly cap to start controlling this member’s spend.'
    tint = { bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.20)', color: 'var(--color-text-muted)' }
  } else if (!autoDowngrade) {
    icon = <Ban size={16} />
    text = `At ${formatCurrency(cap)}, new requests are blocked until the budget resets on the 1st.`
    tint = { bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.22)', color: '#EF4444' }
  } else if (fallbackName) {
    icon = <ArrowDownCircle size={16} />
    text = `At ${formatCurrency(cap)}, requests switch to ${fallbackName} for the rest of the month.`
    tint = { bg: 'rgba(20,184,166,0.10)', border: 'rgba(20,184,166,0.25)', color: '#2DD4BF' }
  } else {
    icon = <AlertTriangle size={16} />
    text = 'Pick a fallback model — without one, reaching the cap won’t change anything and usage continues at full cost.'
    tint = { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', color: '#F59E0B' }
  }

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
      style={{ background: tint.bg, border: `1px solid ${tint.border}` }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: tint.color }}>{icon}</span>
      <p className="text-xs leading-relaxed" style={{ color: tint.color }}>{text}</p>
    </div>
  )
}

// ── Fallback model picker — custom dropdown replacing the native <select>,
// which rendered a giant OS list that opened over the whole screen. This one
// opens downward, stays compact with an internal scroll, and is searchable. ──
const PROVIDER_DOT: Record<string, string> = {
  openai: '#10A37F',
  anthropic: '#D97757',
  google: '#4285F4',
  xai: '#9CA3AF',
  mistral: '#FF7000',
  deepseek: '#4D6BFE',
  perplexity: '#20808D',
  groq: '#F55036',
}

function ProviderDot({ provider }: { provider: string }) {
  const color = PROVIDER_DOT[provider?.toLowerCase()] || 'var(--color-text-muted)'
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
}

function FallbackModelPicker({
  models,
  value,
  onChange,
}: {
  models: AIModel[]
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Active models, cheapest first — a fallback should be the economical choice.
  const sorted = useMemo(
    () =>
      [...models]
        .filter((m) => m.isActive)
        .sort(
          (a, b) =>
            a.inputTokenPrice + a.outputTokenPrice - (b.inputTokenPrice + b.outputTokenPrice),
        ),
    [models],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(
      (m) => m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q),
    )
  }, [sorted, query])

  const selected = models.find((m) => m.id === value)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-medium text-text-secondary mb-1.5">Fallback model</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-surface border border-border rounded-xl px-3 py-2.5 text-sm hover:border-border/80 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <ProviderDot provider={selected.provider} />
            <span className="truncate text-text-primary">{selected.name}</span>
            <span className="text-xs text-text-muted shrink-0">· {selected.provider}</span>
          </span>
        ) : (
          <span className="text-text-muted">Select a fallback model…</span>
        )}
        <ChevronDown
          size={16}
          className={cn('text-text-muted transition-transform duration-200 shrink-0', open && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-full mt-2 z-50 bg-surface border border-border rounded-xl shadow-2xl shadow-black/40 overflow-hidden"
          >
            <div className="p-2 border-b border-border/60">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search models…"
                  className="w-full pl-8 pr-2 py-2 text-sm bg-surface-2 border border-border rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-muted text-center">No models match.</p>
              ) : (
                filtered.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id)
                      setOpen(false)
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                      m.id === value
                        ? 'bg-primary/10 text-text-primary'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                    )}
                  >
                    <ProviderDot provider={m.provider} />
                    <span className="truncate flex-1">{m.name}</span>
                    {i === 0 && !query && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: 'rgba(20,184,166,0.15)', color: '#2DD4BF' }}
                      >
                        cheapest
                      </span>
                    )}
                    <span className="text-xs text-text-muted shrink-0">{m.provider}</span>
                    {m.id === value && <Check size={14} className="text-primary shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default TeamPage
