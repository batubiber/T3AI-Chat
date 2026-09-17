import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // '@' takma adı vite.config.ts'te var ama burada YOKTU: src/lib altındaki
  // testler göreli import kullandığı için sorun çıkmamıştı. src/components
  // altındaki bir bileşen '@/lib/utils' import ettiği anda test "Cannot find
  // package" ile düşüyor. Aynı eşleme burada da tanımlı.
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/offline.ts'],
    // server/ CommonJS ve .js; kapsam dışı kalırsa oradaki testler SESSİZCE
    // hiç çalışmaz ve "test var" sanılır.
    include: ['src/**/*.test.ts', 'server/**/*.test.js'],
  },
});
