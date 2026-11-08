import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guestsApi, reservationsApi } from '../api'
import { ApiError } from '../api/client'
import { makeBill, makeGuest, makePage, makeReservation } from '../test/fixtures'
import ReservationsPage from './ReservationsPage'

vi.mock('../api', () => ({
  reservationsApi: {
    list: vi.fn(),
    create: vi.fn(),
    bill: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
    cancel: vi.fn(),
  },
  guestsApi: { list: vi.fn() },
}))

const maria = makeGuest()
const reserved = makeReservation({ id: 10, status: 'RESERVED' })
const inHotel = makeReservation({
  id: 11,
  status: 'CHECKED_IN',
  guest_detail: makeGuest({ id: 2, name: 'João Souza', document: '98765432100' }),
  checked_in_at: '2026-11-07T15:00:00-03:00',
  has_car: true,
})
const finished = makeReservation({
  id: 12,
  status: 'CHECKED_OUT',
  checked_in_at: '2026-11-06T15:00:00-03:00',
  checked_out_at: '2026-11-07T10:00:00-03:00',
})
const canceled = makeReservation({ id: 13, status: 'CANCELED' })

const moneyText = (value) => new RegExp(`R\\$\\s${value}`)

function renderPage(entries = ['/reservations']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <ReservationsPage />
    </MemoryRouter>,
  )
}

function rowOf(text) {
  return screen.getByText(text).closest('tr')
}

beforeEach(() => {
  vi.resetAllMocks()
  reservationsApi.list.mockResolvedValue(makePage([reserved, inHotel, finished, canceled]))
  guestsApi.list.mockResolvedValue(makePage([maria]))
})

