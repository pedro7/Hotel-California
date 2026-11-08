import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { guestsApi } from '../api'
import { errorMessage } from '../api/client'
import Pagination from '../components/Pagination'
import { useApiList } from '../hooks/useApiList'
import { useDebounce } from '../hooks/useDebounce'
import { formatDocument, formatPhone } from '../utils/format'
import GuestFormModal from './GuestFormModal'

const SCOPES = [
  { key: 'all', label: 'Todos', params: {} },
  { key: 'in_hotel', label: 'No hotel', params: { in_hotel: 'true' } },
  { key: 'awaiting', label: 'Aguardando check-in', params: { awaiting_check_in: 'true' } },
]

export default function GuestsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState('all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new
  const debouncedSearch = useDebounce(search.trim())

  const scopeParams = SCOPES.find((s) => s.key === scope).params
  const { data, loading, error, reload } = useApiList(guestsApi.list, {
    search: debouncedSearch,
    page,
    ...scopeParams,
  })

  function changeScope(key) {
    setScope(key)
    setPage(1)
  }

  function handleSaved() {
    setEditing(undefined)
    reload()
  }

  const guests = data?.results ?? []

  return (
    <section>
      <div className="page-header">
        <h1>Hóspedes</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>
          + Novo hóspede
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar por nome, documento ou telefone"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <div className="tabs" role="tablist">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={scope === s.key}
              className={scope === s.key ? 'tab active' : 'tab'}
              onClick={() => changeScope(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="alert alert-error">{errorMessage(error)}</p>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Documento</th>
              <th>Telefone</th>
              <th className="actions-col" />
            </tr>
          </thead>
          <tbody>
            {guests.map((guest) => (
              <tr key={guest.id}>
                <td>{guest.name}</td>
                <td>{formatDocument(guest.document)}</td>
                <td>{formatPhone(guest.phone)}</td>
                <td className="actions">
                  <button
                    type="button"
                    className="btn btn-small"
                    onClick={() => navigate('/reservations', { state: { newReservationFor: guest } })}
                  >
                    Nova reserva
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => setEditing(guest)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {!loading && !error && guests.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Nenhum hóspede encontrado.
                </td>
              </tr>
            )}
            {loading && guests.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} count={data?.count ?? 0} onChange={setPage} />

      {editing !== undefined && (
        <GuestFormModal guest={editing} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      )}
    </section>
  )
}
