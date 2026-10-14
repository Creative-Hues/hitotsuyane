// 完了時刻の表示(SPEC.md 6.1)。純粋関数。
// 曜日・日付は論理日ではなく、実際の日時(端末のローカル時刻)で表示する。
import type { SectionKey } from './home';
import { toCalendarDate, type LogicalDate } from './period';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 「9:12」形式(時はゼロ埋めなし、分は2桁) */
function formatClock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 「9:12」形式(実際の時刻) */
export function formatClockOf(iso: string): string {
  return formatClock(new Date(iso));
}

/** 「水 9:12」形式(実際の曜日と時刻) */
export function formatWeekdayClock(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS[date.getDay()]} ${formatClock(date)}`;
}

/** 「9/3」形式(実際の月日) */
export function formatMonthDay(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 「10月14日」形式(実際の月日。SPEC.md 12章「更新前のデータ」) */
export function formatMonthDayKanji(iso: string): string {
  const date = new Date(iso);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 論理日('YYYY-MM-DD')を「10/1」形式にする(期間の表示。SPEC.md 8.3) */
export function formatLogicalMonthDay(logicalDate: string): string {
  const [, month, day] = logicalDate.split('-').map(Number);
  return `${month}/${day}`;
}

/** 「2026/9/28 21:30」形式(実際の日時) */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${formatClock(date)}`;
}

/**
 * 前回からの経過時間(SPEC.md 7.5)。どれも切り捨て。
 * 1時間未満は「25分前」、24時間未満は「3時間前」、それ以上は「2日前」
 * @param now 現在時刻(未来の記録は「0分前」として扱う)
 */
export function formatElapsed(fromIso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) {
    return `${minutes}分前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}時間前`;
  }
  return `${Math.floor(hours / 24)}日前`;
}

/**
 * 完了時刻を欄に合わせた形式で表す。
 * - 今日:「9:12」
 * - 今週:「水 9:12」
 * - 今月:「9/3 9:12」
 * - 期限なし:「10/14 9:12」(SPEC.md 6.1)
 * @param completedAt 完了日時(ISO形式)
 */
export function formatCompletionTime(completedAt: string, section: SectionKey): string {
  switch (section) {
    case 'today':
      return formatClockOf(completedAt);
    case 'week':
      return formatWeekdayClock(completedAt);
    case 'month':
    case 'none':
      return `${formatMonthDay(completedAt)} ${formatClockOf(completedAt)}`;
  }
}

/**
 * 論理日('YYYY-MM-DD')の見出し「9/28(月)」(記録の一覧の日ごとの見出し。SPEC.md 7.6)。
 * 論理日そのものの月日と曜日を出す(朝5時前の記録も、前の日の見出しの下に入る)
 */
export function formatLogicalDateHeading(logicalDate: string): string {
  const [year, month, day] = logicalDate.split('-').map(Number);
  // 時差の影響を受けないよう、UTC の日付として曜日を求める
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}/${day}(${weekday})`;
}

/**
 * 記録の一覧の時刻(SPEC.md 7.6)。実際の時刻で出し、論理日の見出しと実際の日付が違う記録
 * (朝5時前の記録)には「翌」を付ける。例:9/27 の見出しの下の 9/28 2:00 → 「翌2:00」
 * @param logicalDate その記録を並べている見出しの論理日
 */
export function formatClockInLogicalDay(iso: string, logicalDate: LogicalDate): string {
  const clock = formatClockOf(iso);
  return toCalendarDate(new Date(iso)) === logicalDate ? clock : `翌${clock}`;
}

/** 「2026/9/28」形式(実際の日付。朝5時前でも前の日にしない) */
export function formatCalendarDateSlash(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}
