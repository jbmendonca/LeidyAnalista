import { prisma } from '@/server/prisma'
import { AppError } from '@/server/http-errors'
import { assertSchoolInScope, escopoVazio, type AuthContext } from '@/server/authorization'
import { logger } from '@/server/logger'
import { registrarAuditoria } from '@/modules/audit/infra/audit-repository'
import { lerArquivo } from '@/modules/imports/infra/table-reader'
import {
  normalizarCabecalho,
  proporMapeamento,
} from '@/modules/imports/infra/header-mapping'
import { normalizeClassCode } from '@/modules/classes/domain/normalize-class-code'
import { normalizeStudentName } from '@/modules/students/domain/normalize-name'
import { reservarCodigosUnicos } from '@/modules/students/infra/student-repository'

/**
 * Cadastro em lote a partir da nominata — FR-170, FR-168, FR-169.
 *
 * O arquivo de nominata é o que a rede já tem: uma planilha com escola, turma e nomes. Ela
 * entra aqui **antes** da avaliação, e é o que transforma a importação de resultados em
 * reconhecimento de estudantes em vez de criação (FR-171).
 *
 * Regras herdadas da importação de resultados (FR-170):
 *
 *  - normalização idêntica — `normalizeClassCode` no código da turma, `normalizeStudentName`
 *    na forma de busca do nome, com o nome original preservado como veio;
 *  - as mesmas severidades: ocorrência `ERROR` impede a gravação. Quando há qualquer erro,
 *    **nada** é criado e o relatório diz o que corrigir, linha por linha. Importar metade de
 *    uma nominata deixaria a base num estado que ninguém pediu e que é difícil de desfazer.
 *
 * O código único é atribuído a cada criança aqui, na criação do cadastro (FR-169), e não na
 * importação de resultados.
 */

export type SeveridadeNominata = 'ERROR' | 'WARNING'

export type ProblemaNominata = Readonly<{
  /** Número da linha no arquivo, base 1, contando o cabeçalho — o que o usuário vê no Excel. */
  linha: number | null
  coluna: string | null
  codigo: string
  severidade: SeveridadeNominata
  mensagem: string
}>

export type RelatorioNominata = Readonly<{
  arquivo: string
  /** `false` quando havia erro: nesse caso nada foi gravado. */
  aplicado: boolean
  totalLinhas: number
  criados: number
  /** Quantos teriam sido criados — igual a `criados` quando a importação foi aplicada. */
  criaveis: number
  jaExistentes: number
  turmasCriadas: number
  problemas: readonly ProblemaNominata[]
}>

export type EntradaNominata = Readonly<{
  conteudo: Buffer
  nomeArquivo: string
  /** Escola escolhida pelo usuário. Quando ausente, cada linha é resolvida pela coluna Escola. */
  schoolId?: string | null
  aba?: string
}>

type LinhaValida = Readonly<{
  linha: number
  schoolId: string
  codigoTurma: string
  turmaNome: string
  anoEscolar: string
  nomeOriginal: string
  nomeNormalizado: string
}>

const COLUNAS_OBRIGATORIAS: ReadonlyArray<readonly [string, string]> = [
  ['codigoTurma', 'Código da Turma'],
  ['turma', 'Turma'],
  ['estudante', 'Estudante'],
]

function chaveTurma(schoolId: string, codigoTurma: string): string {
  return `${schoolId}::${codigoTurma}`
}

/** Comparação de nomes de escola: mesma normalização aplicada a nome de estudante. */
function chaveEscola(nome: string): string {
  return normalizeStudentName(nome)
}

