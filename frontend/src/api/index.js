import { request } from './client'

export const authApi = {
  login: (username, password) =>
    request('/auth/login/', { method: 'POST', body: { username, password } }),
  logout: () => request('/auth/logout/', { method: 'POST' }),
  me: () => request('/auth/me/'),
}

export const guestsApi = {
  list: (params, signal) => request('/guests/', { params, signal }),
  create: (data) => request('/guests/', { method: 'POST', body: data }),
  update: (id, data) => request(`/guests/${id}/`, { method: 'PATCH', body: data }),
}

export const reservationsApi = {
  list: (params, signal) => request('/reservations/', { params, signal }),
  create: (data) => request('/reservations/', { method: 'POST', body: data }),
  bill: (id) => request(`/reservations/${id}/bill/`),
  checkIn: (id, confirmEarly = false) =>
    request(`/reservations/${id}/check-in/`, {
      method: 'POST',
      body: { confirm_early: confirmEarly },
    }),
  checkOut: (id) => request(`/reservations/${id}/check-out/`, { method: 'POST' }),
  cancel: (id) => request(`/reservations/${id}/cancel/`, { method: 'POST' }),
}
