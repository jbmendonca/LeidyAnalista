import { expect, test } from '@playwright/test'
import { criarEscola, criarUsuario, entrar, limpar, prisma, type UsuarioTeste } from './_apoio'

/**
 * Responsividade — FR-123 e Princípio VIII.
 *
 * A regra que importa: **tabela larga rola no próprio contêiner; a página
 * nunca rola na horizontal.** Rolagem horizontal de página num celular é o
 * defeito que torna um painel inutilizável para quem o consulta em campo.
 */

const SUFIXO = `resp${Date.now()}`
let usuario: UsuarioTeste

test.beforeAll(async () => {
  const escola = await criarEscola(SUFIXO, 'EscolaResp')
  usuario = await criarUsuario({ sufixo: SUFIXO, role: 'ADMIN', escolas: [escola] })
})

test.afterAll(async () => {
  await limpar(SUFIXO)
  await prisma.$disconnect()
})

const ROTAS = ['/avaliacoes', '/escolas', '/turmas', '/estudantes', '/importacoes']

for (const rota of ROTAS) {
  test(`${rota} não produz rolagem horizontal da página`, async ({ page }, info) => {
    await entrar(page, usuario)
    await page.goto(rota)
    await page.waitForLoadState('networkidle')

    const excesso = await page.evaluate(() => {
      const doc = document.documentElement
      return doc.scrollWidth - doc.clientWidth
    })

    expect(
      excesso,
      `${rota} em ${info.project.name} transborda ${excesso}px na horizontal`,
    ).toBeLessThanOrEqual(1)
  })
}

test('a navegação permanece alcançável no celular', async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'específico do viewport de celular')

  await entrar(page, usuario)
  await page.goto('/avaliacoes')

  const abrir = page.getByRole('button', { name: /menu|navegação/i })
  await expect(abrir).toBeVisible()
  await abrir.click()

  await expect(page.getByRole('link', { name: /importações/i })).toBeVisible()
})
