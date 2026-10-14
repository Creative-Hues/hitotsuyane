// 交代の記録のカレンダー(SPEC.md 17.7)。すべて純粋関数(同じ入力なら同じ結果)。
// 日付の計算は period.ts の関数を通す
import { logicalDatesOfMonth, toLogicalDate, weekdayOfLogicalDate, type LogicalDate } from './period';
import { compareSwitchLogs, switchLogTime } from './switchLog';
import type { Alter, SwitchLog } from './types';

/** 1つのマスに並べる円の数(3×3) */
export const CALENDAR_DOT_SLOTS = 9;

/** マスの円1つ。color が null なら「わからない」(灰色) */
export interface CalendarDot {
  /** 人格のID。「わからない」(または見つからない人格)は null */
  alterId: string | null;
  color: string | null;
}

/** カレンダーの1日 */
export interface CalendarDay {
  logicalDate: LogicalDate;
  /** 日付の数字(1〜31) */
  day: number;
  /** その日の記録の件数 */
  count: number;
  /** 円(その日に初めて出た順。同じ人格は1つ)。10人以上のときは8個 */
  dots: CalendarDot[];
  /** 10人以上で、9個目の位置に「+」を出すか */
  more: boolean;
}

/** カレンダーの1週(日曜〜土曜の7マス。月の外のマスは null) */
export type CalendarWeek = (CalendarDay | null)[];

/**
 * その論理月のカレンダーを作る(SPEC.md 17.7)。週の始まりは日曜。
 * 各日付のマスには、その日(論理日。記録の時刻で振り分ける)に記録のあった人格の円を、初めて出た順に並べる
 * @param alters すべての人格(非表示も含む)
 */
export function buildSwitchCalendar(input: {
  logs: readonly SwitchLog[];
  month: string;
  alters: readonly Alter[];
}): CalendarWeek[] {
  const { month, alters } = input;
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  // 日ごとに、記録の時刻の古い順で、初めて出た人格を集める(「わからない」・見つからない人格は null)
  const dotsByDate = new Map<LogicalDate, CalendarDot[]>();
  const countByDate = new Map<LogicalDate, number>();
  for (const log of [...input.logs].sort(compareSwitchLogs)) {
    const date = toLogicalDate(new Date(switchLogTime(log)));
    if (!date.startsWith(month)) {
      continue;
    }
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
    const alter = log.alterId === null ? undefined : alterById.get(log.alterId);
    const dots = dotsByDate.get(date) ?? [];
    const alterId = alter?.id ?? null;
    if (!dots.some((dot) => dot.alterId === alterId)) {
      dots.push({ alterId, color: alter?.color ?? null });
    }
    dotsByDate.set(date, dots);
  }

  const days = logicalDatesOfMonth(month).map((logicalDate): CalendarDay => {
    const dots = dotsByDate.get(logicalDate) ?? [];
    const more = dots.length > CALENDAR_DOT_SLOTS;
    return {
      logicalDate,
      day: Number(logicalDate.slice(8)),
      count: countByDate.get(logicalDate) ?? 0,
      dots: more ? dots.slice(0, CALENDAR_DOT_SLOTS - 1) : dots,
      more,
    };
  });

  // 1日の前を空けて、7マスずつに分ける(最後の週も7マスにそろえる)
  const cells: (CalendarDay | null)[] = [...Array<null>(weekdayOfLogicalDate(days[0].logicalDate)).fill(null), ...days];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  const weeks: CalendarWeek[] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** その論理日の記録を、新しい順に並べて返す(カレンダーの日付を押したときの一覧。SPEC.md 17.7) */
export function switchLogsOnDate(logs: readonly SwitchLog[], logicalDate: LogicalDate): SwitchLog[] {
  return logs
    .filter((log) => toLogicalDate(new Date(switchLogTime(log))) === logicalDate)
    .sort((a, b) => compareSwitchLogs(b, a));
}
