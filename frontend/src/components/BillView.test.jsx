import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { makeBill } from '../test/fixtures'
import BillView from './BillView'

const money = (value) => new RegExp(`^R\\$\\s${value}$`)

function summaryRow(label) {
  return screen.getByText(label).closest('div')
}

describe('BillView', () => {
  it('lists every night with its date, weekday and type', () => {
    const bill = makeBill({
      nights: [
        { date: '2026-11-06', weekend: false, daily_rate: '120.00', parking_fee: '15.00' },
        { date: '2026-11-07', weekend: true, daily_rate: '180.00', parking_fee: '20.00' },
      ],
      nights_count: 2,
      daily_total: '300.00',
      parking_total: '35.00',
      total: '335.00',
    })

    render(<BillView bill={bill} hasCar />)

    const rows = screen.getAllByRole('row').slice(1) // skip header
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText(/06\/11\/2026/)).toBeInTheDocument()
    expect(within(rows[0]).getByText(/sex/)).toBeInTheDocument()
    expect(within(rows[0]).getByText('Dia útil')).toBeInTheDocument()
    expect(within(rows[0]).getByText(money('120,00'))).toBeInTheDocument()
    expect(within(rows[0]).getByText(money('15,00'))).toBeInTheDocument()
    expect(within(rows[1]).getByText('Fim de semana')).toBeInTheDocument()
    expect(within(rows[1]).getByText(money('180,00'))).toBeInTheDocument()
    expect(within(rows[1]).getByText(money('20,00'))).toBeInTheDocument()
  })

  it('shows the daily subtotal with the number of nights', () => {
    render(<BillView bill={makeBill()} hasCar />)
    expect(summaryRow('Diárias (1 noite)')).toHaveTextContent(/R\$\s180,00/)
  })

  it('pluralizes nights', () => {
    const bill = makeBill({ nights_count: 3 })
    render(<BillView bill={bill} hasCar={false} />)
    expect(screen.getByText('Diárias (3 noites)')).toBeInTheDocument()
  })

  it('shows parking only when the guest has a car', () => {
    const { rerender } = render(<BillView bill={makeBill()} hasCar />)
    expect(screen.getByRole('columnheader', { name: 'Vaga' })).toBeInTheDocument()
    expect(summaryRow('Estacionamento')).toHaveTextContent(/R\$\s20,00/)

    rerender(<BillView bill={makeBill()} hasCar={false} />)
    expect(screen.queryByRole('columnheader', { name: 'Vaga' })).not.toBeInTheDocument()
    expect(screen.queryByText('Estacionamento')).not.toBeInTheDocument()
  })

  it('does not mention a late fee for a punctual check-out', () => {
    render(<BillView bill={makeBill()} hasCar />)
    expect(screen.queryByText(/Taxa de check-out/)).not.toBeInTheDocument()
  })

  it('shows the late check-out fee when it applies', () => {
    const bill = makeBill({ late_checkout: true, late_checkout_fee: '90.00', total: '290.00' })
    render(<BillView bill={bill} hasCar />)
    const row = summaryRow('Taxa de check-out após as 12h00 (50% da diária)')
    expect(row).toHaveTextContent(/R\$\s90,00/)
  })

  it('highlights the grand total', () => {
    const bill = makeBill({ late_checkout: true, late_checkout_fee: '90.00', total: '290.00' })
    render(<BillView bill={bill} hasCar />)
    expect(summaryRow('Total geral')).toHaveTextContent(/R\$\s290,00/)
  })
})
