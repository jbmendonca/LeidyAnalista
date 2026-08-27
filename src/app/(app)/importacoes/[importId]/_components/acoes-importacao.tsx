'use client'

import { useActionState } from 'react'

import {
  confirmarImportacao,
  excluirImportacao,
  revalidarImportacao,
  type EstadoAcao,
} from '@/modules/imports/application/import-actions'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const INICIAL: EstadoAcao = {}

export function AcoesImportacao({
  importId,
  podeConfirmar,
  jaConfirmada,
  naoCadastrados,
  ehAdmin,
}: {
  importId: string
  podeConfirmar: boolean
  jaConfirmada: boolean
  naoCadastrados: number
  ehAdmin: boolean
}) {
  const [confirmacao, confirmar, confirmando] = useActionState(confirmarImportacao, INICIAL)
  const [revalidacao, revalidar, revalidando] = useActionState(revalidarImportacao, INICIAL)
  const [exclusao, excluir, excluindo] = useActionState(excluirImportacao, INICIAL)

  const estado = confirmacao.erro
    ? confirmacao
    : exclusao.erro
      ? exclusao
      : revalidacao.erro
        ? revalidacao
        : (confirmacao.sucesso && confirmacao) ||
          (exclusao.sucesso && exclusao) ||
          (revalidacao.sucesso && revalidacao) ||
          INICIAL

  return (
    <section className="space-y-4">
      {estado.erro && (
        <Alert variante="erro" titulo="Não foi possível concluir">
          {estado.erro}
        </Alert>
      )}
      {estado.sucesso && (
        <Alert variante="sucesso" titulo="Concluído">
          {estado.sucesso}
        </Alert>
      )}

      <div className="flex flex-wrap gap-3">
        {!jaConfirmada && (
          <form action={confirmar} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="importId" value={importId} />

            {naoCadastrados > 0 && (
              <label className="flex items-center gap-2 text-sm text-texto">
                <input
                  type="checkbox"
                  name="cadastrarNaoEncontrados"
                  className="size-4 rounded border-borda-forte"
                />
                Cadastrar os {naoCadastrados} estudante(s) que não constam da base
              </label>
            )}

            <Button type="submit" disabled={!podeConfirmar || confirmando}>
              {confirmando ? 'Confirmando…' : 'Confirmar importação'}
            </Button>
          </form>
        )}

        {!jaConfirmada && (
          <form action={revalidar}>
            <input type="hidden" name="importId" value={importId} />
            <Button type="submit" variante="secundario" disabled={revalidando}>
              {revalidando ? 'Revalidando…' : 'Revalidar arquivo'}
            </Button>
          </form>
        )}

        {ehAdmin && jaConfirmada && (
          <form action={excluir}>
            <input type="hidden" name="importId" value={importId} />
            <Button type="submit" variante="perigo" disabled={excluindo}>
              {excluindo ? 'Excluindo…' : 'Excluir importação'}
            </Button>
          </form>
        )}
      </div>

      {!podeConfirmar && !jaConfirmada && (
        <p className="text-sm text-texto-suave">
          A confirmação está bloqueada porque há inconsistências críticas. Corrija o arquivo na
          origem e reenvie — o sistema não corrige nada por conta própria.
        </p>
      )}
    </section>
  )
}
