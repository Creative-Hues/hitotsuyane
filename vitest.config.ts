import { defineConfig } from 'vitest/config';

export default defineConfig({
  // テストは本番のビルドと同じ設定で動かす(SPEC.md 21章)
  define: {
    __TEST_SITE__: 'false',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // テストのタイムゾーンを日本時間に固定する(どの環境でも同じ結果になるように)
    env: { TZ: 'Asia/Tokyo' },
  },
});
