/**
 * Carga da 1ª avaliação do sistema, com os dados reais do II Ciclo.
 *
 * Executa o fluxo COMPLETO pela camada de aplicação — não por SQL direto —,
 * para que todas as guardas atuem: escopo por escola, validação, severidades,
 * reconciliação com o cadastro prévio e transação de confirmação.
 *
 * Ordem: escola → avaliação → cadastro dos estudantes (nominata) →
 * importação dos resultados → validação → pré-visualização → confirmação.
 *
 * Uso: npx tsx scripts/carregar-primeira-avaliacao.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

import { criarEscola } from '@/modules/schools/application/school-mutations'
import { criarAvaliacao } from '@/modules/assessments/application/assessment-mutations'
import { importarNominata } from '@/modules/students/application/import-roster'
import { createImport } from '@/modules/imports/application/create-import'
import { runValidation } from '@/modules/imports/application/run-validation'
import { getPreview } from '@/modules/imports/application/get-preview'
import { confirmImport } from '@/modules/imports/application/confirm-import'
import { resolveAllowedSchoolIds, type AuthContext } from '@/server/authorization'

const ARQUIVO = resolve(
  process.cwd(),
  'HABILIDADES_DESEMPENHO_ESTUDANTE 26-08-2026 4-25-38.csv',
)

const prisma = new PrismaClient()

function titulo(texto: string): void {
  console.log(`\n${'─'.repeat(72)}\n${texto}\n${'─'.repeat(72)}`)
}

async function main(): Promise<void> {
  const conteudo = readFileSync(ARQUIVO)

  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@painel.local' },
    select: { id: true, role: true, canAccessNominalData: true },
  })

  const ctxInicial: AuthContext = {
    userId: admin.id,
    role: admin.role,
    allowedSchoolIds: await resolveAllowedSchoolIds(admin.id, admin.role),
    canAccessNominalData: admin.canAccessNominalData,
  }

  // --- 1. Escola -----------------------------------------------------------
  titulo('1. Escola')

  let schoolId: string
  const existente = await prisma.school.findUnique({
    where: { code: 'EM-BOA-VISTA-001' },
    select: { id: true },
  })

  if (existente) {
    schoolId = existente.id
    console.log('  Escola já cadastrada.')
  } else {
    const criada = await criarEscola(ctxInicial, {
      code: 'EM-BOA-VISTA-001',
      name: 'Escola Municipal — II Ciclo',
      rede: 'MUNICIPAL',
      municipio: 'BOA VISTA',
      estado: 'RR',
    })
    schoolId = criada.id
    console.log('  Escola Municipal — II Ciclo (BOA VISTA / RR)')
  }

  // O escopo é resolvido de novo: a escola nova precisa entrar nele.
  const ctx: AuthContext = {
    ...ctxInicial,
    allowedSchoolIds: await resolveAllowedSchoolIds(admin.id, admin.role),
  }

  // --- 2. Avaliação --------------------------------------------------------
  titulo('2. Avaliação')

  const avaliacao = await criarAvaliacao(ctx, {
    nome: 'Avaliação de Leitura — II Ciclo',
    ano: 2026,
    ciclo: 'II Ciclo',
    componenteCurricular: 'LÍNGUA PORTUGUESA',
    dataAplicacao: null,
  })
  console.log('  Avaliação de Leitura — II Ciclo (2026) · LÍNGUA PORTUGUESA')

  // --- 3. Cadastro prévio dos estudantes -----------------------------------
  titulo('3. Cadastro dos estudantes (nominata)')

  const nominata = await importarNominata(ctx, {
    conteudo,
    nomeArquivo: 'nominata-ii-ciclo.csv',
    schoolId,
  })

  console.log(`  Aplicada:         ${nominata.aplicado ? 'sim' : 'NÃO'}`)
  console.log(`  Estudantes criados: ${nominata.criados}`)
  console.log(`  Já existentes:      ${nominata.jaExistentes}`)
  console.log(`  Turmas criadas:     ${nominata.turmasCriadas}`)
  if (nominata.problemas.length > 0) {
    console.log(`  Problemas:          ${nominata.problemas.length}`)
    for (const p of nominata.problemas.slice(0, 5)) {
      console.log(`    linha ${p.linha}: ${p.mensagem}`)
    }
  }

  // --- 4. Importação dos resultados ----------------------------------------
  titulo('4. Importação dos resultados')

  const { importId } = await createImport(ctx, {
    assessmentId: avaliacao.id,
    schoolId,
    nomeArquivo: 'resultados-ii-ciclo.csv',
    conteudo,
    mimeType: 'text/csv',
  })

  const validacao = await runValidation(importId)
  console.log(`  Registros encontrados:      ${validacao.totalRows}`)
  console.log(`  Avaliados:                  ${validacao.evaluatedRows}`)
  console.log(`  Não avaliados:              ${validacao.notEvaluatedRows}`)
  console.log(`  Turmas identificadas:       ${validacao.classCount}`)
  console.log(`  Habilidades identificadas:  ${validacao.skillCount}`)
  console.log(`  Inconsistências críticas:   ${validacao.errorCount}`)
  console.log(`  Alertas:                    ${validacao.warningCount}`)

  // --- 5. Pré-visualização --------------------------------------------------
  titulo('5. Pré-visualização (nada gravado ainda)')

  const preview = await getPreview(ctx, importId, { amostra: 3 })
  const gravadosAntes = await prisma.assessmentStudentResult.count({
    where: { assessmentId: avaliacao.id },
  })
  console.log(`  Resultados persistidos neste momento: ${gravadosAntes}`)
  console.log('  Alertas por tipo:')
  for (const i of preview.inconsistenciasPorTipo) {
    console.log(`    ${i.severity.padEnd(7)} ${String(i.quantidade).padStart(4)}  ${i.code}`)
  }

  if (!preview.resumo.podeConfirmar) {
    console.log('\n  Há inconsistências críticas. A confirmação está bloqueada.')
    return
  }

  // --- 6. Confirmação -------------------------------------------------------
  titulo('6. Confirmação (transação única)')

  const resultado = await confirmImport(ctx, importId, {})
  console.log(`  Registros persistidos:   ${resultado.persistidos}`)
  console.log(`  Estudantes criados:      ${resultado.estudantesCriados}`)
  console.log(`  Turmas criadas:          ${resultado.turmasCriadas}`)

  console.log(`\n  assessmentId = ${avaliacao.id}`)
  console.log(`  schoolId     = ${schoolId}`)
}

main()
  .catch((erro) => {
    console.error('\nFALHA:', erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
