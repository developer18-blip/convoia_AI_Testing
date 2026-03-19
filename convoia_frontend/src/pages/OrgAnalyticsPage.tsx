import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { AreaChart } from '../components/charts/AreaChart'
import { DonutChart } from '../components/charts/DonutChart'
import { LoadingPage } from '../components/shared/LoadingPage'
import { ErrorState } from '../components/shared/ErrorState'
import api from '../lib/api'

export function OrgAnalyticsPage() {
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/org/analytics').then((res) => setData(res.data.data))
      .catch(() => setError('Failed to load analytics')).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) return <LoadingPage />
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />

  const dailyData = data?.dailyUsage || []
  const memberData = (data?.memberBreakdown || []).map((m: any) => ({ name: m.name, value: m.cost }))
  const modelData = (data?.modelBreakdown || []).map((m: any) => ({ name: m.name, value: m.cost }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-text-primary">Organization Analytics</h2>
        <Button variant="secondary"><Download size={16} /> Export</Button>
      </div>

      <Card padding="lg">
        <h3 className="text-sm font-medium text-text-secondary mb-4">Daily Spend</h3>
        {dailyData.length > 0 ? (
          <AreaChart data={dailyData} xKey="date" yKey="cost" height={300} formatY={(v: number) => `$${v.toFixed(2)}`} />
        ) : <div className="h-[300px] flex items-center justify-center text-text-muted text-sm">No data</div>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">By Member</h3>
          {memberData.length > 0 ? <DonutChart data={memberData} /> : <p className="text-center text-text-muted text-sm py-8">No data</p>}
        </Card>
        <Card padding="lg">
          <h3 className="text-sm font-medium text-text-secondary mb-4">By Model</h3>
          {modelData.length > 0 ? <DonutChart data={modelData} /> : <p className="text-center text-text-muted text-sm py-8">No data</p>}
        </Card>
      </div>
    </div>
  )
}

export default OrgAnalyticsPage;
