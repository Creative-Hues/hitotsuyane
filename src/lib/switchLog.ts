// 交代の記録(SPEC.md 17章)。すべて純粋関数(同じ入力なら同じ結果)。
// 日付の計算は period.ts の関数を通す
import { UNKNOWN_ALTER_NAME } from './completionLabel';
import { DAY_START_HOUR, toLogicalDate, toLogicalMonth, type LogicalDate } from './period';
import type { Alter, SwitchLog, SwitchLogV6, SwitchTag } from './types';
import { isDuplicateName } from './validation';

/**
 * 最初のきっかけ(SPEC.md 17.2)。
 * ID は決まった値にしておく(古いバックアップを読み込むときにも同じものを作れるように。この ID は変えないこと)
 */
export const DEFAULT_SWITCH_TAGS: readonly { id: string; name: string }[] = [
  { id: 'switch-tag-sound', name: '音' },
  { id: 'switch-tag-smell', name: 'におい' },
  { id: 'switch-tag-talk', name: '人との会話' },
  { id: 'switch-tag-fatigue', name: '疲れ' },
  { id: 'switch-tag-condition', name: '体調' },
  { id: 'switch-tag-dream', name: '夢' },
];

/** 最初のきっかけを作る(データベースの版上げ・新規インストール・古いバックアップの読み込みで使う) */
export function buildInitialSwitchTags(createdAt: string): SwitchTag[] {
  return DEFAULT_SWITCH_TAGS.map(({ id, name }, index) => ({ id, name, hidden: false, order: index, createdAt }));
}

/** きっかけが「わからない」(タグなし)ときの表示名 */
export const UNKNOWN_TRIGGER_NAME = 'わからない';

/** きっかけが見つからないときの表示名(ふつうは起きない。使っているきっかけは削除できないため) */
export const UNKNOWN_TAG_NAME = '(不明なきっかけ)';

/**
 * 同じ名前のきっかけがほかにあるか(非表示のものとも比べる。SPEC.md 17.2)
 * @param name normalizeName 済みの名前
 * @param exceptId 名前を変えているきっかけ自身のID(追加のときは渡さない)
 */
export function isDuplicateTagName(name: string, tags: readonly SwitchTag[], exceptId?: string): boolean {
  return isDuplicateName(name, tags, exceptId);
}

/**
 * 記録の時刻(SPEC.md 17.3)。交代した時刻がわかればその時刻、わからなければ気づいた時刻
 */
export function switchLogTime(log: Pick<SwitchLog, 'noticedAt' | 'switchedAt'>): string {
  return log.switchedAt ?? log.noticedAt;
}

/** 前後を比べるのに使う項目 */
type SwitchLogOrderKey = Pick<SwitchLog, 'id' | 'noticedAt' | 'switchedAt'>;

/**
 * 記録の前後(SPEC.md 17.3)。記録の時刻の古い順、同じなら気づいた時刻の古い順、それも同じなら ID の順。
 * 日時は toISOString() 形式なので、文字列の大小で前後を比べられる
 */
