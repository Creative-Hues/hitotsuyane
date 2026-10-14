// 版8 → 版9(2026年10月のブラッシュアップ フェーズ4)の移行と、移行前のバックアップ(SPEC.md 3.5・18.4)
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { DB_VERSION } from './dbVersion';
import { BeforeUpdateDatabase, getBeforeUpdateSnapshot, prepareDatabase } from './beforeUpdate';
import { parseBackup } from '../lib/backup';
import { DEFAULT_REACTION_KINDS, HOME_BOARD_ID } from '../lib/board';

const DB_NAME = 'did-todo-test-migration-v9';
const BACKUP_DB_NAME = 'did-todo-test-migration-v9-before-update';

/** 版8のときの定義(db.ts の version(1)〜version(8) と同じ) */
function openV8(): Dexie {
  const v8 = new Dexie(DB_NAME);
  v8.version(1).stores({
    alters: 'id, order',
    tasks: 'id, order',
    records: 'id, taskId, completedAt, [taskId+completedAt]',
  });
  v8.version(2).stores({
    categories: 'id, order',
    profileSections: 'id, alterId, order',
    medications: 'id, order',
    medicationIntakes: 'id, medicationId, takenAt',
    stockLogs: 'id, medicationId, at',
    clinicNotes: 'id, createdAt',
    clinicNoteCategories: 'id, order',
    bucketItems: 'id, alterId, order',
    meta: 'key',
  });
  v8.version(3).stores({ medicationTimings: 'id, order' });
  v8.version(4).stores({ clinicNoteComments: 'id, noteId, createdAt' });
  v8.version(5).stores({});
  v8.version(6).stores({ switchTags: 'id, order', switchLogs: 'id, alterId, noticedAt' });
  v8.version(7).stores({ bucketAlters: 'alterId' });
  v8.version(8).stores({ clinicVisits: 'id, visitedOn', clinicStaff: 'id, order' });
  return v8;
}

const createdAt = '2026-09-01T00:00:00.000Z';

/** 版8のデータ */
const v8Rows: Record<string, object[]> = {
  alters: [
    { id: 'alter-a', name: '人格A', color: '#4a90d9', hidden: false, order: 0, createdAt, reading: '', categoryId: null, age: '', gender: '', identify: '' },
  ],
  tasks: [{ id: 'task-1', name: '植物に水やり', cycle: { type: 'daily' }, careAlterIds: [], hidden: false, order: 0, createdAt }],
  clinicVisits: [{ id: 'v1', visitedOn: '2026-10-01', alterIds: ['alter-a'], staffIds: ['clinic-staff-doctor'], createdAt }],
  clinicStaff: [{ id: 'clinic-staff-doctor', name: '主治医', order: 0, createdAt }],
  bucketAlters: [{ alterId: 'alter-a', hidden: false, addedAt: createdAt }],
  meta: [{ key: 'showStats', value: 'on' }],
};

describe('版8 → 版9(SPEC.md 3.5)', () => {
  let database: AppDatabase | undefined;
  let backupDatabase = new BeforeUpdateDatabase(BACKUP_DB_NAME);
  const now = new Date(2026, 9, 20, 9, 0);

  beforeEach(() => {
    backupDatabase = new BeforeUpdateDatabase(BACKUP_DB_NAME);
  });

  afterEach(async () => {
    database?.close();
    database = undefined;
    await Dexie.delete(DB_NAME);
    backupDatabase.close();
    await Dexie.delete(BACKUP_DB_NAME);
  });

  async function writeV8(): Promise<void> {
    const v8 = openV8();
    await v8.open();
    for (const [name, rows] of Object.entries(v8Rows)) {
      await v8.table(name).bulkAdd(rows);
    }
    v8.close();
  }

  /** 板とリアクションの選択肢の [ID, 名前, 並び順] */
  async function initialRows(db: AppDatabase) {
    return {
      boards: (await db.boards.toArray()).map((b) => [b.id, b.name, b.order]),
      kinds: (await db.reactionKinds.orderBy('order').toArray()).map((k) => [k.id, k.name, k.order]),
    };
  }
  const expectedInitial = {
    boards: [[HOME_BOARD_ID, 'ホーム', 0]],
    kinds: DEFAULT_REACTION_KINDS.map((kind, index) => [kind.id, kind.name, index]),
  };

  it('今のデータは1件も変わらず、ホームの板とリアクションの最初の選択肢が1回だけ入る', async () => {
    await writeV8();
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(database.verno).toBe(9);
    expect(DB_VERSION).toBe(9);
    for (const [name, rows] of Object.entries(v8Rows)) {
      expect(await database.table(name).toArray(), name).toEqual(rows);
    }
    expect(await initialRows(database)).toEqual(expectedInitial);
    expect(await database.boardThreads.count()).toBe(0);
    database.close();
    database = new AppDatabase(DB_NAME);
    expect(await initialRows(database)).toEqual(expectedInitial);
  });

  it('新しく入れたときも、ホームの板とリアクションの最初の選択肢が入る', async () => {
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(await initialRows(database)).toEqual(expectedInitial);
  });

  it('版を上げる前に、版8のデータの写しを保存する', async () => {
    await writeV8();
    expect(await prepareDatabase(now, { dbName: DB_NAME, backupDatabase })).toBe('saved');
    const snapshot = await getBeforeUpdateSnapshot(backupDatabase);
    expect(snapshot).toMatchObject({ fromVersion: 8, toVersion: 9 });
    const parsed = parseBackup(snapshot?.text ?? '');
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    expect(parsed.backup.data.clinicVisits).toEqual(v8Rows.clinicVisits);
    // 版8の写しには掲示板がないので、ホームの板だけとして読み込む
    expect(parsed.backup.data.boards.map((b) => b.id)).toEqual([HOME_BOARD_ID]);
  });
});
