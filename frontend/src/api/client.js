// Thin fetch wrapper for the Django API (same origin, session cookie + CSRF).

const BASE = '/api'
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS']

export class ApiError extends Error {
  constructor(status, data) {
    super(typeof data?.detail === 'string' ? data.detail : `Erro ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function getCookie(name) {
  const prefix = `${name}=`
  const entry = document.cookie.split('; ').find((c) => c.startsWith(prefix))
  return entry ? decodeURIComponent(entry.slice(prefix.length)) : null
}

/** Makes Django set the `csrftoken` cookie. */
export async function ensureCsrf() {
  await fetch(`${BASE}/auth/csrf/`, { credentials: 'same-origin' })
}

export async function request(path, { method = 'GET', body, params, signal } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value)
    }
  }

  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (!SAFE_METHODS.includes(method)) {
    if (!getCookie('csrftoken')) await ensureCsrf()
    headers['X-CSRFToken'] = getCookie('csrftoken') ?? ''
  }

  const response = await fetch(url, {
    method,
    headers,
    credentials: 'same-origin',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })

  if (response.status === 204) return null

  let data = null
  try {
    data = await response.json()
  } catch {
    // non-JSON body (e.g. proxy error page)
  }

  if (!response.ok) throw new ApiError(response.status, data)
  return data
}

/** Human readable message for any error thrown by `request`. */
export function errorMessage(error) {
  if (!(error instanceof ApiError)) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  const data = error.data
  if (!data) return `Erro inesperado (${error.status}).`
  if (typeof data.detail === 'string') return data.detail
  const messages = Object.values(data).flat().filter((m) => typeof m === 'string')
  return messages.length ? messages.join(' ') : `Erro inesperado (${error.status}).`
}

/** Validation message for one form field (DRF returns `{field: [msgs]}`), or ''. */
export function fieldError(error, field) {
  if (!(error instanceof ApiError) || error.status !== 400) return ''
  const messages = error.data?.[field]
  return Array.isArray(messages) ? messages.join(' ') : ''
}

/** Errors not tied to a field (DRF: `non_field_errors`), or ''. */
export function formError(error) {
  if (!(error instanceof ApiError)) return error ? errorMessage(error) : ''
  if (error.status !== 400) return errorMessage(error)
  const messages = error.data?.non_field_errors
  return Array.isArray(messages) ? messages.join(' ') : ''
}
