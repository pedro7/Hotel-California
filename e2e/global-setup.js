import { chromium } from '@playwright/test'

const baseURL = process.env.BASE_URL ?? 'http://localhost:5173'

async function waitForApp() {
  const deadline = Date.now() + 120_000
  for (;;) {
    try {
      const response = await fetch(`${baseURL}/api/auth/csrf/`)
      if (response.ok) return
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`O app não respondeu em ${baseURL}`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

// Logs in once and reuses the session in every test (the login endpoint is rate limited).
export default async function globalSetup() {
  await waitForApp()
  const browser = await chromium.launch()
  const page = await browser.newPage({ baseURL })
  await page.goto('/login')
  await page.getByLabel('Usuário').fill(process.env.E2E_USER ?? 'atendente')
  await page.getByLabel('Senha').fill(process.env.E2E_PASSWORD ?? 'senha-forte-123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/reservations')
  await page.context().storageState({ path: '.auth/state.json' })
  await browser.close()
}
