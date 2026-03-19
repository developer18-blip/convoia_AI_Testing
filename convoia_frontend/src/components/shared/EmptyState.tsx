import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Button } from '../ui/Button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <div className="p-4 bg-surface-2 rounded-2xl text-text-muted mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-text-primary mb-2">{title}</h3>
      <p className="text-sm text-text-muted text-center max-w-sm mb-6">{description}</p>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </motion.div>
  )
}
