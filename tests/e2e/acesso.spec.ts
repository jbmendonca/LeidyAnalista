import { expect, test } from '@playwright/test'
import {
  criarEscola,
  criarUsuario,
  entrar,
  limpar,
  prisma,
  type UsuarioTeste,
} from './_apoio'

/**
 * Cenário 5 do quickstart — escopo por escola e acesso.
 *
 * É o teste que sustenta a promessa mais delicada do sistema: um usuário de
 * escola não alcança dado de outra escola, nem por URL, nem por parâmetro, nem
 * por contagem agregada.
 */

const SUFIXO = `acesso${Date.now()}`

let escolaA: string
let escolaB: string
let usuarioEscolaB: UsuarioTeste
let admin: UsuarioTeste

test.beforeAll(async () => {
  escolaA = await criarEscola(SUFIXO, 'EscolaA')
  escolaB = await criarEscola(SUFIXO, 'EscolaB')
  usuarioEscolaB = await criarUsuario({
    sufixo: SUFIXO,
    role: 'ESCOLA',
    escolas: [escolaB],
  })
  admin = await criarUsuario({ sufixo: SUFIXO, role: 'ADMIN' })
})

test.afterAll(async () => {
  await limpar(SUFIXO)
  await prisma.$disconnect()
})

test('rota protegida sem sessão redireciona para a autenticação', async ({ page }) => {
  await page.goto('/avaliacoes')
  await expect(page).toHaveURL(/\/entrar/)
})

test('credencial inválida devolve a mesma mensagem de e-mail inexistente', async ({
  page,
}) => {
  await page.goto('/entrar')
  await page.getByLabel(/e-?mail/i).fill('nao-existe@teste.local')
  await page.getByLabel(/senha/i).fill('errada')
  await page.getByRole('button', { name: /entrar/i }).click()
  const mensagemInexistente = await page.getByRole('alert').textContent()

  await page.getByLabel(/e-?mail/i).fill(usuarioEscolaB.email)
  await page.getByLabel(/senha/i).fill('senha-errada-mesmo')
  await page.getByRole('button', { name: /entrar/i }).click()
  const mensagemSenhaErrada = await page.getByRole('alert').textContent()

  // Mensagens diferentes permitiriam enumerar quem tem conta no sistema.
  expect(mensagemInexistente).toBe(mensagemSenhaErrada)
})

test('usuário da Escola B não alcança a Escola A por URL', async ({ page }) => {
  await entrar(page, usuarioEscolaB)

  const resposta = await page.goto(`/escolas/${escolaA}/editar`)

  // 404, jamais 403: um 403 confirmaria a existência da escola.
  expect(resposta?.status()).toBe(404)
})

test('usuário da Escola B não vê a Escola A na listagem', async ({ page }) => {
  await entrar(page, usuarioEscolaB)
  await page.goto('/escolas')

  await expect(page.getByText('EscolaB')).toBeVisible()
  await expect(page.getByText('EscolaA')).toHaveCount(0)
})

test('perfil Escola não acessa configurações nem usuários', async ({ page }) => {
  await entrar(page, usuarioEscolaB)

  for (const rota of ['/configuracoes', '/usuarios', '/auditoria']) {
    const resposta = await page.goto(rota)
    expect(
      [403, 404].includes(resposta?.status() ?? 0),
      `${rota} deveria negar o acesso`,
    ).toBe(true)
  }
})

test('sair encerra a sessão no servidor, não apenas no navegador', async ({ page }) => {
  await entrar(page, admin)

  const antes = await prisma.session.count({ where: { userId: admin.id } })
  expect(antes).toBeGreaterThan(0)

  await page.getByRole('button', { name: /sair/i }).click()
  await page.waitForURL(/\/entrar/)

  const depois = await prisma.session.count({ where: { userId: admin.id } })
  expect(depois).toBe(0)
})
