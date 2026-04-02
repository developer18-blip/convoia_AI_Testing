import { useState } from 'react'
import { UserPlus, Building2, User, Eye, EyeOff } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { useToast } from '../hooks/useToast'
import api from '../lib/api'

export function AdminCreateAccountPage() {
  const toast = useToast()
  const [accountType, setAccountType] = useState<'individual' | 'organization'>('individual')
  const [form, setForm] = useState({ name: '', email: '', password: '', organizationName: '', industry: '', role: 'user' })
  const [showPass, setShowPass] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) {
      toast.error('Name, email, and password are required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error('Please enter a valid email address')
      return
    }
    if (form.password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    if (accountType === 'organization' && !form.organizationName) {
      toast.error('Organization name is required')
      return
    }

    try {
      setIsLoading(true)
      const res = await api.post('/admin/accounts', {
        ...form,
        accountType,
      })
      toast.success(res.data.message || 'Account created successfully')
      setForm({ name: '', email: '', password: '', organizationName: '', industry: '', role: 'user' })
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create account')
    } finally {
      setIsLoading(false)
    }
  }

  const inputStyle = "w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-semibold text-text-primary">Create Account</h2>

      {/* Account Type Toggle */}
      <div className="flex gap-3">
        <button
          onClick={() => setAccountType('individual')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
            accountType === 'individual'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-surface text-text-muted hover:border-text-muted'
          }`}
        >
          <User size={18} /> Individual User
        </button>
        <button
          onClick={() => setAccountType('organization')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
            accountType === 'organization'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border bg-surface text-text-muted hover:border-text-muted'
          }`}
        >
          <Building2 size={18} /> Organization
        </button>
      </div>

      <Card padding="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Full Name *</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="John Doe" className={inputStyle} />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="john@example.com" className={inputStyle} />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Password *</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 characters" className={inputStyle} />
              <button type="button" onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Role (for individual) */}
          {accountType === 'individual' && (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={inputStyle}>
                <option value="user">Individual User</option>
                <option value="platform_admin">Platform Admin</option>
              </select>
            </div>
          )}

          {/* Organization fields */}
          {accountType === 'organization' && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Organization Name *</label>
                <input type="text" value={form.organizationName}
                  onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
                  placeholder="Acme Corp" className={inputStyle} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Industry</label>
                <input type="text" value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="Technology, Healthcare, Finance..." className={inputStyle} />
              </div>
            </>
          )}

          <button type="submit" disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            <UserPlus size={18} />
            {isLoading ? 'Creating...' : `Create ${accountType === 'organization' ? 'Organization' : 'Individual'} Account`}
          </button>
        </form>
      </Card>
    </div>
  )
}

export default AdminCreateAccountPage
