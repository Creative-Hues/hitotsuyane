// 話した相手の選択肢の保存・更新・削除(SPEC.md 8.6)
import type { AppDatabase } from './db';
import { isDuplicateStaffName } from '../lib/clinicVisits';
import { nextOrder, reorderSubset } from '../lib/ordering';
import type { ClinicStaff } from '../lib/types';

/** 追加・名前の変更の結果。同じ名前の選択肢があるときは保存しない */
export type SaveStaffResult = { ok: true; staff: ClinicStaff } | { ok: false; reason: 'duplicateName' };

/**
 * 選択肢を一覧の最後に追加する。同じ名前の選択肢があれば追加しない
 * @param name normalizeName 済みの名前
 */
export async function addClinicStaff(database: AppDatabase, name: string, now: Date): Promise<SaveStaffResult> {
  return database.transaction('rw', database.clinicStaff, async () => {
    const all = await database.clinicStaff.toArray();
    if (isDuplicateStaffName(name, all)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    const staff: ClinicStaff = { id: crypto.randomUUID(), name, order: nextOrder(all), createdAt: now.toISOString() };
    await database.clinicStaff.add(staff);
    return { ok: true, staff } as const;
  });
}

/**
 * 選択肢の名前を変える。ほかに同じ名前の選択肢があれば変えない。選択肢が見つからないときは null。
 * 受診の記録は ID で選択肢を指しているので、今までの記録の表示も新しい名前になる
 * @param name normalizeName 済みの名前
 */
export async function renameClinicStaff(
  database: AppDatabase,
  id: string,
  name: string,
): Promise<SaveStaffResult | null> {
  return database.transaction('rw', database.clinicStaff, async () => {
    const all = await database.clinicStaff.toArray();
    const target = all.find((staff) => staff.id === id);
    if (!target) {
      return null;
    }
    if (isDuplicateStaffName(name, all, id)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    await database.clinicStaff.update(id, { name });
    return { ok: true, staff: { ...target, name } } as const;
  });
}

/**
 * 選択肢を並べ替える。
 * @param orderedIds 並べ替えた後の順番に並んだ選択肢のID(対象でない選択肢の順番は変えない)
 */
export async function reorderClinicStaff(database: AppDatabase, orderedIds: readonly string[]): Promise<void> {
  await database.transaction('rw', database.clinicStaff, async () => {
    const changes = reorderSubset(await database.clinicStaff.toArray(), orderedIds);
    for (const change of changes) {
      await database.clinicStaff.update(change.id, { order: change.order });
    }
  });
}

/** その選択肢を使っている受診の記録の件数 */
export async function countClinicStaffUsage(database: AppDatabase, id: string): Promise<number> {
  return database.clinicVisits.filter((visit) => visit.staffIds.includes(id)).count();
}

/** 選択肢を削除する。使っている受診の記録が1件でもあれば削除せず false を返す(削除したら true) */
export async function deleteClinicStaff(database: AppDatabase, id: string): Promise<boolean> {
  return database.transaction('rw', [database.clinicStaff, database.clinicVisits], async () => {
    if ((await countClinicStaffUsage(database, id)) > 0) {
      return false;
    }
    await database.clinicStaff.delete(id);
    return true;
  });
}
