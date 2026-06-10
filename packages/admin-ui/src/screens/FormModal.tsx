import { Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ActionIcon, Button, Modal, useConfirm } from 'slate-ui'

import { ApiError, request, type AdminModelMeta, type Row } from '@/lib/api'
import { fromDatetimeLocal } from '@/lib/format'

import { FieldInput } from './FieldInput.js'

/** Build the JSON payload from form state, skipping read-only fields. */
function buildPayload(model: AdminModelMeta, values: Row): Row {
  const payload: Row = {}
  for (const field of model.fields) {
    if (field.readOnly) {
      continue
    }
    let value = values[field.name]
    if (field.type === 'datetime' && typeof value === 'string') {
      // datetime-local inputs produce local time without a zone.
      value = value.includes('T') && !value.endsWith('Z') ? fromDatetimeLocal(value) : value
    }
    if (value === undefined) {
      continue
    }
    payload[field.name] = value
  }
  return payload
}

export function FormModal({
  model,
  id,
  onClose,
  onSaved
}: {
  model: AdminModelMeta
  /** undefined = create form. */
  id?: string
  onClose: () => void
  onSaved: () => void
}) {
  const editing = id !== undefined
  const { confirm } = useConfirm()
  const [values, setValues] = useState<Row>({})
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(!editing)

  const visibleFields = useMemo(
    () => model.fields.filter((field) => editing || !field.readOnly),
    [model, editing]
  )

  useEffect(() => {
    setValues({})
    setErrors({})
    setFormError(undefined)
    setLoaded(!editing)
    if (!editing) {
      return
    }
    let cancelled = false
    void request<Row>(`${model.apiPath}${encodeURIComponent(id)}/`)
      .then((row) => {
        if (!cancelled) {
          setValues(row)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFormError('Failed to load this record.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [model.apiPath, id, editing])

  const save = async () => {
    setSaving(true)
    setErrors({})
    setFormError(undefined)
    try {
      if (editing) {
        await request(`${model.apiPath}${encodeURIComponent(id)}/`, {
          method: 'PATCH',
          body: JSON.stringify(buildPayload(model, values))
        })
      } else {
        await request(model.apiPath, {
          method: 'POST',
          body: JSON.stringify(buildPayload(model, values))
        })
      }
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        const validation = err.validationErrors
        if (validation !== undefined) {
          setErrors(validation)
        } else {
          setFormError(err.detail ?? 'Failed to save.')
        }
      } else {
        setFormError('Network error.')
      }
    } finally {
      setSaving(false)
    }
  }

  const destroy = async () => {
    if (!editing) {
      return
    }
    try {
      await request(`${model.apiPath}${encodeURIComponent(id)}/`, {
        method: 'DELETE'
      })
      onSaved()
    } catch {
      setFormError('Failed to delete.')
    }
  }

  const confirmDelete = () => {
    confirm({
      title: `Delete ${model.singularLabel.toLowerCase()} #${id ?? ''}?`,
      description: 'This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: () => void destroy()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
      className="w-[560px] max-w-[calc(100vw-2rem)] p-0"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold leading-tight tracking-tight">
              {editing
                ? `Edit ${model.singularLabel.toLowerCase()}`
                : `Add ${model.singularLabel.toLowerCase()}`}
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {editing ? `${model.label} · #${id}` : model.label}
            </p>
          </div>
          <ActionIcon icon={X} variant="subtle" onClick={onClose} />
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {formError !== undefined && (
            <p className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-700">
              {formError}
            </p>
          )}
          {!loaded && formError === undefined && (
            <p className="py-8 text-center text-sm text-muted">Loading…</p>
          )}
          {loaded &&
            visibleFields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={values[field.name]}
                disabled={field.readOnly || saving}
                error={errors[field.name]?.[0]}
                onChange={(value) =>
                  setValues((prev) => ({ ...prev, [field.name]: value }))
                }
              />
            ))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-neutral-50 px-6 py-4">
          <div>
            {editing && (
              <Button
                type="button"
                variant="error"
                iconLeft={Trash2}
                onClick={confirmDelete}
              >
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={!loaded}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
