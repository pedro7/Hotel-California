import { expect, test } from '@playwright/test'
import { expectRows } from './helpers.js'

const toNumber = (text) => Number(text.replace(/\D/g, ''))
const toIso = (text) => text.slice(0, 10).split('/').reverse().join('-')


// The header changes instantly but the rows update when the new request returns,
// so the order has to be awaited (poll), not read once.
const column = (page, index) => page.locator(`tbody tr td:nth-child(${index})`).allInnerTexts()

async function expectOrder(page, index, map, direction) {
  await expect
    .poll(async () => {
      const values = (await column(page, index)).map(map)
      const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      if (direction === 'desc') sorted.reverse()
      return JSON.stringify(sorted) === JSON.stringify(values)
    })
    .toBe(true)
}

test.describe('Reservas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/reservations')
    await expectRows(page, 20)
  })

  test('a ordenação padrão é por id decrescente', async ({ page }) => {
    await expectOrder(page, 1, toNumber, 'desc')
  })

  test('clicar em # alterna entre crescente e decrescente', async ({ page }) => {
    await page.getByRole('button', { name: /^#/ }).click()
    await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1)
    await expectOrder(page, 1, toNumber, 'asc')

    await page.getByRole('button', { name: /^#/ }).click()
    await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1)
    await expectOrder(page, 1, toNumber, 'desc')
  })

  test('ordena pela data de entrada nos dois sentidos', async ({ page }) => {
    await page.getByRole('button', { name: /Entrada/ }).click()
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Entrada')
    await expectOrder(page, 3, toIso, 'asc')

    await page.getByRole('button', { name: /Entrada/ }).click()
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Entrada')
    await expectOrder(page, 3, toIso, 'desc')
  })

  test('ordenar volta para a página 1', async ({ page }) => {
    await page.getByRole('button', { name: /Próxima/ }).click()
    await expect(page.getByText(/Página 2 de/)).toBeVisible()
    await page.getByRole('button', { name: /Saída/ }).click()
    await expect(page.getByText(/Página 1 de/)).toBeVisible()
  })
})

test.describe('Hóspedes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/guests')
    await expectRows(page, 20)
  })

  const digits = (text) => text.replace(/\D/g, '')

  test('ordena por documento nos dois sentidos', async ({ page }) => {
    await page.getByRole('button', { name: /Documento/ }).click()
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Documento')
    await expectOrder(page, 2, digits, 'asc')

    await page.getByRole('button', { name: /Documento/ }).click()
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Documento')
    await expectOrder(page, 2, digits, 'desc')
  })

  test('Nome começa crescente e o primeiro clique inverte', async ({ page }) => {
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Nome')
    await page.getByRole('button', { name: /Nome/ }).click()
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Nome')
  })
})
