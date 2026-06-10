import { useState } from 'react'
import { Button, TextInput } from 'slate-ui'

import { ApiError, login, type LoginResponse } from '@/lib/api'

export function LoginScreen({
  onLogin
}: {
  onLogin: (session: LoginResponse) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      onLogin(await login(email, password))
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.detail ?? 'Unable to log in.')
          : 'Network error — is the server running?'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted-light p-4">
      <div className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Tango Admin</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Sign in with a staff account.</p>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <TextInput
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={setEmail}
          />
          <TextInput
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
            error={error}
          />
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  )
}
