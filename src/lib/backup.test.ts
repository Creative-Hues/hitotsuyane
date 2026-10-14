import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  backupFileName,
  backupReminderText,
  beforeUpdateFileName,
  buildBackup,
  buildRawBackupText,
  isBackupOverdue,
  parseBackup,
  serializeBackup,
  type BackupData,
} from './backup';
import { buildInitialMedicationTimings } from './medicationTimings';
import { buildHomeBoard, buildInitialReactionKinds } from './board';
import { buildInitialClinicStaff } from './clinicVisits';
import { buildInitialSwitchTags } from './switchLog';

function emptyData(): BackupData {
  return {
    alters: [],
    categories: [],
    profileSections: [],
    tasks: [],
    records: [],
    medicationTimings: [],
    medications: [],
    medicationIntakes: [],
    stockLogs: [],
    clinicNotes: [],
    clinicNoteCategories: [],
    clinicNoteComments: [],
    bucketItems: [],
    switchTags: [],
    switchLogs: [],
    bucketAlters: [],
    clinicVisits: [],
    clinicStaff: [],
    // ホームの板はいつもある(ないファイルは足して読み込むため)
    boards: [buildHomeBoard('2026-09-01T00:00:00.000Z')],
    boardThreads: [],
    boardComments: [],
    reactionKinds: [],
    reactions: [],
  };
}

const now = new Date(2026, 8, 28, 21, 30);

/** 書き出した JSON を、手で書き換えられるオブジェクトに戻す */
function exportedJson(data: BackupData = emptyData()): Record<string, unknown> {
  return JSON.parse(serializeBackup(buildBackup(data, now))) as Record<string, unknown>;
}

describe('バックアップのファイル名', () => {
  it('実際の日付を使う(朝5時前でも前日にしない)', () => {
    expect(backupFileName(new Date(2026, 8, 28, 4, 59))).toBe('hitotsuyane-backup-2026-09-28.json');
    expect(backupFileName(new Date(2026, 0, 5, 12, 0))).toBe('hitotsuyane-backup-2026-01-05.json');
    expect(backupFileName(new Date(2026, 0, 5, 12, 0), true)).toBe('hitotsuyane-backup-test-2026-01-05.json');
  });
});

describe('バックアップの読み取り', () => {
  it('書き出したものは、そのまま読み取れる', () => {
    const data = emptyData();
    data.alters.push({
      id: 'alter-a',
      name: '人格A',
      color: '#4a90d9',
      hidden: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      reading: 'じんかくえー',
      categoryId: null,
      age: '',
      gender: '',
      identify: '',
    });
    data.tasks.push({
      id: 'task-1',
      name: '植物に水やり',
      cycle: { type: 'everyNDays', n: 3 },
      careAlterIds: ['alter-a'],
      hidden: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    // careAlterIdsAtCompletion がある記録とない記録
    data.records.push(
      { id: 'r1', taskId: 'task-1', alterId: 'alter-a', completedAt: '2026-09-20T01:00:00.000Z' },
      {
        id: 'r2',
        taskId: 'task-1',
        alterId: null,
        completedAt: '2026-09-23T01:00:00.000Z',
        careAlterIdsAtCompletion: ['alter-a'],
      },
    );
    const result = parseBackup(serializeBackup(buildBackup(data, now)));
    expect(result).toEqual({
      ok: true,
      backup: {
        app: 'minna-todo',
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: now.toISOString(),
        data,
        settings: { altersTerm: '人格' },
      },
    });
  });

  it('JSON でないファイルは読み込まない', () => {
    expect(parseBackup('こんにちは')).toMatchObject({ ok: false });
  });

  it('ほかのアプリのファイルは読み込まない', () => {
    const json = exportedJson();
    json.app = 'other-app';
    expect(parseBackup(JSON.stringify(json))).toEqual({
      ok: false,
      reason: 'このアプリのバックアップファイルではありません',
    });
  });

  it('版番号が合わないファイルは読み込まない', () => {
    const json = exportedJson();
    json.formatVersion = BACKUP_FORMAT_VERSION + 1;
    expect(parseBackup(JSON.stringify(json))).toMatchObject({ ok: false });
  });

  it('テーブルが欠けているファイルは読み込まない', () => {
    const json = exportedJson();
    delete (json.data as Record<string, unknown>).medications;
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '「薬」のデータがありません' });
  });

  it('項目の形が違うデータがあれば読み込まない', () => {
    const json = exportedJson();
    (json.data as Record<string, unknown>).tasks = [
      { id: 't', name: '掃除', cycle: { type: 'everyNDays', n: 1 }, careAlterIds: [], hidden: false, order: 0, createdAt: '' },
    ];
    expect(parseBackup(JSON.stringify(json))).toEqual({
      ok: false,
      reason: '「タスク」の1件目の形が正しくありません',
    });
  });

  it('同じIDのデータが2つあれば読み込まない', () => {
    const json = exportedJson();
    const category = { id: 'c', name: '主人格', order: 0, createdAt: '' };
    (json.data as Record<string, unknown>).categories = [category, category];
    expect(parseBackup(JSON.stringify(json))).toMatchObject({ ok: false });
  });

  it('知らない項目は取り除いて読み込む', () => {
    const json = exportedJson();
    (json.data as Record<string, unknown>).categories = [{ id: 'c', name: '主人格', order: 0, createdAt: '', extra: 1 }];
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.data.categories).toEqual([{ id: 'c', name: '主人格', order: 0, createdAt: '' }]);
  });
});

