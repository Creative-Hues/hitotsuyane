// テスト用の疑似データベース(fake-indexeddb)を使う
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { addClinicStaff, countClinicStaffUsage, deleteClinicStaff, renameClinicStaff, reorderClinicStaff } from './clinicStaffRepo';
import { addClinicVisit, deleteClinicVisit, updateClinicVisit } from './clinicVisitRepo';

describe('受診の記録と、話した相手の選択肢の保存(SPEC.md 8.5・8.6)', () => {
  let database: AppDatabase;
  const now = new Date(2026, 9, 14, 12, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-clinic-visit');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('受診の記録を足す・直す・消す。同じ ID は1つにまとめ、記録した日時は変えない', async () => {
    const visit = await addClinicVisit(
      database,
      { visitedOn: '2026-10-14', alterIds: ['a', 'a', 'b'], staffIds: ['clinic-staff-doctor'] },
      now,
    );
    expect(visit).toMatchObject({ alterIds: ['a', 'b'], createdAt: now.toISOString() });
    await updateClinicVisit(database, visit.id, { visitedOn: '2026-10-13', alterIds: [], staffIds: [] });
    expect(await database.clinicVisits.get(visit.id)).toEqual({
      id: visit.id,
      visitedOn: '2026-10-13',
      alterIds: [],
      staffIds: [],
      createdAt: now.toISOString(),
    });
    await deleteClinicVisit(database, visit.id);
    expect(await database.clinicVisits.count()).toBe(0);
  });

  it('選択肢は最後に追加でき、同じ名前は保存できない。名前を変えられる', async () => {
    const added = await addClinicStaff(database, '薬剤師', now);
    expect(added.ok && added.staff.order).toBe(4);
    expect(await addClinicStaff(database, '主治医', now)).toEqual({ ok: false, reason: 'duplicateName' });
    expect(await renameClinicStaff(database, 'clinic-staff-doctor', '心理士')).toEqual({ ok: false, reason: 'duplicateName' });
    await renameClinicStaff(database, 'clinic-staff-doctor', '先生');
    expect((await database.clinicStaff.get('clinic-staff-doctor'))?.name).toBe('先生');
  });

  it('並べ替えた順番で保存される', async () => {
    await reorderClinicStaff(database, ['clinic-staff-worker', 'clinic-staff-doctor']);
    const ordered = (await database.clinicStaff.orderBy('order').toArray()).map((s) => s.id);
    expect(ordered.indexOf('clinic-staff-worker')).toBeLessThan(ordered.indexOf('clinic-staff-doctor'));
  });

  it('使っている受診の記録がある選択肢は削除できず、記録を消せば削除できる', async () => {
    const visit = await addClinicVisit(database, { visitedOn: '2026-10-14', alterIds: [], staffIds: ['clinic-staff-nurse'] }, now);
    expect(await countClinicStaffUsage(database, 'clinic-staff-nurse')).toBe(1);
    expect(await deleteClinicStaff(database, 'clinic-staff-nurse')).toBe(false);
    await deleteClinicVisit(database, visit.id);
    expect(await deleteClinicStaff(database, 'clinic-staff-nurse')).toBe(true);
    expect(await database.clinicStaff.get('clinic-staff-nurse')).toBeUndefined();
  });
});
