import { describe, expect, it } from 'vitest';
import {
  buildInitialClinicStaff,
  isDuplicateStaffName,
  latestVisitDate,
  sortClinicVisits,
  validateVisitDate,
  visitAlters,
  visitStaffNames,
} from './clinicVisits';
import type { Alter, ClinicVisit } from './types';

function alter(id: string, order: number, hidden = false): Alter {
  return {
    id,
    name: `人格${id}`,
    color: '#123456',
    hidden,
    order,
    createdAt: '',
    reading: '',
    categoryId: null,
    age: '',
    gender: '',
    identify: '',
  };
}

function visit(id: string, visitedOn: string, createdAt: string, alterIds: string[] = [], staffIds: string[] = []): ClinicVisit {
  return { id, visitedOn, alterIds, staffIds, createdAt };
}

const staff = buildInitialClinicStaff('2026-09-01T00:00:00.000Z');

describe('受診の記録(SPEC.md 8.5)', () => {
  it('新しい順(受診した日、同じ日なら記録した日時の新しい順)。いちばん新しい日が前回の受診日', () => {
    const visits = [
      visit('a', '2026-10-01', '2026-10-01T05:00:00.000Z'),
      visit('b', '2026-10-08', '2026-10-08T05:00:00.000Z'),
      visit('c', '2026-10-08', '2026-10-08T07:00:00.000Z'),
      // あとから記録した、前の日の受診
      visit('d', '2026-09-20', '2026-10-09T05:00:00.000Z'),
    ];
    expect(sortClinicVisits(visits).map((v) => v.id)).toEqual(['c', 'b', 'a', 'd']);
    expect(latestVisitDate(visits)).toBe('2026-10-08');
    expect(latestVisitDate([])).toBeNull();
  });

  it('受診した日は、今日(論理日)より後にできない', () => {
    expect(validateVisitDate('2026-10-14', '2026-10-14')).toBeNull();
    expect(validateVisitDate('2026-10-01', '2026-10-14')).toBeNull();
    expect(validateVisitDate('2026-10-15', '2026-10-14')).toBe('今日より後の日は選べません');
    expect(validateVisitDate('', '2026-10-14')).toBe('受診した日を選んでください');
  });

  it('受診した人格は並び順(非表示も出す)。話した相手は選択肢の並び順で、0人なら「わからない」', () => {
    const alters = [alter('B', 1), alter('A', 0), alter('H', 2, true)];
    expect(visitAlters({ alterIds: ['H', 'B', 'A', 'gone'] }, alters).map((a) => a.id)).toEqual(['A', 'B', 'H']);
    expect(visitStaffNames({ staffIds: ['clinic-staff-worker', 'clinic-staff-doctor'] }, staff)).toEqual([
      '主治医',
      'ワーカー',
    ]);
    expect(visitStaffNames({ staffIds: [] }, staff)).toEqual(['わからない']);
  });
});

describe('話した相手の選択肢(SPEC.md 8.6)', () => {
  it('最初の選択肢は決まった ID と並び順', () => {
    expect(staff.map((s) => [s.id, s.name, s.order])).toEqual([
      ['clinic-staff-doctor', '主治医', 0],
      ['clinic-staff-psychologist', '心理士', 1],
      ['clinic-staff-nurse', '看護師', 2],
      ['clinic-staff-worker', 'ワーカー', 3],
    ]);
  });

  it('同じ名前は保存できない(名前を変えている自分自身は除く)', () => {
    expect(isDuplicateStaffName('主治医', staff)).toBe(true);
    expect(isDuplicateStaffName('主治医', staff, 'clinic-staff-doctor')).toBe(false);
    expect(isDuplicateStaffName('薬剤師', staff)).toBe(false);
  });
});