describe('服薬の時間帯(フェーズ9段階Eで追加。SPEC.md 12章)', () => {
  /** 最初の4つの時間帯を使う薬と服薬記録が入ったデータ */
  function dataWithMedication(): BackupData {
    const data = emptyData();
    data.medicationTimings = buildInitialMedicationTimings('2026-09-01T00:00:00.000Z');
    data.medications.push({
      id: 'med-1',
      name: '薬A',
      kind: 'scheduled',
      timings: ['morning', 'bedtime'],
      dosePerTake: 1,
      remaining: 14,
      status: 'active',
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    data.medicationIntakes.push({
      id: 'i1',
      medicationId: 'med-1',
      alterId: null,
      takenAt: '2026-09-27T12:00:00.000Z',
      timing: 'bedtime',
      deducted: 1,
      reason: '',
    });
    return data;
  }

  it('時間帯の一覧がない古いファイルは、最初の4つが入っているものとして読み込む(作成日時は書き出した日時)', () => {
    const json = exportedJson(dataWithMedication());
    delete (json.data as Record<string, unknown>).medicationTimings;
    const result = parseBackup(JSON.stringify(json));
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.backup.data.medicationTimings).toEqual(buildInitialMedicationTimings(now.toISOString()));
    expect(result.backup.data.medicationTimings.map((t) => [t.id, t.name, t.order, t.hidden])).toEqual([
      ['morning', '朝食後', 0, false],
      ['noon', '昼食後', 1, false],
      ['evening', '夕食後', 2, false],
      ['bedtime', '寝る前', 3, false],
    ]);
    // 薬と服薬記録はそのまま
    expect(result.backup.data.medications).toEqual(dataWithMedication().medications);
    expect(result.backup.data.medicationIntakes).toEqual(dataWithMedication().medicationIntakes);
  });

  it('自分で追加した時間帯も、書き出したとおりに読み込める', () => {
    const data = dataWithMedication();
    data.medicationTimings.push({ id: 'custom-1', name: '朝食前', hidden: true, order: -1, createdAt: '' });
    data.medications[0].timings.push('custom-1');
    const result = parseBackup(serializeBackup(buildBackup(data, now)));
    expect(result.ok && result.backup.data).toEqual(data);
  });

  it('時間帯の一覧があっても配列でなければ読み込まない', () => {
    const json = exportedJson(dataWithMedication());
    (json.data as Record<string, unknown>).medicationTimings = null;
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '「服薬の時間帯」のデータがありません' });
  });

  it('薬が一覧にない時間帯を指しているファイルは読み込まない', () => {
    const data = dataWithMedication();
    data.medications[0].timings.push('unknown');
    expect(parseBackup(serializeBackup(buildBackup(data, now)))).toEqual({
      ok: false,
      reason: '「薬」の1件目の時間帯が見つかりません',
    });
  });

  it('服薬記録が一覧にない時間帯を指しているファイルは読み込まない', () => {
    const data = dataWithMedication();
    data.medicationTimings = data.medicationTimings.filter((t) => t.id !== 'bedtime');
    data.medications[0].timings = ['morning'];
    expect(parseBackup(serializeBackup(buildBackup(data, now)))).toEqual({
      ok: false,
      reason: '「服薬記録」の1件目の時間帯が見つかりません',
    });
  });
});

