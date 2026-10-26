import { defineConfig } from 'playwright/test'

if (!process.env.BAITED_TEST_OUTPUT) throw new Error('Set BAITED_TEST_OUTPUT to the registered browser output directory.')

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.BAITED_TEST_OUTPUT,
  reporter: 'list',
  workers: 2,
  timeout: 45_000,
  use: { baseURL: process.env.BAITED_TEST_URL || 'http://127.0.0.1:4372', headless: true, trace: 'retain-on-failure' },
  webServer: process.env.BAITED_TEST_URL
    ? undefined
    : {
        // Match the installed local workerd; production keeps wrangler.jsonc's release date.
        command:
          'pnpm exec wrangler dev --env dev --local --ip 127.0.0.1 --port 4372 --inspector-port 9372 --compatibility-date 2026-08-08',
        url: 'http://127.0.0.1:4372',
        reuseExistingServer: false,
        timeout: 60_000,
      },
})
