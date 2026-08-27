import type { Metadata } from 'next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { FormularioLogin } from './formulario-login'

export const metadata: Metadata = {
  title: 'Entrar',
  description: 'Acesso ao Painel de Análise de Leitura.',
}

export default function PaginaEntrar() {
  return (
    <main
      id="conteudo-principal"
      className="flex min-h-screen items-center justify-center px-4 py-10"
    >
      <div className="w-full max-w-[26rem] space-y-6">
        <header className="space-y-1 text-center">
          <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
            II Ciclo · Criança Alfabetizada
          </p>
          <h1>Painel de Análise de Leitura</h1>
        </header>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Entrar</CardTitle>
            <CardDescription>
              Use as credenciais fornecidas pela coordenação da rede.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioLogin />
          </CardContent>
        </Card>

        <p className="text-center text-rotulo text-texto-suave">
          O painel trata dados de crianças. O acesso é pessoal e registrado em auditoria.
        </p>
      </div>
    </main>
  )
}
