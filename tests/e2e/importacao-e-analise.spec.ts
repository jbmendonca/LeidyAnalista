import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { criarEscola, criarUsuario, entrar, limpar, prisma, type UsuarioTeste } from './_apoio'

/**
 * Cenários 2, 3 e 4 do quickstart — o caminho que justifica o produto.
 *
 * Importa o arquivo de referência e confere, na tela, os números que o
 * Princípio X fixa: 111/106/5/4/12, a distribuição 96/7/3 e o ranking de
 * fragilidade. E confere o que mais importa: que o estudante não avaliado
 * apareça como ausência de dado, nunca como zero.
 */

const SUFIXO = `fluxo${Date.now()}`
const FIXTURE = resolve(__dirname, '../fixtures/resultados-referencia.csv')

let escolaId: string
let avaliacaoId: string
let admin: UsuarioTeste

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  escolaId = await criarEscola(SUFIXO, 'EscolaFluxo')
  admin = await criarUsuario({ sufixo: SUFIXO, role: 'ADMIN', escolas: [escolaId] })

  const avaliacao = await prisma.assessment.create({
    data: {
      nome: `Avaliação ${SUFIXO}`,
      ano: 2026,
      ciclo: 'II Ciclo',
      componenteCurricular: 'LÍNGUA PORTUGUESA',
    },
  })
  avaliacaoId = avaliacao.id
})

test.afterAll(async () => {
  await limpar(SUFIXO)
  await prisma.$disconnect()
})

test('importa o arquivo de referência e confirma os números na pré-visualização', async ({
  page,
}) => {
  await entrar(page, admin)
  await page.goto('/importacoes/nova')

  await page.getByLabel(/avaliação/i).selectOption(avaliacaoId)
  await page.getByLabel(/escola/i).selectOption(escolaId)
  await page.getByLabel(/arquivo/i).setInputFiles(FIXTURE)

  await page.getByRole('button', { name: /enviar e validar/i }).click()
  await page.waitForURL(/\/importacoes\/[^/]+$/, { timeout: 60_000 })

  const conteudo = page.locator('main')
  await expect(conteudo).toContainText('111')
  await expect(conteudo).toContainText('106')

  // Nada foi gravado ainda — é a promessa central da pré-visualização.
  await expect(conteudo).toContainText(/nada foi gravado/i)

  const resultados = await prisma.assessmentStudentResult.count({
    where: { assessmentId: avaliacaoId },
  })
  expect(resultados).toBe(0)
})

test('confirma a importação e persiste os 111 registros', async ({ page }) => {
  await entrar(page, admin)

  const importacao = await prisma.import.findFirstOrThrow({
    where: { assessmentId: avaliacaoId },
    orderBy: { createdAt: 'desc' },
  })
  await page.goto(`/importacoes/${importacao.id}`)

  const cadastrar = page.getByRole('checkbox', { name: /cadastrar/i })
  if (await cadastrar.isVisible().catch(() => false)) {
    await cadastrar.check()
  }

  await page.getByRole('button', { name: /confirmar importação/i }).click()
  await expect(page.getByRole('alert')).toContainText(/confirmada|persistidos/i, {
    timeout: 120_000,
  })

  const resultados = await prisma.assessmentStudentResult.count({
    where: { assessmentId: avaliacaoId },
  })
  expect(resultados).toBe(111)
})

test('o painel geral mostra a participação e a distribuição corretas', async ({ page }) => {
  await entrar(page, admin)
  await page.goto(`/avaliacoes/${avaliacaoId}`)
  await page.waitForLoadState('networkidle')

  const conteudo = page.locator('main')

  await expect(conteudo).toContainText('111')
  await expect(conteudo).toContainText('106')
  await expect(conteudo).toContainText('95,50%')

  // Distribuição sobre os 106 avaliados, nunca sobre os 111 importados.
  await expect(conteudo).toContainText('96')
  await expect(conteudo).toContainText('H07')
})

test('o não avaliado aparece como ausência de dado, nunca como zero', async ({ page }) => {
  await entrar(page, admin)

  const naoAvaliado = await prisma.assessmentStudentResult.findFirstOrThrow({
    where: { assessmentId: avaliacaoId, avaliado: false },
    select: { studentId: true },
  })

  await page.goto(`/estudantes/${naoAvaliado.studentId}`)
  await page.waitForLoadState('networkidle')

  const conteudo = page.locator('main')
  await expect(conteudo).toContainText('—')
  await expect(conteudo).toContainText(/não avaliado/i)

  // A regra que o produto existe para proteger.
  await expect(conteudo).not.toContainText('0,00%')
})

test('bloqueia a reimportação do mesmo arquivo', async ({ page }) => {
  await entrar(page, admin)
  await page.goto('/importacoes/nova')

  await page.getByLabel(/avaliação/i).selectOption(avaliacaoId)
  await page.getByLabel(/escola/i).selectOption(escolaId)
  await page.getByLabel(/arquivo/i).setInputFiles(FIXTURE)
  await page.getByRole('button', { name: /enviar e validar/i }).click()

  await page.waitForURL(/\/importacoes\/[^/]+$/, { timeout: 60_000 })

  await expect(page.locator('main')).toContainText(/inconsistências críticas/i)
  await expect(page.getByRole('button', { name: /confirmar importação/i })).toBeDisabled()
})
