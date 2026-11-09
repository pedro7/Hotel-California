import { useState } from 'react'
import { reservationsApi } from '../api'
import { fieldError, formError } from '../api/client'
import DateInput from '../components/DateInput'
import GuestPicker from '../components/GuestPicker'
import Modal from '../components/Modal'
import { todayIso } from '../utils/format'

export default function ReservationFormModal({ initialGuest, onClose, onSaved }) {
  const [guest, setGuest] = useState(initialGuest ?? null)
  const [checkIn, setCheckIn] = useState(todayIso())
  const [checkOut, setCheckOut] = useState(todayIso(1))
  const [hasCar, setHasCar] = useState(false)
  const [dateErrors, setDateErrors] = useState({})
  const [error, setError] = useState(null)
  const [missingGuest, setMissingGuest] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!guest) {
      setMissingGuest(true)
      return
    }
    const invalid = {}
    if (!checkIn) invalid.check_in_date = 'Informe uma data válida (dd/mm/aaaa).'
    else if (checkIn < todayIso()) invalid.check_in_date = 'A entrada não pode ser no passado.'
    if (!checkOut) invalid.check_out_date = 'Informe uma data válida (dd/mm/aaaa).'
    else if (checkIn && checkOut <= checkIn)
      invalid.check_out_date = 'A data de saída deve ser posterior à data de entrada.'
    setDateErrors(invalid)
    if (Object.keys(invalid).length > 0) return

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
            <DateInput value={checkIn} min={todayIso()} onChange={setCheckIn} required />
            {(dateErrors.check_in_date || fieldError(error, 'check_in_date')) && (
              <span className="field-error">
                {dateErrors.check_in_date || fieldError(error, 'check_in_date')}
              </span>
            )}
          </label>
          <label>
            Saída
            <DateInput value={checkOut} min={checkIn || todayIso()} onChange={setCheckOut} required />
            {(dateErrors.check_out_date || fieldError(error, 'check_out_date')) && (
              <span className="field-error">
                {dateErrors.check_out_date || fieldError(error, 'check_out_date')}
              </span>
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
