import { Inbox, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
  Button,
  Pagination,
  Select,
  Table,
  TextInput
} from 'slate-ui'

import {
  request,
  type AdminModelMeta,
  type PaginatedList,
  type Row
} from '@/lib/api'
import { formatValue, stringify } from '@/lib/format'
import { navigate } from '@/lib/router'

function isBooleanFilter(model: AdminModelMeta, filter: string): boolean {
  return model.fields.some(
    (field) => field.name === filter && field.type === 'boolean'
  )
}

const BOOLEAN_FILTER_ITEMS = [
  { id: 'true', name: 'Yes' },
  { id: 'false', name: 'No' }
]

export function ListScreen({
  model,
  refreshToken = 0
}: {
  model: AdminModelMeta
  /** Bumped by the parent when a modal mutation should trigger a refetch. */
  refreshToken?: number
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [data, setData] = useState<PaginatedList<Row> | undefined>()
  const [error, setError] = useState<string | undefined>()

  const searchField = model.searchFields[0]

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) })
    if (search.length > 0 && searchField !== undefined) {
      params.set(`${searchField}__icontains`, search)
    }
    for (const [key, value] of Object.entries(filters)) {
      if (value.length > 0) {
        params.set(key, value)
      }
    }
    try {
      setData(await request<PaginatedList<Row>>(`${model.apiPath}?${params}`))
      setError(undefined)
    } catch {
      setError('Failed to load rows.')
    }
  }, [model.apiPath, page, search, searchField, filters, refreshToken])

  useEffect(() => {
    void load()
  }, [load])

  // Changing model resets list state.
  useEffect(() => {
    setPage(1)
    setSearch('')
    setFilters({})
  }, [model.name])

  const fieldByName = new Map(model.fields.map((field) => [field.name, field]))
  const columns = model.listDisplay.slice(0, 8).map((column) => ({
    id: column,
    value: fieldByName.get(column)?.label ?? column,
    cell: ({ row }: { row: Row }) => {
      const value = row[column]
      if (typeof value === 'boolean') {
        return (
          <Badge variant={value ? 'success' : 'default'}>
            {value ? 'Yes' : 'No'}
          </Badge>
        )
      }
      return formatValue(fieldByName.get(column), value)
    }
  }))

  return (
    <div>
      <div className="flex items-center justify-between gap-4 px-6 pt-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{model.label}</h1>
          {data !== undefined && (
            <p className="text-sm text-muted">{data.count} total</p>
          )}
        </div>
        <Button
          variant="primary"
          iconLeft={Plus}
          onClick={() => navigate(`/m/${encodeURIComponent(model.name)}/new`)}
        >
          Add {model.singularLabel.toLowerCase()}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 px-6 py-4">
        {searchField !== undefined && (
          <TextInput
            className="w-72"
            iconLeft={Search}
            placeholder={`Search by ${searchField}…`}
            value={search}
            onChange={(value) => {
              setSearch(value)
              setPage(1)
            }}
          />
        )}
        {model.filters.map((filter) =>
          isBooleanFilter(model, filter) ? (
            <Select
              key={filter}
              className="w-44"
              placeholder={filter}
              items={BOOLEAN_FILTER_ITEMS}
              clearable
              value={filters[filter] ?? null}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, [filter]: value ?? '' }))
                setPage(1)
              }}
            />
          ) : (
            <TextInput
              key={filter}
              className="w-44"
              placeholder={filter}
              value={filters[filter] ?? ''}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, [filter]: value }))
                setPage(1)
              }}
            />
          )
        )}
      </div>

      {error !== undefined && (
        <p className="px-6 pb-4 text-sm text-error-500">{error}</p>
      )}

      {/* Full-bleed table: flush with the container edges, with the first and
          last columns padded to align with the page gutters. */}
      <div className="border-t [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
        <Table<Row>
          columns={columns}
          rows={data?.results ?? []}
          loading={data === undefined && error === undefined}
          onRowClick={(row) =>
            navigate(
              `/m/${encodeURIComponent(model.name)}/${encodeURIComponent(stringify(row[model.pk]))}`
            )
          }
          emptyState={{
            icon: Inbox,
            title: `No ${model.label.toLowerCase()} found.`,
            button: {
              children: `Add ${model.singularLabel.toLowerCase()}`,
              onClick: () => navigate(`/m/${encodeURIComponent(model.name)}/new`)
            }
          }}
        />
      </div>
      {data !== undefined && data.count > model.pagination.pageSize && (
        <div className="flex items-center justify-between border-t px-6 py-2">
          <span className="text-xs text-muted">{data.count} total</span>
          {/* slate-ui Pagination is 0-indexed; the Tango API is 1-indexed. */}
          <Pagination
            pageSize={model.pagination.pageSize}
            maxRow={data.count}
            page={page - 1}
            onPageChange={(zeroIndexed) => setPage(zeroIndexed + 1)}
          />
        </div>
      )}
    </div>
  )
}
