import { useEffect, useState } from 'react'
import { Send, Search, User, Building2, Zap } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { useToast } from '../hooks/useToast'
import { formatNumber } from '../lib/utils'
import api from '../lib/api'

type Target = { type: 'user'; id: string; name: string; email: string } | { type: 'org'; id: string; name: string; memberCount?: number }

export function AdminSendTokensPage() {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [orgs, setOrgs] = useState<any[]>([])
  const [target, setTarget] = useState<Target | null>(null)
  const [tokens, setTokens] = useState('')
  const [reason, setReason] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [recentGrants, setRecentGrants] = useState<Array<{ target: string; tokens: number; time: string }>>([])

  useEffect(() => {
    if (!search || search.length < 2) { setUsers([]); setOrgs([]); return }
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const [uRes, oRes] = await Promise.allSettled([
          api.get(`/admin/users?search=${search}&page=1`),
          api.get(`/admin/orgs?search=${search}&page=1`),
        ])
        if (uRes.status === 'fulfilled') {
          const d = uRes.value.data.data
          setUsers(d.data || (Array.isArray(d) ? d : []))
        }
        if (oRes.status === 'fulfilled') {
          const d = oRes.value.data.data
          setOrgs(d.data || (Array.isArray(d) ? d : []))
        }
      } catch { /* ignore */ }
      setIsSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const handleSend = async () => {
    if (!target) { toast.error('Select a recipient'); return }
    const parsedTokens = parseInt(tokens)
    if (!parsedTokens || parsedTokens <= 0) { toast.error('Enter a valid token amount'); return }

    try {
      setIsSending(true)
      const body: any = { tokens: parsedTokens, reason }
      if (target.type === 'user') body.targetUserId = target.id
      else body.targetOrgId = target.id

      const res = await api.post('/admin/send-tokens', body)
      toast.success(res.data.message || 'Tokens sent!')
      setRecentGrants((prev) => [{ target: target.name, tokens: parsedTokens, time: new Date().toLocaleTimeString() }, ...prev.slice(0, 9)])
      setTarget(null)
      setTokens('')
      setReason('')
      setSearch('')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send tokens')
    } finally {
      setIsSending(false)
    }
  }

  const inputStyle = "w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Send Tokens</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Search & Select */}
        <div className="lg:col-span-2 space-y-4">
          {/* Selected target */}
          {target && (
            <Card padding="lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {target.type === 'user' ? <Avatar name={target.name} size="md" /> : <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Building2 size={20} className="text-primary" /></div>}
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{target.name}</p>
                    <p className="text-xs text-text-muted">
                      {target.type === 'user' ? (target as any).email : `Organization · ${(target as any).memberCount || '?'} members`}
                    </p>
                  </div>
                  <Badge size="sm" variant={target.type === 'user' ? 'primary' : 'success'}>{target.type}</Badge>
                </div>
                <button onClick={() => setTarget(null)} className="text-xs text-text-muted hover:text-danger">Change</button>
              </div>
            </Card>
          )}

          {/* Search */}
          {!target && (
            <Card padding="lg">
              <label className="block text-sm font-medium text-text-secondary mb-2">Search User or Organization</label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type name or email..."
                  className={`${inputStyle} pl-9`} />
              </div>

              {isSearching && <p className="text-xs text-text-muted mt-2">Searching...</p>}

              {(users.length > 0 || orgs.length > 0) && (
                <div className="mt-3 max-h-[320px] overflow-y-auto divide-y divide-border/50 border border-border rounded-lg">
                  {users.slice(0, 8).map((u: any) => (
                    <div key={u.id} onClick={() => { setTarget({ type: 'user', id: u.id, name: u.name, email: u.email }); setSearch('') }}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-2 cursor-pointer transition-colors">
                      <User size={14} className="text-text-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{u.name}</p>
                        <p className="text-xs text-text-muted truncate">{u.email}</p>
                      </div>
                      <Badge size="sm" variant="primary">{u.role || 'user'}</Badge>
                    </div>
                  ))}
                  {orgs.slice(0, 5).map((o: any) => (
                    <div key={o.id} onClick={() => { setTarget({ type: 'org', id: o.id, name: o.name, memberCount: o._count?.users }); setSearch('') }}
                      className="px-4 py-2.5 flex items-center gap-3 hover:bg-surface-2 cursor-pointer transition-colors">
                      <Building2 size={14} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{o.name}</p>
                        <p className="text-xs text-text-muted">{o.email}</p>
                      </div>
                      <Badge size="sm" variant="success">org</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Token amount & reason */}
          <Card padding="lg">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Token Amount *</label>
                <div className="relative">
                  <Zap size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input type="number" value={tokens} onChange={(e) => setTokens(e.target.value)}
                    placeholder="e.g. 10000" min="1" className={`${inputStyle} pl-9`} />
                </div>
                {/* Quick amounts */}
                <div className="flex gap-2 mt-2">
                  {[1000, 5000, 10000, 50000, 100000].map((amt) => (
                    <button key={amt} onClick={() => setTokens(String(amt))} type="button"
                      className="px-3 py-1 text-xs rounded-lg border border-border bg-surface text-text-muted hover:border-primary hover:text-primary transition-colors">
                      {formatNumber(amt)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">Reason (optional)</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Welcome bonus, promotional grant..." className={inputStyle} />
              </div>
              <button onClick={handleSend} disabled={isSending || !target || !tokens}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                <Send size={18} />
                {isSending ? 'Sending...' : `Send ${tokens ? formatNumber(parseInt(tokens) || 0) : '0'} Tokens`}
              </button>
            </div>
          </Card>
        </div>

        {/* Right: Recent grants */}
        <div>
          <Card padding="none">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-text-primary">Recent Grants (this session)</h3>
            </div>
            <div className="divide-y divide-border/50">
              {recentGrants.length === 0 ? (
                <div className="px-5 py-8 text-center text-text-muted text-sm">No grants yet</div>
              ) : recentGrants.map((g, i) => (
                <div key={i} className="px-5 py-3">
                  <p className="text-sm font-medium text-text-primary">{g.target}</p>
                  <p className="text-xs text-text-muted">{formatNumber(g.tokens)} tokens · {g.time}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AdminSendTokensPage
