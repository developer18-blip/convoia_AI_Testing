import { useEffect, useState } from 'react'
import { Building2, Users, DollarSign, Activity, Save } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Button } from '../components/ui/Button'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { formatCurrency } from '../lib/utils'
import api from '../lib/api'

export function OrgPage() {
  const toast = useToast()
  const [org, setOrg] = useState<any>(null)
  const [members, setMembers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orgName, setOrgName] = useState('')
  const [industry, setIndustry] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      api.get('/org/settings'),
      api.get('/org/team'),
    ]).then(([orgRes, membersRes]) => {
      if (orgRes.status === 'fulfilled') {
        const d = orgRes.value.data.data
        setOrg(d); setOrgName(d.name || ''); setIndustry(d.industry || '')
      }
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data.data || [])
    }).catch(() => setError('Failed to load organization')).finally(() => setIsLoading(false))
  }, [])

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await api.put('/org/settings', { name: orgName, industry })
      toast.success('Organization updated')
    } catch { toast.error('Failed to update') } finally { setIsSaving(false) }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Organization</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Status" value={org?.status || 'Active'} icon={<Building2 size={20} />} />
        <StatCard title="Members" value={String(members.length)} icon={<Users size={20} />} />
        <StatCard title="Total Spend" value={formatCurrency(members.reduce((s: number, m: any) => s + (Number(m.cost) || 0), 0))} icon={<DollarSign size={20} />} />
        <StatCard title="Tier" value={org?.tier || 'Free'} icon={<Activity size={20} />} />
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Organization Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Organization Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          <Select label="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} options={[
            { value: '', label: 'Select' }, { value: 'legal', label: 'Legal' }, { value: 'healthcare', label: 'Healthcare' },
            { value: 'finance', label: 'Finance' }, { value: 'hr', label: 'HR' }, { value: 'marketing', label: 'Marketing' }, { value: 'other', label: 'Other' },
          ]} />
        </div>
        <Button onClick={handleSave} isLoading={isSaving} className="mt-4"><Save size={16} /> Save Changes</Button>
      </Card>

      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Members</h3>
        </div>
        <div className="divide-y divide-border/50">
          {members.map((m: any) => (
            <div key={m.id} className="px-5 py-3 flex items-center gap-3">
              <Avatar name={m.name} src={m.avatar} size="sm" />
              <div className="flex-1"><p className="text-sm text-text-primary">{m.name}</p><p className="text-xs text-text-muted">{m.email}</p></div>
              <Badge size="sm" variant="primary">{m.role?.replace('_', ' ')}</Badge>
              <span className="text-sm font-mono text-primary">{formatCurrency(Number(m.cost) || 0)}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default OrgPage;