describe('受診メモのコメント(フェーズ10で追加。SPEC.md 12章)', () => {
  /** メモ1件と、そのコメント1件が入ったデータ */
  function dataWithComment(): BackupData {
    const data = emptyData();
    data.clinicNoteCategories.push({ id: 'nc-1', name: '体調', order: 0, createdAt: '' });
    data.clinicNotes.push({
      id: 'n1',
      alterId: null,
      categoryId: 'nc-1',
      body: '朝起きると頭が痛い',
      createdAt: '2026-09-27T12:00:00.000Z',
      discussedAt: null,
    });
    data.clinicNoteComments.push({
      id: 'cm1',
      noteId: 'n1',
      alterId: null,
      body: '私も同じ',
      createdAt: '2026-09-27T13:00:00.000Z',
    });
    return data;
  }

  it('コメントがない古いファイルは、「コメントなし」として読み込む', () => {
    const json = exportedJson(dataWithComment());
    delete (json.data as Record<string, unknown>).clinicNoteComments;
    const result = parseBackup(JSON.stringify(json));
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.backup.data.clinicNoteComments).toEqual([]);
    expect(result.backup.data.clinicNotes).toEqual(dataWithComment().clinicNotes);
  });

  it('コメントも、書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(dataWithComment(), now)));
    expect(result.ok && result.backup.data).toEqual(dataWithComment());
  });

  it('コメントがあっても配列でなければ読み込まない', () => {
    const json = exportedJson(dataWithComment());
    (json.data as Record<string, unknown>).clinicNoteComments = {};
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '「受診メモのコメント」のデータがありません' });
  });

  it('ないメモを指しているコメントがあるファイルは読み込まない', () => {
    const data = dataWithComment();
    data.clinicNotes = [];
    expect(parseBackup(serializeBackup(buildBackup(data, now)))).toEqual({
      ok: false,
      reason: '「受診メモのコメント」の1件目のメモが見つかりません',
    });
  });
});

describe('バケットの削除済みの印(フェーズ11で追加。SPEC.md 12章)', () => {
  /** 削除していない項目と、削除済みの項目が入ったデータ */
  function dataWithBucket(): BackupData {
    const data = emptyData();
    data.bucketItems.push(
      {
        id: 'b1',
        alterId: 'alter-a',
        body: '海を見に行く',
        order: 0,
        createdAt: '2026-09-01T00:00:00.000Z',
        achievedAt: null,
        helperAlterIds: [],
      },
      {
        id: 'b2',
        alterId: 'alter-a',
        body: '山に登る',
        order: 1,
        createdAt: '2026-09-01T00:00:00.000Z',
        achievedAt: '2026-09-20T00:00:00.000Z',
        helperAlterIds: ['alter-b'],
        deletedAt: '2026-09-27T00:00:00.000Z',
      },
    );
    return data;
  }

  it('削除済みの印も、書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(dataWithBucket(), now)));
    expect(result.ok && result.backup.data).toEqual(dataWithBucket());
  });

  it('削除済みの印がない古いファイルは、「削除していない」として読み込む', () => {
    const json = exportedJson(dataWithBucket());
    const items = (json.data as { bucketItems: Record<string, unknown>[] }).bucketItems;
    for (const item of items) {
      delete item.deletedAt;
    }
    const result = parseBackup(JSON.stringify(json));
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.backup.data.bucketItems.map((item) => item.deletedAt)).toEqual([undefined, undefined]);
    expect('deletedAt' in result.backup.data.bucketItems[1]).toBe(false);
  });

  it('削除済みの印が文字でなければ読み込まない', () => {
    const json = exportedJson(dataWithBucket());
    (json.data as { bucketItems: Record<string, unknown>[] }).bucketItems[0].deletedAt = 123;
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '「バケット」の1件目の形が正しくありません' });
  });
});

