import { useState } from 'react'
import { guestsApi } from '../api'
import { fieldError, formError } from '../api/client'
import Modal from '../components/Modal'

/** Create (no `guest`) or edit a guest. Calls `onSaved(savedGuest)` on success. */
export default function GuestFormModal({ guest, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: guest?.name ?? '',
    document: guest?.document ?? '',
    phone: guest?.phone ?? '',
  })
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const saved = guest
        ? await guestsApi.update(guest.id, form)
        : await guestsApi.create(form)
      onSaved(saved)
    } catch (err) {
      setError(err)
      setSubmitting(false)
    }
  }

  return (
    <Modal title={guest ? 'Editar hóspede' : 'Novo hóspede'} onClose={onClose}>
      <form className="form" onSubmit={handleSubmit}>
        <label>
          Nome
          <input value={form.name} onChange={set('name')} required autoFocus />
          {fieldError(error, 'name') && <span className="field-error">{fieldError(error, 'name')}</span>}
        </label>
        <label>
          Documento
          <input value={form.document} onChange={set('document')} placeholder="CPF, RG ou passaporte" required />
          {fieldError(error, 'document') && (
            <span className="field-error">{fieldError(error, 'document')}</span>
          )}
        </label>
        <label>
          Telefone
          <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(11) 91234-5678" required />
          {fieldError(error, 'phone') && <span className="field-error">{fieldError(error, 'phone')}</span>}
        </label>

        {formError(error) && <p className="alert alert-error">{formError(error)}</p>}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
