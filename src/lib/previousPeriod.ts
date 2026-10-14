// 「前の期間」の結果(SPEC.md 6.5)。純粋関数。
// 文言は責める言葉にせず、事実だけを伝える(SPEC.md 14章①)
import { resolveRecordAlter } from './completionLabel';
import {
  addLogicalDays,
  diffLogicalDays,
  previousLogicalMonth,
  startOfLogicalDate,
  startOfLogicalMonth,
  toLogicalDate,
  toLogicalMonth,
  toLogicalWeek,
} from './period';
import { findLatest } from './status';
import { formatClockOf, formatMonthDay, formatWeekdayClock } from './timeFormat';
import type { Alter, CompletionRecord, Cycle, Task } from './types';

/**
 * 前の期間の結果
 * - none:何も出さない(前の期間にタスクがまだなかった、○日ごとで今日より前の記録がない)
 * - record:前の期間の最後の記録(○日ごとは今日より前の最後の記録)
 * - noRecord:前の期間に記録がない(毎日・毎週・毎月)
 * - overdue:○日ごとで、予定日から days 日すぎている
 */
export type PreviousPeriodResult =
  | { kind: 'none' }
  | { kind: 'record'; record: CompletionRecord }
  | { kind: 'noRecord' }
  | { kind: 'overdue'; days: number };

/** 毎日・毎週・毎月の「今の期間」と「前の期間」 */
interface PeriodWindow {
  /** 日時からどの期間かを表す文字列 */
  toKey: (date: Date) => string;
  /** 前の期間を表す文字列 */
  previousKey: string;
  /** 今の期間が始まる日時(= 前の期間の終わり) */
  currentStart: Date;
}

function periodWindowOf(cycleType: 'daily' | 'weekly' | 'monthly', now: Date): PeriodWindow {
  switch (cycleType) {
    case 'daily': {
      const today = toLogicalDate(now);
      return { toKey: toLogicalDate, previousKey: addLogicalDays(today, -1), currentStart: startOfLogicalDate(today) };
    }
    case 'weekly': {
      const monday = toLogicalWeek(now);
      return { toKey: toLogicalWeek, previousKey: addLogicalDays(monday, -7), currentStart: startOfLogicalDate(monday) };
    }
    case 'monthly': {
      const month = toLogicalMonth(now);
      return { toKey: toLogicalMonth, previousKey: previousLogicalMonth(month), currentStart: startOfLogicalMonth(month) };
    }
  }
}

/** 毎日・毎週・毎月:前の期間の最後の記録、または「記録なし」 */
function judgeByPeriod(
  cycleType: 'daily' | 'weekly' | 'monthly',
  createdAt: string,
  records: readonly CompletionRecord[],
  now: Date,
): PreviousPeriodResult {
  const { toKey, previousKey, currentStart } = periodWindowOf(cycleType, now);
  // 前の期間が終わった時点で、まだタスクがなかったら何も出さない
  if (new Date(createdAt).getTime() >= currentStart.getTime()) {
    return { kind: 'none' };
  }
  const latest = findLatest(records.filter((r) => toKey(new Date(r.completedAt)) === previousKey));
  return latest ? { kind: 'record', record: latest } : { kind: 'noRecord' };
}

/**
 * ○日ごと:
 * - 今日まだやっておらず、予定日(最後の記録の論理日 + n 日)をすぎていれば「予定日から○日」
 * - それ以外は、今日より前の最後の記録(なければ何も出さない)
 */
function judgeEveryNDays(n: number, records: readonly CompletionRecord[], now: Date): PreviousPeriodResult {
  const today = toLogicalDate(now);
  const daysAgo = (record: CompletionRecord) => diffLogicalDays(toLogicalDate(new Date(record.completedAt)), today);
  const doneToday = records.some((r) => daysAgo(r) === 0);
  const before = findLatest(records.filter((r) => daysAgo(r) > 0));
  if (before === null) {
    return { kind: 'none' };
  }
  const overdueDays = daysAgo(before) - n;
  if (!doneToday && overdueDays > 0) {
    return { kind: 'overdue', days: overdueDays };
  }
  return { kind: 'record', record: before };
}

/**
 * 前の期間の結果を求める。
 * @param records そのタスクの完了記録
 * @param now 現在時刻(テストで任意の時刻を渡せるよう引数にしている)
 */
export function getPreviousPeriodResult(
  task: Pick<Task, 'cycle' | 'createdAt'>,
  records: readonly CompletionRecord[],
  now: Date,
): PreviousPeriodResult {
  if (task.cycle.type === 'everyNDays') {
    return judgeEveryNDays(task.cycle.n, records, now);
  }
  // 期限なしは期間がないので、前の期間の結果を出さない(SPEC.md 6.5)
  if (task.cycle.type === 'none') {
    return { kind: 'none' };
  }
  return judgeByPeriod(task.cycle.type, task.createdAt, records, now);
}

/** 画面に出す内容 */
export type PreviousPeriodLabel =
  /** 記録あり:「昨日:人格A・21:30」(小さく薄い文字) */
  | { kind: 'record'; prefix: string; name: string; color: string | null; time: string }
  /** 記録なし・予定日から○日(小さい文字で、ふつうの文字色) */
  | { kind: 'missing'; text: string };

const PREFIXES: Record<Cycle['type'], string> = {
  daily: '昨日',
  weekly: '先週',
  monthly: '先月',
  everyNDays: '前回',
  // 期限なしは前の期間の結果を出さない(使わない)
  none: '',
};

/** 時刻の出し方:昨日は時刻、先週は曜日と時刻、先月・前回は月日(どれも実際の日時) */
function formatRecordTime(cycleType: Cycle['type'], completedAt: string): string {
  switch (cycleType) {
    case 'daily':
      return formatClockOf(completedAt);
    case 'weekly':
      return formatWeekdayClock(completedAt);
    case 'monthly':
    case 'everyNDays':
    case 'none':
      return formatMonthDay(completedAt);
  }
}

/** 前の期間の結果から、画面に出す内容を作る。何も出さないときは null */
export function toPreviousPeriodLabel(
  result: PreviousPeriodResult,
  cycle: Cycle,
  alterById: ReadonlyMap<string, Alter>,
): PreviousPeriodLabel | null {
  const prefix = PREFIXES[cycle.type];
  switch (result.kind) {
    case 'none':
      return null;
    case 'record':
      return {
        kind: 'record',
        prefix,
        ...resolveRecordAlter(result.record, alterById),
        time: formatRecordTime(cycle.type, result.record.completedAt),
      };
    case 'noRecord':
      return { kind: 'missing', text: `${prefix}は記録なし` };
    case 'overdue':
      return { kind: 'missing', text: `予定日から${result.days}日` };
  }
}

/** 画面に出す内容を1行の文字にする(読み上げやテスト用) */
export function previousPeriodLabelText(label: PreviousPeriodLabel): string {
  return label.kind === 'record' ? `${label.prefix}:${label.name}・${label.time}` : label.text;
}
