// Type-only import: the meta contract is single-sourced from the server
// package and fully erased at build time.
import type { AdminMetaDocument } from '@tango-ts/admin'

const TOKEN_KEY = 'tango-admin-token'

declare global {
  interface Window {
    __TANGO_ADMIN__?: { apiBase?: string }
  }
}

export const apiBase: string = window.__TANGO_ADMIN__?.apiBase ?? '/admin/api'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token === null) {
    localStorage.removeItem(TOKEN_KEY)
  } else {
    localStorage.setItem(TOKEN_KEY, token)
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown
  ) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
  }

  get detail(): string | undefined {
    if (this.data !== null && typeof this.data === 'object' && 'detail' in this.data) {
      const detail = this.data.detail
      return typeof detail === 'string' ? detail : undefined
    }
    return undefined
  }

  /** Serializer validation errors: `{ field: [messages] }`. */
  get validationErrors(): Record<string, string[]> | undefined {
    if (this.status !== 400 || this.data === null || typeof this.data !== 'object') {
      return undefined
    }
    if ('detail' in this.data) {
      return undefined
    }
    return this.data as Record<string, string[]>
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...init.headers
    }
  })
  if (response.status === 204) {
    return undefined as T
  }
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, data)
  }
  return data as T
}

export interface PaginatedList<T> {
  readonly count: number
  readonly next: string | null
  readonly previous: string | null
  readonly results: T[]
}

export type Row = Record<string, unknown>

export interface LoginResponse {
  readonly token: string
  readonly user: AdminUser
}

export interface AdminUser {
  readonly id: number
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly isStaff: boolean
  readonly isSuperuser: boolean
}

export function fetchMeta(): Promise<AdminMetaDocument> {
  return request<AdminMetaDocument>(`${apiBase}/meta/`)
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>(`${apiBase}/auth/login/`, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  setToken(result.token)
  return result
}

export async function logout(): Promise<void> {
  try {
    await request(`${apiBase}/auth/logout/`, { method: 'POST' })
  } finally {
    setToken(null)
  }
}

export type {
  AdminFieldMeta,
  AdminFunctionMeta,
  AdminMetaDocument,
  AdminModelMeta,
  AdminRelationMeta
} from '@tango-ts/admin'
