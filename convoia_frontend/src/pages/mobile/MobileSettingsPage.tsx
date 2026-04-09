import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, LogOut, Camera, Lock, Eye, EyeOff,
  Users, Building2, DollarSign, BarChart3, Shield,
  Key, FileText, Activity, Briefcase, Coins, UserPlus,
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import { Avatar } from '../../components/ui/Avatar'
import { passwordStrength } from '../../lib/utils'
import api from '../../lib/api'

export function MobileSettingsPage() {
  const { user, updateUser, logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const role = user?.role || 'employee'
  const hasOrg = !!user?.organizationId
  const isAdmin = role === 'platform_admin'
  const isOwner = role === 'org_owner'
  const isManager = role === 'manager'

  // Profile editing
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user?.name || '')
  const [savingProfile, setSavingProfile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Password section
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showNewPw, setShowNewPw] = useState(false)
  const [changingPw, setChangingPw] = useState(false)

  const strength = passwordStrength(newPw)
  const strengthColors = ['#EF4444', '#EF4444', '#F59E0B', '#F59E0B', '#10B981', '#10B981']

  const handleSaveProfile = async () => {
    try {
      setSavingProfile(true)
      await api.put('/auth/profile', { name })
      updateUser({ name })
      toast.success('Profile updated')
      setEditingName(false)
    } catch { toast.error('Failed to update') } finally { setSavingProfile(false) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return }
    try {
      setUploadingAvatar(true)
      const fd = new FormData()
      fd.append('avatar', file)
      const res = await api.post('/auth/avatar/upload', fd)
      updateUser({ avatar: res.data?.data?.avatarUrl })
      toast.success('Avatar updated')
    } catch { toast.error('Upload failed') } finally { setUploadingAvatar(false) }
  }

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) { toast.error('Fill all fields'); return }
    if (newPw.length < 8) { toast.error('Min 8 characters'); return }
    if (strength.score < 4) { toast.error('Password too weak'); return }
    if (newPw !== confirmPw) { toast.error('Passwords don\'t match'); return }
    try {
      setChangingPw(true)
      await api.put('/auth/change-password', { currentPassword: currentPw, newPassword: newPw })
      toast.success('Password changed')
      setShowPasswordSection(false)
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change password')
    } finally { setChangingPw(false) }
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '100px' }}>
      {/* Profile Card */}
      <div style={{
        background: 'var(--color-surface)', borderRadius: '20px', padding: '24px',
        border: '1px solid var(--color-border)', textAlign: 'center',
      }}>
        {/* Avatar */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: '16px' }}>
          <Avatar name={user?.name || 'User'} src={user?.avatar} size="lg" />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}
            style={{
              position: 'absolute', bottom: '-4px', right: '-4px', width: '32px', height: '32px',
              borderRadius: '50%', background: '#7C3AED', border: '3px solid var(--color-surface)',
              color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
            }}>
            <Camera size={14} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleAvatarUpload} />
        </div>

        {/* Name */}
        {editingName ? (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom: '4px' }}>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              style={{
                padding: '8px 12px', borderRadius: '10px', border: '1.5px solid #7C3AED',
                background: 'var(--color-surface-2)', color: 'var(--color-text-primary)',
                fontSize: '16px', fontWeight: 700, textAlign: 'center', width: '180px', outline: 'none',
              }} />
            <button onClick={handleSaveProfile} disabled={savingProfile}
              style={{ padding: '8px 14px', borderRadius: '10px', border: 'none', background: '#7C3AED', color: 'white', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              {savingProfile ? '...' : 'Save'}
            </button>
          </div>
        ) : (
          <p onClick={() => setEditingName(true)}
            style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)', margin: '0 0 4px', cursor: 'pointer' }}>
            {user?.name || 'User'}
          </p>
        )}
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 8px' }}>{user?.email}</p>

        {/* Role badge */}
        <span style={{
          display: 'inline-block', padding: '4px 12px', borderRadius: '10px', fontSize: '11px', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.05em',
          background: isAdmin ? 'rgba(239,68,68,0.1)' : isOwner ? 'rgba(124,58,237,0.1)' : isManager ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
          color: isAdmin ? '#EF4444' : isOwner ? '#7C3AED' : isManager ? '#10B981' : '#3B82F6',
        }}>
          {isAdmin ? 'Platform Admin' : isOwner ? 'Org Owner' : isManager ? 'Manager' : hasOrg ? 'Employee' : 'Personal'}
        </span>
      </div>

      {/* ─── ADMIN NAVIGATION ─── */}
      {isAdmin && (
        <NavSection title="Admin">
          <NavItem icon={<Building2 size={18} />} label="Organizations" sub="Manage all orgs" onClick={() => navigate('/admin/orgs')} />
          <NavItem icon={<Users size={18} />} label="Users" sub="All platform users" onClick={() => navigate('/admin/users')} />
          <NavItem icon={<DollarSign size={18} />} label="Revenue" sub="Platform revenue" onClick={() => navigate('/admin/revenue')} />
          <NavItem icon={<BarChart3 size={18} />} label="Full Analytics" sub="Detailed analytics" onClick={() => navigate('/admin/analytics')} />
          <NavItem icon={<Shield size={18} />} label="AI Models" sub="Model configuration" onClick={() => navigate('/admin/models')} />
          <NavItem icon={<Coins size={18} />} label="Send Tokens" sub="Grant tokens to users" onClick={() => navigate('/admin/send-tokens')} />
          <NavItem icon={<UserPlus size={18} />} label="Create Account" sub="New user account" onClick={() => navigate('/admin/create-account')} last />
        </NavSection>
      )}

      {/* ─── ORG OWNER NAVIGATION ─── */}
      {isOwner && (
        <NavSection title="Organization">
          <NavItem icon={<Building2 size={18} />} label="Org Settings" sub="Name, industry, config" onClick={() => navigate('/org')} />
          <NavItem icon={<DollarSign size={18} />} label="Billing" sub="Payments & invoices" onClick={() => navigate('/org/billing')} />
          <NavItem icon={<BarChart3 size={18} />} label="Org Analytics" sub="Usage analytics" onClick={() => navigate('/org/analytics')} />
          <NavItem icon={<Users size={18} />} label="Team" sub="Manage members" onClick={() => navigate('/team')} />
          <NavItem icon={<Briefcase size={18} />} label="Budgets" sub="Token budgets" onClick={() => navigate('/budgets')} last />
        </NavSection>
      )}

      {/* ─── MANAGER NAVIGATION ─── */}
      {isManager && (
        <NavSection title="Management">
          <NavItem icon={<Users size={18} />} label="Team" sub="Manage your team" onClick={() => navigate('/team')} />
          <NavItem icon={<Briefcase size={18} />} label="Budgets" sub="Token allocations" onClick={() => navigate('/budgets')} last />
        </NavSection>
      )}

      {/* ─── GENERAL NAVIGATION — ALL ROLES ─── */}
      <NavSection title="Account">
        <NavItem icon={<Activity size={18} />} label="Usage" sub="Usage statistics" onClick={() => navigate('/usage')} />
        {!hasOrg && <NavItem icon={<Key size={18} />} label="API Keys" sub="Manage API access" onClick={() => navigate('/api-keys')} />}
        {!hasOrg && <NavItem icon={<FileText size={18} />} label="API Docs" sub="Documentation" onClick={() => navigate('/api-docs')} />}
        {hasOrg && <NavItem icon={<Briefcase size={18} />} label="My Budget" sub="Your token budget" onClick={() => navigate('/budget')} />}
        <NavItem icon={<FileText size={18} />} label="Tasks" sub="Your tasks" onClick={() => navigate('/tasks')} last />
      </NavSection>

      {/* ─── SECURITY ─── */}
      <NavSection title="Security">
        <NavItem icon={<Lock size={18} />} label="Change Password" sub="Update your password"
          onClick={() => setShowPasswordSection(!showPasswordSection)} last />
      </NavSection>

      {showPasswordSection && (
        <div style={{ background: 'var(--color-surface)', borderRadius: '16px', padding: '20px', border: '1px solid var(--color-border)' }}>
          <InputField label="Current password" type="password" value={currentPw} onChange={setCurrentPw} placeholder="Enter current password" />
          <div style={{ marginTop: '12px', position: 'relative' }}>
            <InputField label="New password" type={showNewPw ? 'text' : 'password'} value={newPw} onChange={setNewPw} placeholder="Min 8 characters" />
            <button onClick={() => setShowNewPw(!showNewPw)}
              style={{ position: 'absolute', right: '14px', top: '36px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px' }}>
              {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {newPw && (
            <div style={{ marginTop: '6px' }}>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', background: i <= strength.score ? strengthColors[strength.score] : 'var(--color-surface-2)' }} />
                ))}
              </div>
              <p style={{ fontSize: '11px', marginTop: '4px', fontWeight: 600, color: strengthColors[strength.score] }}>{strength.label}</p>
            </div>
          )}
          <div style={{ marginTop: '12px' }}>
            <InputField label="Confirm password" type="password" value={confirmPw} onChange={setConfirmPw} placeholder="Confirm new password" />
          </div>
          <button onClick={handleChangePassword} disabled={changingPw}
            style={{
              width: '100%', marginTop: '16px', padding: '14px', borderRadius: '14px', border: 'none',
              background: '#7C3AED', color: 'white', fontSize: '14px', fontWeight: 700,
              cursor: changingPw ? 'wait' : 'pointer', opacity: changingPw ? 0.7 : 1,
            }}>
            {changingPw ? 'Changing...' : 'Update Password'}
          </button>
        </div>
      )}

      {/* ─── LOGOUT ─── */}
      <button onClick={handleLogout}
        style={{
          width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.2)',
          background: 'rgba(239,68,68,0.06)', color: '#EF4444', fontSize: '15px', fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>
        <LogOut size={18} />
        Log Out
      </button>
    </div>
  )
}

/* ─── Helper Components ─── */

function NavSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', margin: '0 0 10px', paddingLeft: '4px' }}>
        {title}
      </h2>
      <div style={{ background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function NavItem({ icon, label, sub, onClick, last }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; last?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        width: '100%', padding: '14px 16px', border: 'none', background: 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: last ? 'none' : '1px solid var(--color-border)',
      }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--color-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>{label}</p>
        <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{sub}</p>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    </button>
  )
}

function InputField({ label, type = 'text', value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: '12px', fontSize: '14px',
          border: '1.5px solid var(--color-border)', background: 'var(--color-surface-2)',
          color: 'var(--color-text-primary)', outline: 'none',
        }} />
    </div>
  )
}

export default MobileSettingsPage
