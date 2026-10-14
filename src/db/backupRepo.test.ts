// テスト用の疑似データベース(fake-indexeddb)を使う
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { getLastExportedAt, readAllData, readBackupSettings, replaceAllData, setLastExportedAt } from './backupRepo';
import { buildBackup, parseBackup, serializeBackup, type BackupData } from '../lib/backup';
import { BACKUP_TABLE_NAMES } from '../lib/backupSchema';
import { buildInitialMedicationTimings } from '../lib/medicationTimings';

const now = new Date(2026, 8, 28, 21, 30);

/** すべてのテーブルに1件以上入ったデータ */
function fullData(): BackupData {
  const createdAt = '2026-09-01T00:00:00.000Z';
  return {
    alters: [
      {
        id: 'alter-a',
        name: '人格A',
        color: '#4a90d9',
        hidden: false,
        order: 0,
        createdAt,
        reading: 'じんかくえー',
        categoryId: 'cat-1',
        age: '20代',
        gender: '',
        identify: '話し方がていねい',
      },
      {
        id: 'alter-b',
        name: '人格B',
        color: '#d94a4a',
        hidden: true,
        order: 1,
        createdAt,
        reading: '',
        categoryId: null,
        age: '',
        gender: '',
        identify: '',
      },
    ],
    categories: [{ id: 'cat-1', name: '主人格', order: 0, createdAt }],
    profileSections: [
      { id: 'p1', alterId: 'alter-a', title: '特徴', body: '1行目\n2行目', includeInPdf: true, order: 0, createdAt },
      { id: 'p2', alterId: null, title: 'みんなに共通の配慮', body: '', includeInPdf: false, order: 0, createdAt },
    ],
    tasks: [
      {
        id: 'task-1',
        name: '植物に水やり',
        cycle: { type: 'weekly' },
        careAlterIds: ['alter-a'],
        hidden: false,
        order: 0,
        createdAt,
      },
    ],
    records: [
      { id: 'r1', taskId: 'task-1', alterId: 'alter-b', completedAt: '2026-09-20T01:00:00.000Z' },
      {
        id: 'r2',
        taskId: 'deleted-task',
        alterId: null,
        completedAt: '2026-09-21T01:00:00.000Z',
        careAlterIdsAtCompletion: ['alter-a'],
      },
    ],
    medicationTimings: [
      ...buildInitialMedicationTimings(createdAt),
      // 自分で追加した時間帯(非表示)
      { id: 'custom-1', name: '朝食前', hidden: true, order: 4, createdAt },
    ],
    medications: [
      {
        id: 'med-1',
        name: '薬A',
        kind: 'scheduled',
        timings: ['custom-1', 'morning', 'bedtime'],
        dosePerTake: 0.5,
        remaining: 13.5,
        status: 'active',
        order: 0,
        createdAt,
      },
    ],
    medicationIntakes: [
      {
        id: 'i1',
        medicationId: 'med-1',
        alterId: 'alter-a',
        takenAt: '2026-09-27T12:00:00.000Z',
        timing: 'bedtime',
        deducted: 0.5,
        reason: '',
      },
    ],
    stockLogs: [
      { id: 's0', medicationId: 'med-1', kind: 'initial', amount: 10, at: createdAt },
      { id: 's1', medicationId: 'med-1', kind: 'refill', amount: 14, at: createdAt },
      { id: 's2', medicationId: 'med-1', kind: 'recount', amount: 13.5, at: createdAt },
    ],
    clinicNotes: [
      {
        id: 'n1',
        alterId: null,
        categoryId: 'nc-1',
        body: '眠れない日がある',
        createdAt,
        discussedAt: null,
      },
    ],
    clinicNoteCategories: [{ id: 'nc-1', name: '睡眠', order: 0, createdAt }],
    // 改行のあるコメント
    clinicNoteComments: [{ id: 'cm1', noteId: 'n1', alterId: 'alter-b', body: '私も同じ\n朝がつらい', createdAt }],
    bucketItems: [
      {
        id: 'b1',
        alterId: 'alter-a',
        body: '海を見に行く',
        order: 0,
        createdAt,
        achievedAt: '2026-09-25T01:00:00.000Z',
        helperAlterIds: ['alter-b'],
      },
      // 削除済みの項目(deletedAt。SPEC.md 9.3)も、そのまま元どおりになる
      {
        id: 'b3',
        alterId: 'alter-b',
        body: '山に登る',
        order: 1,
        createdAt,
        achievedAt: '2026-09-26T01:00:00.000Z',
        helperAlterIds: ['alter-a'],
        deletedAt: '2026-09-27T01:00:00.000Z',
      },
    ],
    switchTags: [
      { id: 'switch-tag-sound', name: '音', hidden: false, order: 0, createdAt },
      { id: 'tag-custom', name: '人混み', hidden: true, order: 1, createdAt },
    ],
    switchLogs: [
      {
        id: 'sw1',
        alterId: 'alter-b',
        noticedAt: '2026-09-27T12:00:00.000Z',
        switchedAt: '2026-09-27T11:30:00.000Z',
        tagIds: ['switch-tag-sound', 'tag-custom'],
        fromAlterId: null,
        fromAlterSource: 'guessed',
      },
      {
        id: 'sw2',
        alterId: null,
        noticedAt: '2026-09-28T01:00:00.000Z',
        switchedAt: null,
        tagIds: [],
        fromAlterId: 'alter-a',
        fromAlterSource: 'confirmed',
      },
    ],
    bucketAlters: [
      { alterId: 'alter-a', hidden: false, addedAt: createdAt },
      { alterId: 'alter-b', hidden: true, addedAt: createdAt },
    ],
    clinicVisits: [
      { id: 'v1', visitedOn: '2026-10-01', alterIds: ['alter-a', 'alter-b'], staffIds: ['clinic-staff-doctor', 'staff-custom'], createdAt },
      { id: 'v2', visitedOn: '2026-10-08', alterIds: [], staffIds: [], createdAt },
    ],
    clinicStaff: [
      { id: 'clinic-staff-doctor', name: '主治医', order: 0, createdAt },
      { id: 'staff-custom', name: '薬剤師', order: 1, createdAt },
    ],
  };
}

