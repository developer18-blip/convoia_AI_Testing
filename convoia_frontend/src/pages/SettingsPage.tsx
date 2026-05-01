import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Lock, Save, LogOut, Upload, Camera, Check, Monitor, Sun, Moon, Mail, Bell, Smartphone, Link2, Globe, ArrowRight } from 'lucide-react'
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
import { useTheme } from '../hooks/useTheme'
import { useSidebar } from '../contexts/SidebarContext'
import { useModels } from '../hooks/useModels'
import { cn, passwordStrength } from '../lib/utils'
import api from '../lib/api'

const BUILT_IN_AVATARS = Array.from({ length: 12 }, (_, i) => ({
  id: `avatar-${i + 1}`,
  src: `/avatars/avatar-${i + 1}.svg`,
}))

// ─── localStorage helpers ────────────────────────────────────────────
const LS = {
  defaultModel: 'convoia_settings_default_model',
  sendOn: 'convoia_settings_send_on',
  showCostEstimates: 'convoia_settings_show_cost_estimates',
  showTokenCounts: 'convoia_settings_show_token_counts',
  autoSave: 'convoia_settings_auto_save',
  notifyTransactional: 'convoia_settings_notify_transactional',
  notifyMarketing: 'convoia_settings_notify_marketing',
  notifySecurity: 'convoia_settings_notify_security',
  notifyWeeklyDigest: 'convoia_settings_notify_weekly_digest',
  timezone: 'convoia_settings_timezone',
  language: 'convoia_settings_language',
  fontSize: 'convoia_settings_font_size',
  reducedMotion: 'convoia_settings_reduced_motion',
} as const

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return raw === 'true'
  } catch { return fallback }
}
function writeBool(key: string, value: boolean) {
  try { localStorage.setItem(key, String(value)) } catch { /* ignore */ }
}
function readStr(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writeStr(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

const TIMEZONES = [
  { value: '', label: 'Auto-detect from browser' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris / Berlin / Madrid' },
  { value: 'Asia/Kolkata', label: 'Mumbai / Delhi' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Asia/Shanghai', label: 'Beijing / Shanghai' },
  { value: 'Australia/Sydney', label: 'Sydney' },
]

function describeCurrentDevice(): { device: string; browser: string } {
  if (typeof navigator === 'undefined') return { device: 'This device', browser: 'Browser' }
  const ua = navigator.userAgent
  const isMobile = /iPhone|iPad|Android/.test(ua)
  const isMac = /Macintosh|Mac OS X/.test(ua)
  const isWindows = /Windows/.test(ua)
  const isLinux = /Linux/.test(ua) && !/Android/.test(ua)
  const device = isMobile
    ? (/iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : 'Android device')
    : isMac ? 'Mac'
    : isWindows ? 'Windows PC'
    : isLinux ? 'Linux'
    : 'This device'
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser'
  return { device, browser }
}

export function SettingsPage() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [tab, setTab] = useState('profile')

  // Profile
  const [name, setName] = useState(user?.name || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [timezone, setTimezone] = useState(() => readStr(LS.timezone, ''))

  // Security — password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({})
  const [isChangingPassword, setIsChangingPassword] = useState(false)

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  // Preferences — wired to localStorage
  const [defaultModelId, setDefaultModelId] = useState(() => readStr(LS.defaultModel, ''))
  const [sendOn, setSendOn] = useState<'enter' | 'ctrl+enter'>(() => (readStr(LS.sendOn, 'enter') as 'enter' | 'ctrl+enter'))
  const [showCostEstimates, setShowCostEstimates] = useState(() => readBool(LS.showCostEstimates, true))
  const [showTokenCounts, setShowTokenCounts] = useState(() => readBool(LS.showTokenCounts, true))
  const [autoSave, setAutoSave] = useState(() => readBool(LS.autoSave, true))
  const [notifyTransactional, setNotifyTransactional] = useState(() => readBool(LS.notifyTransactional, true))
  const [notifyMarketing, setNotifyMarketing] = useState(() => readBool(LS.notifyMarketing, false))
  const [notifySecurity, setNotifySecurity] = useState(() => readBool(LS.notifySecurity, true))
  const [notifyWeeklyDigest, setNotifyWeeklyDigest] = useState(() => readBool(LS.notifyWeeklyDigest, false))

  // Appearance
  const { theme, setTheme } = useTheme()
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebar()
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>(() => (readStr(LS.fontSize, 'medium') as 'small' | 'medium' | 'large'))
  const [reducedMotion, setReducedMotion] = useState(() => readBool(LS.reducedMotion, false))

  const { models } = useModels()

  // ─── Persistence effects ──────────────────────────────────────────
  useEffect(() => { writeStr(LS.timezone, timezone) }, [timezone])
  useEffect(() => { writeStr(LS.defaultModel, defaultModelId) }, [defaultModelId])
  useEffect(() => { writeStr(LS.sendOn, sendOn) }, [sendOn])
  useEffect(() => { writeBool(LS.showCostEstimates, showCostEstimates) }, [showCostEstimates])
  useEffect(() => { writeBool(LS.showTokenCounts, showTokenCounts) }, [showTokenCounts])
  useEffect(() => { writeBool(LS.autoSave, autoSave) }, [autoSave])
  useEffect(() => { writeBool(LS.notifyTransactional, notifyTransactional) }, [notifyTransactional])
  useEffect(() => { writeBool(LS.notifyMarketing, notifyMarketing) }, [notifyMarketing])
  useEffect(() => { writeBool(LS.notifySecurity, notifySecurity) }, [notifySecurity])
  useEffect(() => { writeBool(LS.notifyWeeklyDigest, notifyWeeklyDigest) }, [notifyWeeklyDigest])

  // Apply font size to <html>: bumping the root font-size scales rem-based
  // tokens across the app. Three discrete steps avoid runaway layout shifts.
  useEffect(() => {
    const px = fontSize === 'small' ? '14px' : fontSize === 'large' ? '18px' : '16px'
    document.documentElement.style.fontSize = px
    document.documentElement.setAttribute('data-font-size', fontSize)
    writeStr(LS.fontSize, fontSize)
  }, [fontSize])

  // Reduced motion is honored by preferences.css via the data-attr selector.
  useEffect(() => {
    document.documentElement.setAttribute('data-reduced-motion', String(reducedMotion))
    writeBool(LS.reducedMotion, reducedMotion)
  }, [reducedMotion])

  // ─── Profile handlers (existing — DO NOT BREAK) ───────────────────
  const handleSaveProfile = async () => {
    try {
      setIsSavingProfile(true)
      await api.put('/auth/profile', { name })
      updateUser({ name })
      toast.success('Profile updated')
    } catch { toast.error('Failed to update profile') } finally { setIsSavingProfile(false) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      toast.error('Please upload a JPG, PNG, WebP, or GIF image'); return
    }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5MB'); return }
    try {
      setIsUploadingAvatar(true)
      const formData = new FormData()
      formData.append('file', file)
      const res = await api.post('/auth/avatar/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      updateUser({ avatar: res.data.data.avatar })
      toast.success('Avatar updated!')
    } catch { toast.error('Failed to upload avatar') }
    finally {
      setIsUploadingAvatar(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSelectBuiltIn = async (avatarId: string) => {
    try {
      setIsUploadingAvatar(true)
      const res = await api.post('/auth/avatar/select', { avatarId })
      updateUser({ avatar: res.data.data.avatar })
      toast.success('Avatar updated!')
    } catch { toast.error('Failed to update avatar') }
    finally { setIsUploadingAvatar(false) }
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
  const { device, browser } = describeCurrentDevice()
  // getUserById doesn't return authProvider — defensively read it; default
  // to the email/password happy path.
  const authProvider = (user as any)?.authProvider as string | undefined
  const isGoogleAccount = authProvider === 'google'

  // Build provider-grouped flat options (Select primitive doesn't support optgroup).
  // Sorting + label prefix keeps the dropdown visually clustered by provider.
  const modelOptions = [
    { value: '', label: 'Use first available model (auto)' },
    ...[...models]
      .sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name))
      .map((m) => ({
        value: m.id,
        label: `${m.provider.charAt(0).toUpperCase() + m.provider.slice(1)} — ${m.name}`,
      })),
  ]

  return (
    <div className="space-y-5 max-w-2xl w-full mx-auto">
      <h2 className="text-xl sm:text-2xl font-semibold text-text-primary">Settings</h2>

      <Tabs tabs={[
        { id: 'profile', label: 'Profile' },
        { id: 'security', label: 'Security' },
        { id: 'preferences', label: 'Preferences' },
        { id: 'appearance', label: 'Appearance' },
        ...(user?.role === 'org_owner' ? [{ id: 'organization', label: 'Organization' }] : []),
      ]} activeTab={tab} onChange={setTab} />

      {/* ═══════════ PROFILE ═══════════ */}
      {tab === 'profile' && (
        <div className="space-y-6">
          <Card padding="lg">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5 mb-6">
              <div className="relative group">
                {user && <Avatar name={user.name} src={user.avatar} size="xl" />}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ background: 'rgba(0,0,0,0.5)' }}
                >
                  {isUploadingAvatar ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (<Camera size={20} className="text-white" />)}
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary">{user?.name}</h3>
                <p className="text-sm text-text-muted">{user?.email}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 flex items-center gap-1.5 text-xs transition-colors"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)' }}
                >
                  <Upload size={12} /> Upload photo
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <Input label="Display Name" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email" value={user?.email || ''} disabled />
              <Select
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={TIMEZONES}
              />
              <p className="text-xs text-text-muted -mt-2">
                All dates and times across ConvoiaAI will use this timezone.
              </p>

              {/* Language — honest stub. Full i18n is a planned feature; for now
                  we capture interest via a mailto request rather than ship a
                  picker that does nothing. The user's previous pick (if any)
                  is preserved silently in localStorage so when i18n ships we
                  can restore the dropdown without losing data. */}
              <div>
                <label className="text-sm text-text-secondary mb-2 block">Language</label>
                <div
                  className="rounded-xl border p-4 flex items-center justify-between gap-4"
                  style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent-border)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-1)', color: 'var(--accent)' }}>
                      <Globe size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">English</p>
                      <p className="text-xs text-text-muted">More languages on the way — tell us which one matters most.</p>
                    </div>
                  </div>
                  <a
                    href={`mailto:ai@convoia.ai?subject=${encodeURIComponent('Language request for ConvoiaAI')}&body=${encodeURIComponent(`Hi ConvoiaAI team,\n\nI'd love to use ConvoiaAI in: [your language]\n\nMy email: ${user?.email || ''}\n\nThanks!`)}`}
                    className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors hover:opacity-90"
                    style={{ background: 'var(--surface-1)', borderColor: 'var(--accent-border)', color: 'var(--accent)', textDecoration: 'none' }}
                  >
                    Request a language <ArrowRight size={12} />
                  </a>
                </div>
              </div>

              <Button onClick={handleSaveProfile} isLoading={isSavingProfile}><Save size={16} /> Save Display Name</Button>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Or choose an avatar</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {BUILT_IN_AVATARS.map((avatar) => {
                const isSelected = user?.avatar === avatar.src
                return (
                  <button
                    key={avatar.id}
                    onClick={() => handleSelectBuiltIn(avatar.id)}
                    disabled={isUploadingAvatar}
                    className={cn(
                      'relative rounded-xl overflow-hidden border-2 transition-all hover:scale-105',
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-border'
                    )}
                    style={{ aspectRatio: '1', background: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    <img src={avatar.src} alt={avatar.id} className="w-full h-full" />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ═══════════ SECURITY ═══════════ */}
      {tab === 'security' && (
        <div className="space-y-6">
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

          {/* Active Sessions — STUB current-only */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-text-primary mb-1">Active Sessions</h3>
            <p className="text-xs text-text-muted mb-4">Devices currently signed in to your account.</p>
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                  <Smartphone size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {device} · {browser} <Badge size="sm" variant="success">This session</Badge>
                  </p>
                  <p className="text-xs text-text-muted">Currently active</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Multi-device session management coming soon — you'll be able to see and revoke sessions from other devices here.
            </p>
            {/* TODO(settings): wire to backend when /api/auth/sessions exists */}
          </Card>

          {/* Connected Accounts — STUB display + disabled disconnect */}
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-text-primary mb-1">Connected Accounts</h3>
            <p className="text-xs text-text-muted mb-4">Sign-in methods linked to this account.</p>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Email + Password</p>
                    <p className="text-xs text-text-muted">{user?.email}</p>
                  </div>
                </div>
                <Badge size="sm" variant="success">Active</Badge>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-surface flex items-center justify-center" style={{ color: 'var(--accent)' }}>
                    <Link2 size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">Google</p>
                    <p className="text-xs text-text-muted">{isGoogleAccount ? 'Linked' : 'Not connected'}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Account disconnect coming soon"
                >
                  Disconnect
                </Button>
                {/* TODO(settings): wire to backend when /api/auth/disconnect-google exists */}
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Account disconnect coming soon — you'll be able to unlink third-party providers here.
            </p>
          </Card>
        </div>
      )}

      {/* ═══════════ PREFERENCES ═══════════ */}
      {tab === 'preferences' && (
        <div className="space-y-6">
          <Card padding="lg">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Chat Preferences</h3>
            <div className="space-y-6">
              <div>
                <label className="text-sm text-text-secondary mb-2 block">Default Model</label>
                <Select
                  value={defaultModelId}
                  onChange={(e) => setDefaultModelId(e.target.value)}
                  options={modelOptions}
                />
                <p className="text-xs text-text-muted mt-1.5">
                  Used for new conversations when no other selection has been made.
                </p>
              </div>

              <div>
                <label className="text-sm text-text-secondary mb-2 block">Send Message</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSendOn('enter')}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={sendOn === 'enter'
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                      : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                  >
                    Enter to send
                  </button>
                  <button
                    onClick={() => setSendOn('ctrl+enter')}
                    className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={sendOn === 'ctrl+enter'
                      ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                      : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                  >
                    Ctrl+Enter to send
                  </button>
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

          <Card padding="lg">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Bell size={16} /> Email Notifications
              </h3>
              <p className="text-xs text-text-muted mt-1">
                Notification preferences are saved locally — server-side delivery coming soon.
              </p>
            </div>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Transactional emails</p>
                  <p className="text-xs text-text-muted">Receipts, password resets, invitations</p>
                </div>
                <Toggle checked={notifyTransactional} onChange={setNotifyTransactional} label="Transactional emails" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Security alerts</p>
                  <p className="text-xs text-text-muted">New sign-ins and account-security events</p>
                </div>
                <Toggle checked={notifySecurity} onChange={setNotifySecurity} label="Security alerts" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Weekly digest</p>
                  <p className="text-xs text-text-muted">Usage summary and cost recap, every Monday</p>
                </div>
                <Toggle checked={notifyWeeklyDigest} onChange={setNotifyWeeklyDigest} label="Weekly digest" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-primary">Product updates</p>
                  <p className="text-xs text-text-muted">New features, roadmap notes, occasional offers</p>
                </div>
                <Toggle checked={notifyMarketing} onChange={setNotifyMarketing} label="Product updates" />
              </div>
            </div>
            {/* TODO(settings): wire to backend when /api/notifications/preferences exists */}
          </Card>
        </div>
      )}

      {/* ═══════════ APPEARANCE ═══════════ */}
      {tab === 'appearance' && (
        <Card padding="lg">
          <h3 className="text-lg font-semibold text-text-primary mb-5">Appearance</h3>
          <div className="space-y-6">

            <div>
              <label className="text-sm text-text-secondary mb-2 block">Theme</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'light' as const, label: 'Light', icon: <Sun size={14} /> },
                  { id: 'dark' as const, label: 'Dark', icon: <Moon size={14} /> },
                  { id: 'system' as const, label: 'System', icon: <Monitor size={14} /> },
                ]).map((opt) => {
                  const active = theme === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setTheme(opt.id)}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                      style={active
                        ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                        : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="text-sm text-text-secondary mb-2 block">Sidebar</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSidebarCollapsed(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={!sidebarCollapsed
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                >
                  Expanded
                </button>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                  style={sidebarCollapsed
                    ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                    : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                >
                  Compact
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm text-text-secondary mb-2 block">Font Size</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'small' as const, label: 'Small' },
                  { id: 'medium' as const, label: 'Medium' },
                  { id: 'large' as const, label: 'Large' },
                ]).map((opt) => {
                  const active = fontSize === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setFontSize(opt.id)}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors"
                      style={active
                        ? { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent-border)' }
                        : { background: 'var(--surface-2)', color: 'var(--text-secondary)', borderColor: 'var(--border-default)' }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                Affects the entire app — adjusts the root font size.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary">Reduce motion</p>
                <p className="text-xs text-text-muted">Minimize animations and transitions</p>
              </div>
              <Toggle checked={reducedMotion} onChange={setReducedMotion} label="Reduce motion" />
            </div>

          </div>
        </Card>
      )}

      {/* ═══════════ ORGANIZATION ═══════════ */}
      {tab === 'organization' && user?.role === 'org_owner' && (
        <OrgSettingsCard />
      )}
    </div>
  )
}

function OrgSettingsCard() {
  const { user, updateUser } = useAuth()
  const toast = useToast()
  const [orgName, setOrgName] = useState(user?.organization?.name || '')
  const [orgIndustry, setOrgIndustry] = useState(user?.organization?.industry || '')
  const [saving, setSaving] = useState(false)

  const handleSaveOrg = async () => {
    try {
      setSaving(true)
      await api.put('/org', { name: orgName, industry: orgIndustry })
      updateUser({ organization: { ...user!.organization!, name: orgName, industry: orgIndustry } })
      toast.success('Organization updated')
    } catch { toast.error('Failed to update organization') }
    finally { setSaving(false) }
  }

  return (
    <Card padding="lg">
      <h3 className="text-lg font-semibold text-text-primary mb-4">Organization Settings</h3>
      <div className="space-y-4">
        <Input label="Organization Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        <Select label="Industry" value={orgIndustry} onChange={(e) => setOrgIndustry(e.target.value)} options={[
          { value: '', label: 'Select' }, { value: 'legal', label: 'Legal' }, { value: 'healthcare', label: 'Healthcare' },
          { value: 'finance', label: 'Finance' }, { value: 'hr', label: 'HR' }, { value: 'marketing', label: 'Marketing' },
          { value: 'education', label: 'Education' }, { value: 'technology', label: 'Technology' }, { value: 'ecommerce', label: 'E-Commerce' },
        ]} />
        <Button onClick={handleSaveOrg} isLoading={saving}><Save size={16} /> Save</Button>
      </div>
    </Card>
  )
}

export default SettingsPage;
