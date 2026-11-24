import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    // First run downloads a MongoDB binary for the in-memory server, which can take a while.
    hookTimeout: 180_000,
    env: { NODE_ENV: 'test', RATE_LIMIT_MAX: '100000' },
  },
});
