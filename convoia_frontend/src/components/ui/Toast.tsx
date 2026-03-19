import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { useToast } from '../../hooks/useToast'
import { cn } from '../../lib/utils'

const iconMap = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const colorMap = {
  success: 'border-success/20 bg-success/5',
  error: 'border-danger/20 bg-danger/5',
  warning: 'border-warning/20 bg-warning/5',
  info: 'border-info/20 bg-info/5',
}

const iconColorMap = {
  success: 'text-success',
  error: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
}

export function ToastContainer() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = iconMap[toast.type]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 80, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                'flex items-start gap-3 px-4 py-3 rounded-2xl border bg-surface/90 backdrop-blur-xl shadow-xl shadow-black/10',
                colorMap[toast.type]
              )}
            >
              <Icon size={18} className={cn('mt-0.5 shrink-0', iconColorMap[toast.type])} />
              <p className="text-sm text-text-primary flex-1">{toast.message}</p>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => dismiss(toast.id)}
                className="text-text-muted hover:text-text-primary shrink-0 transition-colors"
              >
                <X size={14} />
              </motion.button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
