import { describe, expect, it } from 'vitest';
import { getCurrentPeriodRecords, getTaskStatus } from './status';
import type { CompletionRecord, Cycle } from './types';

/** ローカル時刻の日時から完了記録を作る */
function record(id: string, completedAt: Date): CompletionRecord {
  return { id, taskId: 't1', alterId: null, completedAt: completedAt.toISOString() };
}

/** 2026年のローカル時刻を作る(month は 1〜12) */
function at(month: number, day: number, hour = 12, minute = 0): Date {
  return new Date(2026, month - 1, day, hour, minute);
}

describe('○日ごと', () => {
  const every3: Cycle = { type: 'everyNDays', n: 3 };

  it('記録なし → 未完了', () => {
    expect(getTaskStatus(every3, [], at(9, 25)).status).toBe('todo');
  });

  it('n=3、最後の記録から2日後 → お休み', () => {
    const records = [record('r1', at(9, 20))];
    expect(getTaskStatus(every3, records, at(9, 22)).status).toBe('rest');
  });

  it('n=3、最後の記録から3日後 → 未完了', () => {
    const records = [record('r1', at(9, 20))];
    expect(getTaskStatus(every3, records, at(9, 23)).status).toBe('todo');
  });

  it('遅れて完了したら、そこから数え直す', () => {
    // 9/20 にやり、9/23 にはやらず 9/24 にやった
    const records = [record('r1', at(9, 20)), record('r2', at(9, 24))];
    expect(getTaskStatus(every3, records, at(9, 26)).status).toBe('rest');
    expect(getTaskStatus(every3, records, at(9, 27)).status).toBe('todo');
  });

  it('今日の論理日に記録がある → 完了(その記録を返す)', () => {
    const r = record('r1', at(9, 25, 9, 12));
    const result = getTaskStatus(every3, [r], at(9, 25, 20));
    expect(result.status).toBe('done');
    expect(result.currentRecord).toEqual(r);
  });

  it('日数は論理日で数える(朝5時前は前日扱い)', () => {
    // 9/20 の記録から見て、9/23 4:59 はまだ 9/22 扱い
    const records = [record('r1', at(9, 20))];
    expect(getTaskStatus(every3, records, at(9, 23, 4, 59)).status).toBe('rest');
    expect(getTaskStatus(every3, records, at(9, 23, 5, 0)).status).toBe('todo');
  });

  it('最後の記録が未来の日付 → お休み', () => {
    const records = [record('r1', at(9, 30))];
    expect(getTaskStatus(every3, records, at(9, 25)).status).toBe('rest');
  });
});

describe('毎日', () => {
  const daily: Cycle = { type: 'daily' };

  it('今日の論理日に記録がある → 完了', () => {
    const records = [record('r1', at(9, 25, 9, 12))];
    expect(getTaskStatus(daily, records, at(9, 25, 22)).status).toBe('done');
  });

  it('朝5時をまたぐと未完了に戻る', () => {
    const records = [record('r1', at(9, 25, 9, 12))];
    expect(getTaskStatus(daily, records, at(9, 26, 4, 59)).status).toBe('done');
    expect(getTaskStatus(daily, records, at(9, 26, 5, 0)).status).toBe('todo');
  });

  it('記録なし → 未完了', () => {
    const result = getTaskStatus(daily, [], at(9, 25));
    expect(result.status).toBe('todo');
    expect(result.currentRecord).toBeNull();
  });
});

describe('毎週', () => {
  const weekly: Cycle = { type: 'weekly' };

  it('同じ週(月〜日)に記録がある → 完了', () => {
    // 2026/9/21(月)に記録、9/27(日)に確認
    const records = [record('r1', at(9, 21, 10))];
    expect(getTaskStatus(weekly, records, at(9, 27, 23)).status).toBe('done');
  });

  it('月曜 5:00 から新しい週になり未完了に戻る', () => {
    const records = [record('r1', at(9, 21, 10))];
    expect(getTaskStatus(weekly, records, at(9, 28, 4, 59)).status).toBe('done');
    expect(getTaskStatus(weekly, records, at(9, 28, 5, 0)).status).toBe('todo');
  });
});

describe('毎月', () => {
  const monthly: Cycle = { type: 'monthly' };

  it('同じ月に記録がある → 完了', () => {
    const records = [record('r1', at(9, 3, 9, 12))];
    expect(getTaskStatus(monthly, records, at(9, 30)).status).toBe('done');
  });

  it('1日 5:00 から新しい月になり未完了に戻る', () => {
    const records = [record('r1', at(9, 3, 9, 12))];
    expect(getTaskStatus(monthly, records, at(10, 1, 4, 59)).status).toBe('done');
    expect(getTaskStatus(monthly, records, at(10, 1, 5, 0)).status).toBe('todo');
  });
});

describe('今の期間の記録(取り消しの対象)', () => {
  /** 記録のIDだけを取り出す */
  function ids(records: CompletionRecord[]): string[] {
    return records.map((r) => r.id);
  }

  it('毎日:今日の論理日の記録だけ(朝5時前は前日扱い)', () => {
    const records = [
      record('yesterday', at(9, 24, 9)),
      record('lateNight', at(9, 25, 4, 59)), // 論理日は 9/24
      record('today', at(9, 25, 5, 0)),
    ];
    expect(ids(getCurrentPeriodRecords({ type: 'daily' }, records, at(9, 25, 20)))).toEqual(['today']);
  });

  it('毎週:月曜 5:00 を境に分かれる', () => {
    const records = [record('lastWeek', at(9, 28, 4, 59)), record('thisWeek', at(9, 28, 5, 0))];
    expect(ids(getCurrentPeriodRecords({ type: 'weekly' }, records, at(10, 1)))).toEqual(['thisWeek']);
  });

  it('毎月:1日 5:00 を境に分かれる', () => {
    const records = [record('lastMonth', at(10, 1, 4, 59)), record('thisMonth', at(10, 1, 5, 0))];
    expect(ids(getCurrentPeriodRecords({ type: 'monthly' }, records, at(10, 15)))).toEqual(['thisMonth']);
  });

  it('○日ごと:今日の論理日の記録だけ', () => {
    const records = [record('before', at(9, 22)), record('today', at(9, 25, 9))];
    const cycle: Cycle = { type: 'everyNDays', n: 3 };
    expect(ids(getCurrentPeriodRecords(cycle, records, at(9, 25, 20)))).toEqual(['today']);
  });
});

describe('期限なし(SPEC.md 3.2)', () => {
  const none: Cycle = { type: 'none' };

  it('記録がなければ未完了、記録があれば日がたっても完了のまま(いちばん新しい記録)', () => {
    expect(getTaskStatus(none, [], at(9, 25)).status).toBe('todo');
    const records = [record('old', at(1, 5)), record('new', at(3, 1))];
    expect(getTaskStatus(none, records, at(12, 31))).toEqual({ status: 'done', currentRecord: records[1] });
  });

  it('取り消しで消すのは、そのタスクのすべての記録', () => {
    const records = [record('old', at(1, 5)), record('new', at(3, 1))];
    expect(getCurrentPeriodRecords(none, records, at(12, 31)).map((r) => r.id)).toEqual(['old', 'new']);
  });
});
