// バックアップ用のデータの読み出し・置き換え(SPEC.md 12章)
import type { AppDatabase } from './db';
import type { BackupData, BackupSettings } from '../lib/backup';
import { latestPostAt } from '../lib/board';
import { getAltersTerm, setAltersTerm } from './settingsRepo';

/** バックアップの対象のテーブル(端末の設定 meta は入れない) */
function backupTables(database: AppDatabase) {
  return [
    database.alters,
    database.categories,
    database.profileSections,
    database.tasks,
    database.records,
    database.medicationTimings,
    database.medications,
    database.medicationIntakes,
    database.stockLogs,
    database.clinicNotes,
    database.clinicNoteCategories,
    database.clinicNoteComments,
    database.bucketItems,
    database.switchTags,
    database.switchLogs,
    database.bucketAlters,
    database.clinicVisits,
    database.clinicStaff,
    database.boards,
    database.boardThreads,
    database.boardComments,
    database.reactionKinds,
    database.reactions,
  ];
}

/** バックアップに入れるすべてのデータを、同じ時点のものとして読み出す */
export async function readAllData(database: AppDatabase): Promise<BackupData> {
  return database.transaction('r', backupTables(database), async () => ({
    alters: await database.alters.toArray(),
    categories: await database.categories.toArray(),
    profileSections: await database.profileSections.toArray(),
    tasks: await database.tasks.toArray(),
    records: await database.records.toArray(),
    medicationTimings: await database.medicationTimings.toArray(),
    medications: await database.medications.toArray(),
    medicationIntakes: await database.medicationIntakes.toArray(),
    stockLogs: await database.stockLogs.toArray(),
    clinicNotes: await database.clinicNotes.toArray(),
    clinicNoteCategories: await database.clinicNoteCategories.toArray(),
    clinicNoteComments: await database.clinicNoteComments.toArray(),
    bucketItems: await database.bucketItems.toArray(),
    switchTags: await database.switchTags.toArray(),
    switchLogs: await database.switchLogs.toArray(),
    bucketAlters: await database.bucketAlters.toArray(),
    clinicVisits: await database.clinicVisits.toArray(),
    clinicStaff: await database.clinicStaff.toArray(),
    boards: await database.boards.toArray(),
    boardThreads: await database.boardThreads.toArray(),
    boardComments: await database.boardComments.toArray(),
    reactionKinds: await database.reactionKinds.toArray(),
    reactions: await database.reactions.toArray(),
  }));
}

/** バックアップに入れる端末の設定(呼び方)を読む(SPEC.md 14章③) */
export async function readBackupSettings(database: AppDatabase): Promise<BackupSettings> {
  return { altersTerm: await getAltersTerm(database) };
}

/**
 * 今のデータをすべて消し、バックアップの中身に置き換える。
 * 1つのトランザクション(まとめて1回の処理)で行うので、途中で失敗したら何も変わらない。
 * 端末の設定のうち、最後に書き出した日時・集計の表示は置き換えない。
 * 掲示板の「見た」の記録は、読み込んだすべての書き込みを「見た」にする(新着を出さない。SPEC.md 12章・22.4)。
 * settings を渡したときは、呼び方も一緒に置き換える
 */
export async function replaceAllData(database: AppDatabase, data: BackupData, settings?: BackupSettings): Promise<void> {
  await database.transaction('rw', [...backupTables(database), database.meta, database.boardSeen], async () => {
    if (settings) {
      await setAltersTerm(database, settings.altersTerm);
    }
    await Promise.all(backupTables(database).map((table) => table.clear()));
    await database.alters.bulkAdd(data.alters);
    await database.categories.bulkAdd(data.categories);
    await database.profileSections.bulkAdd(data.profileSections);
    await database.tasks.bulkAdd(data.tasks);
    await database.records.bulkAdd(data.records);
    await database.medicationTimings.bulkAdd(data.medicationTimings);
    await database.medications.bulkAdd(data.medications);
    await database.medicationIntakes.bulkAdd(data.medicationIntakes);
    await database.stockLogs.bulkAdd(data.stockLogs);
    await database.clinicNotes.bulkAdd(data.clinicNotes);
    await database.clinicNoteCategories.bulkAdd(data.clinicNoteCategories);
    await database.clinicNoteComments.bulkAdd(data.clinicNoteComments);
    await database.bucketItems.bulkAdd(data.bucketItems);
    await database.switchTags.bulkAdd(data.switchTags);
    await database.switchLogs.bulkAdd(data.switchLogs);
    await database.bucketAlters.bulkAdd(data.bucketAlters);
    await database.clinicVisits.bulkAdd(data.clinicVisits);
    await database.clinicStaff.bulkAdd(data.clinicStaff);
    await database.boards.bulkAdd(data.boards);
    await database.boardThreads.bulkAdd(data.boardThreads);
    await database.boardComments.bulkAdd(data.boardComments);
    await database.reactionKinds.bulkAdd(data.reactionKinds);
    await database.reactions.bulkAdd(data.reactions);
    await database.boardSeen.clear();
    await database.boardSeen.bulkAdd(
      data.boardThreads.map((thread) => ({ threadId: thread.id, seenPostAt: latestPostAt(thread, data.boardComments) })),
    );
  });
}

/** 最後にバックアップを書き出した日時(ISO形式)。一度もなければ null */
export async function getLastExportedAt(database: AppDatabase): Promise<string | null> {
  return (await database.meta.get('lastBackupExportedAt'))?.value ?? null;
}

export async function setLastExportedAt(database: AppDatabase, now: Date): Promise<void> {
  await database.meta.put({ key: 'lastBackupExportedAt', value: now.toISOString() });
}
