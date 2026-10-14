/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

/** アプリの版(例:「2026.10.02(92104c7)」)。ビルドのときに vite.config.ts で入れる(SPEC.md 14章⑥) */
declare const __APP_VERSION__: string;

/** テスト版のビルドか。ビルドのときに vite.config.ts で入れる(SPEC.md 21章)。直接使わず src/lib/appTarget.ts を通す */
declare const __TEST_SITE__: boolean;
