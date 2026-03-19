import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

interface Tab {
  id: string
  label: string
  count?: number
}

interface TabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 bg-surface border border-border rounded-2xl p-1', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'relative px-4 py-2 text-sm font-medium rounded-xl transition-colors',
            activeTab === tab.id
              ? 'text-white'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="tab-active"
              className="absolute inset-0 bg-gradient-to-r from-accent-start to-accent-mid rounded-xl"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            />
          )}
          <span className="relative z-10">
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'ml-1.5 text-xs',
                  activeTab === tab.id ? 'text-white/70' : 'text-text-muted'
                )}
              >
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