describe('listing', () => {
  it('shows guest, dates, parking and status for each reservation', async () => {
    renderPage()
    await screen.findByText('João Souza')

    const row = rowOf('João Souza')
    expect(within(row).getByText('987.654.321-00')).toBeInTheDocument()
    expect(within(row).getByText('07/11/2026')).toBeInTheDocument()
    expect(within(row).getByText('08/11/2026')).toBeInTheDocument()
    expect(within(row).getByText('Sim')).toBeInTheDocument() // has car
    expect(within(row).getByText('No hotel')).toBeInTheDocument()
    expect(within(rowOf('João Souza')).queryByText('Não')).not.toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    reservationsApi.list.mockResolvedValue(makePage([]))
    renderPage()
    expect(await screen.findByText('Nenhuma reserva encontrada.')).toBeInTheDocument()
  })

  it('shows API errors', async () => {
    reservationsApi.list.mockRejectedValue(new ApiError(500, { detail: 'Falha no servidor.' }))
    renderPage()
    expect(await screen.findByText('Falha no servidor.')).toBeInTheDocument()
  })

  it('offers only the actions that make sense for each status', async () => {
    renderPage()
    await screen.findByText('João Souza')

    const reservedRow = within(screen.getAllByRole('row')[1])
    expect(reservedRow.getByRole('button', { name: 'Check-in' })).toBeInTheDocument()
    expect(reservedRow.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(reservedRow.queryByRole('button', { name: 'Check-out' })).not.toBeInTheDocument()

    const inHotelRow = within(screen.getAllByRole('row')[2])
    expect(inHotelRow.getByRole('button', { name: 'Check-out' })).toBeInTheDocument()
    expect(inHotelRow.queryByRole('button', { name: 'Check-in' })).not.toBeInTheDocument()

    const finishedRow = within(screen.getAllByRole('row')[3])
    expect(finishedRow.getByRole('button', { name: 'Ver conta' })).toBeInTheDocument()
    expect(finishedRow.queryByRole('button')).toBeInTheDocument()
    expect(finishedRow.getAllByRole('button')).toHaveLength(1)

    const canceledRow = within(screen.getAllByRole('row')[4])
    expect(canceledRow.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('finding reservations', () => {
  it('starts without filters', async () => {
    renderPage()
    await screen.findByText('João Souza')
    expect(reservationsApi.list).toHaveBeenCalledWith(
      { status: '', search: '', page: 1 },
      expect.anything(),
    )
  })

  it.each([
    ['Aguardando check-in', 'RESERVED'],
    ['No hotel', 'CHECKED_IN'],
    ['Finalizadas', 'CHECKED_OUT'],
    ['Canceladas', 'CANCELED'],
  ])('tab "%s" filters by status %s', async (tab, status) => {
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(screen.getByRole('tab', { name: tab }))

    await waitFor(() =>
      expect(reservationsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ status, page: 1 }),
        expect.anything(),
      ),
    )
    expect(screen.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true')
  })

  it('searches by guest name, document or phone (debounced)', async () => {
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.type(screen.getByPlaceholderText(/Buscar hóspede/), '123.456')

    await waitFor(() =>
      expect(reservationsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '123.456' }),
        expect.anything(),
      ),
    )
  })
})

describe('check-in', () => {
  it('checks the guest in and refreshes the list', async () => {
    reservationsApi.checkIn.mockResolvedValue({})
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Check-in' }))

    await waitFor(() => expect(reservationsApi.checkIn).toHaveBeenCalledWith(10, false))
    expect(await screen.findByText('Check-in de Maria Silva realizado.')).toBeInTheDocument()
    expect(reservationsApi.list).toHaveBeenCalledTimes(2)
  })

  describe('before 14h00', () => {
    const early = new ApiError(409, {
      code: 'early_check_in',
      detail: 'Check-in antes das 14h00.',
      allowed_from: '2026-11-07T14:00:00-03:00',
    })

    async function clickCheckIn() {
      renderPage()
      await screen.findByText('João Souza')
      await userEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Check-in' }))
    }

    it('warns the attendant instead of checking in', async () => {
      reservationsApi.checkIn.mockRejectedValue(early)
      await clickCheckIn()

      const dialog = await screen.findByRole('dialog', { name: 'Check-in antes das 14h00' })
      expect(dialog).toHaveTextContent(/liberado a partir das 14h00/)
      expect(dialog).toHaveTextContent('Maria Silva')
      expect(reservationsApi.checkIn).toHaveBeenCalledTimes(1)
      expect(screen.queryByText(/realizado\./)).not.toBeInTheDocument()
    })

    it('proceeds with an early check-in when the attendant confirms', async () => {
      reservationsApi.checkIn.mockRejectedValueOnce(early).mockResolvedValueOnce({})
      await clickCheckIn()
      await screen.findByRole('dialog', { name: 'Check-in antes das 14h00' })

      await userEvent.click(screen.getByRole('button', { name: 'Realizar check-in' }))

      await waitFor(() => expect(reservationsApi.checkIn).toHaveBeenLastCalledWith(10, true))
      expect(await screen.findByText('Check-in de Maria Silva realizado.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('does nothing when the attendant backs out', async () => {
      reservationsApi.checkIn.mockRejectedValue(early)
      await clickCheckIn()
      await screen.findByRole('dialog', { name: 'Check-in antes das 14h00' })

      await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(reservationsApi.checkIn).toHaveBeenCalledTimes(1)
    })
  })

  it('shows other errors without the early check-in prompt', async () => {
    reservationsApi.checkIn.mockRejectedValue(
      new ApiError(409, { code: 'invalid_status', detail: 'Só é possível fazer check-in de reservas "Reservada".' }),
    )
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Check-in' }))

    expect(await screen.findByText(/Só é possível fazer check-in/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('check-out', () => {
  const checkOutButton = () =>
    within(screen.getAllByRole('row')[2]).getByRole('button', { name: 'Check-out' })

  it('shows the detailed bill before confirming', async () => {
    reservationsApi.bill.mockResolvedValue(makeBill())
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(checkOutButton())

    const dialog = await screen.findByRole('dialog', { name: 'Check-out' })
    await within(dialog).findByText('Total geral')
    expect(reservationsApi.bill).toHaveBeenCalledWith(11)
    expect(dialog).toHaveTextContent('João Souza')
    expect(dialog).toHaveTextContent(/Valores calculados considerando a saída agora/)
    expect(within(dialog).getByText('Total geral').closest('div')).toHaveTextContent(moneyText('200,00'))
    expect(within(dialog).getByText('Diárias (1 noite)')).toBeInTheDocument()
    // the reservation is not checked out until confirmed
    expect(reservationsApi.checkOut).not.toHaveBeenCalled()
  })

  it('shows the late check-out fee in the preview', async () => {
    reservationsApi.bill.mockResolvedValue(
      makeBill({ late_checkout: true, late_checkout_fee: '90.00', total: '290.00' }),
    )
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(checkOutButton())

    const dialog = await screen.findByRole('dialog', { name: 'Check-out' })
    const feeRow = (await within(dialog).findByText(/Taxa de check-out após as 12h00/)).closest('div')
    expect(feeRow).toHaveTextContent(moneyText('90,00'))
    expect(within(dialog).getByText('Total geral').closest('div')).toHaveTextContent(moneyText('290,00'))
  })

  it('confirms the check-out and then shows the final bill', async () => {
    reservationsApi.bill.mockResolvedValue(makeBill())
    reservationsApi.checkOut.mockResolvedValue({
      reservation: { ...inHotel, status: 'CHECKED_OUT' },
      bill: makeBill({ total: '200.00' }),
    })
    renderPage()
    await screen.findByText('João Souza')
    await userEvent.click(checkOutButton())
    await screen.findByText('Total geral')

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar check-out' }))

    const done = await screen.findByRole('dialog', { name: 'Check-out realizado' })
    expect(reservationsApi.checkOut).toHaveBeenCalledWith(11)
    expect(within(done).getByText('Total geral').closest('div')).toHaveTextContent(moneyText('200,00'))
    expect(within(done).queryByRole('button', { name: 'Confirmar check-out' })).not.toBeInTheDocument()

    await userEvent.click(within(done).getByRole('button', { name: 'Fechar' }))

    expect(await screen.findByText('Check-out de João Souza realizado.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reservationsApi.list).toHaveBeenCalledTimes(2) // list refreshed
  })

  it('can be dismissed without checking out', async () => {
    reservationsApi.bill.mockResolvedValue(makeBill())
    renderPage()
    await screen.findByText('João Souza')
    await userEvent.click(checkOutButton())
    await screen.findByText('Total geral')

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reservationsApi.checkOut).not.toHaveBeenCalled()
    expect(reservationsApi.list).toHaveBeenCalledTimes(1)
  })

  it('shows an error when the check-out fails and keeps the bill open', async () => {
    reservationsApi.bill.mockResolvedValue(makeBill())
    reservationsApi.checkOut.mockRejectedValue(
      new ApiError(409, { code: 'invalid_status', detail: 'Reserva já finalizada.' }),
    )
    renderPage()
    await screen.findByText('João Souza')
    await userEvent.click(checkOutButton())
    await screen.findByText('Total geral')

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar check-out' }))

    expect(await screen.findByText('Reserva já finalizada.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar check-out' })).toBeEnabled()
  })

  it('shows the final bill of a finished reservation (read only)', async () => {
    reservationsApi.bill.mockResolvedValue(makeBill())
    renderPage()
    await screen.findByText('João Souza')

    await userEvent.click(
      within(screen.getAllByRole('row')[3]).getByRole('button', { name: 'Ver conta' }),
    )

    const dialog = await screen.findByRole('dialog', { name: 'Conta da reserva' })
    await within(dialog).findByText('Total geral')
    expect(reservationsApi.bill).toHaveBeenCalledWith(12)
    expect(within(dialog).queryByRole('button', { name: 'Confirmar check-out' })).not.toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reservationsApi.list).toHaveBeenCalledTimes(1) // nothing changed
  })
})

describe('cancel', () => {
  async function openCancelDialog() {
    renderPage()
    await screen.findByText('João Souza')
    await userEvent.click(within(screen.getAllByRole('row')[1]).getByRole('button', { name: 'Cancelar' }))
    return screen.findByRole('dialog', { name: 'Cancelar reserva' })
  }

  it('asks for confirmation and then cancels', async () => {
    reservationsApi.cancel.mockResolvedValue({})
    const dialog = await openCancelDialog()
    expect(dialog).toHaveTextContent('#10')
    expect(reservationsApi.cancel).not.toHaveBeenCalled()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }))

    await waitFor(() => expect(reservationsApi.cancel).toHaveBeenCalledWith(10))
    expect(await screen.findByText('Reserva #10 cancelada.')).toBeInTheDocument()
    expect(reservationsApi.list).toHaveBeenCalledTimes(2)
  })

  it('keeps the reservation when the attendant goes back', async () => {
    const dialog = await openCancelDialog()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Voltar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reservationsApi.cancel).not.toHaveBeenCalled()
  })
})

describe('new reservation', () => {
  it('opens the form from the button', async () => {
    renderPage()
    await screen.findByText('João Souza')
    await userEvent.click(screen.getByRole('button', { name: '+ Nova reserva' }))
    expect(await screen.findByRole('dialog', { name: 'Nova reserva' })).toBeInTheDocument()
  })

  it('opens the form with the guest preselected when coming from the guests page', async () => {
    renderPage([{ pathname: '/reservations', state: { newReservationFor: maria } }])

    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })
    expect(dialog).toHaveTextContent('Maria Silva')
    expect(within(dialog).getByRole('button', { name: 'Trocar' })).toBeInTheDocument()
  })

  it('refreshes the list after creating a reservation', async () => {
    reservationsApi.create.mockResolvedValue({ id: 99 })
    renderPage([{ pathname: '/reservations', state: { newReservationFor: maria } }])
    const dialog = await screen.findByRole('dialog', { name: 'Nova reserva' })

    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByText('Reserva criada.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(reservationsApi.list).toHaveBeenCalledTimes(2)
  })
})
