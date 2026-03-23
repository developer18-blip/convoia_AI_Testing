import { useEffect, useState } from 'react'
import { Key, Plus, Copy, Check, Trash2, Info } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useToast } from '../hooks/useToast'
import { formatDate } from '../lib/utils'
import api from '../lib/api'

interface ApiKey {
  id: string; name: string; key: string; createdAt: string; lastUsedAt?: string; expiresAt?: string; isActive: boolean
}

export function ApiKeysPage() {
  const toast = useToast()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetch = async () => {
    try {
      setIsLoading(true); setError(null)
      const res = await api.get('/keys')
      setKeys(res.data.data || [])
    } catch { setError('Failed to load API keys') } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [])

  const handleCreate = async () => {
    if (!newKeyName.trim()) { toast.error('Name is required'); return }
    try {
      setIsCreating(true)
      const res = await api.post('/keys', { name: newKeyName })
      setCreatedKey(res.data.data?.key || res.data.data?.apiKey || 'key-created')
      toast.success('API key created')
      setNewKeyName('')
      fetch()
    } catch { toast.error('Failed to create API key') } finally { setIsCreating(false) }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      setIsDeleting(true)
      await api.delete(`/keys/${deleteId}`)
      toast.success('API key revoked')
      setDeleteId(null); fetch()
    } catch { toast.error('Failed to revoke key') } finally { setIsDeleting(false) }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text); setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={fetch} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">API Keys</h2>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> Create Key</Button>
      </div>

      <Card padding="lg" className="bg-info/5 border-info/20">
        <div className="flex items-start gap-3">
          <Info size={18} className="text-info mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-text-primary mb-1">Using API Keys</p>
            <p className="text-xs text-text-muted">Use your API key to authenticate requests from external applications and integrations. Set the base URL to your Convoia API endpoint and use the key as the Bearer token in the Authorization header.</p>
          </div>
        </div>
      </Card>

      <Card padding="none">
        {keys.length === 0 ? (
          <EmptyState icon={<Key size={40} />} title="No API keys" description="Create an API key to get started." action={{ label: 'Create Key', onClick: () => setShowCreate(true) }} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Key</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Last Used</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
              </tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{k.name}</td>
                    <td className="px-4 py-3"><code className="text-xs bg-surface-2 px-2 py-1 rounded font-mono text-text-muted">{k.key ? `${k.key.slice(0, 8)}...${k.key.slice(-4)}` : '••••••••'}</code></td>
                    <td className="px-4 py-3 text-sm text-text-muted">{formatDate(k.createdAt)}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">{k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}</td>
                    <td className="px-4 py-3 text-center"><Badge size="sm" variant={k.isActive ? 'success' : 'danger'}>{k.isActive ? 'Active' : 'Revoked'}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setDeleteId(k.id)} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => { setShowCreate(false); setCreatedKey(null) }} title={createdKey ? 'Key Created' : 'Create API Key'}>
        {createdKey ? (
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">Copy this key now. It won't be shown again.</p>
            <div className="flex items-center gap-2 bg-surface-2 rounded-lg p-3">
              <code className="text-sm font-mono text-text-primary flex-1 break-all">{createdKey}</code>
              <button onClick={() => handleCopy(createdKey)} className="p-2 hover:bg-border rounded-lg shrink-0">
                {copied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-text-muted" />}
              </button>
            </div>
            <Button onClick={() => { setShowCreate(false); setCreatedKey(null) }} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input label="Key Name" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g., My Integration" />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} isLoading={isCreating}>Create</Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Revoke API Key" message="This key will immediately stop working. This action cannot be undone." confirmLabel="Revoke" isLoading={isDeleting} />
    </div>
  )
}

export default ApiKeysPage;
