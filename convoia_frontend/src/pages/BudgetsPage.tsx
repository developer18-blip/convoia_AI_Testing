import { useEffect, useState } from 'react'
import { PiggyBank, Save } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Avatar } from '../components/ui/Avatar'
import { LoadingPage } from '../components/shared/LoadingPage'
import { EmptyState } from '../components/shared/EmptyState'
import { useToast } from '../hooks/useToast'
import { formatCurrency } from '../lib/utils'
import api from '../lib/api'

interface BudgetData {
  monthlyCap: number
  currentUsage: number
  usagePercent: number
  remainingBudget: number
  resetDate?: string
}

interface BudgetMember {
  id: string
  name?: string
  user?: { id: string; name: string; email: string; role: string }
  avatar?: string | null
  budget?: BudgetData | null
  monthlyCap?: number
  currentUsage?: number
  usagePercent?: number
}

export function BudgetsPage() {
  const toast = useToast()
  const [myBudget, setMyBudget] = useState<BudgetData | null>(null)
  const [members, setMembers] = useState<BudgetMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const [budgetRes, membersRes] = await Promise.allSettled([
        api.get('/budget/status'),
        api.get('/budget/team'),
      ])

      // My budget — may return 404 if no budget set
      if (budgetRes.status === 'fulfilled') {
        const d = budgetRes.value.data?.data
        if (d && typeof d.monthlyCap === 'number') {
          setMyBudget(d)
        }
      }

      // Team budgets — may return 403 for employees
      if (membersRes.status === 'fulfilled') {
        const d = membersRes.value.data?.data
        if (Array.isArray(d)) {
          setMembers(d)
        } else if (d?.budgets && Array.isArray(d.budgets)) {
          setMembers(d.budgets)
        } else {
          setMembers([])
        }
      }
    } catch {
      // silent — both calls use allSettled
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleSave = async (userId: string) => {
    try {
      setIsSaving(true)
      await api.put('/budget/set', { userId, monthlyCap: parseFloat(editValue) })
      toast.success('Budget updated')
      setEditingId(null)
      fetchData()
    } catch { toast.error('Failed to update budget') } finally { setIsSaving(false) }
  }

  if (isLoading) return <LoadingPage />

  // Helper to get member display name
  const getName = (m: BudgetMember) => m.name || m.user?.name || 'Unknown'
  const getId = (m: BudgetMember) => m.id || m.user?.id || ''
  const getCap = (m: BudgetMember) => m.budget?.monthlyCap ?? m.monthlyCap ?? 0
  const getUsage = (m: BudgetMember) => m.budget?.currentUsage ?? m.currentUsage ?? 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Budgets</h2>

      {/* My Budget */}
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

      {/* Team Budgets */}
      <Card padding="none">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Team Budgets</h3>
        </div>
        {members.length === 0 ? (
          <EmptyState icon={<PiggyBank size={40} />} title="No team budgets" description="Team member budgets will appear here." />
        ) : (
          <div className="divide-y divide-border/50">
            {members.map((m, i) => (
              <div key={getId(m) || i} className="px-5 py-3 flex items-center gap-4">
                <Avatar name={getName(m)} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">{getName(m)}</p>
                  {getCap(m) > 0 ? (
                    <ProgressBar value={getUsage(m)} max={getCap(m)} size="sm" className="mt-1" />
                  ) : (
                    <p className="text-xs text-text-muted">No budget set</p>
                  )}
                </div>
                <div className="text-right text-sm text-text-secondary font-mono">
                  {getCap(m) > 0 ? `${formatCurrency(getUsage(m))} / ${formatCurrency(getCap(m))}` : '-'}
                </div>
                {editingId === getId(m) ? (
                  <div className="flex items-center gap-2">
                    <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="w-24" />
                    <Button size="sm" onClick={() => handleSave(getId(m))} isLoading={isSaving}><Save size={14} /></Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => { setEditingId(getId(m)); setEditValue(String(getCap(m) || '')) }}>Edit</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

export default BudgetsPage
