import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // Logic modules; React components are checked in the browser, not unit-tested.
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'html'],
    },
  },
});
