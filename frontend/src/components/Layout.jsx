import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import NeonSign from './NeonSign'

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
        <NeonSign size="small" />
        <nav className="nav">
          <NavLink to="/reservations" data-room="101">
            Reservas
          </NavLink>
          <NavLink to="/guests" data-room="102">
            Hóspedes
          </NavLink>
        </nav>
        <div className="topbar-user">
          <span className="desk-plate" title="Atendente de plantão">
            <span>{displayName}</span>
          </span>
          <button type="button" className="btn btn-ghost" onClick={handleLogout} disabled={loggingOut}>
            Sair
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="motel-footer" aria-hidden="true">
        <span>Color TV</span>
        <span>✦</span>
        <span>Air Conditioned</span>
        <span>✦</span>
        <span>Open 24 h</span>
      </footer>
    </div>
  )
}
