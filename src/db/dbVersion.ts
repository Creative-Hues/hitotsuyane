// データベースの版(SPEC.md 3.5・18.3)。
// db.ts の version(…) の最後の番号と同じにすること(migration.test.ts で確かめている)。
// 公開のときに version.json にも書き出され、古い版のアプリが「データの形が変わる更新か」を知るのに使う。
// このファイルはビルドの設定(vite.config.ts)からも読むので、ほかのファイルを import しないこと
export const DB_VERSION = 9;
