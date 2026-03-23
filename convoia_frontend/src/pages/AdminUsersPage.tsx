import { useEffect, useState } from 'react'
import { Users, Search } from 'lucide-react'
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

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role })
      toast.success('Role updated')
      fetch()
    } catch { toast.error('Failed to update role') }
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </div>
  )
}

export default AdminUsersPage;
