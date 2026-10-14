import { describe, expect, it } from 'vitest';
import { buildHomeSections, sortSectionByOrder } from './home';
import type { CompletionRecord, Cycle, Task } from './types';

/** 2026年のローカル時刻を作る(month は 1〜12) */
function at(month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(2026, month - 1, day, hour, minute);
}

function task(id: string, cycle: Cycle, order: number, hidden = false): Task {
  return { id, name: id, cycle, careAlterIds: [], hidden, order, createdAt: at(9, 1).toISOString() };
}

function record(taskId: string, completedAt: Date): CompletionRecord {
  return { id: `r-${taskId}-${completedAt.getTime()}`, taskId, alterId: null, completedAt: completedAt.toISOString() };
}

const now = at(9, 25, 20);

describe('ホーム画面の欄', () => {
  it('毎日・○日ごとは今日、毎週は今週、毎月は今月に入る', () => {
    const tasks = [
      task('monthly', { type: 'monthly' }, 0),
      task('weekly', { type: 'weekly' }, 1),
      task('daily', { type: 'daily' }, 2),
      task('every', { type: 'everyNDays', n: 3 }, 3),
    ];
    const sections = buildHomeSections(tasks, [], now);
    expect(sections.map((s) => [s.key, s.title, s.items.map((i) => i.task.id)])).toEqual([
      ['today', '今日', ['daily', 'every']],
      ['week', '今週', ['weekly']],
      ['month', '今月', ['monthly']],
    ]);
  });

  it('○日ごとは「お休み」なら出さず、今日完了したものは出す', () => {
    const tasks = [task('rest', { type: 'everyNDays', n: 3 }, 0), task('doneToday', { type: 'everyNDays', n: 3 }, 1)];
    const records = [record('rest', at(9, 24)), record('doneToday', at(9, 25, 9))];
    const [today] = buildHomeSections(tasks, records, now);
    expect(today.items.map((i) => [i.task.id, i.status])).toEqual([['doneToday', 'done']]);
  });

  it('非表示のタスクは出さない', () => {
    const tasks = [task('shown', { type: 'daily' }, 0), task('hidden', { type: 'daily' }, 1, true)];
    const [today] = buildHomeSections(tasks, [], now);
    expect(today.items.map((i) => i.task.id)).toEqual(['shown']);
  });

  it('未完了を上、完了を下。それぞれ order 順', () => {
    const tasks = [
      task('doneB', { type: 'daily' }, 3),
      task('todoB', { type: 'daily' }, 2),
      task('doneA', { type: 'daily' }, 1),
      task('todoA', { type: 'daily' }, 0),
    ];
    const records = [record('doneA', at(9, 25, 9)), record('doneB', at(9, 25, 10))];
    const [today] = buildHomeSections(tasks, records, now);
    expect(today.items.map((i) => i.task.id)).toEqual(['todoA', 'todoB', 'doneA', 'doneB']);
  });

  it('完了のときは今の期間の記録が入る', () => {
    const r = record('daily', at(9, 25, 9, 12));
    const [today] = buildHomeSections([task('daily', { type: 'daily' }, 0)], [r], now);
    expect(today.items[0].currentRecord).toEqual(r);
  });

  it('前の期間の結果が入る(ほかのタスクの記録は混ざらない)', () => {
    const tasks = [task('daily', { type: 'daily' }, 0), task('other', { type: 'daily' }, 1)];
    const yesterday = record('daily', at(9, 24, 21));
    const [today] = buildHomeSections(tasks, [yesterday], now);
    expect(today.items.map((i) => [i.task.id, i.previous])).toEqual([
      ['daily', { kind: 'record', record: yesterday }],
      ['other', { kind: 'noRecord' }],
    ]);
  });

  it('タスクが1つもない欄は返さない', () => {
    expect(buildHomeSections([task('weekly', { type: 'weekly' }, 0)], [], now).map((s) => s.key)).toEqual(['week']);
    expect(buildHomeSections([], [], now)).toEqual([]);
  });

  it('並び替えモードでは、未完了・完了の区別なく order 順に並ぶ', () => {
    const tasks = [
      task('doneB', { type: 'daily' }, 3),
      task('todoB', { type: 'daily' }, 2),
      task('doneA', { type: 'daily' }, 1),
      task('todoA', { type: 'daily' }, 0),
      task('weekly', { type: 'weekly' }, 4),
    ];
    const records = [record('doneA', at(9, 25, 9)), record('doneB', at(9, 25, 10))];
    const [today] = buildHomeSections(tasks, records, now);
    const sorted = sortSectionByOrder(today);
    expect(sorted.items.map((i) => [i.task.id, i.status])).toEqual([
      ['todoA', 'todo'],
      ['doneA', 'done'],
      ['todoB', 'todo'],
      ['doneB', 'done'],
    ]);
    // 元の欄は書き換えない
    expect(today.items.map((i) => i.task.id)).toEqual(['todoA', 'todoB', 'doneA', 'doneB']);
  });

  it('削除したタスクの記録が残っていても、ほかのタスクの表示に影響しない', () => {
    const records = [record('deleted', at(9, 25, 9))];
    const [today] = buildHomeSections([task('daily', { type: 'daily' }, 0)], records, now);
    expect(today.items.map((i) => [i.task.id, i.status])).toEqual([['daily', 'todo']]);
  });
});

describe('期限なしの欄(SPEC.md 6.1)', () => {
  const none: Cycle = { type: 'none' };

  it('一番上に出て、未完了は order 順、完了は完了した日時の新しい順。前の期間は出さない', () => {
    const tasks = [
      task('daily', { type: 'daily' }, 0),
      task('n1', none, 1),
      task('n2', none, 2),
      task('n3', none, 3),
      task('n4', none, 4),
      task('hidden', none, 5, true),
    ];
    const records = [record('n1', at(9, 1, 9)), record('n3', at(9, 20, 9))];
    const [first, second] = buildHomeSections(tasks, records, now);
    expect(first.key).toBe('none');
    expect(first.title).toBe('期限なし');
    expect(first.items.map((i) => [i.task.id, i.status])).toEqual([
      ['n2', 'todo'],
      ['n4', 'todo'],
      ['n3', 'done'],
      ['n1', 'done'],
    ]);
    expect(first.items.every((i) => i.previous.kind === 'none')).toBe(true);
    expect(second.key).toBe('today');
  });

  it('期限なしのタスクがなければ、欄を出さない', () => {
    expect(buildHomeSections([task('daily', { type: 'daily' }, 0)], [], now).map((s) => s.key)).toEqual(['today']);
  });

  it('並び替えモードでは、未完了だけを並べる', () => {
    const tasks = [task('n1', none, 1), task('n2', none, 0)];
    const [section] = buildHomeSections(tasks, [record('n1', at(9, 1))], now);
    expect(sortSectionByOrder(section).items.map((i) => i.task.id)).toEqual(['n2']);
  });
});
