export function url(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString()
}

export function jsonHeaders(extra: HeadersInit = {}): HeadersInit {
  return { 'content-type': 'application/json', ...extra }
}

export function jsonRequest(
  method: 'DELETE' | 'PATCH' | 'POST' | 'PUT',
  body: unknown,
  headers: HeadersInit = {}
): RequestInit {
  return {
    method,
    headers: jsonHeaders(headers),
    body: JSON.stringify(body)
  }
}
