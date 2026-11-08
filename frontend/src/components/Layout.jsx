import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)

  async function handleLogout() {
    setLoggingOut(true)
    try {
      await logout()
    } catch {
      // The local session is dropped even if the request fails; nothing to show.
    } finally {
      navigate('/login', { replace: true })
    }
  }

  const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Hotel</span>
        <nav className="nav">
          <NavLink to="/reservations">Reservas</NavLink>
          <NavLink to="/guests">Hóspedes</NavLink>
        </nav>
        <div className="topbar-user">
          <span>{displayName}</span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={loggingOut}>
            Sair
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
