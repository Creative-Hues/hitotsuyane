// 人格の保存・更新・削除(削除は記録がない人格だけ。SPEC.md 3.1)
import type { AppDatabase } from './db';
import { buildDefaultProfileSections, EMPTY_ALTER_PROFILE } from './initialData';
import { nextOrder, reorderSubset } from '../lib/ordering';
import type { Alter } from '../lib/types';

/** 人格の入力内容(名前は normalizeName 済みのもの) */
export interface AlterInput {
  name: string;
  color: string;
  /** 区分のID。選ばないときは null(「未分類」) */
  categoryId: string | null;
}

/** 基本情報のうち、基本情報の編集画面で直す項目(区分は人格の編集画面で選ぶ。SPEC.md 10.3) */
export type AlterBasicInfoInput = Pick<Alter, 'reading' | 'age' | 'gender' | 'identify'>;

/** 人格を一覧の最後に追加し、基本の見出しも入れて、追加した人格を返す(SPEC.md 10.4) */
export async function addAlter(database: AppDatabase, input: AlterInput, now: Date): Promise<Alter> {
  return database.transaction('rw', [database.alters, database.profileSections], async () => {
    const all = await database.alters.toArray();
    const alter: Alter = {
      id: crypto.randomUUID(),
      name: input.name,
      color: input.color,
      hidden: false,
      order: nextOrder(all),
      createdAt: now.toISOString(),
      ...EMPTY_ALTER_PROFILE,
      categoryId: input.categoryId,
    };
    await database.alters.add(alter);
    await database.profileSections.bulkAdd(buildDefaultProfileSections(alter.id, now, () => crypto.randomUUID()));
    return alter;
  });
}

/** 名前・色・区分を変更する */
export async function updateAlter(database: AppDatabase, id: string, input: AlterInput): Promise<void> {
  await database.alters.update(id, { name: input.name, color: input.color, categoryId: input.categoryId });
}

/** 基本情報(読み・体感年齢・性別(感)・見分け方)を変更する */
export async function updateAlterBasicInfo(
  database: AppDatabase,
  id: string,
  input: AlterBasicInfoInput,
): Promise<void> {
  await database.alters.update(id, {
    reading: input.reading,
    age: input.age,
    gender: input.gender,
    identify: input.identify,
  });
}

/** 非表示/再表示を切り替える */
export async function setAlterHidden(database: AppDatabase, id: string, hidden: boolean): Promise<void> {
  await database.alters.update(id, { hidden });
}

/**
 * 人格を並べ替える。
 * @param orderedIds 並べ替えた後の順番に並んだ人格のID(対象でない人格の順番は変えない)
 */
export async function reorderAlters(database: AppDatabase, orderedIds: readonly string[]): Promise<void> {
  await database.transaction('rw', database.alters, async () => {
    const changes = reorderSubset(await database.alters.toArray(), orderedIds);
    for (const change of changes) {
      await database.alters.update(change.id, { order: change.order });
    }
  });
}

/**
 * その人格の完了記録・服薬記録・受診メモ・コメント・バケット・交代の記録の件数の合計(SPEC.md 3.1)。
 * バケットは、その人格のリストの項目(削除済みも含む)と、協力者に入っている項目を数える。
 * 「バケットに出す人格」に入っているだけなら数えない。
 * 交代の記録は、交代した人格と、交代前の人格の両方を数える。受診の記録は、受診した人格を数える。
 * 掲示板は、スレッド・コメントを書いた人格と、リアクションを付けた人格を数える。
 * 全件を見て数える(記録は1年分だけ、メモ・コメント・バケットも多くはならないため)
 */
export async function countAlterRecords(database: AppDatabase, id: string): Promise<number> {
  const counts = await Promise.all([
    database.records.filter((record) => record.alterId === id).count(),
    database.medicationIntakes.filter((intake) => intake.alterId === id).count(),
    database.clinicNotes.filter((note) => note.alterId === id).count(),
    database.clinicNoteComments.filter((comment) => comment.alterId === id).count(),
    database.bucketItems.filter((item) => item.alterId === id || item.helperAlterIds.includes(id)).count(),
    database.switchLogs.filter((log) => log.alterId === id || log.fromAlterId === id).count(),
    database.clinicVisits.filter((visit) => visit.alterIds.includes(id)).count(),
    database.boardThreads.filter((thread) => thread.alterId === id).count(),
    database.boardComments.filter((comment) => comment.alterId === id).count(),
    database.reactions.where('alterId').equals(id).count(),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}

/** その人格の見出しのうち、中身が空でないものの件数(削除の確認文に使う。SPEC.md 3.1) */
export async function countFilledProfileSections(database: AppDatabase, id: string): Promise<number> {
  return database.profileSections
    .where('alterId')
    .equals(id)
    .filter((section) => section.body.trim() !== '')
    .count();
}

/**
 * 人格を削除し、すべてのタスクの「気にしている人格」と「バケットに出す人格」からも外す。その人格の見出しも消す。
 * 完了記録・服薬記録・受診メモ・コメント・バケット・交代の記録のどれかが1件でもある人格は削除せず false を返す
 * (削除したら true。SPEC.md 3.1)
 */
export async function deleteAlter(database: AppDatabase, id: string): Promise<boolean> {
  const tables = [
    database.alters,
    database.tasks,
    database.records,
    database.medicationIntakes,
    database.clinicNotes,
    database.clinicNoteComments,
    database.bucketItems,
    database.switchLogs,
    database.profileSections,
    database.bucketAlters,
    database.clinicVisits,
    database.boardThreads,
    database.boardComments,
    database.reactions,
  ];
  return database.transaction('rw', tables, async () => {
    if ((await countAlterRecords(database, id)) > 0) {
      return false;
    }
    await database.alters.delete(id);
    await database.profileSections.where('alterId').equals(id).delete();
    await database.bucketAlters.delete(id);
    const tasks = await database.tasks.filter((task) => task.careAlterIds.includes(id)).toArray();
    for (const task of tasks) {
      await database.tasks.update(task.id, {
        careAlterIds: task.careAlterIds.filter((alterId) => alterId !== id),
      });
    }
    return true;
  });
}
