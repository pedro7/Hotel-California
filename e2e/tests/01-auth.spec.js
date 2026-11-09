import { expect, test } from '@playwright/test'

// These tests start logged out.
test.use({ storageState: { cookies: [], origins: [] } })

test('redireciona para o login quando não há sessão', async ({ page }) => {
  await page.goto('/reservations')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
})

test('a tela de login não exibe a frase nem o contador removidos', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText('check out any time')).toHaveCount(0)
  await expect(page.getByText('Hóspedes registrados')).toHaveCount(0)
})

test('o fundo da tela de login cobre a tela inteira', async ({ page }) => {
  await page.goto('/login')
  const box = await page.locator('.login-page').boundingBox() // waits for the page to render
  const viewport = page.viewportSize().height
  expect(box.y + box.height).toBeGreaterThanOrEqual(viewport - 1)
})

test('senha errada mostra erro e permanece no login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Usuário').fill('atendente')
  await page.getByLabel('Senha').fill('senha-errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})
