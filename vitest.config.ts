import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Deja dyms_test con el esquema al día antes de correr los tests.
    globalSetup: ['tests/setup/migrarBaseTest.ts'],
    // NODE_ENV=test obliga a usar DATABASE_URL_TEST (ver src/config/env.ts).
    env: { NODE_ENV: 'test' },
    // Los tests comparten la base dyms_test: se corren en serie.
    fileParallelism: false,
  },
});
