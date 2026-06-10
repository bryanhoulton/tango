import { useCallback, useEffect, useState } from 'react'

import {
  apiBase,
  ApiError,
  fetchMeta,
  getToken,
  logout,
  request,
  setToken,
  type AdminMetaDocument,
  type AdminUser,
  type LoginResponse
} from '@/lib/api'
import { navigate, useRoute } from '@/lib/router'

import { FormModal } from './screens/FormModal.js'
import { FunctionScreen } from './screens/FunctionScreen.js'
import { Layout } from './screens/Layout.js'
import { ListScreen } from './screens/ListScreen.js'
import { LoginScreen } from './screens/LoginScreen.js'

type Session =
  | { state: 'loading' }
  | { state: 'anonymous' }
  | { state: 'ready'; meta: AdminMetaDocument; user: AdminUser | undefined }

export function App() {
  const [session, setSession] = useState<Session>({ state: 'loading' })
  // Bumped after a modal save/delete so the list under it refetches.
  const [listVersion, setListVersion] = useState(0)
  const route = useRoute()

  const boot = useCallback(async () => {
    if (getToken() === null) {
      setSession({ state: 'anonymous' })
      return
    }
    try {
      const [meta, user] = await Promise.all([
        fetchMeta(),
        request<AdminUser>(`${apiBase}/auth/me/`)
      ])
      setSession({ state: 'ready', meta, user })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setToken(null)
        setSession({ state: 'anonymous' })
      } else {
        setSession({ state: 'anonymous' })
      }
    }
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  // The HTML ships prebuilt with a generic <title>; the project's title only
  // becomes known once the meta document loads.
  useEffect(() => {
    if (session.state === 'ready') {
      document.title = session.meta.site.title
    }
  }, [session])

  const onLogin = async (login: LoginResponse) => {
    try {
      const meta = await fetchMeta()
      setSession({ state: 'ready', meta, user: login.user })
    } catch {
      setSession({ state: 'anonymous' })
    }
  }

  const onLogout = async () => {
    await logout().catch(() => undefined)
    setSession({ state: 'anonymous' })
    navigate('/')
  }

  if (session.state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (session.state === 'anonymous') {
    return <LoginScreen onLogin={(login) => void onLogin(login)} />
  }

  const { meta, user } = session

  if (route.kind === 'function') {
    const fn = meta.functions.find(
      (candidate) => candidate.app === route.app && candidate.name === route.name
    )
    return (
      <Layout meta={meta} user={user} route={route} onLogout={() => void onLogout()}>
        {fn === undefined ? (
          <p className="p-6 text-sm text-muted">Unknown function.</p>
        ) : (
          <FunctionScreen fn={fn} />
        )}
      </Layout>
    )
  }

  const model =
    route.kind === 'home'
      ? meta.models[0]
      : meta.models.find((candidate) => candidate.name === route.model)

  const closeModal = () => {
    if (model !== undefined) {
      navigate(`/m/${encodeURIComponent(model.name)}`)
    }
  }

  return (
    <Layout meta={meta} user={user} route={route} onLogout={() => void onLogout()}>
      {model === undefined ? (
        <p className="p-6 text-sm text-muted">
          {meta.models.length === 0
            ? 'No models are registered with the admin.'
            : 'Unknown model.'}
        </p>
      ) : (
        <>
          {/* The list stays mounted under the create/edit modal. */}
          <ListScreen model={model} refreshToken={listVersion} />
          {(route.kind === 'create' || route.kind === 'edit') && (
            <FormModal
              model={model}
              id={route.kind === 'edit' ? route.id : undefined}
              onClose={closeModal}
              onSaved={() => {
                setListVersion((version) => version + 1)
                closeModal()
              }}
            />
          )}
        </>
      )}
    </Layout>
  )
}
