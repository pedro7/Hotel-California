import { useEffect, useState } from 'react'
import { reservationsApi } from '../api'
import { errorMessage } from '../api/client'
import BillView from '../components/BillView'
import Modal from '../components/Modal'
import { formatDateTime } from '../utils/format'

/**
 * Check-out flow, or a read-only bill for finished reservations.
 *
 * Check-out: shows the detailed bill (as if the guest leaves now) -> attendant
 * confirms -> the final bill is shown. `onClose(changed)` tells the caller
 * whether the list needs a refresh.
 */
export default function BillModal({ reservation, readOnly = false, onClose }) {
  const [phase, setPhase] = useState('loading') // loading | review | done
  const [bill, setBill] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [openedAt] = useState(() => new Date().toISOString())

  useEffect(() => {
    let active = true
    reservationsApi
      .bill(reservation.id)
      .then((data) => {
        if (!active) return
        setBill(data)
        setPhase(readOnly ? 'done' : 'review')
      })
      .catch((err) => active && setError(errorMessage(err)))
    return () => {
      active = false
    }
  }, [reservation.id, readOnly])

  async function confirmCheckOut() {
    setSubmitting(true)
    setError('')
    try {
      const result = await reservationsApi.checkOut(reservation.id)
      setBill(result.bill)
      setPhase('done')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const changed = phase === 'done' && !readOnly
  const close = () => onClose(changed)

  let title = 'Check-out'
  if (readOnly) title = 'Conta da reserva'
  else if (phase === 'done') title = 'Check-out realizado'

  let footer
  if (phase === 'review') {
    footer = (
      <>
        <button type="button" className="btn" onClick={close} disabled={submitting}>
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={confirmCheckOut} disabled={submitting}>
          {submitting ? 'Processando…' : 'Confirmar check-out'}
        </button>
      </>
    )
  } else {
    footer = (
      <button type="button" className="btn btn-primary" onClick={close}>
        Fechar
      </button>
    )
  }

  return (
    <Modal title={title} onClose={close} footer={footer} wide>
      <p className="bill-guest">
        <strong>{reservation.guest_detail.name}</strong>{' '}
        <span className="muted">
          · Reserva #{reservation.id}
          {reservation.checked_in_at && ` · check-in em ${formatDateTime(reservation.checked_in_at)}`}
        </span>
      </p>

      {phase === 'loading' && !error && <p className="muted">Calculando…</p>}
      {error && <p className="alert alert-error">{error}</p>}
      {phase === 'review' && (
        <p className="alert alert-info">
          Valores calculados considerando a saída agora ({formatDateTime(openedAt)}).
          Check-outs após as 12h00 pagam taxa adicional.
        </p>
      )}
      {bill && <BillView bill={bill} hasCar={reservation.has_car} />}
    </Modal>
  )
}
