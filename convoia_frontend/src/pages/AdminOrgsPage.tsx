import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Search, Ban, Trash2, ExternalLink } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Pagination } from '../components/ui/Pagination'
import { ConfirmDialog } from '../components/shared/ConfirmDialog'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useToast } from '../hooks/useToast'
import { formatDate } from '../lib/utils'
import api from '../lib/api'

export function AdminOrgsPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [orgs, setOrgs] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null)
  const [isActioning, setIsActioning] = useState(false)

  const fetch = async () => {
    try {
      setIsLoading(true); setError(null)
      const res = await api.get(`/admin/orgs?page=${page}&search=${search}`)
      const d = res.data.data
      if (d.data) { setOrgs(d.data); setPagination(d.pagination) }
      else if (Array.isArray(d)) setOrgs(d)
    } catch { setError('Failed to load organizations') } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [page, search])

  const handleAction = async () => {
    if (!confirmAction) return
    try {
      setIsActioning(true)
      if (confirmAction.action === 'suspend') await api.put(`/admin/orgs/${confirmAction.id}/suspend`)
      else await api.delete(`/admin/orgs/${confirmAction.id}`)
      toast.success(confirmAction.action === 'suspend' ? 'Organization suspended' : 'Organization deleted')
      setConfirmAction(null); fetch()
    } catch { toast.error('Action failed') } finally { setIsActioning(false) }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={fetch} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Organizations</h2>
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search organizations..." className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      <Card padding="none">
        {orgs.length === 0 ? (
          <EmptyState icon={<Building2 size={40} />} title="No organizations" description="Organizations will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Industry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {orgs.map((org: any) => (
                    <tr key={org.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-text-primary hover:text-primary cursor-pointer" onClick={() => navigate(`/admin/orgs/${org.id}`)}>{org.name}</p><p className="text-xs text-text-muted">{org.email}</p></td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{org.industry || '-'}</td>
                      <td className="px-4 py-3"><Badge size="sm" variant="primary">{org.tier}</Badge></td>
                      <td className="px-4 py-3"><Badge size="sm" variant={org.status === 'active' ? 'success' : 'danger'}>{org.status}</Badge></td>
                      <td className="px-4 py-3 text-sm text-text-muted">{formatDate(org.createdAt || new Date().toISOString())}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => navigate(`/admin/orgs/${org.id}`)} className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg" title="View usage stats"><ExternalLink size={14} /></button>
                          <button onClick={() => setConfirmAction({ id: org.id, action: 'suspend' })} className="p-1.5 text-text-muted hover:text-warning hover:bg-warning/10 rounded-lg"><Ban size={14} /></button>
                          <button onClick={() => setConfirmAction({ id: org.id, action: 'delete' })} className="p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleAction}
        title={confirmAction?.action === 'suspend' ? 'Suspend Organization' : 'Delete Organization'}
        message={confirmAction?.action === 'suspend' ? 'This will suspend the organization and all its members.' : 'This will permanently delete the organization and all data.'}
        confirmLabel={confirmAction?.action === 'suspend' ? 'Suspend' : 'Delete'}
        isLoading={isActioning}
      />
    </div>
  )
}

export default AdminOrgsPage;
