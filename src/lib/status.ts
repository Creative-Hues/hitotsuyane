// タスクの状態判定(SPEC.md 4.2〜4.3)。純粋関数。
import { diffLogicalDays, toLogicalDate, toLogicalMonth, toLogicalWeek } from './period';
import type { CompletionRecord, Cycle } from './types';

/** 完了 / 未完了(やる日) / お休み */
export type TaskStatus = 'done' | 'todo' | 'rest';

export interface TaskStatusResult {
  status: TaskStatus;
  /** 今の期間の完了記録(完了のときだけ入る。表示や取り消しに使う) */
  currentRecord: CompletionRecord | null;
}

/** 日時から「どの期間か」を表す文字列を求める関数 */
type PeriodKeyFn = (date: Date) => string;

/** completedAt が最も新しい記録を返す */
export function findLatest(records: readonly CompletionRecord[]): CompletionRecord | null {
  let latest: CompletionRecord | null = null;
  for (const record of records) {
    if (latest === null || record.completedAt > latest.completedAt) {
      latest = record;
    }
  }
  return latest;
}

/** 今と同じ期間に入っている記録だけを返す */
function filterSamePeriod(
  records: readonly CompletionRecord[],
  now: Date,
  toPeriodKey: PeriodKeyFn,
): CompletionRecord[] {
  const currentKey = toPeriodKey(now);
  return records.filter((r) => toPeriodKey(new Date(r.completedAt)) === currentKey);
}

/** 周期ごとの「期間」の決め方。○日ごとの「完了」は今日の論理日で判定する */
function periodKeyFnOf(cycle: Cycle): PeriodKeyFn {
  switch (cycle.type) {
    case 'daily':
    case 'everyNDays':
      return toLogicalDate;
    case 'weekly':
      return toLogicalWeek;
    case 'monthly':
      return toLogicalMonth;
    case 'none':
      // 期限なし:期間の区切りがないので、すべての記録を同じ期間とみなす(SPEC.md 3.2)
      return () => 'none';
  }
}

/** 毎日・毎週・毎月:今の期間に記録があれば完了、なければ未完了 */
function judgeByPeriod(
  records: readonly CompletionRecord[],
  now: Date,
  toPeriodKey: PeriodKeyFn,
): TaskStatusResult {
  const currentRecord = findLatest(filterSamePeriod(records, now, toPeriodKey));
  return currentRecord
    ? { status: 'done', currentRecord }
    : { status: 'todo', currentRecord: null };
}

/**
 * ○日ごと:最後の記録の論理日から数える
 * - 今日の論理日に記録がある → 完了
 * - 記録が1度もない、または「今日 − 最後の記録の日」が n 日以上 → 未完了
 * - それ以外(最後の記録が未来の日付の場合も含む) → お休み
 */
function judgeEveryNDays(
  records: readonly CompletionRecord[],
  now: Date,
  n: number,
): TaskStatusResult {
  const latest = findLatest(records);
  if (latest === null) {
    return { status: 'todo', currentRecord: null };
  }
  const days = diffLogicalDays(toLogicalDate(new Date(latest.completedAt)), toLogicalDate(now));
  if (days === 0) {
    return { status: 'done', currentRecord: latest };
  }
  if (days >= n) {
    return { status: 'todo', currentRecord: null };
  }
  return { status: 'rest', currentRecord: null };
}

/**
 * タスクの状態を判定する。
 * @param cycle タスクの周期
 * @param records そのタスクの完了記録
 * @param now 現在時刻(テストで任意の時刻を渡せるよう引数にしている)
 */
export function getTaskStatus(
  cycle: Cycle,
  records: readonly CompletionRecord[],
  now: Date,
): TaskStatusResult {
  switch (cycle.type) {
    case 'daily':
    case 'weekly':
    case 'monthly':
    case 'none':
      return judgeByPeriod(records, now, periodKeyFnOf(cycle));
    case 'everyNDays':
      return judgeEveryNDays(records, now, cycle.n);
  }
}

/**
 * 今の期間の記録を返す(取り消しで削除する対象。SPEC.md 6.3)。
 * 毎日・毎週・毎月はその期間の記録、○日ごとは今日の論理日の記録、期限なしはすべての記録。
 * @param now 現在時刻
 */
export function getCurrentPeriodRecords(
  cycle: Cycle,
  records: readonly CompletionRecord[],
  now: Date,
): CompletionRecord[] {
  return filterSamePeriod(records, now, periodKeyFnOf(cycle));
}
