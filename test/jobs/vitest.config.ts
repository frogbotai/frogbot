import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      process.env.TICKET121_BASELINE ? 'test/jobs/baseline.spec.ts' : 'test/jobs/*.int.spec.ts',
    ],
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 90_000,
    testTimeout: 30_000,
    env: {
      PAYLOAD_DISABLE_ADMIN: 'true',
      PAYLOAD_DROP_DATABASE: 'false',
    },
  },
});
