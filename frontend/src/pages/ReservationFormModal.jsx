import { useState } from 'react'
import { reservationsApi } from '../api'
import { fieldError, formError } from '../api/client'
import GuestPicker from '../components/GuestPicker'
import Modal from '../components/Modal'
import { todayIso } from '../utils/format'

export default function ReservationFormModal({ initialGuest, onClose, onSaved }) {
  const [guest, setGuest] = useState(initialGuest ?? null)
  const [checkIn, setCheckIn] = useState(todayIso())
  const [checkOut, setCheckOut] = useState(todayIso(1))
  const [hasCar, setHasCar] = useState(false)
  const [error, setError] = useState(null)
  const [missingGuest, setMissingGuest] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!guest) {
      setMissingGuest(true)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await reservationsApi.create({
        guest: guest.id,
        check_in_date: checkIn,
        check_out_date: checkOut,
        has_car: hasCar,
      })
      onSaved()
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <Modal title="Nova reserva" onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <div className="field">
          <span className="label-text">Hóspede</span>
          <GuestPicker
            value={guest}
            onChange={(picked) => {
              setGuest(picked)
              setMissingGuest(false)
            }}
            error={
              (missingGuest && 'Selecione o hóspede.') || fieldError(error, 'guest')
            }
          />
        </div>

        <div className="form-row">
          <label>
            Entrada
            <input
              type="date"
              value={checkIn}
              min={todayIso()}
              onChange={(event) => setCheckIn(event.target.value)}
              required
            />
            {fieldError(error, 'check_in_date') && (
              <span className="field-error">{fieldError(error, 'check_in_date')}</span>
            )}
          </label>
          <label>
            Saída
            <input
              type="date"
              value={checkOut}
              min={checkIn}
              onChange={(event) => setCheckOut(event.target.value)}
              required
            />
            {fieldError(error, 'check_out_date') && (
              <span className="field-error">{fieldError(error, 'check_out_date')}</span>
            )}
          </label>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={hasCar} onChange={(event) => setHasCar(event.target.checked)} />
          O hóspede utilizará a vaga de estacionamento
        </label>

        {formError(error) && <p className="alert alert-error">{formError(error)}</p>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Criar reserva'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
