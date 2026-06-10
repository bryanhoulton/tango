import { Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, TextArea } from 'slate-ui'

import { ApiError, request, type AdminFunctionMeta } from '@/lib/api'

type RunState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: unknown }
  | { status: 'failed'; message: string }

/** Run screen for an admin-exposed function: JSON payload in, result out. */
export function FunctionScreen({ fn }: { fn: AdminFunctionMeta }) {
  const [payload, setPayload] = useState('')
  const [run, setRun] = useState<RunState>({ status: 'idle' })

  // Switching functions drops the previous payload and run outcome.
  useEffect(() => {
    setPayload('')
    setRun({ status: 'idle' })
  }, [fn.app, fn.name])

  const onRun = async () => {
    let parsed: unknown = null
    if (payload.trim().length > 0) {
      try {
        parsed = JSON.parse(payload)
      } catch {
        setRun({ status: 'failed', message: 'Payload is not valid JSON.' })
        return
      }
    }
    setRun({ status: 'running' })
    try {
      const response = await request<{ result: unknown }>(fn.apiPath, {
        method: 'POST',
        body: JSON.stringify({ payload: parsed })
      })
      setRun({ status: 'done', result: response.result })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? (err.detail ?? `Request failed with status ${err.status}.`)
          : 'Request failed.'
      setRun({ status: 'failed', message })
    }
  }

  return (
    <div className="px-6 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{fn.label}</h1>
      <p className="text-sm text-muted">{fn.appLabel}</p>

      <div className="mt-6 max-w-2xl space-y-4">
        <TextArea
          label="Payload (JSON)"
          rows={8}
          placeholder='{"key": "value"} — leave empty for a null payload'
          value={payload}
          onChange={setPayload}
          disabled={run.status === 'running'}
        />
        <Button
          variant="primary"
          iconLeft={Play}
          loading={run.status === 'running'}
          onClick={() => void onRun()}
        >
          Run function
        </Button>

        {run.status === 'failed' && (
          <p className="rounded-md bg-error-50 px-3 py-2 text-sm text-error-700">
            {run.message}
          </p>
        )}
        {run.status === 'done' && (
          <div>
            <p className="pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Result
            </p>
            <pre className="overflow-x-auto rounded-md border bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
              {JSON.stringify(run.result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
