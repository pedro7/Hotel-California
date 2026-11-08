import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { reservationsApi } from '../api'
import { ApiError, errorMessage } from '../api/client'
import ConfirmModal from '../components/ConfirmModal'
import Pagination from '../components/Pagination'
import StatusBadge from '../components/StatusBadge'
import { useApiList } from '../hooks/useApiList'
import { useDebounce } from '../hooks/useDebounce'
import { formatDate, formatDateTime, formatDocument } from '../utils/format'
import BillModal from './BillModal'
import ReservationFormModal from './ReservationFormModal'

const TABS = [
  { key: '', label: 'Todas' },
  { key: 'RESERVED', label: 'Aguardando check-in' },
  { key: 'CHECKED_IN', label: 'No hotel' },
  { key: 'CHECKED_OUT', label: 'Finalizadas' },
  { key: 'CANCELED', label: 'Canceladas' },
]

export default function ReservationsPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [notice, setNotice] = useState(null) // { type: 'success' | 'error', text }

  // Modals. `creating`: undefined = closed, null = open without a preselected guest.
  const [creating, setCreating] = useState(() => location.state?.newReservationFor ?? undefined)
  const [earlyPrompt, setEarlyPrompt] = useState(null) // { reservation, allowedFrom }
  const [cancelTarget, setCancelTarget] = useState(null)
  const [billModal, setBillModal] = useState(null) // { reservation, readOnly }
  const [busy, setBusy] = useState(false)

  const debouncedSearch = useDebounce(search.trim())
  const { data, loading, error, reload } = useApiList(reservationsApi.list, {
    status,
    search: debouncedSearch,
    page,
  })

  // The "Nova reserva" shortcut from the guests page passes the guest via router
  // state; consume it so a page refresh doesn't reopen the modal.
  useEffect(() => {
    if (location.state?.newReservationFor) {
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  function changeStatus(key) {
    setStatus(key)
    setPage(1)
  }

  async function checkIn(reservation, confirmEarly = false) {
    setBusy(true)
    setNotice(null)
    try {
      await reservationsApi.checkIn(reservation.id, confirmEarly)
      setEarlyPrompt(null)
      setNotice({ type: 'success', text: `Check-in de ${reservation.guest_detail.name} realizado.` })
      reload()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.code === 'early_check_in') {
        setEarlyPrompt({ reservation, allowedFrom: err.data.allowed_from })
      } else {
        setEarlyPrompt(null)
        setNotice({ type: 'error', text: errorMessage(err) })
      }
    } finally {
      setBusy(false)
    }
  }

  async function cancelReservation() {
    setBusy(true)
    setNotice(null)
    try {
      await reservationsApi.cancel(cancelTarget.id)
      setNotice({ type: 'success', text: `Reserva #${cancelTarget.id} cancelada.` })
      reload()
    } catch (err) {
      setNotice({ type: 'error', text: errorMessage(err) })
    } finally {
      setCancelTarget(null)
      setBusy(false)
    }
  }

  function closeBill(changed) {
    if (changed) {
      setNotice({
        type: 'success',
        text: `Check-out de ${billModal.reservation.guest_detail.name} realizado.`,
      })
      reload()
    }
    setBillModal(null)
  }

  const reservations = data?.results ?? []

  return (
    <section>
      <div className="page-header">
        <div>
          <span className="page-kicker" aria-hidden="true">
            Room Bookings
          </span>
          <h1>Reservas</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(null)}>
          + Nova reserva
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Buscar hóspede por nome, documento ou telefone"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(1)
          }}
        />
        <div className="tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={status === tab.key}
              className={status === tab.key ? 'tab active' : 'tab'}
              onClick={() => changeStatus(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p className={`alert alert-${notice.type === 'error' ? 'error' : 'success'}`} role="status">
          {notice.text}
        </p>
      )}
      {error && <p className="alert alert-error">{errorMessage(error)}</p>}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Hóspede</th>
              <th>Entrada</th>
              <th>Saída</th>
              <th>Vaga</th>
              <th>Status</th>
              <th className="actions-col" />
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr key={reservation.id}>
                <td>{reservation.id}</td>
                <td>
                  {reservation.guest_detail.name}
                  <div className="muted small">{formatDocument(reservation.guest_detail.document)}</div>
                </td>
                <td>
                  {formatDate(reservation.check_in_date)}
                  {reservation.checked_in_at && (
                    <div className="muted small">in: {formatDateTime(reservation.checked_in_at)}</div>
                  )}
                </td>
                <td>
                  {formatDate(reservation.check_out_date)}
                  {reservation.checked_out_at && (
                    <div className="muted small">out: {formatDateTime(reservation.checked_out_at)}</div>
                  )}
                </td>
                <td>{reservation.has_car ? 'Sim' : 'Não'}</td>
                <td>
                  <StatusBadge status={reservation.status} />
                </td>
                <td className="actions">
                  {reservation.status === 'RESERVED' && (
                    <>
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        disabled={busy}
                        onClick={() => checkIn(reservation)}
                      >
                        Check-in
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={busy}
                        onClick={() => setCancelTarget(reservation)}
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  {reservation.status === 'CHECKED_IN' && (
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      onClick={() => setBillModal({ reservation, readOnly: false })}
                    >
                      Check-out
                    </button>
                  )}
                  {reservation.status === 'CHECKED_OUT' && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => setBillModal({ reservation, readOnly: true })}
                    >
                      Ver conta
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && !error && reservations.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhuma reserva encontrada.
                </td>
              </tr>
            )}
            {loading && reservations.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  Carregando…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} count={data?.count ?? 0} onChange={setPage} />

      {creating !== undefined && (
        <ReservationFormModal
          initialGuest={creating}
          onClose={() => setCreating(undefined)}
          onSaved={() => {
            setCreating(undefined)
            setNotice({ type: 'success', text: 'Reserva criada.' })
            reload()
          }}
        />
      )}

      {earlyPrompt && (
        <ConfirmModal
          title="Check-in antes das 14h00"
          message={`O check-in é liberado a partir das 14h00 (${formatDateTime(earlyPrompt.allowedFrom)}). Deseja realizar o check-in antecipado de ${earlyPrompt.reservation.guest_detail.name} mesmo assim?`}
          confirmLabel="Realizar check-in"
          busy={busy}
          onCancel={() => setEarlyPrompt(null)}
          onConfirm={() => checkIn(earlyPrompt.reservation, true)}
        />
      )}

      {cancelTarget && (
        <ConfirmModal
          title="Cancelar reserva"
          message={`Cancelar a reserva #${cancelTarget.id} de ${cancelTarget.guest_detail.name}?`}
          confirmLabel="Cancelar reserva"
          cancelLabel="Voltar"
          danger
          busy={busy}
          onCancel={() => setCancelTarget(null)}
          onConfirm={cancelReservation}
        />
      )}

      {billModal && (
        <BillModal
          reservation={billModal.reservation}
          readOnly={billModal.readOnly}
          onClose={closeBill}
        />
      )}
    </section>
  )
}
