import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { environment: 'node', include: ['tests/**/*.test.ts'], setupFiles: ['tests/helpers/setup.ts'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Route handlers import these; stubs let us invoke them directly in node.
      'next/server': fileURLToPath(new URL('./tests/helpers/nextServer.ts', import.meta.url)),
      'next/headers': fileURLToPath(new URL('./tests/helpers/nextHeaders.ts', import.meta.url)),
    },
  },
});
