// 移行前のバックアップ(SPEC.md 18.4)。
// データベースの版を上げる前に、今の版のままデータを読み、バックアップと同じ形の文字列にして、別の小さなデータベースに保存する。
// 保存できたことを確かめてから、アプリのデータベース(db.ts)を開く(そこで版が上がる)。
// 保存に失敗したときは、版を上げずに止める(データは古い形のまま残る)
import { Dexie, type EntityTable } from 'dexie';
import { BEFORE_UPDATE_DB_NAME, DB_NAME } from '../lib/appTarget';
import { buildRawBackupText } from '../lib/backup';
import { BACKUP_TABLE_NAMES } from '../lib/backupSchema';
import type { AppMeta } from '../lib/types';
import { DB_VERSION } from './dbVersion';

/** 保存しておく写し(いつも1つだけ。次に版を上げるときに置き換える) */
export interface BeforeUpdateSnapshot {
  key: 'latest';
  /** 写したときのデータベースの版 */
  fromVersion: number;
  /** 上げる先の版 */
  toVersion: number;
  /** 写した日時(ISO形式) */
  savedAt: string;
  /** バックアップのファイルと同じ形の文字列 */
  text: string;
  /** 「更新前のデータを保存しました」の帯を出すか(書き出すか「閉じる」を押すと false) */
  noticePending: boolean;
}

/** 移行前のバックアップを置くデータベース */
export class BeforeUpdateDatabase extends Dexie {
  snapshots!: EntityTable<BeforeUpdateSnapshot, 'key'>;

  constructor(name = BEFORE_UPDATE_DB_NAME) {
    super(name);
    this.version(1).stores({ snapshots: 'key' });
  }
}

/** アプリ全体で使う、移行前のバックアップのデータベース */
export const beforeUpdateDb = new BeforeUpdateDatabase();

/** 準備の結果:新しく入れた / 版を上げる必要がない / 写しを保存した */
export type PrepareResult = 'fresh' | 'current' | 'saved';

/**
 * 端末のデータベースを、名前だけで(版を決めずに)開く。まだなければ null。
 * 版を決めずに開くと、今の版のまま開ける(版は上がらない)
 */
async function openExisting(name: string): Promise<Dexie | null> {
  const existing = new Dexie(name);
  try {
    await existing.open();
    return existing;
  } catch (error) {
    // まだデータベースがない(新しく入れた人)
    if (error instanceof Dexie.NoSuchDatabaseError) {
      return null;
    }
    throw error;
  }
}

/** 今の版のまま、バックアップに入れるテーブルと呼び方を同じ時点のものとして読む */
async function readRawData(existing: Dexie): Promise<{ tables: Record<string, unknown[]>; altersTerm: string | null }> {
  const present = new Set(existing.tables.map((table) => table.name));
  const names: string[] = BACKUP_TABLE_NAMES.filter((name) => present.has(name));
  const hasMeta = present.has('meta');
  const tablesToRead = hasMeta ? [...names, 'meta'] : names;
  return existing.transaction('r', tablesToRead, async () => {
    const tables: Record<string, unknown[]> = {};
    for (const name of names) {
      tables[name] = await existing.table(name).toArray();
    }
    const term = hasMeta ? await existing.table<AppMeta, string>('meta').get('altersTerm') : undefined;
    return { tables, altersTerm: term?.value ?? null };
  });
}

/**
 * アプリのデータベースを開く前に呼ぶ(SPEC.md 18.4)。
 * 端末のデータベースの版がアプリの版より古いときだけ、版を上げる前のデータを写して保存する。
 * 保存できなかったときはエラーを投げる(呼んだ側は、アプリのデータベースを開かずに止める)
 * @param now 写した日時に使う(テストで任意の時刻を渡せるよう引数にしている)
 */
export async function prepareDatabase(
  now: Date,
  options: { dbName?: string; backupDatabase?: BeforeUpdateDatabase; appVersion?: number } = {},
): Promise<PrepareResult> {
  const { dbName = DB_NAME, backupDatabase = beforeUpdateDb, appVersion = DB_VERSION } = options;
  const existing = await openExisting(dbName);
  if (existing === null) {
    return 'fresh';
  }
  try {
    const fromVersion = existing.verno;
    if (fromVersion >= appVersion) {
      return 'current';
    }
    const { tables, altersTerm } = await readRawData(existing);
    const snapshot: BeforeUpdateSnapshot = {
      key: 'latest',
      fromVersion,
      toVersion: appVersion,
      savedAt: now.toISOString(),
      text: buildRawBackupText(tables, altersTerm, now),
      noticePending: true,
    };
    await backupDatabase.snapshots.put(snapshot);
    // 保存できたことを、読み直して確かめる
    const saved = await backupDatabase.snapshots.get('latest');
    if (saved?.text !== snapshot.text) {
      throw new Error('移行前のバックアップを確かめられませんでした');
    }
    return 'saved';
  } finally {
    // 開いたままだと、アプリのデータベースが版を上げられない
    existing.close();
  }
}

/** 保存してある移行前のバックアップ。なければ null */
export async function getBeforeUpdateSnapshot(
  backupDatabase: BeforeUpdateDatabase = beforeUpdateDb,
): Promise<BeforeUpdateSnapshot | null> {
  return (await backupDatabase.snapshots.get('latest')) ?? null;
}

/** 「更新前のデータを保存しました」の帯を、もう出さない(書き出した・「閉じる」を押した) */
export async function dismissBeforeUpdateNotice(
  backupDatabase: BeforeUpdateDatabase = beforeUpdateDb,
): Promise<void> {
  await backupDatabase.snapshots.update('latest', { noticePending: false });
}
