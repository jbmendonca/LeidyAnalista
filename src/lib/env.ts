import { z } from 'zod'

/**
 * Validação do ambiente. Variável ausente ou malformada derruba o boot com
 * mensagem clara — é preferível não subir a subir com configuração silenciosa
 * e errada.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL precisa ser uma URL de conexão válida'),

  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET precisa ter ao menos 32 caracteres'),

  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(60),

  IMPORT_STORAGE_DIR: z.string().min(1).default('./storage/imports'),
  IMPORT_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(20),

  /** FR-038a — retenção do arquivo original com dados nominais. */
  IMPORT_FILE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  /**
   * Força o atributo `Secure` no cookie de sessão.
   *
   * Deixe em branco para o sistema decidir pelo protocolo real da requisição.
   * Defina `true` em produção atrás de TLS — e veja
   * `src/server/request-protocol.ts` para o porquê de não derivar isso de
   * `NODE_ENV`.
   */
  SESSION_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Configuração de ambiente inválida.\n${detalhes}\n\n` +
        'Copie .env.example para .env e preencha os valores.',
    )
  }

  return parsed.data
}

export const env = loadEnv()

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
