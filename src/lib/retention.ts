// 記録の保持期間(SPEC.md 3.3・3.4・7.2・7.6)。
// 完了記録・服薬記録・在庫の履歴は1年間保持し、それより古いものを削除する。
// ただし、期限なしのタスクが残っている間は、そのタスクの完了記録は削除しない(SPEC.md 3.3)。
import type { AppDatabase } from '../db/db';
import type { Task } from './types';

/**
 * 保持期間の境界を求める(ちょうど1年前の同時刻)。
 * この時刻より前の記録が削除対象。境界ちょうどの記録は残す。
 */
export function getRetentionCutoff(now: Date): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return cutoff;
}

/** 1年の削除から外す完了記録のタスク(残っている期限なしのタスク。非表示も含む)のID */
export function keptTaskIds(tasks: readonly Pick<Task, 'id' | 'cycle'>[]): Set<string> {
  return new Set(tasks.filter((task) => task.cycle.type === 'none').map((task) => task.id));
}

/** 1年より古い完了記録を削除する(期限なしのタスクの記録は残す) */
async function deleteExpiredCompletionRecords(database: AppDatabase, cutoffIso: string): Promise<number> {
  return database.transaction('rw', [database.tasks, database.records], async () => {
    const kept = keptTaskIds(await database.tasks.toArray());
    return database.records
      .where('completedAt')
      .below(cutoffIso)
      .filter((record) => !kept.has(record.taskId))
      .delete();
  });
}

/**
 * 1年より古い完了記録・服薬記録・在庫の履歴を削除し、削除した件数の合計を返す。
 * 日時は toISOString() 形式なので、文字列の大小比較で時刻の前後を判定できる。
 */
export async function deleteExpiredRecords(database: AppDatabase, now: Date): Promise<number> {
  const cutoffIso = getRetentionCutoff(now).toISOString();
  const counts = await Promise.all([
    deleteExpiredCompletionRecords(database, cutoffIso),
    database.medicationIntakes.where('takenAt').below(cutoffIso).delete(),
    database.stockLogs.where('at').below(cutoffIso).delete(),
  ]);
  return counts.reduce((sum, count) => sum + count, 0);
}
