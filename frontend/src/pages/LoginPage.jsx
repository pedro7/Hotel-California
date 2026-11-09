import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '../api/client'
import { useAuth } from '../auth/useAuth'
import NeonSign from '../components/NeonSign'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const destination = location.state?.from?.pathname ?? '/reservations'

  if (loading) return <p className="page-status">Carregando…</p>
  if (user) return <Navigate to={destination} replace />

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? 'Muitas tentativas. Aguarde um minuto e tente novamente.'
          : errorMessage(err),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="rain" aria-hidden="true" />
      <NeonSign />
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="card-ribbon" aria-hidden="true">
          Front Desk · Recepção
        </div>
        <h1>Livro de Registro</h1>
        <p className="muted">Acesso restrito aos atendentes.</p>

        <label>
          Usuário
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
