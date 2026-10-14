// 版6 → 版7(2026年10月のブラッシュアップ フェーズ2)の移行と、移行前のバックアップ(SPEC.md 3.5・18.4)
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from './db';
import { DB_VERSION } from './dbVersion';
import { BeforeUpdateDatabase, getBeforeUpdateSnapshot, prepareDatabase } from './beforeUpdate';
import { readAllData, replaceAllData } from './backupRepo';
import { parseBackup } from '../lib/backup';

const DB_NAME = 'did-todo-test-migration-v7';
const BACKUP_DB_NAME = 'did-todo-test-migration-v7-before-update';

/** 版6のときの定義(db.ts の version(1)〜version(6) と同じ) */
function openV6(): Dexie {
  const v6 = new Dexie(DB_NAME);
  v6.version(1).stores({
    alters: 'id, order',
    tasks: 'id, order',
    records: 'id, taskId, completedAt, [taskId+completedAt]',
  });
  v6.version(2).stores({
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
  v6.version(3).stores({ medicationTimings: 'id, order' });
  v6.version(4).stores({ clinicNoteComments: 'id, noteId, createdAt' });
  v6.version(5).stores({});
  v6.version(6).stores({ switchTags: 'id, order', switchLogs: 'id, alterId, noticedAt' });
  return v6;
}

const createdAt = '2026-09-01T00:00:00.000Z';

function alter(id: string, name: string, order: number, hidden: boolean) {
  return { id, name, color: '#4a90d9', hidden, order, createdAt, reading: '', categoryId: null, age: '', gender: '', identify: '' };
}

/** 版6の、すべてのテーブルに1件以上入ったデータ(交代の記録は交代前の人格の項目がない) */
const v6Rows: Record<string, object[]> = {
  alters: [alter('alter-a', '人格A', 0, false), alter('alter-b', '人格B', 1, false), alter('alter-c', '人格C', 2, true)],
  categories: [{ id: 'cat-1', name: '主人格', order: 0, createdAt }],
  profileSections: [
    { id: 'p1', alterId: null, title: 'みんなに共通の配慮', body: '大きな音が苦手', includeInPdf: true, order: 0, createdAt },
  ],
  tasks: [
    { id: 'task-1', name: '植物に水やり', cycle: { type: 'everyNDays', n: 3 }, careAlterIds: ['alter-a'], hidden: false, order: 0, createdAt },
  ],
  records: [
    { id: 'r1', taskId: 'task-1', alterId: 'alter-a', completedAt: '2026-09-20T01:00:00.000Z', careAlterIdsAtCompletion: ['alter-a'] },
  ],
  medicationTimings: [{ id: 'morning', name: '朝食後', hidden: false, order: 0, createdAt }],
  medications: [
    { id: 'med-1', name: '薬A', kind: 'scheduled', timings: ['morning'], dosePerTake: 1, remaining: 10, status: 'active', order: 0, createdAt },
  ],
  medicationIntakes: [
    { id: 'i1', medicationId: 'med-1', alterId: 'alter-b', takenAt: '2026-09-21T00:00:00.000Z', timing: 'morning', deducted: 1, reason: '' },
  ],
  stockLogs: [{ id: 's1', medicationId: 'med-1', kind: 'initial', amount: 11, at: createdAt }],
  clinicNotes: [{ id: 'n1', alterId: null, categoryId: 'cn-1', body: '眠れない', createdAt, discussedAt: null }],
  clinicNoteCategories: [{ id: 'cn-1', name: '睡眠', order: 0, createdAt }],
  clinicNoteComments: [{ id: 'c1', noteId: 'n1', alterId: 'alter-a', body: 'わかる', createdAt }],
  bucketItems: [
    { id: 'b1', alterId: 'alter-a', body: '海に行く', order: 0, createdAt, achievedAt: null, helperAlterIds: [] },
    { id: 'b2', alterId: 'alter-c', body: '山に登る', order: 1, createdAt, achievedAt: null, helperAlterIds: [] },
  ],
  switchTags: [{ id: 'switch-tag-sound', name: '音', hidden: false, order: 0, createdAt }],
  switchLogs: [
    // 記録の時刻(交代した時刻、わからなければ気づいた時刻)の順:sw2(9時)→ sw1(10時)→ sw3(13時)
    { id: 'sw1', alterId: 'alter-a', noticedAt: '2026-10-01T01:00:00.000Z', switchedAt: '2026-10-01T01:00:00.000Z', tagIds: [] },
    { id: 'sw2', alterId: 'alter-b', noticedAt: '2026-10-01T03:00:00.000Z', switchedAt: '2026-10-01T00:00:00.000Z', tagIds: ['switch-tag-sound'] },
    { id: 'sw3', alterId: null, noticedAt: '2026-10-01T04:00:00.000Z', switchedAt: null, tagIds: [] },
  ],
  // 主キーの順(読み出すと主キーの順に並ぶため)
  meta: [
    { key: 'altersTerm', value: 'メンバー' },
    { key: 'showStats', value: 'on' },
  ],
};

/** 版7で補われる交代前の人格(時刻順に、1つ前の記録の交代した人格。すべて「推測」) */
const expectedFrom: Record<string, string | null> = { sw2: null, sw1: 'alter-b', sw3: 'alter-a' };

async function writeV6(): Promise<void> {
  const v6 = openV6();
  await v6.open();
  for (const [name, rows] of Object.entries(v6Rows)) {
    await v6.table(name).bulkAdd(rows);
  }
  v6.close();
}

/** 端末のデータベースの今の版(開いても版は上げない) */
async function storedVersion(): Promise<number> {
  const existing = new Dexie(DB_NAME);
  await existing.open();
  const version = existing.verno;
  existing.close();
  return version;
}

describe('版6 → 版7(SPEC.md 3.5)', () => {
  let database: AppDatabase | undefined;
  let backupDatabase = new BeforeUpdateDatabase(BACKUP_DB_NAME);
  const now = new Date(2026, 9, 14, 9, 0);

  beforeEach(() => {
    backupDatabase = new BeforeUpdateDatabase(BACKUP_DB_NAME);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    database?.close();
    database = undefined;
    await Dexie.delete(DB_NAME);
    backupDatabase.close();
    await Dexie.delete(BACKUP_DB_NAME);
  });

  it('今のデータは1件も消えず、交代前の人格が時刻順に推測で補われ、バケットに出す人格に非表示でない人格が入る', async () => {
    await writeV6();
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(database.verno).toBe(DB_VERSION);

    for (const [name, rows] of Object.entries(v6Rows)) {
      if (name !== 'switchLogs') {
        expect(await database.table(name).toArray(), name).toEqual(rows);
      }
    }
    const logs = await database.switchLogs.toArray();
    expect(logs).toEqual(
      v6Rows.switchLogs.map((row) => {
        const id = (row as { id: string }).id;
        return { ...row, fromAlterId: expectedFrom[id], fromAlterSource: 'guessed' };
      }),
    );
    // 非表示の人格Cは入れない(今もバケットに出ていないため)。リストの項目は変わらない
    expect((await database.bucketAlters.toArray()).map((entry) => [entry.alterId, entry.hidden])).toEqual([
      ['alter-a', false],
      ['alter-b', false],
    ]);
  });

  it('新しく入れたときは、バケットに出す人格は空で、写しも作らない', async () => {
    expect(await prepareDatabase(now, { dbName: DB_NAME, backupDatabase })).toBe('fresh');
    // 準備では、データベースを作らない
    expect(await Dexie.exists(DB_NAME)).toBe(false);
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(await database.bucketAlters.count()).toBe(0);
    expect(await getBeforeUpdateSnapshot(backupDatabase)).toBeNull();
  });

  describe('移行前のバックアップ(SPEC.md 18.4)', () => {
    it('版を上げる前に写しを保存し、写しを読み込むと版6のデータに戻る', async () => {
      await writeV6();
      expect(await prepareDatabase(now, { dbName: DB_NAME, backupDatabase })).toBe('saved');
      // 写しを保存しただけでは、版は上がっていない
      expect(await storedVersion()).toBe(6);

      const snapshot = await getBeforeUpdateSnapshot(backupDatabase);
      expect(snapshot).toMatchObject({ fromVersion: 6, toVersion: DB_VERSION, savedAt: now.toISOString(), noticePending: true });
      const parsed = parseBackup(snapshot?.text ?? '');
      if (!parsed.ok) {
        throw new Error(parsed.reason);
      }
      expect(parsed.backup.settings).toEqual({ altersTerm: 'メンバー' });

      // 版を上げてからデータを変え、写しを読み込むと元に戻る
      database = new AppDatabase(DB_NAME);
      await database.open();
      await database.alters.clear();
      await database.switchLogs.clear();
      await replaceAllData(database, parsed.backup.data);
      const restored = await readAllData(database);
      for (const [name, rows] of Object.entries(v6Rows)) {
        if (name === 'meta') {
          continue;
        }
        const actual = restored[name as keyof typeof restored];
        if (name === 'switchLogs') {
          expect(actual, name).toEqual(
            rows.map((row) => ({ ...row, fromAlterId: expectedFrom[(row as { id: string }).id], fromAlterSource: 'guessed' })),
          );
        } else {
          expect(actual, name).toEqual(rows);
        }
      }
      expect(restored.bucketAlters.map((entry) => entry.alterId)).toEqual(['alter-a', 'alter-b']);
    });

    it('すでに今の版なら写しを作り直さず、前の写しはそのまま残る', async () => {
      await writeV6();
      await prepareDatabase(now, { dbName: DB_NAME, backupDatabase });
      database = new AppDatabase(DB_NAME);
      await database.open();
      database.close();

      const later = new Date(2026, 9, 20, 9, 0);
      expect(await prepareDatabase(later, { dbName: DB_NAME, backupDatabase })).toBe('current');
      expect((await getBeforeUpdateSnapshot(backupDatabase))?.savedAt).toBe(now.toISOString());
    });

    it('写しを保存できなかったときは、エラーになり、データベースは版6のまま', async () => {
      await writeV6();
      vi.spyOn(backupDatabase.snapshots, 'put').mockRejectedValue(new Error('保存できない'));
      await expect(prepareDatabase(now, { dbName: DB_NAME, backupDatabase })).rejects.toThrow('保存できない');
      expect(await storedVersion()).toBe(6);
    });
  });
});
