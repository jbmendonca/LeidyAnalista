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
  // O Next injeta um `role="alert"` próprio (anunciador de rota); o alerta que
  // interessa é o do formulário.
  const alerta = page.locator('form [role="alert"]')
  const mensagemInexistente = await alerta.textContent()

  await page.getByLabel(/e-?mail/i).fill(usuarioEscolaB.email)
  await page.getByLabel(/senha/i).fill('senha-errada-mesmo')
  await page.getByRole('button', { name: /entrar/i }).click()
  const mensagemSenhaErrada = await alerta.textContent()

  // Mensagens diferentes permitiriam enumerar quem tem conta no sistema.
  expect(mensagemInexistente).toBe(mensagemSenhaErrada)
})

test('usuário da Escola B não alcança a Escola A por URL', async ({ page }) => {
  await entrar(page, usuarioEscolaB)

  await page.goto(`/escolas/${escolaA}/editar`)

  // A tela de edição é privativa do ADMIN: o perfil Escola é desviado antes
  // mesmo de a consulta acontecer. O que importa verificar é o resultado —
  // ele não permanece na rota e não vê nada da Escola A.
  await expect(page).not.toHaveURL(new RegExp(escolaA))
  await expect(page.locator('body')).not.toContainText('EscolaA')
})

test('usuário da Escola B não vê a Escola A na listagem', async ({ page }) => {
  await entrar(page, usuarioEscolaB)
  await page.goto('/escolas')

  // `EscolaB` aparece no nome e no código; basta que exista ao menos uma vez.
  await expect(page.getByText(/EscolaB/).first()).toBeVisible()
  await expect(page.getByText(/EscolaA/)).toHaveCount(0)
})

test('perfil Escola não acessa configurações nem usuários', async ({ page }) => {
  await entrar(page, usuarioEscolaB)

  for (const rota of ['/configuracoes', '/usuarios', '/auditoria']) {
    await page.goto(rota)
    // Negar pode ser desviar ou responder erro; o que não pode é a tela
    // administrativa aparecer para quem não é administrador.
    const corpo = page.locator('body')
    await expect(corpo, `${rota} não deveria estar acessível`).not.toContainText(
      /critérios analíticos|nova pessoa usuária|trilha de auditoria/i,
    )
  }
})

test('sair encerra a sessão no servidor, não apenas no navegador', async ({ page }) => {
  await entrar(page, admin)

  const antes = await prisma.session.count({ where: { userId: admin.id } })
  expect(antes).toBeGreaterThan(0)

  // Abaixo de `lg` a navegação — e com ela o botão Sair — vive na gaveta
  // recolhida, que é `invisible` justamente para não deixar links focáveis
  // fora da tela.
  const abrirMenu = page.getByRole('button', { name: /menu de navegação/i })
  if (await abrirMenu.isVisible().catch(() => false)) {
    await abrirMenu.click()
  }

  await page.getByRole('button', { name: /^sair$/i }).click()
  await page.waitForURL(/\/entrar/)

  const depois = await prisma.session.count({ where: { userId: admin.id } })
  expect(depois).toBe(0)
})
