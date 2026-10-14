// データベースの版を上げても、今のデータが消えないことを確かめる(SPEC.md 3.5)
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { DB_VERSION } from './dbVersion';
import { DEFAULT_SWITCH_TAGS } from '../lib/switchLog';
import type { AlterV1 } from './initialData';
import type { CompletionRecord, Medication, MedicationIntake, StockLog, Task } from '../lib/types';

const DB_NAME = 'did-todo-test-migration';

/** 版1のときの定義(db.ts の version(1) と同じ) */
function openV1(): Dexie {
  const v1 = new Dexie(DB_NAME);
  v1.version(1).stores({
    alters: 'id, order',
    tasks: 'id, order',
    records: 'id, taskId, completedAt, [taskId+completedAt]',
  });
  return v1;
}

/** 版2のときの定義(db.ts の version(1)・version(2) と同じ) */
function openV2(): Dexie {
  const v2 = new Dexie(DB_NAME);
  v2.version(1).stores({
    alters: 'id, order',
    tasks: 'id, order',
    records: 'id, taskId, completedAt, [taskId+completedAt]',
  });
  v2.version(2).stores({
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
  return v2;
}

/** 版3のときの定義(db.ts の version(1)〜version(3) と同じ) */
function openV3(): Dexie {
  const v3 = openV2();
  v3.version(3).stores({ medicationTimings: 'id, order' });
  return v3;
}

/** 版4のときの定義(db.ts の version(1)〜version(4) と同じ) */
function openV4(): Dexie {
  const v4 = openV3();
  v4.version(4).stores({ clinicNoteComments: 'id, noteId, createdAt' });
  return v4;
}

/** 版5のときの定義(db.ts の version(1)〜version(5) と同じ。版5はテーブルの形を変えていない) */
function openV5(): Dexie {
  const v5 = openV4();
  v5.version(5).stores({});
  return v5;
}

/** 最初の4つの時間帯の ID・名前・並び順・非表示(作成日時は版を上げた時刻なので比べない) */
const DEFAULT_TIMING_ROWS = [
  ['morning', '朝食後', 0, false],
  ['noon', '昼食後', 1, false],
  ['evening', '夕食後', 2, false],
  ['bedtime', '寝る前', 3, false],
];

async function timingRows(database: AppDatabase) {
  return (await database.medicationTimings.orderBy('order').toArray()).map((t) => [t.id, t.name, t.order, t.hidden]);
}

const alterA: AlterV1 = {
  id: 'alter-a',
  name: '人格A',
  color: '#4a90d9',
  hidden: false,
  order: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const alterB: AlterV1 = {
  id: 'alter-b',
  name: '人格B',
  color: '#d94a4a',
  hidden: true,
  order: 1,
  createdAt: '2026-09-02T00:00:00.000Z',
};
const task: Task = {
  id: 'task-1',
  name: '植物に水やり',
  cycle: { type: 'everyNDays', n: 3 },
  careAlterIds: ['alter-a', 'alter-b'],
  hidden: false,
  order: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
};
const records: CompletionRecord[] = [
  { id: 'r1', taskId: 'task-1', alterId: 'alter-a', completedAt: '2026-09-20T01:00:00.000Z' },
  { id: 'r2', taskId: 'task-1', alterId: null, completedAt: '2026-09-23T12:00:00.000Z' },
  // タスクを削除したあとも残っている記録
  { id: 'r3', taskId: 'deleted-task', alterId: 'alter-b', completedAt: '2026-09-24T12:00:00.000Z' },
];

describe('データベースの版を上げる', () => {
  let database: AppDatabase | undefined;

  afterEach(async () => {
    database?.close();
    await Dexie.delete(DB_NAME);
  });

  it('版1の人格・タスク・完了記録が消えずに残り、人格に基本情報の初期値が入る', async () => {
    const v1 = openV1();
    await v1.table('alters').bulkAdd([alterA, alterB]);
    await v1.table('tasks').add(task);
    await v1.table('records').bulkAdd(records);
    v1.close();

    database = new AppDatabase(DB_NAME);
    await database.open();

    expect(database.verno).toBe(DB_VERSION);
    expect(await database.alters.orderBy('order').toArray()).toEqual([
      { ...alterA, reading: '', categoryId: null, age: '', gender: '', identify: '' },
      { ...alterB, reading: '', categoryId: null, age: '', gender: '', identify: '' },
    ]);
    expect(await database.tasks.toArray()).toEqual([task]);
    expect(await database.records.orderBy('id').toArray()).toEqual(records);
    // 古い記録には careAlterIdsAtCompletion を足さない(SPEC.md 3.3)
    expect((await database.records.get('r1'))?.careAlterIdsAtCompletion).toBeUndefined();
  });

  it('版を上げたとき、最初の区分と受診メモの分類が入る', async () => {
    const v1 = openV1();
    await v1.table('alters').add(alterA);
    v1.close();

    database = new AppDatabase(DB_NAME);
    const categories = await database.categories.orderBy('order').toArray();
    expect(categories.map((c) => c.name)).toEqual(['主人格', 'よく前に出る', '状況によって出る', '最近出現・詳細確認中']);
    const noteCategories = await database.clinicNoteCategories.orderBy('order').toArray();
    expect(noteCategories.map((c) => c.name)).toEqual(['体調', '薬', '睡眠', '気分', '人格のこと', '生活', 'その他']);
  });

  it('新しく入れたときは、区分は空で、受診メモの分類が1回だけ入る(「人格のこと」の代わりに「交代のこと」。SPEC.md 14章③)', async () => {
    database = new AppDatabase(DB_NAME);
    await database.open();
    database.close();
    // 開き直しても、もう一度は入らない
    database = new AppDatabase(DB_NAME);
    expect(await database.categories.count()).toBe(0);
    expect((await database.clinicNoteCategories.orderBy('order').toArray()).map((c) => c.name)).toEqual([
      '体調',
      '薬',
      '睡眠',
      '気分',
      '交代のこと',
      '生活',
      'その他',
    ]);
    expect(await database.alters.count()).toBe(0);
    expect(await database.meta.count()).toBe(0);
  });

  it('新しいテーブルに保存でき、開き直しても残る', async () => {
    database = new AppDatabase(DB_NAME);
    await database.medications.add({
      id: 'med-1',
      name: '薬A',
      kind: 'scheduled',
      timings: ['morning', 'bedtime'],
      dosePerTake: 0.5,
      remaining: 14,
      status: 'active',
      order: 0,
      createdAt: '2026-09-28T00:00:00.000Z',
    });
    await database.meta.put({ key: 'lastBackupExportedAt', value: '2026-09-28T00:00:00.000Z' });
    database.close();

    database = new AppDatabase(DB_NAME);
    expect((await database.medications.get('med-1'))?.dosePerTake).toBe(0.5);
    expect((await database.meta.get('lastBackupExportedAt'))?.value).toBe('2026-09-28T00:00:00.000Z');
  });

  describe('版2 → 版3(服薬の時間帯の一覧。SPEC.md 3.5・7.8)', () => {
    const medications: Medication[] = [
      {
        id: 'med-1',
        name: '薬A',
        kind: 'scheduled',
        timings: ['morning', 'bedtime'],
        dosePerTake: 1,
        remaining: 13,
        status: 'active',
        order: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
      },
      {
        id: 'med-2',
        name: '薬B',
        kind: 'scheduled',
        timings: ['noon'],
        dosePerTake: 0.5,
        remaining: 3.5,
        status: 'stopped',
        order: 1,
        createdAt: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'med-3',
        name: '頓服C',
        kind: 'asNeeded',
        timings: [],
        dosePerTake: 1,
        remaining: 5,
        status: 'active',
        order: 2,
        createdAt: '2026-09-03T00:00:00.000Z',
      },
    ];
    const intakes: MedicationIntake[] = [
      {
        id: 'i1',
        medicationId: 'med-1',
        alterId: 'alter-a',
        takenAt: '2026-09-27T12:00:00.000Z',
        timing: 'bedtime',
        deducted: 1,
        reason: '',
      },
      {
        id: 'i2',
        medicationId: 'med-3',
        alterId: null,
        takenAt: '2026-09-27T06:00:00.000Z',
        timing: null,
        deducted: 1,
        reason: '頭痛',
      },
    ];
    const stockLogs: StockLog[] = [
      { id: 's1', medicationId: 'med-1', kind: 'initial', amount: 14, at: '2026-09-01T00:00:00.000Z' },
    ];

    it('薬・服薬記録・在庫の履歴が1文字も変わらず、最初の4つの時間帯が入り、薬の時間帯とつながる', async () => {
      const v2 = openV2();
      await v2.open();
      await v2.table('medications').bulkAdd(medications);
      await v2.table('medicationIntakes').bulkAdd(intakes);
      await v2.table('stockLogs').bulkAdd(stockLogs);
      v2.close();

      database = new AppDatabase(DB_NAME);
      await database.open();

      expect(database.verno).toBe(DB_VERSION);
      expect(await timingRows(database)).toEqual(DEFAULT_TIMING_ROWS);
      expect(await database.medications.orderBy('order').toArray()).toEqual(medications);
      expect(await database.medicationIntakes.orderBy('id').toArray()).toEqual(intakes);
      expect(await database.stockLogs.toArray()).toEqual(stockLogs);
      // 薬と服薬記録が指している時間帯が、すべて一覧にある
      const timingIds = new Set((await database.medicationTimings.toArray()).map((t) => t.id));
      const referenced = [...medications.flatMap((m) => m.timings), ...intakes.flatMap((i) => (i.timing ? [i.timing] : []))];
      expect(referenced.every((id) => timingIds.has(id))).toBe(true);
    });

    it('版1から開いても、最初の4つの時間帯が1回だけ入る', async () => {
      const v1 = openV1();
      await v1.table('alters').add(alterA);
      v1.close();

      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(database.verno).toBe(DB_VERSION);
      expect(await timingRows(database)).toEqual(DEFAULT_TIMING_ROWS);
    });

    it('新しく入れたときも最初の4つが入り、開き直しても増えない', async () => {
      database = new AppDatabase(DB_NAME);
      await database.open();
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await timingRows(database)).toEqual(DEFAULT_TIMING_ROWS);
    });
  });

  describe('版3 → 版4(受診メモのコメント。SPEC.md 3.5・8.4)', () => {
    /** 版3のすべてのテーブルに入れておくデータ */
    const v3Rows: Record<string, object[]> = {
      alters: [{ ...alterA, reading: '', categoryId: 'cat-1', age: '', gender: '', identify: '' }],
      tasks: [task],
      records,
      categories: [{ id: 'cat-1', name: '主人格', order: 0, createdAt: '2026-09-01T00:00:00.000Z' }],
      // 人格にも「全体のこと」にも見出しがあるので、版5でも見出しは足されない
      // (読み出しは ID 順なので、ID 順に並べておく)
      profileSections: [
        {
          id: 'p0',
          alterId: null,
          title: 'みんなに共通の配慮',
          body: '',
          includeInPdf: true,
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'p1',
          alterId: 'alter-a',
          title: '特徴',
          body: '',
          includeInPdf: true,
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      medicationTimings: [{ id: 'morning', name: '朝食後', hidden: false, order: 0, createdAt: '2026-09-01T00:00:00.000Z' }],
      medications: [
        {
          id: 'med-1',
          name: '薬A',
          kind: 'scheduled',
          timings: ['morning'],
          dosePerTake: 1,
          remaining: 13,
          status: 'active',
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      medicationIntakes: [
        {
          id: 'i1',
          medicationId: 'med-1',
          alterId: 'alter-a',
          takenAt: '2026-09-27T00:00:00.000Z',
          timing: 'morning',
          deducted: 1,
          reason: '',
        },
      ],
      stockLogs: [{ id: 's1', medicationId: 'med-1', kind: 'initial', amount: 14, at: '2026-09-01T00:00:00.000Z' }],
      clinicNoteCategories: [{ id: 'nc-1', name: '体調', order: 0, createdAt: '2026-09-01T00:00:00.000Z' }],
      clinicNotes: [
        // まだ話していないメモ(改行あり)・話したメモ・「わからない」のメモ
        {
          id: 'n1',
          alterId: 'alter-a',
          categoryId: 'nc-1',
          body: '朝起きると頭が痛い\n2週間くらい前から',
          createdAt: '2026-09-20T00:00:00.000Z',
          discussedAt: null,
        },
        {
          id: 'n2',
          alterId: 'alter-a',
          categoryId: 'nc-1',
          body: '食欲がない',
          createdAt: '2026-09-21T00:00:00.000Z',
          discussedAt: '2026-09-25T00:00:00.000Z',
        },
        {
          id: 'n3',
          alterId: null,
          categoryId: 'nc-1',
          body: '記憶がとぶ',
          createdAt: '2026-09-22T00:00:00.000Z',
          discussedAt: null,
        },
      ],
      bucketItems: [
        {
          id: 'b1',
          alterId: 'alter-a',
          body: '海を見に行く',
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
          achievedAt: null,
          helperAlterIds: [],
        },
      ],
      meta: [{ key: 'lastBackupExportedAt', value: '2026-09-28T00:00:00.000Z' }],
    };

    it('版3のすべてのテーブルの中身が1文字も変わらず、コメントのテーブルは空で書き込める', async () => {
      const v3 = openV3();
      await v3.open();
      for (const [name, rows] of Object.entries(v3Rows)) {
        await v3.table(name).bulkAdd(rows);
      }
      v3.close();

      database = new AppDatabase(DB_NAME);
      await database.open();

      expect(database.verno).toBe(DB_VERSION);
      for (const [name, rows] of Object.entries(v3Rows)) {
        expect(await database.table(name).toArray(), name).toEqual(rows);
      }
      expect(await database.clinicNoteComments.count()).toBe(0);

      // コメントを書き込めて、開き直しても残る
      await database.clinicNoteComments.add({
        id: 'cm1',
        noteId: 'n1',
        alterId: null,
        body: '私も同じ',
        createdAt: '2026-09-28T00:00:00.000Z',
      });
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await database.clinicNoteComments.where('noteId').equals('n1').count()).toBe(1);
    });

    it('版1から開いても、新しく入れても、コメントは空で、最初のデータは1回だけ入る', async () => {
      const v1 = openV1();
      await v1.table('alters').add(alterA);
      v1.close();
      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(database.verno).toBe(DB_VERSION);
      expect(await database.clinicNoteComments.count()).toBe(0);
      expect(await database.clinicNoteCategories.count()).toBe(7);
      expect(await database.medicationTimings.count()).toBe(4);
      database.close();
      await Dexie.delete(DB_NAME);

      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(database.verno).toBe(DB_VERSION);
      expect(await database.clinicNoteComments.count()).toBe(0);
      expect(await database.clinicNoteCategories.count()).toBe(7);
      expect(await database.medicationTimings.count()).toBe(4);
    });
  });

  describe('版4 → 版5(最初のプロフィールの見出し。SPEC.md 3.5・10.4・10.5)', () => {
    const DEFAULT_TITLES = ['機能・役割', '特徴', '記憶', '身体・感覚', '対応のお願い', '交代の傾向', '経緯', 'その他'];
    const COMMON_TITLES = ['みんなに共通の配慮', '交代のときの様子', '誰が出ているかわからないとき'];
    const withProfile = (alter: AlterV1, categoryId: string | null) => ({
      ...alter,
      reading: '',
      categoryId,
      age: '',
      gender: '',
      identify: '',
    });
    const alterC: AlterV1 = { ...alterA, id: 'alter-c', name: '人格C', order: 2 };
    /** 人格A だけ見出しがあり、B(非表示)と C にはない。「全体のこと」の見出しもない */
    const ownSection = {
      id: 'p1',
      alterId: 'alter-a',
      title: '好きなもの',
      body: '海',
      includeInPdf: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
    };
    const v4Rows: Record<string, object[]> = {
      alters: [withProfile(alterA, 'cat-1'), withProfile(alterB, null), withProfile(alterC, null)],
      tasks: [task],
      records,
      categories: [{ id: 'cat-1', name: '主人格', order: 0, createdAt: '2026-09-01T00:00:00.000Z' }],
      clinicNoteComments: [{ id: 'cm1', noteId: 'n1', alterId: null, body: '私も同じ', createdAt: '' }],
      bucketItems: [
        {
          id: 'b1',
          alterId: 'alter-a',
          body: '海を見に行く',
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
          achievedAt: null,
          helperAlterIds: [],
        },
      ],
      meta: [{ key: 'lastBackupExportedAt', value: '2026-09-28T00:00:00.000Z' }],
    };

    /** その人格(null なら「全体のこと」)の見出しの [見出し, 中身, PDFに入れる] を並び順で */
    async function sectionRows(db: AppDatabase, alterId: string | null) {
      const sections = await db.profileSections.filter((s) => s.alterId === alterId).toArray();
      return sections.sort((a, b) => a.order - b.order).map((s) => [s.title, s.body, s.includeInPdf]);
    }
    const defaultRows = DEFAULT_TITLES.map((title) => [title, '', title !== '経緯']);
    const commonRows = COMMON_TITLES.map((title) => [title, '', true]);

    async function openFromV4(): Promise<AppDatabase> {
      const v4 = openV4();
      await v4.open();
      for (const [name, rows] of Object.entries(v4Rows)) {
        await v4.table(name).bulkAdd(rows);
      }
      await v4.table('profileSections').add(ownSection);
      v4.close();
      const opened = new AppDatabase(DB_NAME);
      await opened.open();
      return opened;
    }

    it('今のデータは1文字も変わらず、見出しのない人格と「全体のこと」にだけ最初の見出しが入る', async () => {
      database = await openFromV4();

      expect(database.verno).toBe(DB_VERSION);
      for (const [name, rows] of Object.entries(v4Rows)) {
        expect(await database.table(name).toArray(), name).toEqual(rows);
      }
      // 人格A の見出しはそのまま(基本の見出しは足さない)
      expect(await database.profileSections.filter((s) => s.alterId === 'alter-a').toArray()).toEqual([ownSection]);
      // 非表示の人格B にも入る
      expect(await sectionRows(database, 'alter-b')).toEqual(defaultRows);
      expect(await sectionRows(database, 'alter-c')).toEqual(defaultRows);
      expect(await sectionRows(database, null)).toEqual(commonRows);
    });

    it('開き直しても、見出しは増えない', async () => {
      database = await openFromV4();
      const count = await database.profileSections.count();
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await database.profileSections.count()).toBe(count);
      expect(count).toBe(1 + 8 + 8 + 3);
    });

    it('「全体のこと」の見出しがすでにあれば、足さない', async () => {
      const v4 = openV4();
      await v4.open();
      const common = { ...ownSection, id: 'p0', alterId: null, title: '連絡先' };
      await v4.table('profileSections').add(common);
      v4.close();

      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(await database.profileSections.toArray()).toEqual([common]);
    });

    it('版1から開いても、新しく入れても、最初の見出しが1回だけ入る', async () => {
      const v1 = openV1();
      await v1.table('alters').add(alterA);
      v1.close();
      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(await sectionRows(database, 'alter-a')).toEqual(defaultRows);
      expect(await sectionRows(database, null)).toEqual(commonRows);
      database.close();
      await Dexie.delete(DB_NAME);

      database = new AppDatabase(DB_NAME);
      await database.open();
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await sectionRows(database, null)).toEqual(commonRows);
      expect(await database.profileSections.count()).toBe(3);
    });
  });
  it('データベースの版の数字(DB_VERSION)が、実際のデータベースの版と同じ(SPEC.md 18.3)', async () => {
    database = new AppDatabase(DB_NAME);
    await database.open();
    expect(database.verno).toBe(DB_VERSION);
  });

  describe('版5 → 版6(交代のきっかけと交代の記録。SPEC.md 3.5・17章)', () => {
    /** きっかけの [ID, 名前, 並び順, 非表示] を並び順で */
    async function tagRows(db: AppDatabase) {
      return (await db.switchTags.orderBy('order').toArray()).map((t) => [t.id, t.name, t.order, t.hidden]);
    }
    const defaultTagRows = DEFAULT_SWITCH_TAGS.map((tag, index) => [tag.id, tag.name, index, false]);

    const v5Rows: Record<string, object[]> = {
      alters: [{ ...alterA, reading: '', categoryId: null, age: '', gender: '', identify: '' }],
      tasks: [task],
      records,
      profileSections: [
        {
          id: 'p1',
          alterId: null,
          title: 'みんなに共通の配慮',
          body: '大きな音が苦手',
          includeInPdf: true,
          order: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      meta: [{ key: 'showStats', value: 'on' }],
    };

    it('今のデータは1文字も変わらず、最初のきっかけが入り、記録は空で書き込める', async () => {
      const v5 = openV5();
      await v5.open();
      for (const [name, rows] of Object.entries(v5Rows)) {
        await v5.table(name).bulkAdd(rows);
      }
      v5.close();

      database = new AppDatabase(DB_NAME);
      await database.open();
      expect(database.verno).toBe(DB_VERSION);
      for (const [name, rows] of Object.entries(v5Rows)) {
        expect(await database.table(name).toArray(), name).toEqual(rows);
      }
      expect(await tagRows(database)).toEqual(defaultTagRows);
      expect(await database.switchLogs.count()).toBe(0);

      const log = {
        id: 'sw1',
        alterId: 'alter-a',
        noticedAt: '2026-10-02T12:00:00.000Z',
        switchedAt: null,
        tagIds: [],
        fromAlterId: null,
        fromAlterSource: 'guessed' as const,
      };
      await database.switchLogs.add(log);
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await database.switchLogs.toArray()).toEqual([log]);
      // 開き直しても、きっかけは増えない
      expect(await tagRows(database)).toEqual(defaultTagRows);
    });

    it('版1から開いても、新しく入れても、最初のきっかけが1回だけ入る', async () => {
      const v1 = openV1();
      await v1.table('alters').add(alterA);
      v1.close();
      database = new AppDatabase(DB_NAME);
      expect(await tagRows(database)).toEqual(defaultTagRows);
      database.close();
      await Dexie.delete(DB_NAME);

      database = new AppDatabase(DB_NAME);
      await database.open();
      database.close();
      database = new AppDatabase(DB_NAME);
      expect(await tagRows(database)).toEqual(defaultTagRows);
    });
  });
});
