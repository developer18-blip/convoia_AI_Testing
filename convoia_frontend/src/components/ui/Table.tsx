import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Column<T> {
  key: string
  header: string
  className?: string
  render?: (item: T) => ReactNode
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (item: T) => void
  emptyMessage?: string
  className?: string
}

export function Table<T extends { id?: string }>({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data',
  className,
}: TableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-text-muted text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, i) => (
              <tr
                key={item.id || i}
                onClick={() => onRowClick?.(item)}
                className={cn(
                  'border-b border-border/50 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-surface-2'
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3 text-sm text-text-secondary', col.className)}>
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
