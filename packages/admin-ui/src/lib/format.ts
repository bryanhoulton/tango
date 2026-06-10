import type { AdminFieldMeta } from '@/lib/api'

/** Safe `String(...)` for `unknown` JSON values. */
export function stringify(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value)
    case 'object':
      return value === null ? '' : JSON.stringify(value)
    default:
      return ''
  }
}

/** Render a cell value for the list table. */
export function formatValue(field: AdminFieldMeta | undefined, value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }
  if (field?.type === 'datetime' || field?.type === 'date') {
    const date = new Date(stringify(value))
    if (!Number.isNaN(date.getTime())) {
      return field.type === 'date' ? date.toLocaleDateString() : date.toLocaleString()
    }
  }
  const text = stringify(value)
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

/** ISO string → value for `<input type="datetime-local">` (local time). */
export function toDatetimeLocal(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `<input type="datetime-local">` value → ISO string for the API. */
export function fromDatetimeLocal(value: string): string | null {
  if (value.length === 0) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
