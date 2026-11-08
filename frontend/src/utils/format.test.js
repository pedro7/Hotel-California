import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatDocument,
  formatMoney,
  formatPhone,
  todayIso,
  weekdayName,
} from './format'

describe('formatMoney', () => {
  it('formats API decimal strings as Brazilian reais', () => {
    expect(formatMoney('120.00')).toMatch(/^R\$\s120,00$/)
    expect(formatMoney('180.00')).toMatch(/^R\$\s180,00$/)
    expect(formatMoney('1234.5')).toMatch(/^R\$\s1\.234,50$/)
  })

  it('treats missing values as zero', () => {
    expect(formatMoney(null)).toMatch(/^R\$\s0,00$/)
    expect(formatMoney(undefined)).toMatch(/^R\$\s0,00$/)
  })
})

describe('formatDate', () => {
  it('turns ISO dates into dd/mm/yyyy', () => {
    expect(formatDate('2026-11-07')).toBe('07/11/2026')
  })

  it('shows a dash when empty', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })
})

describe('weekdayName', () => {
  it('uses the calendar day regardless of time zone', () => {
    expect(weekdayName('2026-11-06')).toBe('sex')
    expect(weekdayName('2026-11-07')).toBe('sáb')
    expect(weekdayName('2026-11-08')).toBe('dom')
    expect(weekdayName('2026-11-09')).toBe('seg')
  })
})

describe('formatDateTime', () => {
  it('shows a dash when empty', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('includes date and time', () => {
    const text = formatDateTime('2026-11-07T14:30:00-03:00')
    expect(text).toMatch(/\d{2}\/\d{2}\/\d{4}/)
    expect(text).toMatch(/\d{2}:\d{2}/)
  })
})

describe('todayIso', () => {
  afterEach(() => vi.useRealTimers())

  it('returns the local date as YYYY-MM-DD, optionally offset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 30, 10, 0, 0)) // 30 Nov 2026, local time
    expect(todayIso()).toBe('2026-11-30')
    expect(todayIso(1)).toBe('2026-12-01')
    expect(todayIso(-1)).toBe('2026-11-29')
  })
})

describe('formatDocument', () => {
  it('masks CPFs', () => {
    expect(formatDocument('12345678900')).toBe('123.456.789-00')
  })

  it('leaves other documents untouched', () => {
    expect(formatDocument('AB123456')).toBe('AB123456')
    expect(formatDocument('123456789')).toBe('123456789')
  })
})

describe('formatPhone', () => {
  it('formats mobile numbers (11 digits)', () => {
    expect(formatPhone('11912345678')).toBe('(11) 91234-5678')
  })

  it('formats landlines (10 digits)', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })

  it('leaves other formats untouched', () => {
    expect(formatPhone('5511912345678')).toBe('5511912345678')
  })
})
