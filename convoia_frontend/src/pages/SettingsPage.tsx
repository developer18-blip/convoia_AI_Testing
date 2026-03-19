import { useState, type FormEvent } from 'react'
import { Lock, Save, LogOut } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { Tabs } from '../components/ui/Tabs'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Toggle } from '../components/ui/Toggle'
import { cn, passwordStrength } from '../lib/utils'
import api from '../lib/api'

export function SettingsPage() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('profile')

  const [name, setName] = useState(user?.name || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  const [showCostEstimates, setShowCostEstimates] = useState(true)
  const [showTokenCounts, setShowTokenCounts] = useState(true)
  const [autoSave, setAutoSave] = useState(true)

  const handleSaveProfile = async () => {
    try {
      setIsSavingProfile(true)
      await api.put('/auth/profile', { name })
      updateUser({ name })
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') } finally { setIsSavingProfile(false) }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!currentPassword) errors.current = 'Required'
    if (!newPassword) errors.new = 'Required'
    else if (newPassword.length < 8) errors.new = 'Minimum 8 characters'
    if (newPassword !== confirmPassword) errors.confirm = 'Passwords do not match'
    setPasswordErrors(errors)
    if (Object.keys(errors).length) return

    try {
      setIsChangingPassword(true)
      await api.put('/auth/change-password', { currentPassword, newPassword })
      toast.success('Password changed')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message || 'Failed to change password'
      toast.error(msg)
    } finally { setIsChangingPassword(false) }
  }

  const strength = passwordStrength(newPassword)

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-text-primary">Settings</h2>

      <Tabs tabs={[
        { id: 'profile', label: 'Profile' },
        { id: 'security', label: 'Security' },
        { id: 'preferences', label: 'Preferences' },
        { id: 'appearance', label: 'Appearance' },
        ...(user?.role === 'org_owner' ? [{ id: 'organization', label: 'Organization' }] : []),
      ]} activeTab={tab} onChange={setTab} />

      {tab === 'profile' && (
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-6">
            {user && <Avatar name={user.name} size="lg" />}
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{user?.name}</h3>
              <p className="text-sm text-text-muted">{user?.email}</p>
            </div>
          </div>
          <div className="space-y-4">
            <Input label="Display Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Email" value={user?.email || ''} disabled />
            <Button onClick={handleSaveProfile} isLoading={isSavingProfile}><Save size={16} /> Save</Button>
          </div>
        </Card>
      )}

      {tab === 'security' && (
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Change Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input label="Current Password" type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setPasswordErrors((p) => ({ ...p, current: '' })) }} error={passwordErrors.current} icon={<Lock size={16} />} />
            <div>
              <Input label="New Password" type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setPasswordErrors((p) => ({ ...p, new: '' })) }} error={passwordErrors.new} icon={<Lock size={16} />} />
              {newPassword && (
                <div className="mt-2 flex gap-1">
                  {[1,2,3,4,5].map((i) => <div key={i} className={cn('h-1 flex-1 rounded-full', i <= strength.score ? strength.color : 'bg-surface-2')} />)}
                </div>
              )}
            </div>
            <Input label="Confirm New Password" type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setPasswordErrors((p) => ({ ...p, confirm: '' })) }} error={passwordErrors.confirm} icon={<Lock size={16} />} />
            <Button type="submit" isLoading={isChangingPassword}><Lock size={16} /> Change Password</Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Session Info</h4>
            <div className="space-y-2 text-sm text-text-secondary">
              <p>Logged in as <span className="text-text-primary">{user?.email}</span> <Badge size="sm" variant="success">Verified</Badge></p>
              <p>Role: <Badge size="sm" variant="primary">{user?.role?.replace('_', ' ')}</Badge></p>
            </div>
            <Button variant="danger" size="sm" className="mt-4" onClick={() => { localStorage.clear(); window.location.href = '/login' }}>
              <LogOut size={14} /> Logout All Devices
            </Button>
          </div>
        </Card>
      )}

      {tab === 'preferences' && (
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Preferences</h3>
          <div className="space-y-6">
            <div>
              <label className="text-sm text-text-secondary mb-2 block">Send Message</label>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium border border-primary/20">Enter to send</button>
                <button className="px-4 py-2 bg-surface-2 text-text-secondary rounded-lg text-sm font-medium border border-border hover:border-primary/40">Ctrl+Enter to send</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Show cost estimates</p>
                <p className="text-xs text-text-muted">Display estimated costs while composing messages</p>
              </div>
              <Toggle checked={showCostEstimates} onChange={setShowCostEstimates} label="Show cost estimates" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Show token counts</p>
                <p className="text-xs text-text-muted">Display token usage in message details</p>
              </div>
              <Toggle checked={showTokenCounts} onChange={setShowTokenCounts} label="Show token counts" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Auto-save conversations</p>
                <p className="text-xs text-text-muted">Automatically save chat history to localStorage</p>
              </div>
              <Toggle checked={autoSave} onChange={setAutoSave} label="Auto-save conversations" />
            </div>
          </div>
        </Card>
      )}

      {tab === 'appearance' && (
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Appearance</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-text-secondary mb-2 block">Sidebar</label>
              <div className="flex gap-3">
                <button className="px-4 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium border border-primary/20">Expanded</button>
                <button className="px-4 py-2 bg-surface-2 text-text-secondary rounded-lg text-sm font-medium border border-border hover:border-primary/40">Compact</button>
              </div>
            </div>
            <div>
              <label className="text-sm text-text-secondary mb-2 block">Theme</label>
              <p className="text-sm text-text-muted">Dark mode is always on for optimal viewing.</p>
            </div>
          </div>
        </Card>
      )}

      {tab === 'organization' && user?.role === 'org_owner' && (
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-text-primary mb-4">Organization Settings</h3>
          <div className="space-y-4">
            <Input label="Organization Name" value={user.organization?.name || ''} onChange={() => {}} />
            <Select label="Industry" value={user.organization?.industry || ''} onChange={() => {}} options={[
              { value: '', label: 'Select' }, { value: 'legal', label: 'Legal' }, { value: 'healthcare', label: 'Healthcare' },
              { value: 'finance', label: 'Finance' }, { value: 'hr', label: 'HR' }, { value: 'marketing', label: 'Marketing' },
            ]} />
            <Button><Save size={16} /> Save</Button>
          </div>
        </Card>
      )}
    </div>
  )
}




export default SettingsPage;
