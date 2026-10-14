// 受診メモの診察用の表示の「交代記録」の部分(SPEC.md 8.3)。すべて純粋関数(同じ入力なら同じ結果)。
// 期間の交代の記録から、要約(回数・人格ごとの回数・多いきっかけ)と、詳しい一覧(誰から誰に)を作る
// 日付の計算は period.ts の関数を通す
import { SWITCH_LOG_NOTICE } from './about';
import { isInLogicalRange, toLogicalDate, type LogicalDateRange } from './period';
import { countText } from './stats';
import {
  compareSwitchLogs,
  countSwitchAlters,
  groupSwitchLogsByDay,
  resolveFromAlter,
  resolveSwitchAlter,
  switchAlterLabel,
  switchLogTime,
  tagNamesOf,
  type SwitchAlterCount,
  type SwitchLogDay,
} from './switchLog';
import { formatClockInLogicalDay, formatLogicalDateHeading, formatLogicalMonthDay } from './timeFormat';
import type { Alter, SwitchLog, SwitchTag } from './types';

/** 要約に出す「多いきっかけ」の数(SPEC.md 8.3) */
export const TOP_TAG_COUNT = 3;

/** 多いきっかけ1つ */
export interface TagCount {
  tag: SwitchTag;
  count: number;
}

/** 期間の交代の記録の要約と詳しい一覧 */
export interface SwitchSummary {
  range: LogicalDateRange;
  /** 期間の記録の件数 */
  total: number;
  /** 人格ごとの回数(人格の並び順、「わからない」は最後) */
  byAlter: SwitchAlterCount[];
  /** 多いきっかけ(回数の多い順に上から3つまで。同じ回数ならきっかけの並び順。「わからない」は入れない) */
  topTags: TagCount[];
  /** 論理日ごとの記録(日も記録も古い順) */
  days: SwitchLogDay[];
}

/**
 * 期間の交代の記録の要約と詳しい一覧を作る(SPEC.md 8.3)。記録の時刻(17.3)の論理日で期間に入れる
 * @param alters すべての人格(非表示も含む)
 * @param tags すべてのきっかけ(非表示も含む)
 */
export function buildSwitchSummary(input: {
  logs: readonly SwitchLog[];
  range: LogicalDateRange;
  alters: readonly Alter[];
  tags: readonly SwitchTag[];
}): SwitchSummary {
  const { range, alters, tags } = input;
  const logs = input.logs
    .filter((log) => isInLogicalRange(toLogicalDate(new Date(switchLogTime(log))), range))
    .sort(compareSwitchLogs);

  const tagCounts = new Map<string, number>();
  for (const log of logs) {
    // 同じきっかけが2回入っていても1回と数える
    for (const tagId of new Set(log.tagIds)) {
      tagCounts.set(tagId, (tagCounts.get(tagId) ?? 0) + 1);
    }
  }
  const topTags = tags
    .filter((tag) => (tagCounts.get(tag.id) ?? 0) > 0)
    .map((tag) => ({ tag, count: tagCounts.get(tag.id) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.tag.order - b.tag.order)
    .slice(0, TOP_TAG_COUNT);

  return {
    range,
    total: logs.length,
    byAlter: countSwitchAlters(logs, alters),
    topTags,
    days: groupSwitchLogsByDay(logs),
  };
}

/** 期間の表示「10/1〜10/14」(1日だけなら「10/14」) */
export function rangeLabel(range: LogicalDateRange): string {
  const from = formatLogicalMonthDay(range.from);
  return range.from === range.to ? from : `${from}〜${formatLogicalMonthDay(range.to)}`;
}

/** 要約の見出し「交代の記録(10/1〜10/14)」 */
export function switchSummaryTitle(range: LogicalDateRange): string {
  return `交代の記録(${rangeLabel(range)})`;
}

/** 期間に記録がないときの文 */
export const NO_SWITCH_IN_RANGE_TEXT = 'この期間の交代の記録はありません';

/** 人格ごとの回数の文「人格A 5回、人格B 4回、わからない 3回」 */
export function alterCountsText(summary: SwitchSummary): string {
  return summary.byAlter.map((item) => `${switchAlterLabel(item.alter).name} ${countText(item.count)}`).join('、');
}

/** 多いきっかけの文「音 4回、疲れ 3回」(ないときは null) */
export function topTagsText(summary: SwitchSummary): string | null {
  return summary.topTags.length === 0
    ? null
    : summary.topTags.map((item) => `${item.tag.name} ${countText(item.count)}`).join('、');
}

/**
 * 詳しい一覧の1行の文「21:30 人格A → 人格B(推測) きっかけ:音、夢」。
 * 交代した時刻がわからない記録は時刻に「(気づいた時刻)」を、朝5時前の記録は「翌」を付ける
 */
export function switchLineText(
  log: SwitchLog,
  logicalDate: string,
  alters: readonly Alter[],
  tags: readonly SwitchTag[],
): string {
  const time = `${formatClockInLogicalDay(switchLogTime(log), logicalDate)}${log.switchedAt === null ? '(気づいた時刻)' : ''}`;
  const from = switchAlterLabel(resolveFromAlter(log, alters)).name;
  const to = switchAlterLabel(resolveSwitchAlter(log, alters)).name;
  const guessed = log.fromAlterSource === 'guessed' ? '(推測)' : '';
  return `${time} ${from} → ${to}${guessed} きっかけ:${tagNamesOf(log, tags).join('、')}`;
}

/**
 * 「文字としてコピー」に入れる交代記録の文(SPEC.md 8.3)。
 * 例:
 * ■ 交代の記録(10/1〜10/14)
 * 全12回
 * 人格A 5回、人格B 4回、わからない 3回
 * 多いきっかけ:音 4回、疲れ 3回
 * この記録と集計は、傾向を見るためのものです。診断ではありません。
 *
 * 10/2(金)
 * ・21:30 人格A → 人格B きっかけ:音
 */
export function buildSwitchSummaryText(
  summary: SwitchSummary,
  alters: readonly Alter[],
  tags: readonly SwitchTag[],
): string {
  const head = [`■ ${switchSummaryTitle(summary.range)}`];
  if (summary.total === 0) {
    return [...head, NO_SWITCH_IN_RANGE_TEXT].join('\n');
  }
  head.push(`全${countText(summary.total)}`, alterCountsText(summary));
  const top = topTagsText(summary);
  if (top !== null) {
    head.push(`多いきっかけ:${top}`);
  }
  head.push(SWITCH_LOG_NOTICE);
  const days = summary.days.map((day) =>
    [
      formatLogicalDateHeading(day.logicalDate),
      ...day.logs.map((log) => `・${switchLineText(log, day.logicalDate, alters, tags)}`),
    ].join('\n'),
  );
  return [head.join('\n'), ...days].join('\n\n');
}
