// 論理日・週・月の計算(SPEC.md 4章)
// 日付の計算は必ずこのファイルの関数を通すこと。すべて純粋関数(同じ入力なら同じ結果)。

/** 1日の始まり(朝5時) */
export const DAY_START_HOUR = 5;

/** 論理日を 'YYYY-MM-DD' 形式の文字列で表す */
export type LogicalDate = string;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDate(year: number, month: number, day: number): LogicalDate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 'YYYY-MM-DD' を年・月・日の数値に分ける */
function parseLogicalDate(logicalDate: LogicalDate): { year: number; month: number; day: number } {
  const [year, month, day] = logicalDate.split('-').map(Number);
  return { year, month, day };
}

/** 論理日を UTC の日数(1970-01-01 からの日数)に変換する。時差の影響を受けない */
function toDayNumber(logicalDate: LogicalDate): number {
  const { year, month, day } = parseLogicalDate(logicalDate);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/**
 * 日時から論理日を求める。
 * 端末のローカル時刻から5時間引いた日時の「日付」。
 * 例:9/26 4:59 → 9/25、9/26 5:00 → 9/26
 */
export function toLogicalDate(date: Date): LogicalDate {
  const shifted = new Date(date.getTime());
  shifted.setHours(shifted.getHours() - DAY_START_HOUR);
  return formatDate(shifted.getFullYear(), shifted.getMonth() + 1, shifted.getDate());
}

/**
 * 日時の「実際の日付」(朝5時の区切りを使わない、端末のローカル時刻の日付)を 'YYYY-MM-DD' で表す。
 * ファイル名など、カレンダーどおりの日付を出したいときに使う。
 */
export function toCalendarDate(date: Date): string {
  return formatDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 論理日どうしの日数差(to − from)。to が from より前ならマイナスになる */
export function diffLogicalDays(from: LogicalDate, to: LogicalDate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/**
 * 週の始まりの曜日(日曜=0, 月曜=1 … 土曜=6)。アプリ全体の週の区切りは、この1か所で決める(SPEC.md 4.2)。
 * ToDo の「毎週」・交代のカレンダー・診察用の表示の「今週」は、すべてこれを使う。
 * 将来「週の始まりを選べる設定」を入れるときは、ここを設定から渡す形にする
 */
export const WEEK_START_DAY = 1;

/** 週の始まりの曜日から、その日が何日目か(0〜6) */
export function daysSinceWeekStart(logicalDate: LogicalDate, weekStartDay: number = WEEK_START_DAY): number {
  return (weekdayOfLogicalDate(logicalDate) - weekStartDay + 7) % 7;
}

/**
 * 日時が属する週を、その週の始まりの日(月曜)の論理日で表す。
 * 週は論理日で月曜〜日曜(WEEK_START_DAY)。
 */
export function toLogicalWeek(date: Date, weekStartDay: number = WEEK_START_DAY): LogicalDate {
  const logicalDate = toLogicalDate(date);
  return addLogicalDays(logicalDate, -daysSinceWeekStart(logicalDate, weekStartDay));
}

/** 日時が属する月を 'YYYY-MM' 形式で表す(論理日の年月) */
export function toLogicalMonth(date: Date): string {
  return toLogicalDate(date).slice(0, 7);
}

/** 論理日に日数を足す(マイナスなら前の日) */
export function addLogicalDays(logicalDate: LogicalDate, days: number): LogicalDate {
  const utc = new Date((toDayNumber(logicalDate) + days) * 86_400_000);
  return formatDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

/** 'YYYY-MM' の前の月 */
export function previousLogicalMonth(logicalMonth: string): string {
  const [year, month] = logicalMonth.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${pad2(month - 1)}`;
}

/** 'YYYY-MM' の次の月 */
export function nextLogicalMonth(logicalMonth: string): string {
  const [year, month] = logicalMonth.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${pad2(month + 1)}`;
}

/** 集計で見られる月の数(過去11か月〜今月。SPEC.md 11章) */
export const STATS_MONTH_COUNT = 12;

/**
 * 集計で見られる月の範囲(SPEC.md 11章)。
 * latest は今の論理月、oldest はその11か月前。
 * @param now 現在時刻(テストで任意の時刻を渡せるよう引数にしている)
 */
export function statsMonthRange(now: Date): { oldest: string; latest: string } {
  const latest = toLogicalMonth(now);
  let oldest = latest;
  for (let i = 1; i < STATS_MONTH_COUNT; i += 1) {
    oldest = previousLogicalMonth(oldest);
  }
  return { oldest, latest };
}

/**
 * 集計で表示する月を、見られる範囲の中に寄せる(SPEC.md 11章)。
 * month が null なら今の論理月。月をまたいで範囲の外になった月は、範囲の端の月にする
 * @param now 現在時刻(テストで任意の時刻を渡せるよう引数にしている)
 */
export function clampStatsMonth(month: string | null, now: Date): string {
  const { oldest, latest } = statsMonthRange(now);
  if (month === null || month > latest) {
    return latest;
  }
  return month < oldest ? oldest : month;
}

/** 論理日の曜日(日曜=0 … 土曜=6)。カレンダーで使う(SPEC.md 17.7) */
export function weekdayOfLogicalDate(logicalDate: LogicalDate): number {
  return new Date(toDayNumber(logicalDate) * 86_400_000).getUTCDay();
}

/** 論理月('YYYY-MM')の、1日から月末までの論理日 */
export function logicalDatesOfMonth(logicalMonth: string): LogicalDate[] {
  const dates: LogicalDate[] = [];
  for (let date = `${logicalMonth}-01`; date.startsWith(logicalMonth); date = addLogicalDays(date, 1)) {
    dates.push(date);
  }
  return dates;
}

/** 論理日の期間(from 〜 to。両端を含む) */
export interface LogicalDateRange {
  from: LogicalDate;
  to: LogicalDate;
}

/** 論理日が期間に入るか(両端を含む) */
export function isInLogicalRange(logicalDate: LogicalDate, range: LogicalDateRange): boolean {
  return logicalDate >= range.from && logicalDate <= range.to;
}

/** 診察用の表示の期間の種類(SPEC.md 8.3):前回の受診日から / 今月 / 今週 / 今日 */
export type ClinicPeriodKind = 'sinceVisit' | 'month' | 'week' | 'today';

/**
 * 診察用の表示の期間(SPEC.md 8.3)。どれも今日(論理日)まで。
 * - 前回の受診日から:基準の日から(受診日の当日も入れる)。基準の日が今日より後なら今日から。
 *   基準の日がない(受診の記録がない)ときは、今月と同じ
 * - 今月:論理月の1日から / 今週:週の始まり(月曜。WEEK_START_DAY)から / 今日:今日だけ
 * @param now 現在時刻(テストで任意の時刻を渡せるよう引数にしている)
 * @param baseDate 前回の受診日(または利用者が変えた基準の日)
 */
export function clinicPeriodRange(kind: ClinicPeriodKind, now: Date, baseDate: LogicalDate | null): LogicalDateRange {
  const today = toLogicalDate(now);
  const monthStart = `${toLogicalMonth(now)}-01`;
  switch (kind) {
    case 'sinceVisit':
      return { from: baseDate === null ? monthStart : baseDate > today ? today : baseDate, to: today };
    case 'month':
      return { from: monthStart, to: today };
    case 'week':
      return { from: toLogicalWeek(now), to: today };
    case 'today':
      return { from: today, to: today };
  }
}

/** 論理日が始まる日時(その日の朝5時。端末のローカル時刻) */
export function startOfLogicalDate(logicalDate: LogicalDate): Date {
  const { year, month, day } = parseLogicalDate(logicalDate);
  return new Date(year, month - 1, day, DAY_START_HOUR);
}

/** 論理月('YYYY-MM')が始まる日時(1日の朝5時) */
export function startOfLogicalMonth(logicalMonth: string): Date {
  return startOfLogicalDate(`${logicalMonth}-01`);
}

function pad2Clock(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * 日時入力(<input type="datetime-local">)に入れる値「2026-10-02T21:05」を作る(端末のローカル時刻。秒は切り捨て)。
 * 交代の記録の「時間を指定」で使う(SPEC.md 17.1)
 */
export function toDateTimeLocalValue(date: Date): string {
  return `${toCalendarDate(date)}T${pad2Clock(date.getHours())}:${pad2Clock(date.getMinutes())}`;
}

/** 日時入力の値「2026-10-02T21:05」を日時に戻す(端末のローカル時刻)。形が正しくなければ null */
export function parseDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute] = match.slice(1, 6).map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  // 2月30日のような、ない日付は受け付けない
  if (date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour) {
    return null;
  }
  return date;
}
