import { Brain, Search, Zap, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import { Button } from '../ui/Button'
import type { AgentRun } from '../../types'

interface AgentPanelProps {
  agentRun: AgentRun
  onCancel?: () => void
}

const stepIcons = {
  thinking: <Brain size={16} className="text-blue-400" />,
  searching: <Search size={16} className="text-amber-400" />,
  executing: <Zap size={16} className="text-primary" />,
  complete: <CheckCircle2 size={16} className="text-success" />,
  error: <XCircle size={16} className="text-danger" />,
}

export function AgentPanel({ agentRun, onCancel }: AgentPanelProps) {
  const isRunning = agentRun.status === 'running'
  const totalCostSoFar = agentRun.steps.reduce((s, step) => s + (step.cost || 0), 0)

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-2 border-b border-border">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Loader2 size={16} className="text-primary animate-spin" />
          ) : agentRun.status === 'complete' ? (
            <CheckCircle2 size={16} className="text-success" />
          ) : (
            <XCircle size={16} className="text-danger" />
          )}
          <span className="text-sm font-medium text-text-primary">
            {isRunning ? 'Agent Working...' : agentRun.status === 'complete' ? 'Agent Complete' : 'Agent Failed'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted">{formatCurrency(totalCostSoFar)} so far</span>
          {isRunning && onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="p-4 space-y-3">
        {agentRun.steps.map((step, i) => (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="mt-0.5">{stepIcons[step.type]}</div>
              {i < agentRun.steps.length - 1 && (
                <div className="w-px flex-1 bg-border my-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <p className="text-sm font-medium text-text-primary">{step.title}</p>
              <p className="text-xs text-text-muted mt-0.5">{step.content}</p>
              {step.result && (
                <div className="mt-1.5 p-2 bg-surface-2 rounded-lg text-xs text-text-secondary">
                  {step.result}
                </div>
              )}
              {step.cost !== undefined && step.cost > 0 && (
                <span className="text-xs font-mono text-primary mt-1 inline-block">{formatCurrency(step.cost)}</span>
              )}
            </div>
          </div>
        ))}

        {isRunning && (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Processing...</span>
          </div>
        )}
      </div>
    </div>
  )
}
