import { NavegacaoLateral } from './navegacao-lateral'

/**
 * Casca da área autenticada.
 *
 * A verificação de sessão **não** acontece aqui — é responsabilidade da camada de acesso, que
 * resolve escopo por escola na consulta ao banco. Este arquivo cuida apenas de estrutura:
 * navegação à esquerda no desktop, gaveta no celular, e uma região de conteúdo que rola
 * sozinha.
 *
 * `min-w-0` no `<main>` é o que impede que uma tabela larga estique o layout inteiro e
 * empurre a página para a rolagem horizontal — a coluna flexível precisa poder encolher
 * abaixo do conteúdo para que a rolagem fique dentro do contêiner da tabela.
 */
export default function LayoutAutenticado({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavegacaoLateral />

      <main
        id="conteudo-principal"
        className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-6 lg:px-7"
      >
        <div className="mx-auto w-full max-w-[84rem]">{children}</div>
      </main>
    </div>
  )
}