describe('人格情報(フェーズ12。SPEC.md 12章)', () => {
  /** 人格1人と、その見出し・「全体のこと」の見出しが入ったデータ */
  function dataWithProfile(): BackupData {
    const data = emptyData();
    data.alters.push({
      id: 'alter-a',
      name: '人格A',
      color: '#4a90d9',
      hidden: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      reading: '',
      // ない区分を指していても読み込む(画面では「未分類」に出す)
      categoryId: 'deleted-category',
      age: '',
      gender: '',
      identify: '',
    });
    data.profileSections.push(
      { id: 'p1', alterId: 'alter-a', title: '特徴', body: '明るい', includeInPdf: true, order: 0, createdAt: '' },
      { id: 'p2', alterId: null, title: 'みんなに共通の配慮', body: '', includeInPdf: true, order: 0, createdAt: '' },
    );
    return data;
  }

  it('見出しと、ない区分を指す人格も、書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(dataWithProfile(), now)));
    expect(result.ok && result.backup.data).toEqual(dataWithProfile());
  });

  it('ない人格を指している見出しがあるファイルは読み込まない', () => {
    const data = dataWithProfile();
    data.alters = [];
    expect(parseBackup(serializeBackup(buildBackup(data, now)))).toEqual({
      ok: false,
      reason: '「プロフィール」の1件目の人格が見つかりません',
    });
  });
});

describe('書き出しのすすめ', () => {
  it('一度も書き出していなければすすめる', () => {
    expect(isBackupOverdue(null, now)).toBe(true);
    expect(backupReminderText(null, now)).toContain('まだバックアップを書き出していません');
  });

  it('30日目(論理日)からすすめる', () => {
    const last = new Date(2026, 7, 29, 21, 0).toISOString(); // 8/29
    expect(isBackupOverdue(last, new Date(2026, 8, 28, 4, 59))).toBe(false); // 論理日は 9/27 → 29日
    expect(isBackupOverdue(last, new Date(2026, 8, 28, 5, 0))).toBe(true); // 9/28 → 30日
    expect(backupReminderText(last, new Date(2026, 8, 28, 5, 0))).toContain('30日以上');
    expect(backupReminderText(last, new Date(2026, 8, 28, 4, 59))).toBeNull();
  });
});

describe('交代の記録のバックアップ(SPEC.md 12章・17章)', () => {
  function dataWithSwitches(): BackupData {
    const data = emptyData();
    data.switchTags.push(...buildInitialSwitchTags('2026-09-01T00:00:00.000Z'), {
      id: 'tag-custom',
      name: '人混み',
      hidden: true,
      order: 6,
      createdAt: '2026-09-02T00:00:00.000Z',
    });
    data.switchLogs.push(
      {
        id: 'sw1',
        alterId: 'alter-a',
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
        // ファイルの中に人格がないので、交代前は「わからない」を選んだ記録にする
        fromAlterId: null,
        fromAlterSource: 'confirmed',
      },
    );
    return data;
  }

  it('きっかけと記録も、書き出したとおりに読み込める', () => {
    const data = dataWithSwitches();
    const result = parseBackup(serializeBackup(buildBackup(data, now)));
    expect(result.ok && result.backup.data).toEqual(data);
  });

  it('きっかけ・記録がない古いファイルは、最初のきっかけと「記録なし」として読み込む(作成日時は書き出した日時)', () => {
    const json = exportedJson();
    delete (json.data as Record<string, unknown>).switchTags;
    delete (json.data as Record<string, unknown>).switchLogs;
    const result = parseBackup(JSON.stringify(json));
    if (!result.ok) {
      throw new Error(result.reason);
    }
    expect(result.backup.data.switchTags).toEqual(buildInitialSwitchTags(now.toISOString()));
    expect(result.backup.data.switchLogs).toEqual([]);
  });

  it('ないきっかけを指している記録があるファイルは読み込まない', () => {
    const data = dataWithSwitches();
    data.switchLogs[1].tagIds = ['no-such-tag'];
    const result = parseBackup(serializeBackup(buildBackup(data, now)));
    expect(result).toEqual({ ok: false, reason: '「交代の記録」の2件目のきっかけが見つかりません' });
  });

  it('記録の形が違えば読み込まない', () => {
    const json = exportedJson(dataWithSwitches());
    (json.data as { switchLogs: Record<string, unknown>[] }).switchLogs[0].switchedAt = 0;
    expect(parseBackup(JSON.stringify(json))).toEqual({
      ok: false,
      reason: '「交代の記録」の1件目の形が正しくありません',
    });
  });
});

