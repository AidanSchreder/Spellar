import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The browser tests play against a frozen copy of the data (tests/fixtures/data, launch
// 2026-10-17), on their own port, so editing or relaunching the real schedule never breaks them.
const FIXTURE = fileURLToPath(new URL('./tests/fixtures/data', import.meta.url));

// Two projects: "unit" runs the pure logic in Node (no browser); "e2e" plays the game in Chromium
// against the local mock API (dev/mock-api.mjs), which serves the same JSON as the PHP routes.
export default defineConfig({
  testDir: 'tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1, // the e2e tests share the mock server's clock and counters
  reporter: [['list']],
  projects: [
    { name: 'unit', testMatch: /unit[\\/].*\.spec\.mjs$/ },
    {
      name: 'e2e',
      testMatch: /e2e[\\/].*\.spec\.mjs$/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8781' },
    },
    // The PHP plugin in a real WordPress: SPELLAR_WP_URL=http://127.0.0.1:9400 npx playwright test --project=wp
    { name: 'wp', testMatch: /wp[\\/].*\.spec\.mjs$/, use: { ...devices['Desktop Chrome'] } },
    // The live page: SPELLAR_LIVE_URL=https://www.seds.ca npx playwright test --project=live
    { name: 'live', testMatch: /live[\\/].*\.spec\.mjs$/, timeout: 90_000, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node dev/mock-api.mjs',
    env: { PORT: '8781', SPELLAR_DATA_DIR: FIXTURE },
    url: 'http://localhost:8781/dev/stats',
    reuseExistingServer: true,
  },
});