export async function importarNominata(
  ctx: AuthContext,
  entrada: EntradaNominata,
): Promise<RelatorioNominata> {
  if (escopoVazio(ctx)) {
    throw new AppError(
      'NAO_ENCONTRADO',
      'Nenhuma escola disponível no seu acesso para receber a nominata.',
    )
  }

  const escolaEscolhida =
    entrada.schoolId != null ? assertSchoolInScope(ctx, entrada.schoolId) : null

  const tabela = lerArquivo(entrada.conteudo, entrada.nomeArquivo, {
    ...(entrada.aba !== undefined ? { aba: entrada.aba } : {}),
  })

  const mapeamento = proporMapeamento(tabela.cabecalhos)

  const faltantes = COLUNAS_OBRIGATORIAS.filter(
    ([campo]) => mapeamento.campos[campo] === undefined,
  ).map(([, rotulo]) => rotulo)

  if (faltantes.length > 0) {
    throw new AppError(
      'ENTRADA_INVALIDA',
      'A nominata não traz todas as colunas necessárias.',
      { arquivo: [`Colunas ausentes: ${faltantes.join(', ')}.`] },
    )
  }

  const indiceCodigoTurma = mapeamento.campos['codigoTurma'] as number
  const indiceTurma = mapeamento.campos['turma'] as number
  const indiceEstudante = mapeamento.campos['estudante'] as number
  const indiceAnoEscolar = mapeamento.campos['anoEscolar']
  // `Escola` não é campo canônico do mapeamento da importação de resultados — lá a escola vem
  // da própria importação. Aqui ela é reconhecida à parte, sem alterar aquele contrato.
  const indiceEscola = tabela.cabecalhos.findIndex(
    (c) => normalizarCabecalho(c) === 'ESCOLA',
  )

  const escolasDoEscopo = await prisma.school.findMany({
    where: { id: { in: [...ctx.allowedSchoolIds] } },
    select: { id: true, name: true },
  })

  const escolaPorNome = new Map<string, string | null>()
  for (const escola of escolasDoEscopo) {
    const chave = chaveEscola(escola.name)
    // Nome repetido no escopo vira ambiguidade explícita (`null`), nunca escolha silenciosa.
    escolaPorNome.set(chave, escolaPorNome.has(chave) ? null : escola.id)
  }

  const problemas: ProblemaNominata[] = []
  const validas: LinhaValida[] = []
  const vistasNoArquivo = new Set<string>()

  tabela.linhas.forEach((celulas, indice) => {
    const linha = indice + 2 // +1 pelo cabeçalho, +1 porque a contagem do usuário começa em 1

    const nomeBruto = celulas[indiceEstudante] ?? ''
    const nomeOriginal = nomeBruto.trim()
    const codigoTurma = normalizeClassCode(celulas[indiceCodigoTurma] ?? '')
    const turmaNome = (celulas[indiceTurma] ?? '').trim()
    const anoEscolar =
      indiceAnoEscolar !== undefined ? (celulas[indiceAnoEscolar] ?? '').trim() : ''
    const escolaBruta = indiceEscola >= 0 ? (celulas[indiceEscola] ?? '').trim() : ''

    // Linha inteiramente vazia é resíduo de planilha, não erro do operador.
    if (
      nomeOriginal === '' &&
      codigoTurma === '' &&
      turmaNome === '' &&
      escolaBruta === ''
    ) {
      return
    }

    if (nomeOriginal === '') {
      problemas.push({
        linha,
        coluna: 'Estudante',
        codigo: 'NOME_VAZIO',
        severidade: 'ERROR',
        mensagem: 'A linha não traz o nome do estudante.',
      })
      return
    }

    if (codigoTurma === '') {
      problemas.push({
        linha,
        coluna: 'Código da Turma',
        codigo: 'TURMA_SEM_CODIGO',
        severidade: 'ERROR',
        mensagem: 'A linha não traz o código da turma.',
      })
      return
    }

    let schoolId: string | null = escolaEscolhida

    if (escolaBruta !== '') {
      const resolvida = escolaPorNome.get(chaveEscola(escolaBruta))

      if (resolvida === undefined) {
        problemas.push({
          linha,
          coluna: 'Escola',
          codigo: 'ESCOLA_DESCONHECIDA',
          severidade: 'ERROR',
          mensagem: 'A escola informada não existe ou está fora do seu acesso.',
        })
        return
      }

      if (resolvida === null) {
        problemas.push({
          linha,
          coluna: 'Escola',
          codigo: 'ESCOLA_AMBIGUA',
          severidade: 'ERROR',
          mensagem:
            'Há mais de uma escola com esse nome no seu acesso. Selecione a escola antes de enviar.',
        })
        return
      }

      if (escolaEscolhida !== null && resolvida !== escolaEscolhida) {
        problemas.push({
          linha,
          coluna: 'Escola',
          codigo: 'ESCOLA_DIVERGENTE',
          severidade: 'ERROR',
          mensagem: 'A escola da linha é diferente da escola selecionada para a importação.',
        })
        return
      }

      schoolId = resolvida
    }

    if (schoolId === null) {
      problemas.push({
        linha,
        coluna: 'Escola',
        codigo: 'ESCOLA_AUSENTE',
        severidade: 'ERROR',
        mensagem:
          'A linha não informa a escola e nenhuma escola foi selecionada para a importação.',
      })
      return
    }

    const nomeNormalizado = normalizeStudentName(nomeOriginal)
    const chaveLinha = `${chaveTurma(schoolId, codigoTurma)}::${nomeNormalizado}`

    // Homônimos na mesma turma podem existir no cadastro (FR-175), mas só por decisão
    // explícita — nunca por uma linha repetida em arquivo. Aqui a repetição é apontada com o
    // número da linha para que quem gerou o arquivo decida (FR-147, FR-149).
    if (vistasNoArquivo.has(chaveLinha)) {
      problemas.push({
        linha,
        coluna: 'Estudante',
        codigo: 'DUPLICADO_NO_ARQUIVO',
        severidade: 'ERROR',
        mensagem:
          'O arquivo repete este estudante na mesma turma. Homônimos precisam ser cadastrados individualmente.',
      })
      return
    }
    vistasNoArquivo.add(chaveLinha)

    validas.push({
      linha,
      schoolId,
      codigoTurma,
      turmaNome: turmaNome === '' ? codigoTurma : turmaNome,
      anoEscolar,
      nomeOriginal,
      nomeNormalizado,
    })
  })

  const turmasDoArquivo = new Map<
    string,
    { schoolId: string; codigoTurma: string; nome: string; anoEscolar: string }
  >()
  for (const registro of validas) {
    const chave = chaveTurma(registro.schoolId, registro.codigoTurma)
    if (!turmasDoArquivo.has(chave)) {
      turmasDoArquivo.set(chave, {
        schoolId: registro.schoolId,
        codigoTurma: registro.codigoTurma,
        nome: registro.turmaNome,
        anoEscolar: registro.anoEscolar,
      })
    }
  }

  const turmasExistentes =
    turmasDoArquivo.size === 0
      ? []
      : await prisma.class.findMany({
          where: {
            OR: [...turmasDoArquivo.values()].map((t) => ({
              schoolId: t.schoolId,
              externalCode: t.codigoTurma,
            })),
          },
          select: {
            id: true,
            schoolId: true,
            externalCode: true,
            name: true,
            anoEscolar: true,
          },
        })

  const turmaPorChave = new Map(
    turmasExistentes.map((t) => [chaveTurma(t.schoolId, t.externalCode), t]),
  )

  for (const [chave, turma] of turmasDoArquivo) {
    const existente = turmaPorChave.get(chave)
    if (existente && existente.name !== turma.nome) {
      problemas.push({
        linha: null,
        coluna: 'Turma',
        codigo: 'TURMA_DIVERGENTE',
        severidade: 'WARNING',
        mensagem: `A turma de código "${turma.codigoTurma}" já está cadastrada com outro nome. O cadastro existente foi mantido.`,
      })
    }
  }

  const estudantesExistentes = await prisma.student.findMany({
    where: { classId: { in: turmasExistentes.map((t) => t.id) } },
    select: { classId: true, nomeNormalizado: true },
  })

  const jaCadastrados = new Set(
    estudantesExistentes.map((e) => `${e.classId}::${e.nomeNormalizado}`),
  )

  // Uma linha já cadastrada não é erro: a nominata reenviada com uma criança nova a mais é o
  // caso comum, e ele precisa passar.
  const aCriar = validas.filter((registro) => {
    const turma = turmaPorChave.get(chaveTurma(registro.schoolId, registro.codigoTurma))
    if (!turma) return true
    return !jaCadastrados.has(`${turma.id}::${registro.nomeNormalizado}`)
  })

  const jaExistentes = validas.length - aCriar.length
  const temErro = problemas.some((p) => p.severidade === 'ERROR')

  const relatorioBase = {
    arquivo: entrada.nomeArquivo,
    totalLinhas: tabela.linhas.length,
    criaveis: aCriar.length,
    jaExistentes,
    problemas,
  }

  if (temErro) {
    logger.warn('nominata rejeitada por erro de validação', {
      arquivo: entrada.nomeArquivo,
      erros: problemas.filter((p) => p.severidade === 'ERROR').length,
    })

    return {
      ...relatorioBase,
      aplicado: false,
      criados: 0,
      turmasCriadas: 0,
    }
  }

  const codigos = await reservarCodigosUnicos(aCriar.length)

  const { criados, turmasCriadas } = await prisma.$transaction(
    async (tx) => {
      const idPorChave = new Map<string, string>()
      let novasTurmas = 0

      for (const [chave, turma] of turmasDoArquivo) {
        const existente = turmaPorChave.get(chave)
        if (existente) {
          idPorChave.set(chave, existente.id)
          continue
        }

        // `upsert` sobre a chave (escola, código) em vez de `create`: se outra importação
        // criar a mesma turma no intervalo entre a consulta e esta escrita, o resultado é a
        // turma existente e não uma violação de unicidade.
        const criada = await tx.class.upsert({
          where: {
            schoolId_externalCode: {
              schoolId: turma.schoolId,
              externalCode: turma.codigoTurma,
            },
          },
          update: {},
          create: {
            schoolId: turma.schoolId,
            externalCode: turma.codigoTurma,
            name: turma.nome,
            anoEscolar: turma.anoEscolar,
          },
          select: { id: true },
        })

        idPorChave.set(chave, criada.id)
        novasTurmas += 1
      }

      let total = 0

      for (const [posicao, registro] of aCriar.entries()) {
        const classId = idPorChave.get(chaveTurma(registro.schoolId, registro.codigoTurma))
        const uniqueCode = codigos[posicao]

        /* c8 ignore next */
        if (classId === undefined || uniqueCode === undefined) continue

        const estudante = await tx.student.create({
          data: {
            uniqueCode,
            schoolId: registro.schoolId,
            classId,
            nomeOriginal: registro.nomeOriginal,
            nomeNormalizado: registro.nomeNormalizado,
          },
          select: { id: true, uniqueCode: true, schoolId: true, classId: true },
        })

        await registrarAuditoria(tx, {
          action: 'STUDENT_CREATE',
          userId: ctx.userId,
          entityType: 'Student',
          entityId: estudante.id,
          schoolId: estudante.schoolId,
          afterValue: {
            uniqueCode: estudante.uniqueCode,
            schoolId: estudante.schoolId,
            classId: estudante.classId,
          },
          metadata: {
            origem: 'NOMINATA',
            arquivo: entrada.nomeArquivo,
            linha: registro.linha,
          },
        })

        total += 1
      }

      return { criados: total, turmasCriadas: novasTurmas }
    },
    // Uma nominata de rede tem centenas de linhas; o limite padrão de 5 s derrubaria a
    // importação inteira por lentidão, e não por defeito.
    { timeout: 120_000, maxWait: 20_000 },
  )

  logger.info('nominata importada', {
    arquivo: entrada.nomeArquivo,
    criados,
    turmasCriadas,
    jaExistentes,
  })

  return { ...relatorioBase, aplicado: true, criados, turmasCriadas }
}
