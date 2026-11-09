import { expect } from '@playwright/test'

/** Today (+ offset days) in the hotel's time zone, as dd/mm/aaaa. */
export function brDate(offsetDays = 0) {
  const base = new Date(Date.now() + offsetDays * 86_400_000)
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(base)
}

/** Waits for the grid to have loaded `count` data rows. */
export async function expectRows(page, count) {
  await expect(page.locator('tbody tr')).toHaveCount(count)
}

/** Size information used by the layout assertions. */
export function layoutMetrics(page) {
  return page.evaluate(() => {
    const card = document.querySelector('.table-card')
    const table = card.querySelector('table')
    const root = document.documentElement
    return {
      pageScrolls:
        root.scrollHeight > window.innerHeight + 1 || document.body.scrollHeight > window.innerHeight + 1,
      cardScrolls: card.scrollHeight > card.clientHeight + 1,
      cardHeight: card.getBoundingClientRect().height,
      tableHeight: table.getBoundingClientRect().height,
      viewportHeight: window.innerHeight,
    }
  })
}
