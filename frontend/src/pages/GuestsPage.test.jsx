import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guestsApi } from '../api'
import { ApiError } from '../api/client'
import { makeGuest, makePage } from '../test/fixtures'
import GuestsPage from './GuestsPage'

vi.mock('../api', () => ({
  guestsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
}))

const maria = makeGuest()
const joao = makeGuest({ id: 2, name: 'João Souza', document: 'AB123456', phone: '2133334444' })

function ReservationsProbe() {
  const { state } = useLocation()
  return <p>reservas para {state?.newReservationFor?.name}</p>
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/guests']}>
      <Routes>
        <Route path="/guests" element={<GuestsPage />} />
        <Route path="/reservations" element={<ReservationsProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  guestsApi.list.mockResolvedValue(makePage([maria, joao]))
})

describe('listing', () => {
  it('shows name, document and phone formatted for reading', async () => {
    renderPage()
    const row = (await screen.findByText('Maria Silva')).closest('tr')
    expect(within(row).getByText('123.456.789-00')).toBeInTheDocument()
    expect(within(row).getByText('(11) 91234-5678')).toBeInTheDocument()

    const other = screen.getByText('João Souza').closest('tr')
    expect(within(other).getByText('AB123456')).toBeInTheDocument()
    expect(within(other).getByText('(21) 3333-4444')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    guestsApi.list.mockResolvedValue(makePage([]))
    renderPage()
    expect(await screen.findByText('Nenhum hóspede encontrado.')).toBeInTheDocument()
  })

  it('shows API errors', async () => {
    guestsApi.list.mockRejectedValue(new ApiError(500, { detail: 'Falha no servidor.' }))
    renderPage()
    expect(await screen.findByText('Falha no servidor.')).toBeInTheDocument()
  })
})

describe('finding guests', () => {
  it('starts without filters', async () => {
    renderPage()
    await screen.findByText('Maria Silva')
    expect(guestsApi.list).toHaveBeenCalledWith({ search: '', page: 1 }, expect.anything())
  })

  it('searches by name, document or phone', async () => {
    renderPage()
    await screen.findByText('Maria Silva')

    await userEvent.type(screen.getByPlaceholderText(/Buscar por nome, documento ou telefone/), '91234')

    await waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '91234', page: 1 }),
        expect.anything(),
      ),
    )
  })

  it('filters guests that are still in the hotel', async () => {
    renderPage()
    await screen.findByText('Maria Silva')

    await userEvent.click(screen.getByRole('tab', { name: 'No hotel' }))

    await waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ in_hotel: 'true' }),
        expect.anything(),
      ),
    )
    expect(guestsApi.list).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ awaiting_check_in: 'true' }),
      expect.anything(),
    )
  })

  it('filters guests with a reservation that have not checked in', async () => {
    renderPage()
    await screen.findByText('Maria Silva')

    await userEvent.click(screen.getByRole('tab', { name: 'Aguardando check-in' }))

    await waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ awaiting_check_in: 'true' }),
        expect.anything(),
      ),
    )
  })

  it('goes back to everyone with "Todos"', async () => {
    renderPage()
    await screen.findByText('Maria Silva')
    await userEvent.click(screen.getByRole('tab', { name: 'No hotel' }))
    await waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ in_hotel: 'true' }),
        expect.anything(),
      ),
    )

    await userEvent.click(screen.getByRole('tab', { name: 'Todos' }))

    await waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        { search: '', page: 1 },
        expect.anything(),
      ),
    )
  })
})

describe('registering a guest', () => {
  async function openForm() {
    renderPage()
    await screen.findByText('Maria Silva')
    await userEvent.click(screen.getByRole('button', { name: '+ Novo hóspede' }))
    return screen.findByRole('dialog', { name: 'Novo hóspede' })
  }

  async function fillForm(dialog) {
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Carlos Lima')
    await userEvent.type(within(dialog).getByLabelText('Documento'), '111.222.333-44')
    await userEvent.type(within(dialog).getByLabelText('Telefone'), '(31) 99999-0000')
  }

  it('creates the guest with name, document and phone and refreshes the list', async () => {
    guestsApi.create.mockResolvedValue(makeGuest({ id: 3, name: 'Carlos Lima' }))
    const dialog = await openForm()
    await fillForm(dialog)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(guestsApi.create).toHaveBeenCalledWith({
        name: 'Carlos Lima',
        document: '111.222.333-44',
        phone: '(31) 99999-0000',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(guestsApi.list).toHaveBeenCalledTimes(2)
  })

  it('shows the API validation errors next to the fields and keeps the form open', async () => {
    guestsApi.create.mockRejectedValue(
      new ApiError(400, { document: ['Já existe um hóspede com este documento.'] }),
    )
    const dialog = await openForm()
    await fillForm(dialog)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByText('Já existe um hóspede com este documento.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Novo hóspede' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(guestsApi.list).toHaveBeenCalledTimes(1)
  })

  it('does not submit when required fields are empty', async () => {
    const dialog = await openForm()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    expect(guestsApi.create).not.toHaveBeenCalled()
  })

  it('closes without saving on cancel', async () => {
    const dialog = await openForm()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(guestsApi.create).not.toHaveBeenCalled()
  })
})

describe('editing a guest', () => {
  it('opens the form with the current data and saves the changes', async () => {
    guestsApi.update.mockResolvedValue(maria)
    renderPage()
    const row = (await screen.findByText('Maria Silva')).closest('tr')

    await userEvent.click(within(row).getByRole('button', { name: 'Editar' }))

    const dialog = await screen.findByRole('dialog', { name: 'Editar hóspede' })
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Maria Silva')
    expect(within(dialog).getByLabelText('Documento')).toHaveValue('12345678900')
    expect(within(dialog).getByLabelText('Telefone')).toHaveValue('11912345678')

    const phone = within(dialog).getByLabelText('Telefone')
    await userEvent.clear(phone)
    await userEvent.type(phone, '21988887777')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    await waitFor(() =>
      expect(guestsApi.update).toHaveBeenCalledWith(1, {
        name: 'Maria Silva',
        document: '12345678900',
        phone: '21988887777',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('booking from the guest list', () => {
  it('goes to the reservation form with that guest selected', async () => {
    renderPage()
    const row = (await screen.findByText('João Souza')).closest('tr')

    await userEvent.click(within(row).getByRole('button', { name: 'Nova reserva' }))

    expect(await screen.findByText('reservas para João Souza')).toBeInTheDocument()
  })
})
