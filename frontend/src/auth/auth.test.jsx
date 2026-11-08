import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '../api'
import { ApiError, ensureCsrf } from '../api/client'
import Layout from '../components/Layout'
import ProtectedRoute from '../components/ProtectedRoute'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

vi.mock('../api', () => ({
  authApi: { login: vi.fn(), logout: vi.fn(), me: vi.fn() },
}))
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal()),
  ensureCsrf: vi.fn().mockResolvedValue(undefined),
}))

const attendant = { id: 1, username: 'atendente', first_name: 'Ana', last_name: 'Souza', is_staff: false }

function renderApp(path = '/private') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>tela de login</p>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/private" element={<p>conteúdo restrito</p>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  ensureCsrf.mockResolvedValue(undefined)
})

describe('protected routes', () => {
  it('sends anonymous visitors to the login page', async () => {
    authApi.me.mockRejectedValue(new ApiError(403, { detail: 'Não autenticado.' }))
    renderApp()
    expect(await screen.findByText('tela de login')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo restrito')).not.toBeInTheDocument()
  })

  it('shows a loading state while the session is being checked', () => {
    authApi.me.mockReturnValue(new Promise(() => {}))
    renderApp()
    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument()
  })

  it('lets logged-in attendants through', async () => {
    authApi.me.mockResolvedValue(attendant)
    renderApp()
    expect(await screen.findByText('conteúdo restrito')).toBeInTheDocument()
  })
})

describe('layout', () => {
  it('shows the attendant name and the main navigation', async () => {
    authApi.me.mockResolvedValue(attendant)
    renderApp()
    await screen.findByText('conteúdo restrito')
    expect(screen.getByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute('href', '/reservations')
    expect(screen.getByRole('link', { name: 'Hóspedes' })).toHaveAttribute('href', '/guests')
  })

  it('falls back to the username when there is no full name', async () => {
    authApi.me.mockResolvedValue({ ...attendant, first_name: '', last_name: '' })
    renderApp()
    await screen.findByText('conteúdo restrito')
    expect(screen.getByText('atendente')).toBeInTheDocument()
  })

  it('logs out and returns to the login page', async () => {
    authApi.me.mockResolvedValue(attendant)
    authApi.logout.mockResolvedValue(null)
    renderApp()
    await screen.findByText('conteúdo restrito')

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(authApi.logout).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('tela de login')).toBeInTheDocument()
  })

  it('still leaves the session locally when the logout request fails', async () => {
    authApi.me.mockResolvedValue(attendant)
    authApi.logout.mockRejectedValue(new ApiError(500, null))
    renderApp()
    await screen.findByText('conteúdo restrito')

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByText('tela de login')).toBeInTheDocument()
  })
})

describe('AuthProvider', () => {
  function Probe() {
    const { user, loading, login } = useAuth()
    return (
      <div>
        <span>{loading ? 'loading' : 'ready'}</span>
        <span>{user ? `user:${user.username}` : 'anonymous'}</span>
        <button type="button" onClick={() => login('atendente', 'senha')}>
          entrar
        </button>
      </div>
    )
  }

  it('stores the user after a successful login', async () => {
    authApi.me.mockRejectedValue(new ApiError(403, null))
    authApi.login.mockResolvedValue(attendant)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await screen.findByText('ready')
    expect(screen.getByText('anonymous')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'entrar' }))

    await waitFor(() => expect(screen.getByText('user:atendente')).toBeInTheDocument())
    expect(authApi.login).toHaveBeenCalledWith('atendente', 'senha')
  })

  it('useAuth requires the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
    spy.mockRestore()
  })
})
