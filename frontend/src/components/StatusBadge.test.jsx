import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StatusBadge from './StatusBadge'

describe('StatusBadge', () => {
  it.each([
    ['RESERVED', 'Aguardando check-in'],
    ['CHECKED_IN', 'No hotel'],
    ['CHECKED_OUT', 'Finalizada'],
    ['CANCELED', 'Cancelada'],
  ])('labels %s as "%s"', (status, label) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('falls back to the raw status for unknown values', () => {
    render(<StatusBadge status="WHATEVER" />)
    expect(screen.getByText('WHATEVER')).toBeInTheDocument()
  })
})