describe('呼び方のバックアップ(SPEC.md 12章・14章③)', () => {
  it('呼び方も書き出され、そのまま読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(emptyData(), now, { altersTerm: 'メンバー' })));
    expect(result.ok && result.backup.settings).toEqual({ altersTerm: 'メンバー' });
  });

  it('呼び方が入っていない古いファイルは、「人格」として読み込む', () => {
    const json = exportedJson();
    delete json.settings;
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.settings).toEqual({ altersTerm: '人格' });
  });

  it('呼び方が正しくなければ読み込まない', () => {
    const json = exportedJson();
    json.settings = { altersTerm: '' };
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '呼び方の設定が正しくありません' });
    json.settings = 'メンバー';
    expect(parseBackup(JSON.stringify(json))).toEqual({ ok: false, reason: '呼び方の設定が正しくありません' });
  });
});

describe('2026年10月のブラッシュアップ フェーズ2で足したデータ(SPEC.md 12章)', () => {
  function alterRow(id: string, order: number, hidden: boolean) {
    return {
      id,
      name: id,
      color: '#4a90d9',
      hidden,
      order,
      createdAt: '2026-09-01T00:00:00.000Z',
      reading: '',
      categoryId: null,
      age: '',
      gender: '',
      identify: '',
    };
  }

  function data(): BackupData {
    const result = emptyData();
    result.alters.push(alterRow('alter-a', 0, false), alterRow('alter-b', 1, false), alterRow('alter-h', 2, true));
    result.tasks.push({
      id: 'task-none',
      name: '粗大ごみの申し込み',
      cycle: { type: 'none' },
      careAlterIds: [],
      hidden: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    result.switchLogs.push(
      {
        id: 'sw1',
        alterId: 'alter-a',
        noticedAt: '2026-10-01T01:00:00.000Z',
        switchedAt: '2026-10-01T01:00:00.000Z',
        tagIds: [],
        fromAlterId: null,
        fromAlterSource: 'guessed',
      },
      {
        id: 'sw2',
        alterId: 'alter-b',
        noticedAt: '2026-10-01T02:00:00.000Z',
        switchedAt: null,
        tagIds: [],
        fromAlterId: 'alter-h',
        fromAlterSource: 'confirmed',
      },
    );
    result.bucketAlters.push(
      { alterId: 'alter-a', hidden: false, addedAt: '2026-10-14T00:00:00.000Z' },
      { alterId: 'alter-b', hidden: true, addedAt: '2026-10-14T00:00:00.000Z' },
    );
    return result;
  }

  it('期限なしのタスク・交代前の人格・バケットに出す人格も、書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(data(), now)));
    expect(result.ok && result.backup.data).toEqual(data());
  });

  it('バケットに出す人格がない古いファイルは、非表示でない人格全員が入っているものとして読み込む', () => {
    const json = exportedJson(data());
    delete (json.data as Record<string, unknown>).bucketAlters;
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.data.bucketAlters).toEqual([
      { alterId: 'alter-a', hidden: false, addedAt: now.toISOString() },
      { alterId: 'alter-b', hidden: false, addedAt: now.toISOString() },
    ]);
  });

  it('交代前の人格がない記録は、時刻順に推測して「推測」として読み込む', () => {
    const json = exportedJson(data());
    const logs = (json.data as { switchLogs: Record<string, unknown>[] }).switchLogs;
    for (const log of logs) {
      delete log.fromAlterId;
      delete log.fromAlterSource;
    }
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.data.switchLogs.map((log) => [log.id, log.fromAlterId, log.fromAlterSource])).toEqual([
      ['sw1', null, 'guessed'],
      ['sw2', 'alter-a', 'guessed'],
    ]);
  });

  it('交代前の人格が、ない人格を指しているファイルは読み込まない', () => {
    const broken = data();
    broken.switchLogs[1].fromAlterId = 'deleted';
    expect(parseBackup(serializeBackup(buildBackup(broken, now)))).toEqual({
      ok: false,
      reason: '「交代の記録」の2件目の交代前の人格が見つかりません',
    });
  });

  it('バケットに出す人格が、ない人格を指しているファイルは読み込まない', () => {
    const broken = data();
    broken.bucketAlters.push({ alterId: 'deleted', hidden: false, addedAt: '' });
    expect(parseBackup(serializeBackup(buildBackup(broken, now)))).toEqual({
      ok: false,
      reason: '「バケットに出す人格」の3件目の人格が見つかりません',
    });
  });

  it('同じ人格がバケットに出す人格に2つあるファイルは読み込まない', () => {
    const broken = data();
    broken.bucketAlters.push({ ...broken.bucketAlters[0] });
    expect(parseBackup(serializeBackup(buildBackup(broken, now)))).toEqual({
      ok: false,
      reason: '「バケットに出す人格」に同じIDのデータが2つあります',
    });
  });
});

