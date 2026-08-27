import { redirect } from 'next/navigation'

/**
 * A raiz não tem conteúdo próprio: o ponto de entrada de quem trabalha no painel é a lista de
 * avaliações. Quem não tiver sessão será desviado para `/entrar` pela verificação de acesso.
 */
export default function Home(): never {
  redirect('/avaliacoes')
}
