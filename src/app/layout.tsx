import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Painel de Análise de Leitura',
    template: '%s · Painel de Análise de Leitura',
  },
  description:
    'Consolidação e análise das avaliações de Leitura do II Ciclo do Compromisso Nacional Criança Alfabetizada.',
  applicationName: 'Painel de Análise de Leitura',
  // Dado de criança não vai para índice de busca em hipótese alguma.
  robots: { index: false, follow: false, nocache: true },
  formatDetection: { telephone: false, email: false, address: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sem `maximumScale`: bloquear o zoom quebraria WCAG 1.4.4 para quem amplia a tela.
  colorScheme: 'light',
}

/**
 * Layout raiz.
 *
 * `lang="pt-BR"` não é detalhe: define a pronúncia do leitor de tela, a quebra de linha e a
 * correção ortográfica do navegador para toda a interface.
 *
 * A tipografia é a do sistema operacional — nenhuma fonte remota. Além de eliminar
 * requisição externa e o salto de layout que ela provoca, evita expor a navegação de quem usa
 * o painel a um domínio de terceiros.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a
          href="#conteudo-principal"
          className="apenas-leitor-de-tela apenas-leitor-de-tela:focavel focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-primaria focus:px-4 focus:py-2 focus:text-primaria-contraste"
        >
          Pular para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  )
}