describe('更新前のデータ(SPEC.md 12章・18.4)', () => {
  it('ファイル名は保存した日(実際の日付)。テスト版は名前で見分けられる', () => {
    expect(beforeUpdateFileName(new Date(2026, 9, 14, 4, 0))).toBe('hitotsuyane-backup-before-update-2026-10-14.json');
    expect(beforeUpdateFileName(new Date(2026, 9, 14, 4, 0), true)).toBe(
      'hitotsuyane-backup-test-before-update-2026-10-14.json',
    );
  });

  it('古い版のテーブルをそのまま入れた文字列は、古い形のファイルとして読み込める', () => {
    const tables = Object.fromEntries(Object.entries(emptyData()).filter(([name]) => name !== 'bucketAlters'));
    const text = buildRawBackupText(tables, 'メンバー', now);
    const result = parseBackup(text);
    expect(result.ok && result.backup.settings).toEqual({ altersTerm: 'メンバー' });
    expect(result.ok && result.backup.exportedAt).toBe(now.toISOString());
    expect(result.ok && result.backup.data).toEqual(emptyData());
  });

  it('呼び方が保存されていなければ「人格」として入れる', () => {
    const result = parseBackup(buildRawBackupText(emptyData() as unknown as Record<string, unknown[]>, null, now));
    expect(result.ok && result.backup.settings).toEqual({ altersTerm: '人格' });
  });
});

describe('受診の記録と、話した相手の選択肢(SPEC.md 8.5・8.6・12章)', () => {
  function data(): BackupData {
    const result = emptyData();
    result.alters.push({
      id: 'alter-a',
      name: '人格A',
      color: '#4a90d9',
      hidden: false,
      order: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      reading: '',
      categoryId: null,
      age: '',
      gender: '',
      identify: '',
    });
    result.clinicStaff.push(...buildInitialClinicStaff('2026-09-01T00:00:00.000Z'));
    result.clinicVisits.push(
      {
        id: 'v1',
        visitedOn: '2026-10-01',
        alterIds: ['alter-a'],
        staffIds: ['clinic-staff-doctor', 'clinic-staff-nurse'],
        createdAt: '2026-10-01T05:00:00.000Z',
      },
      // 「わからない」は空
      { id: 'v2', visitedOn: '2026-10-08', alterIds: [], staffIds: [], createdAt: '2026-10-08T05:00:00.000Z' },
    );
    return result;
  }

  it('書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(data(), now)));
    expect(result.ok && result.backup.data).toEqual(data());
  });

  it('受診の記録がない古いファイルは「記録なし」、選択肢がないファイルは最初の4つとして読み込む', () => {
    const json = exportedJson(data());
    delete (json.data as Record<string, unknown>).clinicVisits;
    delete (json.data as Record<string, unknown>).clinicStaff;
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.data.clinicVisits).toEqual([]);
    expect(result.ok && result.backup.data.clinicStaff).toEqual(buildInitialClinicStaff(now.toISOString()));
  });

  it('ない人格・ない話した相手を指す受診の記録があるファイルは読み込まない', () => {
    const noAlter = data();
    noAlter.clinicVisits[1].alterIds = ['deleted'];
    expect(parseBackup(serializeBackup(buildBackup(noAlter, now)))).toEqual({
      ok: false,
      reason: '「受診の記録」の2件目の人格が見つかりません',
    });
    const noStaff = data();
    noStaff.clinicVisits[0].staffIds = ['deleted'];
    expect(parseBackup(serializeBackup(buildBackup(noStaff, now)))).toEqual({
      ok: false,
      reason: '「受診の記録」の1件目の話した相手が見つかりません',
    });
  });
});

