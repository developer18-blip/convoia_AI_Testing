import { X } from 'lucide-react'
import { Sidebar } from './Sidebar'

interface MobileNavProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-[260px] h-full animate-in slide-in-from-left duration-200">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-2 rounded-lg"
        >
          <X size={18} />
        </button>
        <Sidebar collapsed={false} onToggle={() => {}} onClose={onClose} />
      </div>
    </div>
  )
}
