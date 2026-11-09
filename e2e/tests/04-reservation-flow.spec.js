import { expect, test } from '@playwright/test'
import { brDate } from './helpers.js'

// Creates data (a new guest and its reservations), so this file runs last.
const GUEST = { name: 'Teste E2E Silva', document: '88877766655', phone: '11955554444' }

async function searchReservations(page, term) {
  await page.goto('/reservations')
  await page.getByPlaceholder(/Buscar hóspede/).fill(term)
  // The search is debounced: wait until the grid shows only matching rows.
  await expect(page.locator('tbody tr', { hasNotText: term })).toHaveCount(0)
  await expect(page.locator('tbody tr', { hasText: term }).first()).toBeVisible()
}

async function openNewReservation(page) {
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nova reserva' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova reserva' })
  await dialog.getByPlaceholder(/Buscar hóspede/).fill(GUEST.name)
  await dialog.getByRole('button', { name: new RegExp(GUEST.name) }).click()
  return dialog
}

async function newReservation(page, { checkIn, checkOut }) {
  const dialog = await openNewReservation(page)
  await dialog.getByLabel('Entrada').fill(checkIn)
  await dialog.getByLabel('Saída').fill(checkOut)
  await dialog.getByRole('button', { name: 'Criar reserva' }).click()
  return dialog
}

async function confirmEarlyCheckInIfAsked(page) {
  // Before 14:00 the app asks for confirmation; otherwise it answers with a notice right away.
  // Wait for whichever comes first, so the check does not race the API response.
  const early = page.getByRole('dialog', { name: /Check-in antes das 14h00/ })
  const notice = page.getByRole('status')
  await early.or(notice).first().waitFor()
  if (await early.isVisible()) {
    await early.getByRole('button', { name: 'Realizar check-in' }).click()
  }
}

test.describe.configure({ mode: 'serial' })

test('cadastra um hóspede', async ({ page }) => {
  await page.goto('/guests')
  await page.getByRole('button', { name: '+ Novo hóspede' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo hóspede' })
  await dialog.getByLabel('Nome').fill(GUEST.name)
  await dialog.getByLabel('Documento').fill(GUEST.document)
  await dialog.getByLabel('Telefone').fill(GUEST.phone)
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog).toBeHidden()

  await page.getByPlaceholder(/Buscar por nome/).fill(GUEST.name)
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.getByText('888.777.666-55')).toBeVisible()
})

test('não permite cadastrar o mesmo documento duas vezes', async ({ page }) => {
  await page.goto('/guests')
  await page.getByRole('button', { name: '+ Novo hóspede' }).click()
  const dialog = page.getByRole('dialog', { name: 'Novo hóspede' })
  await dialog.getByLabel('Nome').fill('Outra Pessoa')
  await dialog.getByLabel('Documento').fill('888.777.666-55')
  await dialog.getByLabel('Telefone').fill('11911112222')
  await dialog.getByRole('button', { name: 'Salvar' }).click()
  await expect(dialog.getByText('Já existe um hóspede com este documento.')).toBeVisible()
})

test('cria reserva digitando as datas em dd/mm/aaaa', async ({ page }) => {
  const dialog = await newReservation(page, { checkIn: brDate(10), checkOut: brDate(12) })
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Reserva criada.')).toBeVisible()

  await searchReservations(page, GUEST.name)
  const row = page.locator('tbody tr').first()
  await expect(row).toContainText(brDate(10))
  await expect(row).toContainText(brDate(12))
  await expect(row).toContainText('Aguardando check-in')
})

test('o campo de data aplica a máscara e rejeita datas inválidas', async ({ page }) => {
  const dialog = await openNewReservation(page)

  const entrada = dialog.getByLabel('Entrada')
  await entrada.fill('')
  await entrada.pressSequentially('10122030')
  await expect(entrada).toHaveValue('10/12/2030')

  await entrada.fill('01/01/2020')
  await dialog.getByLabel('Saída').fill('31/02/2030')
  await dialog.getByRole('button', { name: 'Criar reserva' }).click()
  await expect(dialog.getByText('A entrada não pode ser no passado.')).toBeVisible()
  await expect(dialog.getByText('Informe uma data válida (dd/mm/aaaa).')).toBeVisible()
})

test('os dois campos de data têm o botão de calendário', async ({ page }) => {
  await page.goto('/reservations')
  await page.getByRole('button', { name: '+ Nova reserva' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nova reserva' })
  await expect(dialog.getByRole('button', { name: 'Abrir calendário' })).toHaveCount(2)
})

test('recusa reserva sobreposta para o mesmo hóspede', async ({ page }) => {
  const dialog = await newReservation(page, { checkIn: brDate(11), checkOut: brDate(13) })
  await expect(
    dialog.getByText('Este hóspede já possui uma reserva ou hospedagem ativa neste período.'),
  ).toBeVisible()
})

test('faz o check-in (confirmando o alerta de antecipado, se aparecer)', async ({ page }) => {
  await searchReservations(page, GUEST.name)
  const row = page.locator('tbody tr').first()
  await row.getByRole('button', { name: 'Check-in' }).click()
  await confirmEarlyCheckInIfAsked(page)

  await expect(page.getByText(/Check-in de .* realizado/)).toBeVisible()
  await expect(page.locator('tbody tr').first()).toContainText('No hotel')
})

test('não deixa fazer um segundo check-in do mesmo hóspede', async ({ page }) => {
  const dialog = await newReservation(page, { checkIn: brDate(20), checkOut: brDate(22) })
  await expect(dialog).toBeHidden()

  await searchReservations(page, GUEST.name)
  // the newest reservation is first (default order: id descending)
  const row = page.locator('tbody tr').first()
  await expect(row).toContainText(brDate(20))
  await row.getByRole('button', { name: 'Check-in' }).click()
  await confirmEarlyCheckInIfAsked(page)

  await expect(page.getByText(/já está com check-in realizado/)).toBeVisible()
  await expect(row).toContainText('Aguardando check-in')
})

test('faz o check-out e mostra a conta', async ({ page }) => {
  await searchReservations(page, GUEST.name)
  const checkedIn = page.locator('tbody tr', { hasText: 'No hotel' })
  await checkedIn.getByRole('button', { name: 'Check-out' }).click()

  await page.getByRole('button', { name: 'Confirmar check-out' }).click()
  await expect(page.getByRole('dialog', { name: 'Check-out realizado' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.locator('tbody tr', { hasText: 'Finalizada' })).toHaveCount(1)
})

test('cancela uma reserva', async ({ page }) => {
  await searchReservations(page, GUEST.name)
  const reserved = page.locator('tbody tr', { hasText: 'Aguardando check-in' })
  await reserved.getByRole('button', { name: 'Cancelar' }).click()
  await page
    .getByRole('dialog', { name: 'Cancelar reserva' })
    .getByRole('button', { name: 'Cancelar reserva' })
    .click()
  await expect(page.getByText(/Reserva #\d+ cancelada/)).toBeVisible()
  await expect(page.locator('tbody tr', { hasText: 'Cancelada' })).toHaveCount(1)
})
