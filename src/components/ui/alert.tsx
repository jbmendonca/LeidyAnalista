import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

import { cn } from '@/lib/utils'

const variantesAlerta = cva('flex gap-3 rounded-md border-l-4 border-y border-r p-3.5', {
  variants: {
    variante: {
      informativo: 'border-info bg-info-tenue text-texto',
      sucesso: 'border-sucesso bg-sucesso-tenue text-texto',
      aviso: 'border-aviso bg-aviso-tenue text-texto',
      erro: 'border-perigo bg-perigo-tenue text-texto',
    },
  },
  defaultVariants: { variante: 'informativo' },
})

/**
 * Cada variante tem ícone próprio **e** prefixo textual anunciado ao leitor de tela. Um
 * alerta que diferisse do outro apenas pelo fundo colorido seria indistinguível para quem
 * não percebe cor (WCAG 1.4.1) e para quem imprime em preto e branco.
 */
const APARENCIA = {
  informativo: { Icone: Info, cor: 'text-info', prefixo: 'Informação:' },
  sucesso: { Icone: CheckCircle2, cor: 'text-sucesso', prefixo: 'Sucesso:' },
  aviso: { Icone: AlertTriangle, cor: 'text-aviso', prefixo: 'Atenção:' },
  erro: { Icone: XCircle, cor: 'text-perigo', prefixo: 'Erro:' },
} as const

export type PropsAlert = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof variantesAlerta> & {
    titulo?: React.ReactNode
  }

export function Alert({
  className,
  variante = 'informativo',
  titulo,
  children,
  ...props
}: PropsAlert) {
  const { Icone, cor, prefixo } = APARENCIA[variante ?? 'informativo']
  // Erro é interrupção: `assertive` interrompe a leitura corrente. O resto espera a pausa.
  const urgente = variante === 'erro'

  return (
    <div
      role={urgente ? 'alert' : 'status'}
      aria-live={urgente ? 'assertive' : 'polite'}
      className={cn(variantesAlerta({ variante }), className)}
      {...props}
    >
      <Icone aria-hidden="true" className={cn('mt-0.5 size-5 shrink-0', cor)} />
      <div className="min-w-0 space-y-1 text-sm">
        <span className="apenas-leitor-de-tela">{prefixo} </span>
        {titulo ? <p className="font-semibold text-texto">{titulo}</p> : null}
        {children ? <div className="text-texto">{children}</div> : null}
      </div>
    </div>
  )
}

export { variantesAlerta }
