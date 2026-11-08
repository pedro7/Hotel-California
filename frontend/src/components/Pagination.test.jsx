import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import Pagination, { PAGE_SIZE } from './Pagination'

describe('Pagination', () => {
  it('renders nothing when everything fits in one page', () => {
    const { container } = render(<Pagination page={1} count={PAGE_SIZE} onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the current page and the total', () => {
    render(<Pagination page={2} count={45} onChange={() => {}} />)
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('disables "previous" on the first page and "next" on the last', () => {
    const { rerender } = render(<Pagination page={1} count={45} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeEnabled()

    rerender(<Pagination page={3} count={45} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /Anterior/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /Próxima/ })).toBeDisabled()
  })

  it('asks for the neighbouring pages', async () => {
    const onChange = vi.fn()
    render(<Pagination page={2} count={45} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: /Próxima/ }))
    expect(onChange).toHaveBeenLastCalledWith(3)

    await userEvent.click(screen.getByRole('button', { name: /Anterior/ }))
    expect(onChange).toHaveBeenLastCalledWith(1)
  })
})
