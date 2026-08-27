import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getAuthContext } from '@/server/auth-context'
import { obterEscola } from '@/modules/schools/application/get-school'
import { atualizarEscolaAction } from '@/modules/schools/application/update-school'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularioEscola } from '../../_components/formulario-escola'

export const metadata = { title: 'Editar escola' }

/**
 * Edição de escola.
 *
 * `obterEscola` aplica `assertSchoolInScope`: um `schoolId` de outra rede digitado na barra de
 * endereços produz 404, e não uma tela de "sem permissão" — que confirmaria a existência
 * daquela escola a quem não pode vê-la.
 */
export default async function PaginaEditarEscola({
  params,
}: {
  params: Promise<{ schoolId: string }>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/entrar')
  if (ctx.role !== 'ADMIN') redirect('/escolas')

  const { schoolId } = await params
  const escola = await obterEscola(ctx, schoolId)

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <Link
          href="/escolas"
          className="text-rotulo text-primaria underline underline-offset-4"
        >
          Voltar para escolas
        </Link>
        <h1 className="text-xl font-semibold text-texto">Editar escola</h1>
        <p className="text-sm text-texto-suave">{escola.name}</p>
      </header>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle as="h2">Dados da escola</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioEscola
            acao={atualizarEscolaAction}
            schoolId={escola.id}
            valores={{
              code: escola.code,
              name: escola.name,
              rede: escola.rede,
              municipio: escola.municipio,
              estado: escola.estado,
            }}
            rotuloEnvio="Salvar alterações"
          />
        </CardContent>
      </Card>
    </div>
  )
}
