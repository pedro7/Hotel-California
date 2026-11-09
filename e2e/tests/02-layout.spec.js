import { expect, test } from '@playwright/test'
import { expectRows, layoutMetrics } from './helpers.js'

for (const [name, path, searchPlaceholder, oneResult] of [
  ['Reservas', '/reservations', /Buscar hóspede/, 'Ana Almeida 01'],
  ['Hóspedes', '/guests', /Buscar por nome/, 'Ana Almeida 01'],
]) {
  test.describe(name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path)
      await expectRows(page, 20)
    })

    test('a página não rola; só a grade rola por dentro', async ({ page }) => {
      const m = await layoutMetrics(page)
      expect(m.pageScrolls).toBe(false)
      expect(m.cardScrolls).toBe(true)
    })

    test('a paginação e o rodapé ficam visíveis na tela', async ({ page }) => {
      const pagination = await page.locator('.pagination').boundingBox()
      const footer = await page.locator('.motel-footer').boundingBox()
      const { viewportHeight } = await layoutMetrics(page)
      expect(pagination.y + pagination.height).toBeLessThanOrEqual(viewportHeight)
      expect(footer.y + footer.height).toBeLessThanOrEqual(viewportHeight + 1)
    })

    test('o cabeçalho da grade fica fixo ao rolar', async ({ page }) => {
      const card = page.locator('.table-card')
      await card.evaluate((el) => el.scrollTo(0, el.scrollHeight))
      const cardBox = await card.boundingBox()
      const headerBox = await page.locator('thead th').first().boundingBox()
      expect(Math.abs(headerBox.y - cardBox.y)).toBeLessThan(4)
    })

    test('navega entre as páginas', async ({ page }) => {
      await expect(page.getByText(/Página 1 de [2-9]/)).toBeVisible()
      await expect(page.getByRole('button', { name: /Anterior/ })).toBeDisabled()

      const firstRowPage1 = await page.locator('tbody tr').first().innerText()
      await page.getByRole('button', { name: /Próxima/ }).click()
      await expect(page.getByText(/Página 2 de/)).toBeVisible()
      await expect(page.locator('tbody tr').first()).not.toHaveText(firstRowPage1)

      // go to the last page: fewer rows, "Próxima" disabled
      while (await page.getByRole('button', { name: /Próxima/ }).isEnabled()) {
        await page.getByRole('button', { name: /Próxima/ }).click()
      }
      await expect(page.locator('tbody tr')).not.toHaveCount(20)

      await page.getByRole('button', { name: /Anterior/ }).click()
      await expect(page.locator('tbody tr')).toHaveCount(20)
    })

    test('filtrar por um único registro não deixa espaço em branco sob a grade', async ({ page }) => {
      await page.getByPlaceholder(searchPlaceholder).fill(oneResult)
      await expectRows(page, 1)
      await expect(page.locator('.pagination')).toHaveCount(0)

      const m = await layoutMetrics(page)
      expect(m.cardScrolls).toBe(false)
      // the card is exactly as tall as its table (+ borders), with no empty band
      expect(m.cardHeight - m.tableHeight).toBeLessThan(8)
    })

    test('buscar sem resultado mostra o estado vazio', async ({ page }) => {
      await page.getByRole('button', { name: /Próxima/ }).click()
      await page.getByPlaceholder(searchPlaceholder).fill('zzzz-inexistente')
      await expect(page.getByText(/Nenhum(a)? (reserva|hóspede)/)).toBeVisible()
    })
  })
}
