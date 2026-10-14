// 更新のお知らせ(SPEC.md 18章)。すべて純粋関数(同じ入力なら同じ結果)。
// このファイルはビルドの設定(vite.config.ts)からも読むので、ほかのファイルを import しないこと

/**
 * 新しい版の情報を知らせるファイルの名前。公開のときにサイトの一番上(index.html と同じ場所)に置く。
 * 端末に保存しない(オフライン用の保存の対象外。拡張子 .json は保存する種類に入っていない)ので、
 * 読むといつもサイトに置いてある一番新しい版の情報が返る
 */
export const VERSION_FILE_NAME = 'version.json';

/** version.json の中身 */
export interface VersionInfo {
  /** その版のデータベースの版(SPEC.md 3.5) */
  dbVersion: number;
}

/** version.json の中身を作る(ビルドのときに使う) */
export function buildVersionInfo(dbVersion: number): VersionInfo {
  return { dbVersion };
}

/** version.json の中身を読み取る。形が正しくなければ null */
export function parseVersionInfo(value: unknown): VersionInfo | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { dbVersion } = value as { dbVersion?: unknown };
  return typeof dbVersion === 'number' && Number.isSafeInteger(dbVersion) && dbVersion > 0 ? { dbVersion } : null;
}

/**
 * お知らせの種類
 * - normal:ふつうのお知らせ
 * - dataChange:データの形が変わる(データベースの版が上がる)更新。強めのお知らせ(SPEC.md 18.3)
 */
export type UpdateNoticeKind = 'normal' | 'dataChange';

/**
 * お知らせの種類を決める。
 * 新しい版のデータベースの版が、今のアプリの版より大きいときだけ dataChange。
 * 新しい版の情報が読めなかったとき(null。オフラインなど)は normal
 * @param currentDbVersion 今動いているアプリのデータベースの版
 * @param latest サイトに置いてある新しい版の情報
 */
export function updateNoticeKind(currentDbVersion: number, latest: VersionInfo | null): UpdateNoticeKind {
  return latest !== null && latest.dbVersion > currentDbVersion ? 'dataChange' : 'normal';
}

/** お知らせの文(SPEC.md 18.2・18.3) */
export function updateNoticeText(kind: UpdateNoticeKind): string {
  return kind === 'dataChange'
    ? '今回の更新では、データの形が変わります。必ずバックアップを書き出してから更新してください。'
    : '新しい版があります。更新の前に、バックアップの書き出しをおすすめします。';
}

/** 画面を開いたままのときに、新しい版がないか確かめる間隔(30分。SPEC.md 18.2) */
export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * オフライン用の仕組み(サービスワーカー)の、新しい版の状態
 * - waiting:新しい版を取り終えて、切り替えを待っている(帯を出す)
 * - installing:新しい版を取っている途中(取り終わるのを見届ける)
 * - none:新しい版はない
 */
export type ServiceWorkerUpdateState = 'waiting' | 'installing' | 'none';

/**
 * 登録の状態から、新しい版の状態を決める(SPEC.md 18.2)。
 * 使っている部品(workbox-window)が合図を見落としても帯を出せるよう、アプリ自身でも確かめるために使う。
 * 今動いている版(active)がないときは、初めて入れたところなので「新しい版」ではない
 * (初めて入れたときは、取り終えた直後に一瞬だけ waiting になってから、すぐに動き始めるため)
 */
export function serviceWorkerUpdateState(registration: {
  hasActive: boolean;
  hasWaiting: boolean;
  hasInstalling: boolean;
}): ServiceWorkerUpdateState {
  if (!registration.hasActive) {
    return 'none';
  }
  if (registration.hasWaiting) {
    return 'waiting';
  }
  return registration.hasInstalling ? 'installing' : 'none';
}
