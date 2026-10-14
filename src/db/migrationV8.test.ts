// 版7 → 版8(2026年10月のブラッシュアップ フェーズ3)の移行と、移行前のバックアップ(SPEC.md 3.5・18.4)
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { DB_VERSION } from './dbVersion';
import { BeforeUpdateDatabase, getBeforeUpdateSnapshot, prepareDatabase } from './beforeUpdate';
import { parseBackup } from '../lib/backup';
import { DEFAULT_CLINIC_STAFF } from '../lib/clinicVisits';

const DB_NAME = 'did-todo-test-migration-v8';
const BACKUP_DB_NAME = 'did-todo-test-migration-v8-before-update';

/** 版7のときの定義(db.ts の version(1)〜version(7) と同じ) */
function openV7(): Dexie {
  const v7 = new Dexie(DB_NAME);
  v7.version(1).stores({
    alters: 'id, order',
    tasks: 'id, order',
    records: 'id, taskId, completedAt, [taskId+completedAt]',
  });
  v7.version(2).stores({
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
  v7.version(3).stores({ medicationTimings: 'id, order' });
  v7.version(4).stores({ clinicNoteComments: 'id, noteId, createdAt' });
  v7.version(5).stores({});
  v7.version(6).stores({ switchTags: 'id, order', switchLogs: 'id, alterId, noticedAt' });
  v7.version(7).stores({ bucketAlters: 'alterId' });
  return v7;
}

const createdAt = '2026-09-01T00:00:00.000Z';

/** 版7のデータ(版7で足した項目も入っている) */
const v7Rows: Record<string, object[]> = {
  alters: [
    { id: 'alter-a', name: '人格A', color: '#4a90d9', hidden: false, order: 0, createdAt, reading: '', categoryId: null, age: '', gender: '', identify: '' },
  ],
  tasks: [{ id: 'task-1', name: '粗大ごみの申し込み', cycle: { type: 'none' }, careAlterIds: [], hidden: false, order: 0, createdAt }],
  records: [{ id: 'r1', taskId: 'task-1', alterId: 'alter-a', completedAt: '2026-10-01T01:00:00.000Z' }],
  clinicNotes: [{ id: 'n1', alterId: 'alter-a', categoryId: 'cn-1', body: '眠れない', createdAt, discussedAt: null }],
  clinicNoteCategories: [{ id: 'cn-1', name: '睡眠', order: 0, createdAt }],
  bucketAlters: [{ alterId: 'alter-a', hidden: false, addedAt: createdAt }],
  switchTags: [{ id: 'switch-tag-sound', name: '音', hidden: false, order: 0, createdAt }],
  switchLogs: [
    {
      id: 'sw1',
      alterId: 'alter-a',
      noticedAt: '2026-10-01T01:00:00.000Z',
      switchedAt: null,
      tagIds: [],
      fromAlterId: null,
      fromAlterSource: 'guessed',
    },
  ],
  meta: [{ key: 'showStats', value: 'on' }],
};

/** 話した相手の [ID, 名前, 並び順](作成日時は版を上げた時刻なので比べない) */
async function staffRows(database: AppDatabase) {
  return (await database.clinicStaff.orderBy('order').toArray()).map((s) => [s.id, s.name, s.order]);
}
const defaultStaffRows = DEFAULT_CLINIC_STAFF.map((staff, index) => [staff.id, staff.name, index]);

describe('版7 → 版8(SPEC.md 3.5)', () => {
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

  async function writeV7(): Promise<void> {
    const v7 = openV7();
    await v7.open();
    for (const [name, rows] of Object.entries(v7Rows)) {
      await v7.table(name).bulkAdd(rows);
    }
    v7.close();
  }

  it('今のデータは1件も変わらず、受診の記録は空で、話した相手の最初の選択肢が1回だけ入る', async () => {
    await writeV7();
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(database.verno).toBe(8);
    expect(DB_VERSION).toBe(8);
    for (const [name, rows] of Object.entries(v7Rows)) {
      expect(await database.table(name).toArray(), name).toEqual(rows);
    }
    expect(await database.clinicVisits.count()).toBe(0);
    expect(await staffRows(database)).toEqual(defaultStaffRows);
    // 開き直しても増えない
    database.close();
    database = new AppDatabase(DB_NAME);
    expect(await staffRows(database)).toEqual(defaultStaffRows);
  });

  it('新しく入れたときも、話した相手の最初の選択肢が入る', async () => {
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(await staffRows(database)).toEqual(defaultStaffRows);
    expect(await database.clinicVisits.count()).toBe(0);
  });

  it('版を上げる前に、版7のデータの写しを保存する(読み込むと版7のデータになる)', async () => {
    await writeV7();
    expect(await prepareDatabase(now, { dbName: DB_NAME, backupDatabase })).toBe('saved');
    const snapshot = await getBeforeUpdateSnapshot(backupDatabase);
    expect(snapshot).toMatchObject({ fromVersion: 7, toVersion: 8, noticePending: true });
    const parsed = parseBackup(snapshot?.text ?? '');
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    expect(parsed.backup.data.tasks).toEqual(v7Rows.tasks);
    expect(parsed.backup.data.switchLogs).toEqual(v7Rows.switchLogs);
    expect(parsed.backup.data.bucketAlters).toEqual(v7Rows.bucketAlters);
    // 版7の写しには受診の記録がないので、「記録なし」・最初の選択肢として読み込む
    expect(parsed.backup.data.clinicVisits).toEqual([]);
    expect(parsed.backup.data.clinicStaff.map((s) => s.id)).toEqual(DEFAULT_CLINIC_STAFF.map((s) => s.id));
  });
});
