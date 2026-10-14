// 受診の記録と、話した相手の選択肢(SPEC.md 8.5・8.6)。すべて純粋関数(同じ入力なら同じ結果)。
// 日付の計算は period.ts の関数を通す
import type { Alter, ClinicStaff, ClinicVisit } from './types';
import { isDuplicateName } from './validation';

/**
 * 話した相手の最初の選択肢(SPEC.md 8.6)。
 * ID は決まった値にしておく(古いバックアップを読み込むときにも同じものを作れるように。この ID は変えないこと)
 */
export const DEFAULT_CLINIC_STAFF: readonly { id: string; name: string }[] = [
  { id: 'clinic-staff-doctor', name: '主治医' },
  { id: 'clinic-staff-psychologist', name: '心理士' },
  { id: 'clinic-staff-nurse', name: '看護師' },
  { id: 'clinic-staff-worker', name: 'ワーカー' },
];

/** 最初の選択肢を作る(データベースの版上げ・新規インストール・古いバックアップの読み込みで使う) */
export function buildInitialClinicStaff(createdAt: string): ClinicStaff[] {
  return DEFAULT_CLINIC_STAFF.map(({ id, name }, index) => ({ id, name, order: index, createdAt }));
}

/** 話した相手が「わからない」ときの表示名 */
export const UNKNOWN_STAFF_NAME = 'わからない';

/** 話した相手が見つからないときの表示名(ふつうは起きない。使っている選択肢は削除できないため) */
export const UNKNOWN_STAFF_ITEM_NAME = '(不明な相手)';

/**
 * 同じ名前の選択肢がほかにあるか(SPEC.md 8.6)
 * @param name normalizeName 済みの名前
 * @param exceptId 名前を変えている選択肢自身のID(追加のときは渡さない)
 */
export function isDuplicateStaffName(name: string, staff: readonly ClinicStaff[], exceptId?: string): boolean {
  return isDuplicateName(name, staff, exceptId);
}

/** 受診の記録の新しい順(受診した日の新しい順、同じ日なら記録した日時の新しい順。SPEC.md 8.5) */
export function sortClinicVisits(visits: readonly ClinicVisit[]): ClinicVisit[] {
  return [...visits].sort((a, b) => b.visitedOn.localeCompare(a.visitedOn) || b.createdAt.localeCompare(a.createdAt));
}

/** いちばん新しい受診の日(「前回の受診日」の最初の値。SPEC.md 8.3)。記録がなければ null */
export function latestVisitDate(visits: readonly ClinicVisit[]): string | null {
  return sortClinicVisits(visits)[0]?.visitedOn ?? null;
}

/** 記録の受診した人格(並び順。非表示も名前と色で出す。見つからない人格は出さない)。0人なら「わからない」 */
export function visitAlters(visit: Pick<ClinicVisit, 'alterIds'>, alters: readonly Alter[]): Alter[] {
  return alters.filter((alter) => visit.alterIds.includes(alter.id)).sort((a, b) => a.order - b.order);
}

/** 記録の話した相手の名前(選択肢の並び順)。0人なら「わからない」だけ */
export function visitStaffNames(visit: Pick<ClinicVisit, 'staffIds'>, staff: readonly ClinicStaff[]): string[] {
  if (visit.staffIds.length === 0) {
    return [UNKNOWN_STAFF_NAME];
  }
  const byId = new Map(staff.map((item) => [item.id, item]));
  return [...visit.staffIds]
    .sort((a, b) => (byId.get(a)?.order ?? Infinity) - (byId.get(b)?.order ?? Infinity))
    .map((id) => byId.get(id)?.name ?? UNKNOWN_STAFF_ITEM_NAME);
}

/** 受診の日が正しいか(SPEC.md 8.5)。今日(論理日)より後の日は選べない。正しければ null、だめなら理由 */
export function validateVisitDate(visitedOn: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedOn)) {
    return '受診した日を選んでください';
  }
  return visitedOn > today ? '今日より後の日は選べません' : null;
}

/** 保存する ID:同じ ID を1つにまとめる(何も選んでいなければ「わからない」= 空) */
export function normalizeIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
