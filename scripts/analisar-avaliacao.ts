/**
 * Análise da avaliação carregada, pela mesma camada que alimenta as telas.
 *
 * Uso: npx tsx scripts/analisar-avaliacao.ts
 */

import Decimal from 'decimal.js'
import { PrismaClient } from '@prisma/client'

import { obterPainelAvaliacao } from '@/modules/analytics/application/assessment-dashboard'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'

const prisma = new PrismaClient()

function titulo(texto: string): void {
  console.log(`\n${'═'.repeat(74)}\n  ${texto}\n${'═'.repeat(74)}`)
}

function sub(texto: string): void {
  console.log(`\n${texto}\n${'─'.repeat(74)}`)
}

async function main(): Promise<void> {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@painel.local' },
    select: { id: true, role: true, canAccessNominalData: true },
  })

  const ctx: AuthContext = {
    userId: admin.id,
    role: admin.role,
    allowedSchoolIds: await resolveAllowedSchoolIds(admin.id, admin.role),
    canAccessNominalData: admin.canAccessNominalData,
  }

  const avaliacao = await prisma.assessment.findFirstOrThrow({
    orderBy: { createdAt: 'desc' },
    select: { id: true, nome: true, ano: true, ciclo: true },
  })

  const painel = await obterPainelAvaliacao(ctx, { assessmentId: avaliacao.id })

  titulo(`${avaliacao.nome} — ${avaliacao.ciclo} (${avaliacao.ano})`)

  // --- participação --------------------------------------------------------
  sub('PARTICIPAÇÃO')
  const p = painel.participacao
  console.log(`  Estudantes importados .......... ${p.total}`)
  console.log(`  Avaliados ...................... ${p.avaliados}`)
  console.log(`  Não avaliados .................. ${p.naoAvaliados}`)
  console.log(`  Taxa de participação ........... ${p.taxa.percentualFormatado}`)

  // --- desempenho ----------------------------------------------------------
  sub('DESEMPENHO GERAL')
  const d = painel.desempenhoGeral
  console.log(
    `  Percentual geral de acertos .... ${d.percentualFormatado}` +
      (d.numerador !== null ? `   (${d.numerador} de ${d.denominador} itens)` : ''),
  )
  console.log('  Cálculo: Σ acertos ÷ Σ itens dos avaliados — nunca média de percentuais.')

  // --- distribuição --------------------------------------------------------
  sub('DISTRIBUIÇÃO POR NÍVEL DE APRENDIZAGEM  (fonte oficial, sobre os avaliados)')
  for (const linha of painel.distribuicao.linhas) {
    console.log(
      `  ${linha.rotulo.padEnd(30)} ${String(linha.quantidade).padStart(4)}   ${
        linha.proporcao.percentualFormatado
      }`,
    )
  }
  console.log(
    `  ${'—'.repeat(22)} ${'—'.repeat(4)}\n  ${'Denominador'.padEnd(22)} ${String(
      painel.distribuicao.totalAvaliados,
    ).padStart(4)}   avaliados (os não avaliados ficam fora)`,
  )

  // --- habilidades ---------------------------------------------------------
  sub('RANKING DE HABILIDADES — da maior fragilidade ao melhor desempenho')
  console.log(
    `  ${'#'.padStart(2)}  ${'Hab'.padEnd(5)} ${'Código'.padEnd(9)} ${'Acertos'.padStart(
      8,
    )} ${'Itens'.padStart(7)} ${'%'.padStart(9)}   Descrição`,
  )
  for (const h of painel.habilidades) {
    const desc = h.descricao.length > 62 ? `${h.descricao.slice(0, 59)}…` : h.descricao
    console.log(
      `  ${String(h.posicao).padStart(2)}  ${h.shortCode.padEnd(5)} ${h.referenceCode.padEnd(
        9,
      )} ${String(h.acertos ?? '—').padStart(8)} ${String(h.itens ?? '—').padStart(
        7,
      )} ${h.percentualFormatado.padStart(9)}   ${desc}`,
    )
  }

  const maisFragil = painel.habilidadeMaisFragil
  const melhor = painel.habilidadeMelhorDesempenho
  console.log(`\n  Habilidade mais frágil ......... ${maisFragil?.shortCode} — ${maisFragil?.percentualFormatado}`)
  console.log(`  Melhor desempenho .............. ${melhor?.shortCode} — ${melhor?.percentualFormatado}`)

  // --- turmas --------------------------------------------------------------
  sub('TURMAS')
  console.log(
    `  ${'Turma'.padEnd(14)} ${'Total'.padStart(6)} ${'Aval.'.padStart(6)} ${'Não av.'.padStart(
      8,
    )} ${'Participação'.padStart(13)} ${'Desempenho'.padStart(11)} ${'Defasagem'.padStart(10)}`,
  )
  for (const t of painel.turmasPorMenorDesempenho) {
    console.log(
      `  ${t.nome.slice(0, 14).padEnd(14)} ${String(t.total).padStart(6)} ${String(
        t.avaliados,
      ).padStart(6)} ${String(t.naoAvaliados).padStart(8)} ${`${t.avaliados}/${t.total}`.padStart(
        13,
      )} ${t.desempenho.percentualFormatado.padStart(11)} ${t.proporcaoDefasagem.percentualFormatado.padStart(10)}`,
    )
  }

  // --- conferência aritmética ----------------------------------------------
  sub('CONFERÊNCIA ARITMÉTICA (independente da camada de análise)')

  const somaHabilidades = await prisma.studentSkillResult.aggregate({
    where: { result: { assessmentId: avaliacao.id, avaliado: true }, acertos: { not: null } },
    _sum: { acertos: true, itensPossiveis: true },
  })
  const somaEstudantes = await prisma.assessmentStudentResult.aggregate({
    where: { assessmentId: avaliacao.id, avaliado: true },
    _sum: { acertosTotais: true, itensTotais: true },
  })

  const porHabilidade = new Decimal(somaHabilidades._sum.acertos ?? 0)
    .div(somaHabilidades._sum.itensPossiveis ?? 1)
    .mul(100)
  const porEstudante = new Decimal(somaEstudantes._sum.acertosTotais ?? 0)
    .div(somaEstudantes._sum.itensTotais ?? 1)
    .mul(100)

  console.log(`  Σ por habilidade ............... ${porHabilidade.toFixed(4)}%`)
  console.log(`  Σ por estudante ................ ${porEstudante.toFixed(4)}%`)
  console.log(
    `  Coincidem? ..................... ${
      porHabilidade.toFixed(6) === porEstudante.toFixed(6) ? 'SIM' : 'NÃO'
    }  (as duas rotas de soma têm de dar o mesmo)`,
  )

  const zerosIndevidos = await prisma.studentSkillResult.count({
    where: { result: { assessmentId: avaliacao.id, avaliado: false }, acertos: { not: null } },
  })
  const totaisIndevidos = await prisma.assessmentStudentResult.count({
    where: { assessmentId: avaliacao.id, avaliado: false, acertosTotais: { not: null } },
  })
  console.log(`  Não avaliado com resultado ..... ${zerosIndevidos}  (tem de ser 0)`)
  console.log(`  Não avaliado com total ......... ${totaisIndevidos}  (tem de ser 0)`)

  const itensPorEstudante = await prisma.assessmentSkill.aggregate({
    where: { assessmentId: avaliacao.id },
    _sum: { referenceItems: true },
  })
  console.log(
    `  Itens por estudante avaliado ... ${itensPorEstudante._sum.referenceItems}  (apurado dos dados, não fixado)`,
  )
}

main()
  .catch((erro) => {
    console.error('FALHA:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
