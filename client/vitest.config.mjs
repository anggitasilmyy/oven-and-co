// vitest.config.mjs — CR-03 §B10: unit test aturan murni client dengan Vitest (tests/vitest/).
// Test lama berbasis node:test tetap dijalankan lewat `npm run test:unit` (tests/unit/).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/vitest/**/*.test.{js,mjs}'],
    environment: 'node',
  },
});