describe('掲示板(SPEC.md 12章・22章)', () => {
  const createdAt = '2026-10-01T00:00:00.000Z';
  function data(): BackupData {
    const result = emptyData();
    result.alters.push({
      id: 'alter-a',
      name: '人格A',
      color: '#4a90d9',
      hidden: false,
      order: 0,
      createdAt,
      reading: '',
      categoryId: null,
      age: '',
      gender: '',
      identify: '',
    });
    result.boards.push({ id: 'board-2', name: '家のこと', order: 1, createdAt });
    result.boardThreads.push({ id: 'th1', boardId: 'board-2', alterId: 'alter-a', title: '週末', body: '出かける?', createdAt, editedAt: null });
    result.boardComments.push({ id: 'bc1', threadId: 'th1', alterId: null, body: 'いいね', createdAt, editedAt: createdAt });
    result.reactionKinds.push(...buildInitialReactionKinds(createdAt));
    result.reactions.push(
      { id: 're1', targetType: 'thread', targetId: 'th1', kindId: 'reaction-read', alterId: 'alter-a', createdAt },
      { id: 're2', targetType: 'comment', targetId: 'bc1', kindId: 'reaction-agree', alterId: 'alter-a', createdAt },
    );
    return result;
  }

  it('書き出したとおりに読み込める', () => {
    const result = parseBackup(serializeBackup(buildBackup(data(), now)));
    expect(result.ok && result.backup.data).toEqual(data());
  });

  it('掲示板がない古いファイルは、ホームの板だけ・書き込みなし・最初のリアクションとして読み込む', () => {
    const json = exportedJson(data());
    for (const name of ['boards', 'boardThreads', 'boardComments', 'reactionKinds', 'reactions']) {
      delete (json.data as Record<string, unknown>)[name];
    }
    const result = parseBackup(JSON.stringify(json));
    expect(result.ok && result.backup.data.boards).toEqual([buildHomeBoard(now.toISOString())]);
    expect(result.ok && result.backup.data.boardThreads).toEqual([]);
    expect(result.ok && result.backup.data.reactions).toEqual([]);
    expect(result.ok && result.backup.data.reactionKinds).toEqual(buildInitialReactionKinds(now.toISOString()));
  });

  it('ホームの板がないファイルは、ホームの板を足して読み込む', () => {
    const noHome = data();
    noHome.boards = noHome.boards.filter((board) => board.id !== 'board-home');
    const result = parseBackup(serializeBackup(buildBackup(noHome, now)));
    expect(result.ok && result.backup.data.boards.map((board) => board.id)).toEqual(['board-home', 'board-2']);
  });

  it('ないものを指す書き込み・リアクションがあるファイルは読み込まない', () => {
    const noBoard = data();
    noBoard.boardThreads[0].boardId = 'deleted';
    expect(parseBackup(serializeBackup(buildBackup(noBoard, now)))).toEqual({
      ok: false,
      reason: '「掲示板のスレッド」の1件目の板か人格が見つかりません',
    });
    const noThread = data();
    noThread.boardComments[0].threadId = 'deleted';
    expect(parseBackup(serializeBackup(buildBackup(noThread, now)))).toEqual({
      ok: false,
      reason: '「掲示板のコメント」の1件目のスレッドか人格が見つかりません',
    });
    const noKind = data();
    noKind.reactions[1].kindId = 'deleted';
    expect(parseBackup(serializeBackup(buildBackup(noKind, now)))).toEqual({
      ok: false,
      reason: '「リアクション」の2件目の書き込み・リアクションの選択肢・人格のどれかが見つかりません',
    });
    const wrongTarget = data();
    // コメントの ID を、スレッドへのリアクションとして指している
    wrongTarget.reactions[0].targetId = 'bc1';
    expect(parseBackup(serializeBackup(buildBackup(wrongTarget, now))).ok).toBe(false);
  });
});
