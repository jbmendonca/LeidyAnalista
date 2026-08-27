/**
 * Setup global da suíte.
 *
 * Os testes de domínio são puros e não precisam de nada daqui. Os de
 * integração precisam do ambiente validado por `src/lib/env.ts`, que lança se
 * uma variável estiver ausente — daí os valores padrão abaixo.
 */
// `NODE_ENV` é somente leitura nos tipos do Node. A atribuição é legítima em
// tempo de execução e este é o lugar certo para fazê-la; o cast é o mínimo
// necessário para dizer isso ao compilador.
const ambiente = process.env as Record<string, string | undefined>
ambiente['NODE_ENV'] = ambiente['NODE_ENV'] ?? 'test'

process.env.SESSION_SECRET =
  process.env.SESSION_SECRET ?? 'segredo-de-teste-com-mais-de-32-caracteres-ok'
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://painel:painel_local_dev@localhost:5432/painel_leitura?schema=public'
process.env.IMPORT_STORAGE_DIR = process.env.IMPORT_STORAGE_DIR ?? './storage/imports-test'
process.env.IMPORT_MAX_FILE_SIZE_MB = process.env.IMPORT_MAX_FILE_SIZE_MB ?? '20'
process.env.IMPORT_FILE_RETENTION_DAYS = process.env.IMPORT_FILE_RETENTION_DAYS ?? '90'

export {}