export function compareSwitchLogs(a: SwitchLogOrderKey, b: SwitchLogOrderKey): number {
  return (
    switchLogTime(a).localeCompare(switchLogTime(b)) ||
    a.noticedAt.localeCompare(b.noticedAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * 交代前の人格を推測する(SPEC.md 17.3)。
 * target より前で、いちばん新しい記録の「交代した人格」。前の記録がなければ null(わからない)。
 * target 自身(同じ ID の記録)は数えない。
 * 期間で区切らずに使えるので、フェーズ3の受診前のまとめでも使う
 */
export function guessFromAlterId(
  logs: readonly Pick<SwitchLog, 'id' | 'noticedAt' | 'switchedAt' | 'alterId'>[],
  target: SwitchLogOrderKey,
): string | null {
  let previous: (typeof logs)[number] | null = null;
  for (const log of logs) {
    if (log.id === target.id || compareSwitchLogs(log, target) >= 0) {
      continue;
    }
    if (previous === null || compareSwitchLogs(log, previous) > 0) {
      previous = log;
    }
  }
  return previous?.alterId ?? null;
}

/**
 * 「推測」の記録の交代前の人格を計算し直す(SPEC.md 17.3)。
 * 変わる記録だけを { id, fromAlterId } で返す。「確認した」記録は変えない
 */
export function recomputeGuessedFromAlters(
  logs: readonly SwitchLog[],
): { id: string; fromAlterId: string | null }[] {
  const sorted = [...logs].sort(compareSwitchLogs);
  const changes: { id: string; fromAlterId: string | null }[] = [];
  sorted.forEach((log, index) => {
    if (log.fromAlterSource !== 'guessed') {
      return;
    }
    const guessed = index === 0 ? null : sorted[index - 1].alterId;
    if (guessed !== log.fromAlterId) {
      changes.push({ id: log.id, fromAlterId: guessed });
    }
  });
  return changes;
}

/**
 * 版6までの記録に、交代前の人格を推測で補う(データベースの版上げ・古いバックアップの読み込み。SPEC.md 3.5・12章)。
 * 渡した順のまま返し、すべて「推測」にする
 */
export function fillFromAlters(logs: readonly SwitchLogV6[]): SwitchLog[] {
  const sorted = [...logs].sort(compareSwitchLogs);
  const fromById = new Map(sorted.map((log, index) => [log.id, index === 0 ? null : sorted[index - 1].alterId]));
  return logs.map((log) => ({ ...log, fromAlterId: fromById.get(log.id) ?? null, fromAlterSource: 'guessed' }));
}

/** 「どれくらい前から自分?」の答え(SPEC.md 17.1) */
export type SinceAnswer = { kind: 'now' } | { kind: 'at'; date: Date } | { kind: 'unknown' };

/**
 * 交代した時刻を決める。「今」なら気づいた時刻と同じ、「わからない」なら null。
 * 指定した時刻が気づいた時刻より後なら、エラーとして 'afterNoticed' を返す
 */
export function resolveSwitchedAt(answer: SinceAnswer, noticedAt: Date): string | null | 'afterNoticed' {
  switch (answer.kind) {
    case 'now':
      return noticedAt.toISOString();
    case 'unknown':
      return null;
    case 'at':
      return answer.date.getTime() > noticedAt.getTime() ? 'afterNoticed' : answer.date.toISOString();
  }
}

/** 時間帯の区切り(3時間ずつ8つ。朝5時から。SPEC.md 17.5) */
export const TIME_BIN_LABELS: readonly string[] = [
  '5〜8時',
  '8〜11時',
  '11〜14時',
  '14〜17時',
  '17〜20時',
  '20〜23時',
  '23〜翌2時',
  '翌2〜5時',
];

const TIME_BIN_HOURS = 3;

/** 日時がどの時間帯に入るか(0〜7。端末のローカル時刻で、朝5時から3時間ずつ) */
export function timeBinIndex(date: Date): number {
  const hoursSinceDayStart = (date.getHours() - DAY_START_HOUR + 24) % 24;
  return Math.floor(hoursSinceDayStart / TIME_BIN_HOURS);
}

/**
 * 交代の記録の画面で見られる月の範囲(SPEC.md 17.4)。
 * latest は今の論理月。oldest はいちばん古い記録の論理月(記録がない・今月より新しいときは今月)
 */
export function switchMonthRange(logs: readonly SwitchLog[], now: Date): { oldest: string; latest: string } {
  const latest = toLogicalMonth(now);
  const oldest = logs.reduce((min, log) => {
    const month = toLogicalMonth(new Date(switchLogTime(log)));
    return month < min ? month : min;
  }, latest);
  return { oldest, latest };
}

/** 表示する月を、見られる範囲の中に寄せる。month が null なら今の論理月 */
export function clampSwitchMonth(month: string | null, range: { oldest: string; latest: string }): string {
  if (month === null || month > range.latest) {
    return range.latest;
  }
  return month < range.oldest ? range.oldest : month;
}

/** その論理月の記録を、新しい順に並べて返す */
export function switchLogsInMonth(logs: readonly SwitchLog[], month: string): SwitchLog[] {
  return logs
    .filter((log) => toLogicalMonth(new Date(switchLogTime(log))) === month)
    .sort((a, b) => switchLogTime(b).localeCompare(switchLogTime(a)) || b.noticedAt.localeCompare(a.noticedAt));
}

/** 論理日ごとのまとまり(記録は渡した順のまま) */
export interface SwitchLogDay {
  logicalDate: LogicalDate;
  logs: SwitchLog[];
}

/** 記録を論理日ごとにまとめる(日の順番は、渡した記録の順に最初に出てきた順) */
export function groupSwitchLogsByDay(logs: readonly SwitchLog[]): SwitchLogDay[] {
  const days: SwitchLogDay[] = [];
  for (const log of logs) {
    const logicalDate = toLogicalDate(new Date(switchLogTime(log)));
    const last = days[days.length - 1];
    if (last && last.logicalDate === logicalDate) {
      last.logs.push(log);
    } else {
      days.push({ logicalDate, logs: [log] });
    }
  }
  return days;
}

/** 記録のきっかけの名前(並びはきっかけの並び順。なければ「わからない」だけ) */
export function tagNamesOf(log: Pick<SwitchLog, 'tagIds'>, tags: readonly SwitchTag[]): string[] {
  if (log.tagIds.length === 0) {
    return [UNKNOWN_TRIGGER_NAME];
  }
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return [...log.tagIds]
    .sort((a, b) => (byId.get(a)?.order ?? Infinity) - (byId.get(b)?.order ?? Infinity))
    .map((id) => byId.get(id)?.name ?? UNKNOWN_TAG_NAME);
}

/** 人格(「わからない」は null)と回数 */
export interface SwitchAlterCount {
  /** 人格。「わからない」(または見つからない人格)は null */
  alter: Alter | null;
  count: number;
}

/** 集計の1行(時間帯・きっかけ) */
export interface SwitchStatsRow {
  label: string;
  total: number;
  /** 人格ごとの回数(人格の並び順、「わからない」は最後。0回は入れない) */
  counts: SwitchAlterCount[];
}

/** 1か月分の集計(SPEC.md 17.5) */
export interface SwitchStats {
  /** その月の記録の件数 */
  total: number;
  /** 人格ごとの回数 */
  byAlter: SwitchAlterCount[];
  /** 時間帯ごと(0回の時間帯は入れない。時間帯の順) */
  byTime: SwitchStatsRow[];
  /** きっかけごと(0回のきっかけは入れない。きっかけの並び順、「わからない」は最後) */
  byTag: SwitchStatsRow[];
}

/** 人格のキー(「わからない」・見つからない人格は '') */
const UNKNOWN_KEY = '';

/** 記録の人格のキー(人格が見つからないときは「わからない」として扱う) */
function alterKeyOf(log: SwitchLog, alterById: ReadonlyMap<string, Alter>): string {
  return log.alterId !== null && alterById.has(log.alterId) ? log.alterId : UNKNOWN_KEY;
}

/** キーごとの回数を、人格の並び順(「わからない」は最後)の一覧にする。0回は入れない */
function toSwitchAlterCounts(counts: ReadonlyMap<string, number>, alters: readonly Alter[]): SwitchAlterCount[] {
  const known = [...alters]
    .sort((a, b) => a.order - b.order)
    .filter((alter) => (counts.get(alter.id) ?? 0) > 0)
    .map((alter) => ({ alter, count: counts.get(alter.id) ?? 0 }));
  const unknown = counts.get(UNKNOWN_KEY) ?? 0;
  return unknown > 0 ? [...known, { alter: null, count: unknown }] : known;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function toRow(label: string, counts: ReadonlyMap<string, number>, alters: readonly Alter[]): SwitchStatsRow {
  const alterCounts = toSwitchAlterCounts(counts, alters);
  return { label, total: alterCounts.reduce((sum, item) => sum + item.count, 0), counts: alterCounts };
}

/**
 * 1か月分の集計を作る(SPEC.md 17.5)。
 * @param alters すべての人格(非表示も含む)
 * @param tags すべてのきっかけ(非表示も含む)
 */
export function buildSwitchStats(input: {
  logs: readonly SwitchLog[];
  month: string;
  alters: readonly Alter[];
  tags: readonly SwitchTag[];
}): SwitchStats {
  const { month, alters, tags } = input;
  const logs = switchLogsInMonth(input.logs, month);
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const knownTagIds = new Set(tags.map((tag) => tag.id));

  const byAlter = new Map<string, number>();
  const byTime = TIME_BIN_LABELS.map(() => new Map<string, number>());
  const byTag = new Map<string, Map<string, number>>();
  const tagCounts = (tagKey: string) => {
    const existing = byTag.get(tagKey);
    if (existing) {
      return existing;
    }
    const created = new Map<string, number>();
    byTag.set(tagKey, created);
    return created;
  };

  for (const log of logs) {
    const key = alterKeyOf(log, alterById);
    increment(byAlter, key);
    increment(byTime[timeBinIndex(new Date(switchLogTime(log)))], key);
    // 同じきっかけが2回入っていても1回と数える。見つからないきっかけは数えない
    const tagIds = [...new Set(log.tagIds)].filter((id) => knownTagIds.has(id));
    if (log.tagIds.length === 0) {
      increment(tagCounts(UNKNOWN_KEY), key);
    }
    for (const tagId of tagIds) {
      increment(tagCounts(tagId), key);
    }
  }

  const tagRows = [...tags]
    .sort((a, b) => a.order - b.order)
    .map((tag) => toRow(tag.name, byTag.get(tag.id) ?? new Map(), alters));
  tagRows.push(toRow(UNKNOWN_TRIGGER_NAME, byTag.get(UNKNOWN_KEY) ?? new Map(), alters));

  return {
    total: logs.length,
    byAlter: toSwitchAlterCounts(byAlter, alters),
    byTime: byTime.map((counts, index) => toRow(TIME_BIN_LABELS[index], counts, alters)).filter((row) => row.total > 0),
    byTag: tagRows.filter((row) => row.total > 0),
  };
}

/** 人格の表示名と色(「わからない」は色なし) */
export function switchAlterLabel(alter: Alter | null): { name: string; color: string | null } {
  return alter === null ? { name: UNKNOWN_ALTER_NAME, color: null } : { name: alter.name, color: alter.color };
}

/** 記録の人格(非表示の人格も名前と色で出す。見つからないときは「わからない」) */
export function resolveSwitchAlter(log: Pick<SwitchLog, 'alterId'>, alters: readonly Alter[]): Alter | null {
  return log.alterId === null ? null : (alters.find((alter) => alter.id === log.alterId) ?? null);
}

