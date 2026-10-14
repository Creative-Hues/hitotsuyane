import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';
import { DB_VERSION } from './src/db/dbVersion';
import { buildVersionInfo, VERSION_FILE_NAME } from './src/lib/updateNotice';
import { formatAppVersion } from './src/lib/appVersion';

/** テスト版を作るときのビルドの種類の名前(`vite build --mode testsite`。SPEC.md 21章) */
const TEST_SITE_MODE = 'testsite';

/**
 * 公開のときに version.json(新しい版のデータベースの版)を書き出す(SPEC.md 18.3)。
 * 古い版のアプリが、新しい版を見つけたときに読んで、データの形が変わる更新かを知る
 */
function versionFilePlugin(): Plugin {
  return {
    name: 'hitotsuyane-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: VERSION_FILE_NAME,
        source: JSON.stringify(buildVersionInfo(DB_VERSION)),
      });
    },
  };
}

/** index.html のページの名前とホーム画面用の名前を、テスト版の名前に変える(SPEC.md 21章) */
function testSiteHtmlPlugin(appName: string): Plugin {
  return {
    name: 'hitotsuyane-test-site-html',
    transformIndexHtml(html) {
      return html
        .replace('<title>ひとつやね</title>', `<title>${appName}</title>`)
        .replace('name="apple-mobile-web-app-title" content="ひとつやね"', `name="apple-mobile-web-app-title" content="${appName}"`);
    },
  };
}

/** ビルドのときの環境変数を読む。Node の型定義を入れていないので、process は globalThis から型を付けて読む */
function env(name: string): string | undefined {
  const nodeProcess = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
  return nodeProcess?.env[name];
}

/**
 * 変更の目印(コミットの番号)。GitHub Actions が入れる GITHUB_SHA を読む。
 * テスト版をこの PC から反映するときは、反映のスクリプトが HITOTSUYANE_COMMIT に入れる。読めなければ null
 */
function currentCommit(): string | null {
  return env('GITHUB_SHA') ?? env('HITOTSUYANE_COMMIT') ?? null;
}

export default defineConfig(({ mode }) => {
  const isTestSite = mode === TEST_SITE_MODE;
  // GitHub Pages の公開先に合わせる。本番:https://creative-hues.github.io/hitotsuyane/(SPEC.md 19章)
  // テスト版:https://creative-hues.github.io/hitotsuyane-test/(SPEC.md 21章)
  const base = isTestSite ? '/hitotsuyane-test/' : '/hitotsuyane/';
  // ホーム画面の名前。テスト版は、途中で切れず本番と見分けられる短い名前にする
  const appName = isTestSite ? 'テストやね' : 'ひとつやね';

  return {
    base,
    define: {
      // アプリの版(SPEC.md 14章⑥)。公開した日付と変更の目印を、ビルドのときに入れる
      __APP_VERSION__: JSON.stringify(formatAppVersion(new Date(), currentCommit())),
      // テスト版か(SPEC.md 21章)。src/lib/appTarget.ts で、保存の名前を本番と分けるのに使う
      __TEST_SITE__: JSON.stringify(isTestSite),
    },
    plugins: [
      react(),
      versionFilePlugin(),
      ...(isTestSite ? [testSiteHtmlPlugin(appName)] : []),
      VitePWA({
        // 新しい版を公開しても自動では切り替えず、利用者が「更新する」を押したら切り替える(SPEC.md 18.2)
        // 登録は src/hooks/useUpdateNotice.ts で行う
        registerType: 'prompt',
        includeAssets: ['favicon.ico', 'icon.svg', 'apple-touch-icon-180x180.png'],
        manifest: {
          name: appName,
          short_name: appName,
          description: '人格交代があっても日々のToDoを共有管理するアプリ',
          lang: 'ja',
          display: 'standalone',
          orientation: 'portrait',
          start_url: base,
          scope: base,
          theme_color: '#ffffff',
          background_color: '#ffffff',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // オフラインでも開けるよう、これらのファイルを端末に保存する
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
      }),
    ],
  };
});
