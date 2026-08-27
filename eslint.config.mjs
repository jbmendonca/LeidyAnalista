import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({ baseDirectory: __dirname })

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'storage/**',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // Const. V — `any` deve ser evitado; quando indispensável, justificado.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Const. VI — o domínio é puro: sem I/O, sem framework, sem persistência.
    // Esta regra é o que impede a erosão silenciosa da fronteira.
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'Const. VI: regra de domínio não pode viver em componente. Mova para application/ ou infra/.',
            },
            {
              name: 'next',
              message: 'Const. VI: o domínio não conhece o framework.',
            },
            {
              name: '@prisma/client',
              message:
                'Const. VI: o domínio não conhece a persistência. Receba dados por parâmetro.',
            },
          ],
          patterns: [
            {
              group: ['next/*', '@/server/*', '@/components/*', '**/infra/*'],
              message:
                'Const. VI: o domínio não importa infraestrutura, servidor nem interface.',
            },
          ],
        },
      ],
    },
  },

  {
    // O ponto de virada de todo cálculo: Number para percentual é proibido.
    files: ['src/modules/analytics/**/*.ts', 'src/modules/imports/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Const. II: ponto flutuante não é fonte de verdade. Use inteiros e Decimal.',
        },
      ],
    },
  },
]

export default config
