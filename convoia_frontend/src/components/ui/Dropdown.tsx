import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../lib/utils'

interface DropdownItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

interface DropdownProps {
  trigger: ReactNode
  items: DropdownItem[]
  align?: 'left' | 'right'
}

export function Dropdown({ trigger, items, align = 'right' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen(!open)} className="cursor-pointer">
        {trigger}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              'absolute top-full mt-2 z-50 min-w-[180px] bg-surface border border-border rounded-2xl shadow-xl shadow-black/10 py-1.5 overflow-hidden',
              align === 'right' ? 'right-0' : 'left-0'
            )}
          >
            {items.map((item, i) =>
              item.divider ? (
                <div key={i} className="border-t border-border/50 my-1" />
              ) : (
                <button
                  key={i}
                  onClick={() => {
                    item.onClick()
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-all duration-150',
                    item.danger
                      ? 'text-danger hover:bg-danger/10'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
                  )}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
