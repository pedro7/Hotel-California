import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api'
import { ApiError, ensureCsrf } from '../api/client'
import { AuthProvider } from '../auth/AuthProvider'
import LoginPage from './LoginPage'

vi.mock('../api', () => ({
  authApi: { login: vi.fn(), logout: vi.fn(), me: vi.fn() },
}))
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
}))

function renderLogin(initialEntries = ['/login']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reservations" element={<p>página de reservas</p>} />
          <Route path="/guests" element={<p>página de hóspedes</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(username, password) {
  await userEvent.type(await screen.findByLabelText('Usuário'), username)
  await userEvent.type(screen.getByLabelText('Senha'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  ensureCsrf.mockResolvedValue(undefined)
  authApi.me.mockRejectedValue(new ApiError(403, null))
})

describe('LoginPage', () => {
  it('asks for username and password', async () => {
    renderLogin()
    expect(await screen.findByLabelText('Usuário')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('logs in and goes to the reservations page', async () => {
    authApi.login.mockResolvedValue({ id: 1, username: 'atendente', first_name: '', last_name: '' })
    renderLogin()

    await fillAndSubmit('atendente', 'senha-forte-123')

    expect(authApi.login).toHaveBeenCalledWith('atendente', 'senha-forte-123')
    expect(await screen.findByText('página de reservas')).toBeInTheDocument()
  })

  it('returns to the page the attendant originally asked for', async () => {
    authApi.login.mockResolvedValue({ id: 1, username: 'atendente', first_name: '', last_name: '' })
    renderLogin([{ pathname: '/login', state: { from: { pathname: '/guests' } } }])

    await fillAndSubmit('atendente', 'senha-forte-123')

    expect(await screen.findByText('página de hóspedes')).toBeInTheDocument()
  })

  it('shows the server message when the credentials are wrong', async () => {
    authApi.login.mockRejectedValue(new ApiError(401, { detail: 'Usuário ou senha inválidos.' }))
    renderLogin()

    await fillAndSubmit('atendente', 'errada')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.')
    expect(screen.getByLabelText('Usuário')).toBeInTheDocument() // still on the form
  })

  it('explains the rate limit', async () => {
    authApi.login.mockRejectedValue(new ApiError(429, { detail: 'Request was throttled.' }))
    renderLogin()

    await fillAndSubmit('atendente', 'errada')

    expect(await screen.findByRole('alert')).toHaveTextContent(/Muitas tentativas/)
  })

  it('reports connection problems', async () => {
    authApi.login.mockRejectedValue(new TypeError('Failed to fetch'))
    renderLogin()

    await fillAndSubmit('atendente', 'senha')

    expect(await screen.findByRole('alert')).toHaveTextContent(/conectar ao servidor/)
  })

  it('skips the form when the attendant is already logged in', async () => {
    authApi.me.mockResolvedValue({ id: 1, username: 'atendente', first_name: '', last_name: '' })
    renderLogin()
    expect(await screen.findByText('página de reservas')).toBeInTheDocument()
  })
})
