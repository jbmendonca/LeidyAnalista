/**
 * Normaliza o Código da Turma (FR-033): remove apenas os espaços das extremidades.
 *
 * Contrato: specs/001-painel-analise-leitura/contracts/domain-functions.md#normalizeclasscode
 *
 * O arquivo real traz `" 8npu2dd9128c "` com espaço nos dois lados. Caixa e conteúdo interno são
 * preservados — o código é opaco e gerado por outro sistema; alterá-lo além do necessário
 * arriscaria colidir dois códigos distintos.
 *
 * Função pura: sem I/O, sem estado, sem relógio.
 */
export function normalizeClassCode(code: string): string {
  return code.trim()
}