/** 1件の主キー(ふつうは id。「バケットに出す人格」は人格のID) */
function keyOf(row: BackupData[keyof BackupData][number]): string {
  return 'id' in row ? row.id : row.alterId;
}

/** 比べやすいように、各テーブルを主キーの順に並べる */
function sortById(data: BackupData): BackupData {
  const sorted: Record<string, unknown[]> = { ...data };
  for (const name of BACKUP_TABLE_NAMES) {
    sorted[name] = [...data[name]].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  }
  return sorted as unknown as BackupData;
}

describe('バックアップの書き出しと読み込み', () => {
  let database: AppDatabase;

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-backup');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('データベースのテーブルは、端末の設定を除いてすべてバックアップの対象になっている', () => {
    const tableNames = database.tables.map((table) => table.name).filter((name) => name !== 'meta');
    expect([...tableNames].sort()).toEqual([...BACKUP_TABLE_NAMES].sort());
  });

  it('書き出し → 読み込みで、すべてのデータが元どおりになる', async () => {
    await replaceAllData(database, fullData());
    const text = serializeBackup(buildBackup(await readAllData(database), now));

    // 書き出したあとにデータを変える
    await database.alters.update('alter-a', { name: '人格A2' });
    await database.tasks.clear();
    await database.bucketItems.add({
      id: 'b2',
      alterId: 'alter-b',
      body: '増えた項目',
      order: 0,
      createdAt: '',
      achievedAt: null,
      helperAlterIds: [],
    });

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      throw new Error(parsed.reason);
    }
    await replaceAllData(database, parsed.backup.data);
    expect(sortById(await readAllData(database))).toEqual(sortById(fullData()));
  });

  it('読み込みに失敗したときは、今のデータが1件も変わらない', async () => {
    await replaceAllData(database, fullData());
    const broken = fullData();
    // 同じIDが2つあると保存で失敗する(途中まで消えたりしないことを確かめる)
    broken.bucketItems.push({ ...broken.bucketItems[0] });

    await expect(replaceAllData(database, broken)).rejects.toThrow();
    expect(sortById(await readAllData(database))).toEqual(sortById(fullData()));
  });

  it('呼び方は、設定を渡したときだけ読み込みで置き換わる(SPEC.md 14章③)', async () => {
    expect(await readBackupSettings(database)).toEqual({ altersTerm: '人格' });
    await replaceAllData(database, fullData(), { altersTerm: 'パーツ' });
    expect(await readBackupSettings(database)).toEqual({ altersTerm: 'パーツ' });
    await replaceAllData(database, fullData());
    expect(await readBackupSettings(database)).toEqual({ altersTerm: 'パーツ' });
  });

  it('最後に書き出した日時は、読み込みで置き換わらない', async () => {
    expect(await getLastExportedAt(database)).toBeNull();
    await setLastExportedAt(database, now);
    await replaceAllData(database, fullData());
    expect(await getLastExportedAt(database)).toBe(now.toISOString());
  });
});
