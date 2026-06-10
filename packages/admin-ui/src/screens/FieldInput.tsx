import { useEffect, useState } from 'react'
import { Checkbox, Select, TextArea, TextInput } from 'slate-ui'

import {
  request,
  type AdminFieldMeta,
  type PaginatedList,
  type Row
} from '@/lib/api'
import { stringify, toDatetimeLocal } from '@/lib/format'

interface FieldInputProps {
  readonly field: AdminFieldMeta
  readonly value: unknown
  readonly disabled: boolean
  readonly error?: string
  readonly onChange: (value: unknown) => void
}

function fieldLabel(field: AdminFieldMeta): string {
  return field.required ? `${field.label} *` : field.label
}

interface RelationOption {
  readonly id: number
  readonly name: string
}

function toOption(
  row: Row,
  column: string,
  displayField: string
): RelationOption | undefined {
  const id = row[column]
  if (typeof id !== 'number') {
    return undefined
  }
  return { id, name: `${stringify(row[displayField] ?? id)} (#${id})` }
}

/**
 * Foreign key picker: a searchable Select over the related model's admin
 * endpoint, showing its display field. Falls back to a plain numeric input
 * when the related model is not registered with the admin.
 */
function RelationPicker({ field, value, disabled, error, onChange }: FieldInputProps) {
  const relation = field.relation
  const apiPath = relation?.apiPath
  const column = relation?.column ?? 'id'
  const displayField = relation?.displayField ?? 'id'
  const current = typeof value === 'number' ? value : null

  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<RelationOption[]>([])

  useEffect(() => {
    if (apiPath === undefined) {
      return
    }
    const params = new URLSearchParams()
    if (search.length > 0) {
      params.set(`${displayField}__icontains`, search)
    }
    let cancelled = false
    void (async () => {
      const page = await request<PaginatedList<Row>>(`${apiPath}?${params}`).catch(
        () => undefined
      )
      if (cancelled || page === undefined) {
        return
      }
      const loaded = page.results
        .map((row) => toOption(row, column, displayField))
        .filter((option): option is RelationOption => option !== undefined)
      // Keep the currently selected row in the list even when the current
      // search page does not include it, so the Select can render its label.
      if (current !== null && !loaded.some((option) => option.id === current)) {
        const row = await request<Row>(`${apiPath}${current}/`).catch(() => undefined)
        if (row !== undefined) {
          const option = toOption(row, column, displayField)
          if (option !== undefined) {
            loaded.unshift(option)
          }
        }
      }
      if (!cancelled) {
        setOptions(loaded)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [apiPath, column, displayField, search, current])

  if (apiPath === undefined) {
    return (
      <TextInput
        label={fieldLabel(field)}
        type="number"
        disabled={disabled}
        error={error}
        value={current === null ? '' : String(current)}
        onChange={(text) => onChange(text === '' ? null : Number(text))}
      />
    )
  }

  return (
    <Select<number>
      label={fieldLabel(field)}
      placeholder={`Select ${field.label.toLowerCase()}…`}
      items={options}
      value={current}
      disabled={disabled}
      error={error}
      searchable
      search={search}
      onSearchChange={setSearch}
      clearable={field.nullable}
      onChange={(selected) => onChange(selected)}
    />
  )
}

export function FieldInput(props: FieldInputProps) {
  const { field, value, disabled, error, onChange } = props

  if (field.relation !== undefined) {
    return <RelationPicker {...props} />
  }

  if (field.choices !== undefined) {
    return (
      <Select<string | number>
        label={fieldLabel(field)}
        placeholder={`Select ${field.label.toLowerCase()}…`}
        items={field.choices.map((choice) => ({
          id: choice,
          name: String(choice)
        }))}
        value={
          typeof value === 'string' || typeof value === 'number' ? value : null
        }
        disabled={disabled}
        error={error}
        clearable={field.nullable}
        onChange={(selected) => onChange(selected)}
      />
    )
  }

  switch (field.type) {
    case 'boolean':
      return (
        <div className="space-y-1">
          <Checkbox
            label={fieldLabel(field)}
            disabled={disabled}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
          />
          {error !== undefined && <p className="text-sm text-error-500">{error}</p>}
        </div>
      )
    case 'int':
    case 'float':
      return (
        <TextInput
          label={fieldLabel(field)}
          type="number"
          step={field.type === 'float' ? 'any' : 1}
          disabled={disabled}
          error={error}
          value={value === null || value === undefined ? '' : stringify(value)}
          onChange={(text) => onChange(text === '' ? null : Number(text))}
        />
      )
    case 'text':
      return (
        <TextArea
          label={fieldLabel(field)}
          rows={5}
          disabled={disabled}
          error={error}
          value={value === null || value === undefined ? '' : stringify(value)}
          onChange={(text) => onChange(text === '' && field.nullable ? null : text)}
        />
      )
    case 'datetime':
      return (
        <TextInput
          label={fieldLabel(field)}
          type="datetime-local"
          disabled={disabled}
          error={error}
          value={toDatetimeLocal(value)}
          onChange={(text) => onChange(text)}
        />
      )
    case 'date':
      return (
        <TextInput
          label={fieldLabel(field)}
          type="date"
          disabled={disabled}
          error={error}
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={(text) => onChange(text === '' ? null : text)}
        />
      )
    case 'varchar':
      return (
        <TextInput
          label={fieldLabel(field)}
          disabled={disabled}
          error={error}
          {...(field.maxLength === undefined ? {} : { maxLength: field.maxLength })}
          value={value === null || value === undefined ? '' : stringify(value)}
          onChange={(text) => onChange(text === '' && field.nullable ? null : text)}
        />
      )
  }
}
