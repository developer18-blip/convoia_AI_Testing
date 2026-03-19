import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface PaginationProps {
  page: number
  pages: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pages, total, onPageChange }: PaginationProps) {
  if (pages <= 1) return null

  const getVisiblePages = () => {
    const visible: number[] = []
    const start = Math.max(1, page - 2)
    const end = Math.min(pages, page + 2)
    for (let i = start; i <= end; i++) visible.push(i)
    return visible
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-sm text-text-muted">
        {total} result{total !== 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        {getVisiblePages().map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={cn(
              'min-w-[32px] h-8 rounded-lg text-sm transition-colors',
              p === page
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
            )}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
