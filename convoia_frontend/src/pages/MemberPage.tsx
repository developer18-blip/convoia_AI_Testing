import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Activity, DollarSign, Coins } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { StatCard } from '../components/shared/StatCard'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { AreaChart } from '../components/charts/AreaChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { useToast } from '../hooks/useToast'
import { formatCurrency, formatNumber, formatTokens } from '../lib/utils'
import api from '../lib/api'

export function MemberPage() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [member, setMember] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [budgetCap, setBudgetCap] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    api.get(`/org/user/${userId}`).then((res) => {
      setMember(res.data.data)
      setBudgetCap(String(res.data.data?.budget?.monthlyCap || ''))
    }).catch(() => setError('Failed to load member data')).finally(() => setIsLoading(false))
  }, [userId])

  const handleSaveBudget = async () => {
    try {
      setIsSaving(true)
      await api.put('/budget/set', { userId, monthlyCap: parseFloat(budgetCap) })
      toast.success('Budget updated')
    } catch { toast.error('Failed to update budget') } finally { setIsSaving(false) }
  }

  if (isLoading) return <LoadingPage />
  if (error || !member) return <ErrorState message={error || 'Member not found'} onRetry={() => navigate('/team')} />

  return (
    <div className="space-y-6">
      <button onClick={() => navigate('/team')} className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary">
        <ArrowLeft size={16} /> Back to Team
      </button>

      <div className="flex items-center gap-4">
        <Avatar name={member.name} src={member.avatar} size="lg" />
        <div>
          <h2 className="text-2xl font-semibold text-text-primary">{member.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="primary">{member.role?.replace('_', ' ')}</Badge>
            <span className="text-sm text-text-muted">{member.email}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Queries" value={formatNumber(member.queries || 0)} icon={<Activity size={20} />} />
        <StatCard title="Cost" value={formatCurrency(member.cost || 0)} icon={<DollarSign size={20} />} />
        <StatCard title="Tokens" value={formatTokens(member.tokens || 0)} icon={<Coins size={20} />} />
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Budget</h3>
        {member.budget && (
          <div className="mb-4">
            <ProgressBar value={member.budget.currentUsage} max={member.budget.monthlyCap} size="md" showLabel />
          </div>
        )}
        <div className="flex items-end gap-3">
          <Input label="Monthly Cap ($)" type="number" value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} className="w-40" />
          <Button onClick={handleSaveBudget} isLoading={isSaving}>Save</Button>
        </div>
      </Card>

      {member.dailyUsage && (
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">30-Day Usage</h3>
          <AreaChart data={member.dailyUsage} xKey="date" yKey="cost" height={280} formatY={(v: number) => `$${v.toFixed(2)}`} />
        </Card>
      )}
    </div>
  )
}

export default MemberPage;
