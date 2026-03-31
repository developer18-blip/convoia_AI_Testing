import { useEffect, useState } from 'react'
import { Users, Search, Trash2 } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Avatar } from '../components/ui/Avatar'
import { Badge } from '../components/ui/Badge'
import { Select } from '../components/ui/Select'
import { Pagination } from '../components/ui/Pagination'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import { EmptyState } from '../components/shared/EmptyState'
import { useToast } from '../hooks/useToast'
import { formatDate } from '../lib/utils'
import api from '../lib/api'

export function AdminUsersPage() {
  const toast = useToast()
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })

  const fetch = async () => {
    try {
      setIsLoading(true); setError(null)
      const res = await api.get(`/admin/users?page=${page}&search=${search}`)
      const d = res.data.data
      if (d.data) { setUsers(d.data); setPagination(d.pagination) }
      else if (Array.isArray(d)) setUsers(d)
    } catch { setError('Failed to load users') } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [page, search])

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; email: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role })
      toast.success('Role updated')
      fetch()
    } catch { toast.error('Failed to update role') }
  }

  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      await api.delete(`/admin/users/${deleteTarget.id}`)
      toast.success(`${deleteTarget.email} permanently deleted`)
      setDeleteTarget(null)
      fetch()
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete user')
    } finally { setDeleting(false) }
  }

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={fetch} />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Users</h2>
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
      </div>

      <Card padding="none">
        {users.length === 0 ? (
          <EmptyState icon={<Users size={40} />} title="No users" description="Users will appear here." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Role</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Verified</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase">Joined</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase">Actions</th>
                </tr></thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={u.name} src={u.avatar} size="sm" /><div><p className="text-sm font-medium text-text-primary">{u.name}</p><p className="text-xs text-text-muted">{u.email}</p></div></div></td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{u.organization?.name || '-'}</td>
                      <td className="px-4 py-3">
                        <Select
                          options={[
                            { value: 'employee', label: 'Employee' },
                            { value: 'manager', label: 'Manager' },
                            { value: 'org_owner', label: 'Org Owner' },
                            { value: 'platform_admin', label: 'Platform Admin' },
                          ]}
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="w-36"
                        />
                      </td>
                      <td className="px-4 py-3 text-center"><Badge size="sm" variant={u.isVerified ? 'success' : 'warning'}>{u.isVerified ? 'Yes' : 'No'}</Badge></td>
                      <td className="px-4 py-3 text-sm text-text-muted">{formatDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-center">
                        {u.role !== 'platform_admin' && (
                          <button onClick={() => setDeleteTarget({ id: u.id, name: u.name, email: u.email })}
                            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                            title="Delete permanently">
                            <Trash2 size={15} />
                          </button>
                        )}
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

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDeleteTarget(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--color-surface)', borderRadius: '16px', padding: '24px',
            border: '1px solid var(--color-border)', maxWidth: '440px', width: '90%',
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 12px' }}>Delete User Permanently</h3>
            <p style={{ fontSize: '14px', color: 'var(--color-text-secondary)', margin: '0 0 12px' }}>
              Are you sure you want to permanently delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})?
            </p>
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '12px', color: '#EF4444', marginBottom: '16px' }}>
              This will delete their account, conversations, usage logs, tokens, wallet, and all associated data. This cannot be undone.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleDeleteUser} disabled={deleting}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', border: 'none', background: '#EF4444', color: 'white', cursor: 'pointer', fontWeight: 600, opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminUsersPage;
