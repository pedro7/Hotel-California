import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guestsApi, reservationsApi } from '../api'
import { ApiError } from '../api/client'
import { makeGuest, makePage } from '../test/fixtures'
import { formatDate, todayIso } from '../utils/format'
import ReservationFormModal from './ReservationFormModal'

vi.mock('../api', () => ({
  reservationsApi: { create: vi.fn() },
  guestsApi: { list: vi.fn() },
}))

const maria = makeGuest()
const joao = makeGuest({ id: 2, name: 'João Souza', document: '98765432100', phone: '21988887777' })

function renderForm(props = {}) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(<ReservationFormModal onClose={onClose} onSaved={onSaved} {...props} />)
  return { onClose, onSaved }
}

beforeEach(() => {
  vi.resetAllMocks()
  guestsApi.list.mockResolvedValue(makePage([maria, joao]))
})

describe('ReservationFormModal', () => {
  it('suggests today as check-in and tomorrow as check-out', () => {
    renderForm({ initialGuest: maria })
    expect(screen.getByLabelText('Entrada')).toHaveValue(formatDate(todayIso()))
    expect(screen.getByLabelText('Saída')).toHaveValue(formatDate(todayIso(1)))
  })

  it('masks typed dates as dd/mm/aaaa', () => {
    renderForm({ initialGuest: maria })
    fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '10122026' } })
    expect(screen.getByLabelText('Entrada')).toHaveValue('10/12/2026')
  })

  it('rejects a check-in in the past and an invalid date without calling the API', async () => {
    renderForm({ initialGuest: maria })

    fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '01/01/2020' } })
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '31/02/2030' } })
    await userEvent.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByText('A entrada não pode ser no passado.')).toBeInTheDocument()
    expect(screen.getByText('Informe uma data válida (dd/mm/aaaa).')).toBeInTheDocument()
    expect(reservationsApi.create).not.toHaveBeenCalled()
  })

  it('requires a guest', async () => {
    renderForm()

    await userEvent.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(await screen.findByText('Selecione o hóspede.')).toBeInTheDocument()
    expect(reservationsApi.create).not.toHaveBeenCalled()
  })

  it('finds a guest by searching and selects it', async () => {
    renderForm()

    await userEvent.type(screen.getByPlaceholderText(/Buscar hóspede/), 'joão')
    // the search is debounced: wait until it reaches the API
    await vi.waitFor(() =>
      expect(guestsApi.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'joão' }),
        expect.anything(),
      ),
    )
    await userEvent.click(await screen.findByRole('button', { name: /João Souza/ }))

    expect(screen.getByText('João Souza')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar' })).toBeInTheDocument()
  })

  it('lets the attendant swap the selected guest', async () => {
    renderForm({ initialGuest: maria })
    await userEvent.click(screen.getByRole('button', { name: 'Trocar' }))
    expect(screen.getByPlaceholderText(/Buscar hóspede/)).toBeInTheDocument()
  })

  it('creates the reservation with guest, dates and parking choice', async () => {
    reservationsApi.create.mockResolvedValue({ id: 1 })
    const { onSaved } = renderForm({ initialGuest: maria })

    fireEvent.change(screen.getByLabelText('Entrada'), { target: { value: '10/12/2030' } })
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '13/12/2030' } })
    await userEvent.click(screen.getByLabelText(/utilizará a vaga/))
    await userEvent.click(screen.getByRole('button', { name: 'Criar reserva' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(reservationsApi.create).toHaveBeenCalledWith({
      guest: 1,
      check_in_date: '2030-12-10',
      check_out_date: '2030-12-13',
      has_car: true,
    })
  })

  it('sends has_car=false by default', async () => {
    reservationsApi.create.mockResolvedValue({ id: 1 })
    const { onSaved } = renderForm({ initialGuest: maria })

    await userEvent.click(screen.getByRole('button', { name: 'Criar reserva' }))

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(reservationsApi.create).toHaveBeenCalledWith(expect.objectContaining({ has_car: false }))
  })

  it('shows the validation errors returned by the API and stays open', async () => {
    reservationsApi.create.mockRejectedValue(
      new ApiError(400, { check_out_date: ['A data de saída deve ser posterior à data de entrada.'] }),
    )
    const { onSaved } = renderForm({ initialGuest: maria })

    await userEvent.click(screen.getByRole('button', { name: 'Criar reserva' }))

    expect(
      await screen.findByText('A data de saída deve ser posterior à data de entrada.'),
    ).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Criar reserva' })).toBeEnabled()
  })

  it('closes without saving on cancel', async () => {
    const { onClose } = renderForm({ initialGuest: maria })
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(reservationsApi.create).not.toHaveBeenCalled()
  })
})
