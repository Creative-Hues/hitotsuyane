import { describe, expect, it } from 'vitest';
import { clinicPeriodRange, isInLogicalRange } from './period';
import { buildSwitchSummary, buildSwitchSummaryText, rangeLabel } from './switchSummary';
import type { Alter, SwitchLog, SwitchTag } from './types';

function alter(id: string, order: number): Alter {
  return {
    id,
    name: `人格${id}`,
    color: '#123456',
    hidden: false,
    order,
    createdAt: '',
    reading: '',
    categoryId: null,
    age: '',
    gender: '',
    identify: '',
  };
}

const tags: SwitchTag[] = [
  { id: 't-sound', name: '音', hidden: false, order: 0, createdAt: '' },
  { id: 't-smell', name: 'におい', hidden: false, order: 1, createdAt: '' },
  { id: 't-talk', name: '人との会話', hidden: false, order: 2, createdAt: '' },
  { id: 't-dream', name: '夢', hidden: true, order: 3, createdAt: '' },
];
const alters = [alter('B', 1), alter('A', 0)];

/** 交代した時刻 = 気づいた時刻の記録(端末のローカル時刻) */
function log(id: string, from: string | null, to: string | null, at: Date, tagIds: string[] = []): SwitchLog {
  return {
    id,
    alterId: to,
    noticedAt: at.toISOString(),
    switchedAt: at.toISOString(),
    tagIds,
    fromAlterId: from,
    fromAlterSource: 'guessed',
  };
}

describe('診察用の表示の期間(SPEC.md 8.3)', () => {
  // 2026/10/14 は水曜日
  const now = new Date(2026, 9, 14, 12, 0);

  it('前回の受診日から:受診日の当日から今日まで。基準の日がなければ今月', () => {
    expect(clinicPeriodRange('sinceVisit', now, '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    expect(clinicPeriodRange('sinceVisit', now, '2026-09-20')).toEqual({ from: '2026-09-20', to: '2026-10-14' });
    expect(clinicPeriodRange('sinceVisit', now, null)).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    // 基準の日が今日より後なら今日だけ
    expect(clinicPeriodRange('sinceVisit', now, '2026-10-20')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
  });

  it('今月・今週(月曜から)・今日', () => {
    expect(clinicPeriodRange('month', now, null)).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    expect(clinicPeriodRange('week', now, null)).toEqual({ from: '2026-10-12', to: '2026-10-14' });
    expect(clinicPeriodRange('today', now, null)).toEqual({ from: '2026-10-14', to: '2026-10-14' });
  });

  it('朝5時の区切り:月曜 4:59 はまだ前の週、1日 4:59 はまだ前の月', () => {
    expect(clinicPeriodRange('week', new Date(2026, 9, 12, 4, 59), null)).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(clinicPeriodRange('week', new Date(2026, 9, 12, 5, 0), null)).toEqual({ from: '2026-10-12', to: '2026-10-12' });
    expect(clinicPeriodRange('month', new Date(2026, 10, 1, 4, 59), null)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('期間に入るかは両端を含む', () => {
    const range = { from: '2026-10-01', to: '2026-10-14' };
    expect(isInLogicalRange('2026-10-01', range)).toBe(true);
    expect(isInLogicalRange('2026-10-14', range)).toBe(true);
    expect(isInLogicalRange('2026-09-30', range)).toBe(false);
    expect(rangeLabel(range)).toBe('10/1〜10/14');
    expect(rangeLabel({ from: '2026-10-14', to: '2026-10-14' })).toBe('10/14');
  });
});

describe('交代記録の要約と詳しい一覧(SPEC.md 8.3)', () => {
  const range = { from: '2026-10-01', to: '2026-10-14' };
  const logs = [
    log('1', null, 'A', new Date(2026, 9, 2, 21, 30), ['t-sound']),
    log('2', 'A', 'B', new Date(2026, 9, 3, 9, 0), ['t-sound', 't-smell', 't-sound']),
    log('3', 'B', 'A', new Date(2026, 9, 3, 22, 0), ['t-smell']),
    log('4', 'A', null, new Date(2026, 9, 4, 3, 0), ['t-talk']),
    log('5', null, 'A', new Date(2026, 9, 5, 9, 0), ['t-dream']),
    log('6', 'A', 'B', new Date(2026, 9, 6, 9, 0)),
    // 期間の外(9/30 と、10/1 4:59 = 論理日は 9/30)
    log('x1', 'B', 'A', new Date(2026, 8, 30, 12, 0), ['t-talk']),
    log('x2', 'B', 'A', new Date(2026, 9, 1, 4, 59), ['t-talk']),
  ];

  it('回数・人格ごとの回数・多いきっかけ上位3つ(同じ回数ならきっかけの並び順。「わからない」は入れない)', () => {
    const summary = buildSwitchSummary({ logs, range, alters, tags });
    expect(summary.total).toBe(6);
    expect(summary.byAlter.map((c) => [c.alter?.id ?? null, c.count])).toEqual([
      ['A', 3],
      ['B', 2],
      [null, 1],
    ]);
    // 音2・におい2・人との会話1・夢1 → 上から3つ(人との会話と夢は同じ回数なので、並び順で人との会話)
    expect(summary.topTags.map((t) => [t.tag.name, t.count])).toEqual([
      ['音', 2],
      ['におい', 2],
      ['人との会話', 1],
    ]);
    // 日も記録も古い順。朝5時前の記録は前の日に入る
    expect(summary.days.map((day) => [day.logicalDate, day.logs.map((l) => l.id)])).toEqual([
      ['2026-10-02', ['1']],
      ['2026-10-03', ['2', '3', '4']],
      ['2026-10-05', ['5']],
      ['2026-10-06', ['6']],
    ]);
  });

  it('「文字としてコピー」の文', () => {
    const summary = buildSwitchSummary({ logs: logs.slice(0, 4), range, alters, tags });
    expect(buildSwitchSummaryText(summary, alters, tags)).toBe(
      [
        '■ 交代の記録(10/1〜10/14)',
        '全4回',
        '人格A 2回、人格B 1回、わからない 1回',
        '多いきっかけ:音 2回、におい 2回、人との会話 1回',
        'この記録と集計は、傾向を見るためのものです。診断ではありません。',
        '',
        '10/2(金)',
        '・21:30 わからない → 人格A(推測) きっかけ:音',
        '',
        '10/3(土)',
        '・9:00 人格A → 人格B(推測) きっかけ:音、におい',
        '・22:00 人格B → 人格A(推測) きっかけ:におい',
        '・翌3:00 人格A → わからない(推測) きっかけ:人との会話',
      ].join('\n'),
    );
  });

  it('期間に記録がないときは、その文だけ', () => {
    const summary = buildSwitchSummary({ logs: [], range, alters, tags });
    expect(buildSwitchSummaryText(summary, alters, tags)).toBe(
      ['■ 交代の記録(10/1〜10/14)', 'この期間の交代の記録はありません'].join('\n'),
    );
  });
});
