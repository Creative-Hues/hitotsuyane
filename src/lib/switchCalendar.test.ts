import { describe, expect, it } from 'vitest';
import { daysSinceWeekStart, logicalDatesOfMonth, toLogicalWeek, weekdayOfLogicalDate } from './period';
import { buildSwitchCalendar, calendarWeekdayLabels, switchLogsOnDate } from './switchCalendar';
import type { Alter, SwitchLog } from './types';

function alter(id: string, order: number, hidden = false): Alter {
  return {
    id,
    name: `人格${id}`,
    color: `#00000${order}`,
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

/** 端末のローカル時刻で記録を作る(交代した時刻 = 気づいた時刻) */
function log(id: string, alterId: string | null, at: Date): SwitchLog {
  return {
    id,
    alterId,
    noticedAt: at.toISOString(),
    switchedAt: at.toISOString(),
    tagIds: [],
    fromAlterId: null,
    fromAlterSource: 'guessed',
  };
}

describe('カレンダーの日付(SPEC.md 17.7)', () => {
  it('曜日は日曜=0', () => {
    expect(weekdayOfLogicalDate('2026-10-01')).toBe(4); // 木曜
    expect(weekdayOfLogicalDate('2026-11-01')).toBe(0); // 日曜
  });

  it('週の始まり(月曜)から何日目か。日曜始まりも渡せる', () => {
    expect(daysSinceWeekStart('2026-10-12')).toBe(0); // 月曜
    expect(daysSinceWeekStart('2026-10-18')).toBe(6); // 日曜
    expect(daysSinceWeekStart('2026-10-18', 0)).toBe(0);
    expect(toLogicalWeek(new Date(2026, 9, 18, 12, 0), 0)).toBe('2026-10-18');
  });

  it('月の1日から月末まで(うるう年の2月も)', () => {
    expect(logicalDatesOfMonth('2026-10')).toHaveLength(31);
    expect(logicalDatesOfMonth('2028-02').at(-1)).toBe('2028-02-29');
    expect(logicalDatesOfMonth('2026-02').at(-1)).toBe('2026-02-28');
  });
});

describe('交代の記録のカレンダー(SPEC.md 17.7)', () => {
  const alters = [alter('B', 1), alter('A', 0), alter('H', 2, true)];

  it('週の始まりは月曜(アプリ全体と同じ)で、1日の前と月末の後は空のマス', () => {
    const weeks = buildSwitchCalendar({ logs: [], month: '2026-10', alters });
    expect(calendarWeekdayLabels()).toEqual(['月', '火', '水', '木', '金', '土', '日']);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // 2026年10月1日は木曜
    expect(weeks[0].map((cell) => cell?.day ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks[4].map((cell) => cell?.day ?? null)).toEqual([26, 27, 28, 29, 30, 31, null]);
  });

  it('週の始まりの曜日を変えると、見出しとマスの並びも変わる(将来の設定のため)', () => {
    const weeks = buildSwitchCalendar({ logs: [], month: '2026-10', alters, weekStartDay: 0 });
    expect(calendarWeekdayLabels(0)).toEqual(['日', '月', '火', '水', '木', '金', '土']);
    expect(weeks[0].map((cell) => cell?.day ?? null)).toEqual([null, null, null, null, 1, 2, 3]);
  });

  it('その日に初めて出た順に円を並べ、同じ人格は1つ、「わからない」は色なし(灰色)', () => {
    const logs = [
      log('3', 'A', new Date(2026, 9, 2, 20, 0)),
      log('1', 'B', new Date(2026, 9, 2, 9, 0)),
      log('2', null, new Date(2026, 9, 2, 12, 0)),
      log('4', 'B', new Date(2026, 9, 2, 22, 0)),
      // 見つからない人格は「わからない」と同じ円にまとめる
      log('5', 'gone', new Date(2026, 9, 2, 23, 0)),
      // 非表示の人格も、名前と色で出す
      log('6', 'H', new Date(2026, 9, 3, 9, 0)),
    ];
    const days = buildSwitchCalendar({ logs, month: '2026-10', alters }).flat();
    const oct2 = days.find((day) => day?.logicalDate === '2026-10-02');
    expect(oct2?.count).toBe(5);
    expect(oct2?.dots).toEqual([
      { alterId: 'B', color: '#000001' },
      { alterId: null, color: null },
      { alterId: 'A', color: '#000000' },
    ]);
    expect(oct2?.more).toBe(false);
    expect(days.find((day) => day?.logicalDate === '2026-10-03')?.dots).toEqual([{ alterId: 'H', color: '#000002' }]);
  });

  it('朝5時前の記録は前の日のマスに入る。ほかの月の記録は入れない', () => {
    const logs = [log('1', 'A', new Date(2026, 9, 3, 4, 59)), log('2', 'A', new Date(2026, 10, 1, 4, 0))];
    const days = buildSwitchCalendar({ logs, month: '2026-10', alters }).flat();
    expect(days.find((day) => day?.logicalDate === '2026-10-02')?.count).toBe(1);
    expect(days.find((day) => day?.logicalDate === '2026-10-03')?.count).toBe(0);
    // 11/1 4:00 は論理日では 10/31
    expect(days.find((day) => day?.logicalDate === '2026-10-31')?.count).toBe(1);
  });

  it('9人までは円を全部出し、10人以上は8個の円と「+」', () => {
    const many = Array.from({ length: 10 }, (_, index) => alter(`p${index}`, index));
    const nine = many.slice(0, 9).map((a, index) => log(`n${index}`, a.id, new Date(2026, 9, 5, 9, index)));
    const ten = many.map((a, index) => log(`t${index}`, a.id, new Date(2026, 9, 6, 9, index)));
    const days = buildSwitchCalendar({ logs: [...nine, ...ten], month: '2026-10', alters: many }).flat();
    const oct5 = days.find((day) => day?.logicalDate === '2026-10-05');
    expect([oct5?.dots.length, oct5?.more]).toEqual([9, false]);
    const oct6 = days.find((day) => day?.logicalDate === '2026-10-06');
    expect([oct6?.dots.length, oct6?.more]).toEqual([8, true]);
    expect(oct6?.dots.map((dot) => dot.alterId)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('日付を押したときの一覧は、その論理日の記録だけを新しい順で', () => {
    const logs = [
      log('1', 'A', new Date(2026, 9, 2, 9, 0)),
      log('2', 'B', new Date(2026, 9, 3, 4, 0)), // 論理日は 10/2
      log('3', 'A', new Date(2026, 9, 3, 9, 0)),
    ];
    expect(switchLogsOnDate(logs, '2026-10-02').map((l) => l.id)).toEqual(['2', '1']);
  });
});
