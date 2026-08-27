import type { Config } from 'tailwindcss'

/**
 * Paleta do Painel de Análise de Leitura.
 *
 * Toda cor vive como tripla RGB em variável CSS (`src/app/globals.css`) e é consumida aqui
 * por `rgb(var(--x) / <alpha-value>)`, de modo que os modificadores de opacidade do Tailwind
 * (`bg-primaria/10`) continuem funcionando.
 *
 * Duas escalas cromáticas coexistem e **não podem ser confundidas** (Const. — a categoria
 * analítica do sistema é separada da classificação oficial da fonte):
 *
 * | Escala                | Origem            | Forma                                  |
 * |-----------------------|-------------------|----------------------------------------|
 * | `nivel-*`             | fonte (intocável) | retângulo sólido, canto reto, sem marca |
 * | `faixa-*`             | sistema           | pílula, borda tracejada, marcador ◆      |
 *
 * As famílias de matiz também divergem: os níveis oficiais usam verde / âmbar / vermelho;
 * as faixas analíticas usam petróleo / laranja-queimado / vinho. Cor, porém, nunca carrega
 * significado sozinha — todo badge exibe rótulo textual (WCAG 1.4.1).
 */

const comAlfa = (variavel: string) => `rgb(var(${variavel}) / <alpha-value>)`

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fundo: comAlfa('--cor-fundo'),
        superficie: comAlfa('--cor-superficie'),
        'superficie-tenue': comAlfa('--cor-superficie-tenue'),
        texto: comAlfa('--cor-texto'),
        'texto-suave': comAlfa('--cor-texto-suave'),
        borda: comAlfa('--cor-borda'),
        'borda-forte': comAlfa('--cor-borda-forte'),
        foco: comAlfa('--cor-foco'),

        primaria: {
          DEFAULT: comAlfa('--cor-primaria'),
          forte: comAlfa('--cor-primaria-forte'),
          tenue: comAlfa('--cor-primaria-tenue'),
          contraste: comAlfa('--cor-primaria-contraste'),
        },

        perigo: {
          DEFAULT: comAlfa('--cor-perigo'),
          tenue: comAlfa('--cor-perigo-tenue'),
          contraste: comAlfa('--cor-perigo-contraste'),
        },
        sucesso: {
          DEFAULT: comAlfa('--cor-sucesso'),
          tenue: comAlfa('--cor-sucesso-tenue'),
        },
        aviso: {
          DEFAULT: comAlfa('--cor-aviso'),
          tenue: comAlfa('--cor-aviso-tenue'),
        },
        info: {
          DEFAULT: comAlfa('--cor-info'),
          tenue: comAlfa('--cor-info-tenue'),
        },

        // --- Níveis oficiais da fonte (LearningLevel). Intocáveis, sólidos. ---
        nivel: {
          adequado: comAlfa('--cor-nivel-adequado'),
          'adequado-fundo': comAlfa('--cor-nivel-adequado-fundo'),
          'adequado-borda': comAlfa('--cor-nivel-adequado-borda'),
          intermediario: comAlfa('--cor-nivel-intermediario'),
          'intermediario-fundo': comAlfa('--cor-nivel-intermediario-fundo'),
          'intermediario-borda': comAlfa('--cor-nivel-intermediario-borda'),
          defasagem: comAlfa('--cor-nivel-defasagem'),
          'defasagem-fundo': comAlfa('--cor-nivel-defasagem-fundo'),
          'defasagem-borda': comAlfa('--cor-nivel-defasagem-borda'),
          ausente: comAlfa('--cor-nivel-ausente'),
          'ausente-fundo': comAlfa('--cor-nivel-ausente-fundo'),
          'ausente-borda': comAlfa('--cor-nivel-ausente-borda'),
        },

        // --- Faixas analíticas do sistema (AnalyticalBand). Pílula tracejada. ---
        faixa: {
          satisfatorio: comAlfa('--cor-faixa-satisfatorio'),
          'satisfatorio-fundo': comAlfa('--cor-faixa-satisfatorio-fundo'),
          'satisfatorio-borda': comAlfa('--cor-faixa-satisfatorio-borda'),
          atencao: comAlfa('--cor-faixa-atencao'),
          'atencao-fundo': comAlfa('--cor-faixa-atencao-fundo'),
          'atencao-borda': comAlfa('--cor-faixa-atencao-borda'),
          fragilidade: comAlfa('--cor-faixa-fragilidade'),
          'fragilidade-fundo': comAlfa('--cor-faixa-fragilidade-fundo'),
          'fragilidade-borda': comAlfa('--cor-faixa-fragilidade-borda'),
        },
      },

      fontFamily: {
        sans: ['var(--fonte-sistema)'],
        mono: ['var(--fonte-mono)'],
      },

      fontSize: {
        // Base 16px; nada abaixo de 12px em texto informativo.
        rotulo: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0.01em' }],
      },

      borderRadius: {
        // A distinção de forma entre as escalas depende do raio: `sm` para o nível
        // oficial (canto reto), `full` para a faixa analítica (pílula).
        sm: '0.1875rem',
        DEFAULT: '0.375rem',
        md: '0.5rem',
        lg: '0.625rem',
      },

      boxShadow: {
        cartao: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
        elevado: '0 4px 12px -2px rgb(16 24 40 / 0.12)',
      },

      screens: {
        // 375px é o piso de referência declarado no plano; abaixo disso o layout
        // continua legível porque nada tem largura fixa.
        xs: '375px',
      },

      keyframes: {
        pulsar: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        pulsar: 'pulsar 1.6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}

export default config
