import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environmentMatchGlobs: [['tests/unit/components/**', 'jsdom']],
    setupFiles: ['./tests/setup.ts'],

    /**
     * Arquivos de teste em série, não em paralelo.
     *
     * Os testes de integração compartilham **um** banco, e parte do estado é
     * global por natureza: `AnalyticalSettings` é uma configuração única do
     * sistema, e `Skill` é um catálogo. Um arquivo que cria uma versão nova de
     * critérios muda as faixas que outro está lendo no mesmo instante — e a
     * falha aparece como classificação errada num teste que não tem nada a ver
     * com configuração, o que é caro de diagnosticar.
     *
     * A suíte inteira roda em poucos segundos; o paralelismo aqui compra pouco
     * e custa instabilidade.
     */
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/modules/**/domain/**', 'src/lib/**'],
      thresholds: {
        // O núcleo pedagógico não admite ramo não exercitado (Const. V e X).
        'src/modules/**/domain/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
})
