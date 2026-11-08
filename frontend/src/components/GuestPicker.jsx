import { useState } from 'react'
import { guestsApi } from '../api'
import { useApiList } from '../hooks/useApiList'
import { useDebounce } from '../hooks/useDebounce'
import { formatDocument, formatPhone } from '../utils/format'

/** Search-and-select field for a guest (by name, document or phone). */
export default function GuestPicker({ value, onChange, error }) {
  const [term, setTerm] = useState('')
  const debouncedTerm = useDebounce(term.trim())
  const { data, loading } = useApiList(guestsApi.list, { search: debouncedTerm })

  if (value) {
    return (
      <div className="picked">
        <span>
          <strong>{value.name}</strong>{' '}
          <span className="muted">{formatDocument(value.document)}</span>
        </span>
        <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>
          Trocar
        </button>
      </div>
    )
  }

  const results = data?.results ?? []
  return (
    <div>
      <input
        type="search"
        placeholder="Buscar hóspede por nome, documento ou telefone"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        autoComplete="off"
      />
      {error && <p className="field-error">{error}</p>}
      <ul className="picker-list">
        {results.slice(0, 6).map((guest) => (
          <li key={guest.id}>
            <button type="button" onClick={() => onChange(guest)}>
              <strong>{guest.name}</strong>
              <span className="muted">
                {formatDocument(guest.document)} · {formatPhone(guest.phone)}
              </span>
            </button>
          </li>
        ))}
        {!loading && results.length === 0 && (
          <li className="muted picker-empty">Nenhum hóspede encontrado. Cadastre-o na aba Hóspedes.</li>
        )}
      </ul>
    </div>
  )
}
