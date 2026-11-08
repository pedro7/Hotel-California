import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ensureCsrf, errorMessage, fieldError, formError, request } from './client'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function clearCookies() {
  document.cookie.split('; ').forEach((cookie) => {
    const name = cookie.split('=')[0]
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  })
}

describe('request', () => {
  let fetchMock

  beforeEach(() => {
    clearCookies()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearCookies()
  })

  const lastCall = () => fetchMock.mock.calls.at(-1)

  it('sends GET requests with the session cookie and without a CSRF header', async () => {
    document.cookie = 'csrftoken=abc123'
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    const data = await request('/guests/')

    const [url, options] = lastCall()
    expect(String(url)).toMatch(/\/api\/guests\/$/)
    expect(options.method).toBe('GET')
    expect(options.credentials).toBe('same-origin')
    expect(options.headers['X-CSRFToken']).toBeUndefined()
    expect(data).toEqual({ ok: true })
  })

  it('adds query params and skips empty ones', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))

    await request('/guests/', {
      params: { search: 'maria', page: 2, in_hotel: '', name: undefined, document: null },
    })

    const url = new URL(String(lastCall()[0]))
    expect(url.searchParams.get('search')).toBe('maria')
    expect(url.searchParams.get('page')).toBe('2')
    expect([...url.searchParams.keys()].sort()).toEqual(['page', 'search'])
  })

  it('sends JSON bodies with the CSRF token from the cookie on unsafe methods', async () => {
    document.cookie = 'csrftoken=abc123'
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }, 201))

    await request('/guests/', { method: 'POST', body: { name: 'Maria' } })

    const [, options] = lastCall()
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.headers['X-CSRFToken']).toBe('abc123')
    expect(options.body).toBe(JSON.stringify({ name: 'Maria' }))
  })

  it('requests the CSRF cookie first when it is missing', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith('/api/auth/csrf/')) {
        document.cookie = 'csrftoken=fresh'
        return jsonResponse({ detail: 'ok' })
      }
      return jsonResponse({ id: 1 })
    })

    await request('/guests/', { method: 'POST', body: {} })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/auth\/csrf\/$/)
    expect(fetchMock.mock.calls[1][1].headers['X-CSRFToken']).toBe('fresh')
  })

  it('does not fetch the CSRF cookie again when it is already present', async () => {
    document.cookie = 'csrftoken=abc123'
    fetchMock.mockResolvedValue(jsonResponse({}))

    await request('/reservations/1/check-in/', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null for 204 responses', async () => {
    document.cookie = 'csrftoken=abc123'
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    expect(await request('/auth/logout/', { method: 'POST' })).toBeNull()
  })

  it('throws ApiError with status and parsed body on failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Não encontrado.' }, 404))

    const error = await request('/guests/99/').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.data).toEqual({ detail: 'Não encontrado.' })
    expect(error.message).toBe('Não encontrado.')
  })

  it('copes with non-JSON error bodies', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))

    const error = await request('/guests/').catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.data).toBeNull()
  })

  it('ensureCsrf calls the csrf endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    await ensureCsrf()
    expect(String(lastCall()[0])).toMatch(/\/api\/auth\/csrf\/$/)
  })
})

describe('errorMessage', () => {
  it('uses the API detail when present', () => {
    expect(errorMessage(new ApiError(409, { detail: 'Já feito.' }))).toBe('Já feito.')
  })

  it('joins field validation messages', () => {
    const error = new ApiError(400, { document: ['Documento inválido.'], phone: ['Telefone inválido.'] })
    expect(errorMessage(error)).toBe('Documento inválido. Telefone inválido.')
  })

  it('falls back to the status code', () => {
    expect(errorMessage(new ApiError(500, null))).toBe('Erro inesperado (500).')
  })

  it('reports connection problems for network errors', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toMatch(/conectar ao servidor/)
  })
})

describe('fieldError', () => {
  const error = new ApiError(400, { document: ['Já existe.', 'Outra.'], name: ['Obrigatório.'] })

  it('returns the messages of one field', () => {
    expect(fieldError(error, 'document')).toBe('Já existe. Outra.')
    expect(fieldError(error, 'name')).toBe('Obrigatório.')
  })

  it('returns an empty string for other fields, statuses and error types', () => {
    expect(fieldError(error, 'phone')).toBe('')
    expect(fieldError(new ApiError(409, { document: ['x'] }), 'document')).toBe('')
    expect(fieldError(null, 'document')).toBe('')
    expect(fieldError(new Error('x'), 'document')).toBe('')
  })
})

describe('formError', () => {
  it('returns non-field validation errors', () => {
    const error = new ApiError(400, { non_field_errors: ['Datas inválidas.'] })
    expect(formError(error)).toBe('Datas inválidas.')
  })

  it('is empty for field-only validation errors and for no error', () => {
    expect(formError(new ApiError(400, { name: ['x'] }))).toBe('')
    expect(formError(null)).toBe('')
  })

  it('surfaces non-validation failures', () => {
    expect(formError(new ApiError(409, { detail: 'Conflito.' }))).toBe('Conflito.')
    expect(formError(new TypeError('Failed to fetch'))).toMatch(/conectar ao servidor/)
  })
})
