// 受診の記録の保存・更新・削除(SPEC.md 8.5)
import type { AppDatabase } from './db';
import { normalizeIds } from '../lib/clinicVisits';
import type { ClinicVisit } from '../lib/types';

/** 受診の記録の入力内容(日付はチェック済みのもの。人格・話した相手は、空なら「わからない」) */
export interface ClinicVisitInput {
  visitedOn: string;
  alterIds: readonly string[];
  staffIds: readonly string[];
}

/** 受診の記録を足して、足した記録を返す */
export async function addClinicVisit(database: AppDatabase, input: ClinicVisitInput, now: Date): Promise<ClinicVisit> {
  const visit: ClinicVisit = {
    id: crypto.randomUUID(),
    visitedOn: input.visitedOn,
    alterIds: normalizeIds(input.alterIds),
    staffIds: normalizeIds(input.staffIds),
    createdAt: now.toISOString(),
  };
  await database.clinicVisits.add(visit);
  return visit;
}

/** 受診した日・人格・話した相手を直す(記録した日時は変えない) */
export async function updateClinicVisit(database: AppDatabase, id: string, input: ClinicVisitInput): Promise<void> {
  await database.clinicVisits.update(id, {
    visitedOn: input.visitedOn,
    alterIds: normalizeIds(input.alterIds),
    staffIds: normalizeIds(input.staffIds),
  });
}

export async function deleteClinicVisit(database: AppDatabase, id: string): Promise<void> {
  await database.clinicVisits.delete(id);
}
