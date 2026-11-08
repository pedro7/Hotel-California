import { useCallback, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api'
import { ensureCsrf } from '../api/client'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // On startup: get the CSRF cookie, then ask who is logged in (if anyone).
  useEffect(() => {
    let active = true
    ensureCsrf()
      .then(() => authApi.me())
      .then((me) => active && setUser(me))
      .catch(() => active && setUser(null)) // 401/403 => anonymous
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (username, password) => {
    setUser(await authApi.login(username, password))
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
