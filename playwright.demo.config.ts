import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/demo',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5180',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview:demo',
    url: `http://127.0.0.1:5180${process.env.PAGES_BASE_PATH || '/new-2d/'}`,
    reuseExistingServer: !process.env.CI,
  },
});
