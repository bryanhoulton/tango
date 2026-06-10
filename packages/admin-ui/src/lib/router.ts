import { useEffect, useState } from 'react'

/**
 * Hash-based routing: the SPA is served as static files from any mount point,
 * so real-path routing (and the server rewrites it needs) is avoided entirely.
 *
 * Routes:
 * - `#/`                 → redirect to the first model
 * - `#/m/<model>`        → list view
 * - `#/m/<model>/new`    → create form
 * - `#/m/<model>/<id>`   → edit form
 */
export type AdminRoute =
  | { readonly kind: 'home' }
  | { readonly kind: 'list'; readonly model: string }
  | { readonly kind: 'create'; readonly model: string }
  | { readonly kind: 'edit'; readonly model: string; readonly id: string }

function currentHash(): string {
  return window.location.hash.slice(1) || '/'
}

export function parseRoute(hash: string): AdminRoute {
  const parts = hash.split('/').filter((part) => part.length > 0)
  if (parts[0] !== 'm' || parts[1] === undefined) {
    return { kind: 'home' }
  }
  const model = decodeURIComponent(parts[1])
  if (parts[2] === undefined) {
    return { kind: 'list', model }
  }
  if (parts[2] === 'new') {
    return { kind: 'create', model }
  }
  return { kind: 'edit', model, id: decodeURIComponent(parts[2]) }
}

export function navigate(path: string): void {
  window.location.hash = path
}

export function useRoute(): AdminRoute {
  const [hash, setHash] = useState(currentHash)
  useEffect(() => {
    const onChange = () => setHash(currentHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parseRoute(hash)
}
