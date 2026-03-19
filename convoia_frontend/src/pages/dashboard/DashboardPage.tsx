import { useAuth } from '../../hooks/useAuth'
import { useDashboard } from '../../hooks/useDashboard'
import { LoadingPage } from '../../components/shared/LoadingPage'
import { ErrorState } from '../../components/shared/ErrorState'
import { PersonalView } from './views/PersonalView'
import { EmployeeView } from './views/EmployeeView'
import { ManagerView } from './views/ManagerView'
import { OwnerView } from './views/OwnerView'
import { AdminView } from './views/AdminView'

export function DashboardPage() {
  const { user } = useAuth()
  const { stats, wallet, sessions, recentUsage, insights, budget, isLoading, error, refetch } = useDashboard()

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  const role = user?.role || 'employee'
  const hasOrg = !!user?.organizationId
  const userName = user?.name || 'User'
  const orgName = user?.organization?.name || 'Organization'

  // Platform Admin — completely separate view
  if (role === 'platform_admin') return <AdminView />

  // Org Owner — full financial + org visibility
  if (role === 'org_owner') {
    return (
      <OwnerView
        stats={stats}
        userName={userName}
        orgName={orgName}
        plan={user?.organization?.tier || 'Free'}
      />
    )
  }

  // Manager — team management, NO money
  if (role === 'manager') {
    return (
      <ManagerView
        stats={stats}
        userName={userName}
        orgName={orgName}
      />
    )
  }

  // Employee (with org) — NO money, token-only
  if (role === 'employee' && hasOrg) {
    return (
      <EmployeeView
        stats={stats}
        recentUsage={recentUsage}
        insights={insights}
        userName={userName}
        orgName={orgName}
        budget={budget}
      />
    )
  }

  // General user / Freelancer (no org) — full personal view with wallet
  return (
    <PersonalView
      stats={stats}
      wallet={wallet}
      sessions={sessions}
      recentUsage={recentUsage}
      insights={insights}
      userName={userName}
    />
  )
}

export default DashboardPage
