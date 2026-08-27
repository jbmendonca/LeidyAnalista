'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3,
  Building2,
  ClipboardList,
  History,
  LogOut,
  Menu,
  Settings,
  Target,
  Upload,
  Users,
  X,
} from 'lucide-react'

import { signOut } from '@/modules/auth/application/sign-out'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type ItemNavegacao = {
  rotulo: string
  href: string
  Icone: typeof ClipboardList
}

/** Ordem de trabalho: primeiro o que se analisa, depois o que se administra. */
const ITENS: readonly ItemNavegacao[] = [
  { rotulo: 'Avaliações', href: '/avaliacoes', Icone: ClipboardList },
  { rotulo: 'Escolas', href: '/escolas', Icone: Building2 },
  { rotulo: 'Turmas', href: '/turmas', Icone: Users },
  { rotulo: 'Estudantes', href: '/estudantes', Icone: Users },
  { rotulo: 'Habilidades', href: '/habilidades', Icone: Target },
  { rotulo: 'Importações', href: '/importacoes', Icone: Upload },
  { rotulo: 'Relatórios', href: '/relatorios', Icone: BarChart3 },
  { rotulo: 'Configurações', href: '/configuracoes', Icone: Settings },
  { rotulo: 'Auditoria', href: '/auditoria', Icone: History },
]

/**
 * O item ativo é o de prefixo mais longo que casa com a rota corrente, para que
 * `/escolas/12/turmas` mantenha "Escolas" marcado. Comparação por segmento evita que
 * `/turmas` seja considerado prefixo de `/turmas-antigas`.
 */
function estaAtivo(href: string, caminho: string): boolean {
  return caminho === href || caminho.startsWith(`${href}/`)
}

function ListaDeLinks({ aoNavegar }: { aoNavegar: () => void }) {
  const caminho = usePathname() ?? ''

  return (
    <ul className="space-y-0.5">
      {ITENS.map(({ rotulo, href, Icone }) => {
        const ativo = estaAtivo(href, caminho)

        return (
          <li key={href}>
            <Link
              href={href}
              onClick={aoNavegar}
              // `aria-current` é o que informa a posição a quem não vê o realce.
              aria-current={ativo ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco focus-visible:ring-offset-2 focus-visible:ring-offset-superficie',
                ativo
                  ? // Realce por cor E por barra lateral E por peso da fonte: nenhum
                    // sinal isolado carrega a informação (WCAG 1.4.1).
                    'border-l-[3px] border-primaria bg-primaria-tenue pl-[calc(0.75rem-3px)] font-semibold text-primaria-forte'
                  : 'border-l-[3px] border-transparent pl-[calc(0.75rem-3px)] font-medium text-texto hover:bg-superficie-tenue',
              )}
            >
              <Icone aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{rotulo}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function BotaoSair({ className }: { className?: string }) {
  return (
    <form action={signOut} className={className}>
      <Button type="submit" variante="secundario" tamanho="pequeno" largura="total">
        <LogOut aria-hidden="true" />
        Sair
      </Button>
    </form>
  )
}

export function NavegacaoLateral() {
  const [aberto, setAberto] = useState(false)
  const idPainel = useId()
  const caminho = usePathname()

  // Trocar de página fecha o menu: no celular ele cobre o conteúdo que a pessoa
  // acabou de pedir.
  useEffect(() => {
    setAberto(false)
  }, [caminho])

  // Esc fecha o painel — expectativa firme de quem navega por teclado.
  useEffect(() => {
    if (!aberto) return

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto])

  return (
    <>
      {/* --- Barra superior: só existe abaixo de lg --- */}
      <header className="nao-imprimir sticky top-0 z-30 flex items-center gap-3 border-b border-borda bg-superficie px-3 py-2 lg:hidden">
        <Button
          variante="sutil"
          tamanho="icone"
          onClick={() => setAberto((atual) => !atual)}
          aria-expanded={aberto}
          aria-controls={idPainel}
          aria-label={aberto ? 'Fechar menu de navegação' : 'Abrir menu de navegação'}
        >
          {aberto ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
        <span className="truncate text-sm font-semibold">
          Painel de Análise de Leitura
        </span>
      </header>

      {/* --- Painel deslizante no mobile, coluna fixa a partir de lg --- */}
      {aberto ? (
        <button
          type="button"
          aria-label="Fechar menu de navegação"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-30 bg-texto/40 lg:hidden"
        />
      ) : null}

      <nav
        id={idPainel}
        aria-label="Navegação principal"
        className={cn(
          'nao-imprimir flex w-64 shrink-0 flex-col gap-4 border-r border-borda bg-superficie p-3',
          // Mobile: gaveta sobreposta, removida do fluxo e do foco quando fechada.
          'fixed inset-y-0 left-0 z-40 transition-transform duration-200 lg:static lg:z-auto lg:visible lg:translate-x-0',
          // `invisible` (não apenas deslocado) é o que retira os links da ordem de
          // tabulação enquanto a gaveta está fechada — um menu fora da tela mas ainda
          // focável faz o teclado percorrer nove destinos invisíveis.
          aberto ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-2 px-1 pt-1">
          <div className="min-w-0">
            <p className="text-rotulo font-medium uppercase tracking-wide text-texto-suave">
              II Ciclo · CNCA
            </p>
            <p className="text-sm font-semibold leading-snug">Análise de Leitura</p>
          </div>
          <Button
            variante="sutil"
            tamanho="icone"
            className="size-8 lg:hidden"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu de navegação"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ListaDeLinks aoNavegar={() => setAberto(false)} />
        </div>

        <div className="border-t border-borda pt-3">
          <BotaoSair />
        </div>
      </nav>
    </>
  )
}

export { ITENS as ITENS_NAVEGACAO }
