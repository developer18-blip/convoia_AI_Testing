import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, Activity, DollarSign, UserPlus, Mail, Copy, Check, X,
  MoreHorizontal, Shield, ArrowRight, Search, RefreshCw, Trash2,
} from 'lucide-react'
import { StatCard } from '../components/shared/StatCard'
import { Card } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { ProgressBar } from '../components/ui/ProgressBar'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { formatCurrency, formatNumber, formatTokens } from '../lib/utils'
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
  const isOwner = user?.role === 'org_owner' || user?.role === 'platform_admin'

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
  const [isSavingBudget, setIsSavingBudget] = useState(false)

  // Role change modal
  const [roleChangeTarget, setRoleChangeTarget] = useState<TeamMember | null>(null)
  const [newRole, setNewRole] = useState('')

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

  // Filtered members
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
    return result
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
      await api.put('/budget/set', { userId: budgetTarget.id, monthlyCap: parseFloat(budgetCap) })
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
          <StatCard title="Total Spend" value={formatCurrency(totalSpend)} subtitle="this month" icon={<DollarSign size={20} />} />
          <StatCard title="Avg / Member" value={formatCurrency(members.length ? totalSpend / members.length : 0)} subtitle="this month" icon={<DollarSign size={20} />} />
        </div>
      )}

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <Card padding="none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-primary" />
              <h3 className="text-sm font-medium text-text-secondary">
                Pending Invites ({pendingInvites.length})
              </h3>
            </div>
          </div>
          <div className="divide-y divide-border/50">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{inv.email}</p>
                  <p className="text-xs text-text-muted">
                    <Badge size="sm" variant="primary">{inv.role}</Badge>
                    <span className="ml-2">Invited by {inv.invitedBy}</span>
                    <span className="ml-2 text-text-dim">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
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
        </Card>
      )}

      {/* Members Table */}
      <Card padding="none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-text-secondary">Team Members</h3>
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
                            setBudgetTarget(m)
                            setBudgetCap('')
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
                          onSetBudget={() => { setBudgetTarget(m); setBudgetCap(String(m.budget?.monthlyCap || '')) }}
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
            Link expires in 7 days ({new Date(inviteResult?.expiresAt ?? '').toLocaleDateString()})
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
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setBudgetTarget(null)}>Cancel</Button>
            <Button onClick={handleSaveBudget} isLoading={isSavingBudget}>Save Budget</Button>
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
  onChangeRole,
  onRemove,
  onDelete,
}: {
  member: TeamMember
  isOwner: boolean
  onViewProfile: () => void
  onSetBudget: () => void
  onChangeRole: () => void
  onRemove: () => void
  onDelete?: () => void
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLDivElement>(null)
  const [dropUp, setDropUp] = useState(false)

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      setDropUp(spaceBelow < 250)
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
          <div className={`absolute right-0 ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'} w-48 bg-surface border border-border rounded-lg shadow-xl z-50 py-1`}>
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

export default TeamPage
