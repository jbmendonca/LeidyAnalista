import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de ponta a ponta.
 *
 * Os viewports não são decoração: a constituição exige layout responsivo em
 * desktop, tablet e smartphone, e sem exercitar os três a exigência vira boa
 * intenção. 375 px é o piso real de celular em uso na rede.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'tablet',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'celular',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
  ],

  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/entrar',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
