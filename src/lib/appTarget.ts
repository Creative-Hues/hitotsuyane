// 本番とテスト版で変わる値(SPEC.md 21章)。保存の名前は、すべてこのファイルで決める。
// テスト版は本番と同じドメイン(creative-hues.github.io)で動くので、保存の名前が同じだと本番のデータを読み書きしてしまう。
// __TEST_SITE__ はビルドのときに true / false の文字に置き換わる(vite.config.ts)。
// 「__TEST_SITE__ ? テスト版の値 : 本番の値」の形で直接書くと、ビルドでもう片方の値がまるごと消える。
// そのため、テスト版のビルドの中には本番の名前が入らない(check.yml で確かめている)。この形を崩さないこと

/** テスト版のビルドか */
export const IS_TEST_SITE: boolean = __TEST_SITE__;

/**
 * 端末の中のデータベース(IndexedDB)の名前。
 * 本番は、URL を変えたとき(SPEC.md 19章)も以前の名前のまま変えない(変えると保存されていたデータを読めなくなるため)
 */
export const DB_NAME: string = __TEST_SITE__ ? 'hitotsuyane-test' : 'did-todo';

/** localStorage などに保存するときの、キー名の頭に付ける文字(今は使っていない。使うときは storageKey を通す) */
export const STORAGE_KEY_PREFIX: string = __TEST_SITE__ ? 'hitotsuyane-test:' : 'hitotsuyane:';

/** localStorage などのキー名を作る(本番とテスト版で分かれる) */
export function storageKey(name: string): string {
  return `${STORAGE_KEY_PREFIX}${name}`;
}
