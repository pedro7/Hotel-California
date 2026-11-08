const STATUS_LABELS = {
  RESERVED: 'Aguardando check-in',
  CHECKED_IN: 'No hotel',
  CHECKED_OUT: 'Finalizada',
  CANCELED: 'Cancelada',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status.toLowerCase().replace('_', '-')}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
