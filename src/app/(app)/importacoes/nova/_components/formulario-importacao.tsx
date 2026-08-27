'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type Opcao = { id: string; rotulo: string }

export function FormularioImportacao({
  avaliacoes,
  escolas,
  limiteMb,
}: {
  avaliacoes: readonly Opcao[]
  escolas: readonly Opcao[]
  limiteMb: number
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro(null)
    setEnviando(true)

    try {
      const resposta = await fetch('/api/imports', {
        method: 'POST',
        body: new FormData(evento.currentTarget),
      })
      const corpo = (await resposta.json()) as {
        importId?: string
        mensagem?: string
        detalhes?: Record<string, string[]>
      }

      if (!resposta.ok) {
        const primeiro = corpo.detalhes ? Object.values(corpo.detalhes)[0]?.[0] : undefined
        setErro(primeiro ?? corpo.mensagem ?? 'Não foi possível enviar o arquivo.')
        return
      }

      router.push(`/importacoes/${corpo.importId}`)
    } catch {
      setErro('Falha de rede ao enviar o arquivo.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="max-w-xl space-y-5">
      {erro && (
        <Alert variante="erro" titulo="Não foi possível enviar">
          {erro}
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="assessmentId">Avaliação</Label>
        <Select id="assessmentId" name="assessmentId" required defaultValue="">
          <option value="" disabled>
            Selecione a avaliação
          </option>
          {avaliacoes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.rotulo}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="schoolId">Escola</Label>
        <Select id="schoolId" name="schoolId" required defaultValue="">
          <option value="" disabled>
            Selecione a escola
          </option>
          {escolas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.rotulo}
            </option>
          ))}
        </Select>
        <p className="text-sm text-texto-suave">
          O arquivo de resultados não traz a escola. Todos os registros deste arquivo serão
          vinculados à escola selecionada.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="arquivo">Arquivo de resultados</Label>
        <Input
          id="arquivo"
          name="arquivo"
          type="file"
          accept=".csv,.xlsx,.xls"
          required
        />
        <p className="text-sm text-texto-suave">
          Formatos aceitos: CSV, XLSX e XLS. Limite de {limiteMb} MB. Arquivos CSV com ponto e
          vírgula e acentuação UTF-8 são reconhecidos automaticamente.
        </p>
      </div>

      <Button type="submit" disabled={enviando}>
        {enviando ? 'Enviando e validando…' : 'Enviar e validar'}
      </Button>

      <p className="text-sm text-texto-suave">
        Nada é gravado agora. O arquivo é apenas lido e conferido; você verá a
        pré-visualização antes de qualquer confirmação.
      </p>
    </form>
  )
}
