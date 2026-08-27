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

    const medida = await page.evaluate(() => {
      // `scrollWidth - clientWidth` NÃO serve aqui: com `overflow-x: hidden`
      // na raiz, ele continua reportando a extensão do conteúdo mesmo quando a
      // página não rola. O que importa é se a pessoa CONSEGUE rolar.
      const antes = window.scrollX
      window.scrollTo(9999, 0)
      const depois = window.scrollX
      window.scrollTo(antes, 0)

      // E, separadamente, se algum conteúdo ficou inalcançável: transbordo
      // fora de qualquer contêiner rolável é conteúdo perdido, não contido.
      const largura = document.documentElement.clientWidth
      const clipado = (el: Element): boolean => {
        let p = el.parentElement
        while (p) {
          const ox = getComputedStyle(p).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
          p = p.parentElement
        }
        return false
      }
      const inalcancaveis = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.right > largura + 1 && !clipado(el)
        })
        .map((el) => `${el.tagName}.${(el.className || '').toString().slice(0, 40)}`)

      return { rolouHorizontal: depois > antes, inalcancaveis: inalcancaveis.slice(0, 3) }
    })

    expect(
      medida.rolouHorizontal,
      `${rota} em ${info.project.name} rola na horizontal`,
    ).toBe(false)

    expect(
      medida.inalcancaveis,
      `${rota} em ${info.project.name} tem conteúdo transbordando fora de contêiner rolável`,
    ).toEqual([])
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
