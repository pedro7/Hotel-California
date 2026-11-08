export const PAGE_SIZE = 20 // matches the backend's PAGE_SIZE

export default function Pagination({ page, count, onChange }) {
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  if (totalPages === 1) return null

  return (
    <div className="pagination">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        className="btn"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Próxima →
      </button>
    </div>
  )
}
