import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Composição de classes utilitárias.
 *
 * `clsx` resolve condicionais e `twMerge` desempata conflitos do Tailwind, de modo que a
 * classe passada por quem usa o componente sempre vença a classe padrão do componente —
 * sem isso, `className="p-0"` sobre um botão com `px-4` dependeria da ordem no CSS.
 */
export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas))
}
