import { formatDate, formatMoney, weekdayName } from '../utils/format'

/** Detailed bill returned by the API (`/reservations/:id/bill/` and check-out). */
export default function BillView({ bill, hasCar }) {
  return (
    <div className="bill">
      <table className="table table-compact">
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th className="num">Diária</th>
            {hasCar && <th className="num">Vaga</th>}
          </tr>
        </thead>
        <tbody>
          {bill.nights.map((night) => (
            <tr key={night.date}>
              <td>
                {formatDate(night.date)} <span className="muted">({weekdayName(night.date)})</span>
              </td>
              <td>{night.weekend ? 'Fim de semana' : 'Dia útil'}</td>
              <td className="num">{formatMoney(night.daily_rate)}</td>
              {hasCar && <td className="num">{formatMoney(night.parking_fee)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="bill-summary">
        <div>
          <dt>
            Diárias ({bill.nights_count} {bill.nights_count === 1 ? 'noite' : 'noites'})
          </dt>
          <dd>{formatMoney(bill.daily_total)}</dd>
        </div>
        {hasCar && (
          <div>
            <dt>Estacionamento</dt>
            <dd>{formatMoney(bill.parking_total)}</dd>
          </div>
        )}
        {bill.late_checkout && (
          <div className="bill-warning">
            <dt>Taxa de check-out após as 12h00 (50% da diária)</dt>
            <dd>{formatMoney(bill.late_checkout_fee)}</dd>
          </div>
        )}
        <div className="bill-total">
          <dt>Total geral</dt>
          <dd>{formatMoney(bill.total)}</dd>
        </div>
      </dl>
    </div>
  )
}
