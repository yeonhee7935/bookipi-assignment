import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests start Redis/Postgres containers on first run.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      // Entry points and CLIs only wire things together; they are exercised by the stress runs.
      exclude: ['src/server.ts', 'src/worker.ts', 'src/cli/**'],
      reporter: ['text-summary', 'html'],
    },
  },
});
