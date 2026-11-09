const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** "120.00" (DRF decimal string) -> "R$ 120,00" */
export function formatMoney(value) {
  return currency.format(Number(value ?? 0))
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function parseIsoDate(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day) // local date, no time zone shifting
}

/** "2026-11-07" -> "07/11/2026" */
export function formatDate(iso) {
  if (!iso) return '—'
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

/** Keeps only digits and inserts the slashes while typing: "0711" -> "07/11" */
export function maskDate(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** "07/11/2026" -> "2026-11-07"; returns '' when incomplete or not a real date. */
export function parseBrDate(text) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  if (!match) return ''
  const [, day, month, year] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  const real =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
  return real ? `${year}-${month}-${day}` : ''
}

/** "2026-11-07" -> "sáb" */
export function weekdayName(iso) {
  return WEEKDAYS[parseIsoDate(iso).getDay()]
}

/** ISO datetime -> "07/11/2026 14:30" (browser local time) */
export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return '—'
  return new Date(isoDateTime).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** Today (+ offsetDays) as "YYYY-MM-DD" in local time, for <input type="date">. */
export function todayIso(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** "12345678900" -> "123.456.789-00" (CPF); other documents are shown as stored. */
export function formatDocument(document) {
  if (/^\d{11}$/.test(document)) {
    return document.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  return document
}

/** "11912345678" -> "(11) 91234-5678" */
export function formatPhone(phone) {
  if (/^\d{11}$/.test(phone)) return phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (/^\d{10}$/.test(phone)) return phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return phone
}
