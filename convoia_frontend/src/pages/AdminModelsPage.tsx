import { useCallback, useEffect, useState } from 'react'
import { Save, ToggleLeft, ToggleRight } from 'lucide-react'
import { useToast } from '../hooks/useToast'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { ProviderBadge } from '../components/shared/ProviderBadge'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import api from '../lib/api'

export function AdminModelsPage() {
  const toast = useToast()
  const [models, setModels] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    try {
      setIsLoading(true); setError(null)
      const res = await api.get('/admin/models')
      setModels(res.data.data || [])
    } catch { setError('Failed to load models') }
    finally { setIsLoading(false) }
  }, [])

  useEffect(() => { refetch() }, [refetch])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState({ inputPrice: '', outputPrice: '', markup: '' })
  const [isSaving, setIsSaving] = useState(false)

  const handleEdit = (model: any) => {
    setEditingId(model.id)
    setEditValues({
      inputPrice: String(Number(model.inputTokenPrice ?? 0)),
      outputPrice: String(Number(model.outputTokenPrice ?? 0)),
      markup: String(Number(model.markupPercentage ?? 0)),
    })
  }

  const handleSave = async (modelId: string) => {
    const input = parseFloat(editValues.inputPrice)
    const output = parseFloat(editValues.outputPrice)
    const markup = parseFloat(editValues.markup)
    if (isNaN(input) || input < 0 || isNaN(output) || output < 0) {
      toast.error('Prices must be valid non-negative numbers'); return
    }
    if (isNaN(markup) || markup < 0 || markup > 200) {
      toast.error('Markup must be between 0% and 200%'); return
    }
    try {
      setIsSaving(true)
      await api.put(`/admin/models/${modelId}/pricing`, {
        inputTokenPrice: input,
        outputTokenPrice: output,
        markupPercentage: markup,
      })
      toast.success('Pricing updated')
      setEditingId(null)
      refetch()
    } catch { toast.error('Failed to update pricing') } finally { setIsSaving(false) }
  }

  const handleToggle = async (modelId: string, isActive: boolean) => {
    try {
      await api.post(`/admin/models/${modelId}/toggle`)
      toast.success(isActive ? 'Model deactivated' : 'Model activated')
      refetch()
    } catch { toast.error('Failed to toggle model') }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-text-primary">Model Pricing</h2>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-border">
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Model</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Provider</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Input $/1M</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Output $/1M</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Markup %</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Active</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {models.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-text-muted text-sm">No models found</td></tr>
              )}
              {models.map((model) => (
                <tr key={model.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{model.name}</td>
                  <td className="px-4 py-3"><ProviderBadge provider={model.provider} /></td>
                  {editingId === model.id ? (
                    <>
                      <td className="px-4 py-3"><Input type="number" value={editValues.inputPrice} onChange={(e) => setEditValues((v) => ({ ...v, inputPrice: e.target.value }))} className="w-24" /></td>
                      <td className="px-4 py-3"><Input type="number" value={editValues.outputPrice} onChange={(e) => setEditValues((v) => ({ ...v, outputPrice: e.target.value }))} className="w-24" /></td>
                      <td className="px-4 py-3"><Input type="number" value={editValues.markup} onChange={(e) => setEditValues((v) => ({ ...v, markup: e.target.value }))} className="w-20" /></td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">${Number(model.inputTokenPrice ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">${Number(model.outputTokenPrice ?? 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary text-right">{Number(model.markupPercentage ?? 0)}%</td>
                    </>
                  )}
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggle(model.id, model.isActive)} className="hover:opacity-80 transition-opacity">
                      {model.isActive ? <ToggleRight size={24} className="text-success" /> : <ToggleLeft size={24} className="text-danger" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId === model.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" onClick={() => handleSave(model.id)} isLoading={isSaving}><Save size={14} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(model)}>Edit</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

export default AdminModelsPage;
