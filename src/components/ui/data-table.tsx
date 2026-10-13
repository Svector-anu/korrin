'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { Skeleton } from './states'

export type Column<T> = {
  key: string
  header: ReactNode
  align?: 'left' | 'right'
  width?: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => number | string
  hideBelow?: 'sm' | 'md' | 'lg'
}

const hideClass = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  initialSort,
  caption,
  dense = false,
  selectedKey,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  loading?: boolean
  empty?: ReactNode
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  caption?: string
  dense?: boolean
  selectedKey?: string
}) {
  const [sort, setSort] = useState(initialSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const get = col.sortValue
    return [...rows].sort((a, b) => {
      const av = get(a)
      const bv = get(b)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, columns])

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="hairline-b border-line">
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  style={{ width: c.width }}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-4 py-3 text-[13px] font-normal whitespace-nowrap text-muted first:pl-5 last:pr-5', c.align === 'right' ? 'text-right' : 'text-left', c.hideBelow && hideClass[c.hideBelow])}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}
                      className={cn('inline-flex items-center gap-1 transition-colors hover:text-ink', active && 'text-ink', c.align === 'right' && 'flex-row-reverse')}
                    >
                      {c.header}
                      {active ? sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <span className="size-3" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            rows.length === 0 &&
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk-${i}`} className="hairline-b border-line-faint">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 first:pl-5 last:pr-5', c.hideBelow && hideClass[c.hideBelow])}>
                    <Skeleton className={cn('h-3', c.align === 'right' ? 'ml-auto w-16' : 'w-28')} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && empty && (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              tabIndex={onRowClick ? 0 : undefined}
              aria-selected={selectedKey === undefined ? undefined : selectedKey === rowKey(row)}
              className={cn(
                'hairline-b border-line-faint transition-colors duration-150 last:border-b-0',
                onRowClick && 'cursor-pointer hover:bg-hover focus-visible:bg-hover focus-visible:outline-none',
                selectedKey !== undefined && selectedKey === rowKey(row) && 'bg-recessed shadow-[inset_2px_0_0_var(--ink-structural)]',
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('px-4 align-middle first:pl-5 last:pr-5', dense ? 'py-2.5' : 'py-3.5', c.align === 'right' ? 'text-right' : 'text-left', c.hideBelow && hideClass[c.hideBelow])}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
