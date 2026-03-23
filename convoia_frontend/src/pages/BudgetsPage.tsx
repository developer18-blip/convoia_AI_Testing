import { useEffect, useState } from 'react'
import { PiggyBank, Save } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Avatar } from '../components/ui/Avatar'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useToast } from '../hooks/useToast'
import { formatCurrency } from '../lib/utils'
import api from '../lib/api'
import type { Budget } from '../types'

interface BudgetMember {
  id: string; name: string; avatar?: string | null; budget: Budget | null
}

export function BudgetsPage() {
  const toast = useToast()
  const [myBudget, setMyBudget] = useState<Budget | null>(null)
  const [members, setMembers] = useState<BudgetMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const fetch = async () => {
    try {
      setIsLoading(true); setError(null)
      const [budgetRes, membersRes] = await Promise.allSettled([
        api.get('/budget/status'),
        api.get('/budget/team'),
      ])
      if (budgetRes.status === 'fulfilled') setMyBudget(budgetRes.value.data.data)
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data.data || [])
    } catch { setError('Failed to load budgets') } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  const handleSave = async (userId: string) => {
    try {
      setIsSaving(true)
      await api.put('/budget/set', { userId, monthlyCap: parseFloat(editValue) })
      toast.success('Budget updated')
      setEditingId(null)
      fetch()
    } catch { toast.error('Failed to update budget') } finally { setIsSaving(false) }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={fetch} />

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Budgets</h2>

      {myBudget && myBudget.monthlyCap > 0 && (
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-3">My Budget</h3>
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold font-mono text-text-primary">{formatCurrency(myBudget.currentUsage)}</span>
            <span className="text-sm text-text-muted">of {formatCurrency(myBudget.monthlyCap)}</span>
          </div>
          <ProgressBar value={myBudget.currentUsage} max={myBudget.monthlyCap} size="md" />
          <p className="text-xs text-text-muted mt-2">
            Resets {myBudget.resetDate ? new Date(myBudget.resetDate).toLocaleDateString() : 'N/A'}
          </p>
        </Card>
      )}

      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Team Budgets</h3>
        </div>
        {members.length === 0 ? (
          <EmptyState icon={<PiggyBank size={40} />} title="No team budgets" description="Team member budgets will appear here." />
        ) : (
          <div className="divide-y divide-border/50">
            {members.map((m) => (
              <div key={m.id} className="px-5 py-3 flex items-center gap-4">
                <Avatar name={m.name} src={m.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{m.name}</p>
                  {m.budget ? (
                    <ProgressBar value={m.budget.currentUsage} max={m.budget.monthlyCap} size="sm" className="mt-1" />
                  ) : (
                    <p className="text-xs text-text-muted">No budget set</p>
                  )}
                </div>
                <div className="text-right text-sm text-text-secondary font-mono">
                  {m.budget ? `${formatCurrency(m.budget.currentUsage)} / ${formatCurrency(m.budget.monthlyCap)}` : '-'}
                </div>
                {editingId === m.id ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-24" />
                    <Button size="sm" onClick={() => handleSave(m.id)} isLoading={isSaving}><Save size={14} /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => { setEditingId(m.id); setEditValue(String(m.budget?.monthlyCap || '')) }}>Edit</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default BudgetsPage;
