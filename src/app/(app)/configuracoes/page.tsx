import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { formatarDataHora } from '@/lib/format'
import { formatarLimite } from '@/modules/settings/schemas'
import { obterConfiguracaoVigente } from '@/modules/settings/application/get-current-settings'
import { criarVersaoDeCriteriosAction } from '@/modules/settings/application/settings-actions'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FaixaBadge } from '@/components/ui/faixa-badge'
import { NivelBadge } from '@/components/ui/nivel-badge'
import { FormularioCriterios } from './_components/formulario-criterios'

export const metadata: Metadata = {
  title: 'Critérios analíticos',
  description: 'Faixas de situação analítica, baixo rendimento e visões opcionais.',
}

export const dynamic = 'force-dynamic'

/**
 * Configuração dos critérios analíticos — FR-109 a FR-113, FR-162 a FR-167.
 *
 * Três coisas esta tela precisa deixar explícitas, e por isso ocupam espaço nela:
 *
 *  1. **Estas categorias são critério do sistema, não da fonte.** As duas escalas aparecem
 *     lado a lado no topo, com as etiquetas reais de cada uma, para que a diferença seja
 *     visível antes de qualquer campo ser editado (Const. III, FR-112).
 *  2. **A configuração é global.** Não há seletor de escola nem de avaliação, e o texto diz
 *     por quê (FR-162, FR-167).
 *  3. **Alterar as faixas não reprocessa nada.** A classificação é derivada na leitura; não
 *     existe faixa gravada em coluna alguma. Sem esse aviso, o operador procuraria um botão
 *     de reprocessamento que não deve existir — e concluiria que o sistema ficou pela metade.
 *
 * A checagem de perfil aqui é conveniência: evita oferecer uma tela que reprovaria no envio.
 * A autorização que vale é a de `obterConfiguracaoVigente` e da server action, no servidor.
 */
export default async function PaginaConfiguracoes() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/avaliacoes')

  const vigente = await obterConfiguracaoVigente(ctx)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-texto">Critérios analíticos</h1>
          <p className="max-w-prose text-sm text-texto-suave">
            Configuração única para todo o sistema. Não existe critério por escola nem por
            avaliação: dois resultados classificados como &ldquo;Fragilidade&rdquo;
            precisam significar a mesma coisa em qualquer tela.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/configuracoes/historico"
            className="text-sm text-primaria underline underline-offset-4"
          >
            Histórico de versões
          </Link>
          <Link
            href="/usuarios"
            className="text-sm text-primaria underline underline-offset-4"
          >
            Usuários e permissões
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Duas escalas distintas, e elas não se substituem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-md border border-borda bg-superficie-tenue p-3.5">
              <p className="text-sm font-semibold text-texto">
                Nível de aprendizagem — da fonte
              </p>
              <p className="text-sm text-texto-suave">
                Transcrito da planilha original, sem alteração. O sistema não o infere,
                não o recalcula e não o reordena. Nada nesta página muda esse campo.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <NivelBadge nivel="ADEQUADO" avaliado />
                <NivelBadge nivel="INTERMEDIARIO" avaliado />
                <NivelBadge nivel="DEFASAGEM" avaliado />
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-borda bg-superficie-tenue p-3.5">
              <p className="text-sm font-semibold text-texto">
                Faixa analítica — critério do sistema
              </p>
              <p className="text-sm text-texto-suave">
                Calculada pelo painel a partir de acertos e itens, com os limites
                definidos abaixo. É o que esta página configura.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <FaixaBadge faixa="FRAGILIDADE" />
                <FaixaBadge faixa="ATENCAO" />
                <FaixaBadge faixa="SATISFATORIO" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {vigente === null ? (
        <Alert variante="aviso" titulo="Nenhuma versão de critérios cadastrada">
          As faixas não possuem valor padrão em código, de propósito: um limite
          configurável escondido em constante deixaria de ser configurável. Grave a
          primeira versão abaixo para que as telas analíticas voltem a classificar
          resultados.
        </Alert>
      ) : (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle as="h2">Versão vigente</CardTitle>
            <Badge variante="destaque">Versão {vigente.version}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-rotulo text-texto-suave">Fragilidade</dt>
                <dd className="font-medium text-texto">
                  abaixo de {formatarLimite(vigente.fragilidadeMax)}
                </dd>
              </div>
              <div>
                <dt className="text-rotulo text-texto-suave">Atenção</dt>
                <dd className="font-medium text-texto">
                  de {formatarLimite(vigente.fragilidadeMax)} a{' '}
                  {formatarLimite(vigente.atencaoMax)} (exclusive)
                </dd>
              </div>
              <div>
                <dt className="text-rotulo text-texto-suave">Satisfatório</dt>
                <dd className="font-medium text-texto">
                  {formatarLimite(vigente.atencaoMax)} ou mais
                </dd>
              </div>
              <div>
                <dt className="text-rotulo text-texto-suave">
                  Visão &ldquo;Abaixo do adequado&rdquo;
                </dt>
                <dd className="font-medium text-texto">
                  {vigente.abaixoDoAdequadoHabilitado ? 'Habilitada' : 'Desabilitada'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-rotulo text-texto-suave">
                  Níveis contados como baixo rendimento
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {vigente.baixoRendimento.length === 0 ? (
                    <span className="text-sm text-texto-suave">
                      Nenhum nível selecionado — a visão está desligada.
                    </span>
                  ) : (
                    vigente.baixoRendimento.map((nivel) => (
                      <NivelBadge key={nivel} nivel={nivel} avaliado />
                    ))
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-rotulo text-texto-suave">Em vigor desde</dt>
                <dd className="font-medium text-texto">
                  {formatarDataHora(vigente.effectiveFrom)} — registrada por{' '}
                  {vigente.autor.name}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/*
        FR-113 e FR-164 em uma frase, na tela e não só no código: alterar as faixas recalcula
        a leitura analítica e não altera valor importado algum. Como nenhuma faixa é
        armazenada — a classificação é derivada na consulta — não existe reprocessamento a
        executar depois de gravar.
      */}
      <Alert variante="informativo" titulo="O que muda ao gravar uma nova versão">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            As telas analíticas passam a classificar com os limites novos na consulta
            seguinte. Não há reprocessamento a executar: a faixa é calculada na leitura e
            não existe coluna de faixa em lugar nenhum do banco.
          </li>
          <li>
            Nenhum valor importado é alterado — acertos, itens possíveis, valor original
            da célula e o <strong>Nível de aprendizagem</strong> da fonte permanecem
            exatamente como foram recebidos.
          </li>
          <li>
            A versão anterior continua gravada, com autor e período de vigência, e segue
            explicando os relatórios emitidos enquanto ela valia.
          </li>
        </ul>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle as="h2">
            {vigente === null ? 'Primeira versão' : 'Registrar nova versão'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioCriterios
            acao={criarVersaoDeCriteriosAction}
            {...(vigente
              ? {
                  valores: {
                    fragilidadeMax: vigente.fragilidadeMax,
                    atencaoMax: vigente.atencaoMax,
                    baixoRendimento: vigente.baixoRendimento,
                    abaixoDoAdequadoHabilitado: vigente.abaixoDoAdequadoHabilitado,
                  },
                }
              : {})}
          />
        </CardContent>
      </Card>
    </div>
  )
}
