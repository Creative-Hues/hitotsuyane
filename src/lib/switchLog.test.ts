import { describe, expect, it } from 'vitest';
import {
  buildInitialSwitchTags,
  buildSwitchStats,
  clampSwitchMonth,
  compareSwitchLogs,
  countSwitchPairs,
  fillFromAlters,
  fromAlterNotice,
  guessFromAlterId,
  recomputeGuessedFromAlters,
  groupSwitchLogsByDay,
  resolveFromAlter,
  resolveSwitchedAt,
  switchLogsInMonth,
  switchLogTime,
  switchMonthRange,
  tagNamesOf,
  timeBinIndex,
} from './switchLog';
import type { Alter, SwitchLog, SwitchTag } from './types';

function alter(id: string, order: number, hidden = false): Alter {
  return {
    id,
    name: `人格${id}`,
    color: '#123456',
    hidden,
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
  { id: 't-dream', name: '夢', hidden: true, order: 1, createdAt: '' },
];

/** 端末のローカル時刻で記録を作る(交代した時刻 = 気づいた時刻) */
function log(id: string, alterId: string | null, at: Date, tagIds: string[] = []): SwitchLog {
  return {
    id,
    alterId,
    noticedAt: at.toISOString(),
    switchedAt: at.toISOString(),
    tagIds,
    fromAlterId: null,
    fromAlterSource: 'guessed',
  };
}

describe('記録の時刻(SPEC.md 17.3)', () => {
  it('交代した時刻がわかればその時刻、わからなければ気づいた時刻', () => {
    expect(switchLogTime({ noticedAt: 'b', switchedAt: 'a' })).toBe('a');
    expect(switchLogTime({ noticedAt: 'b', switchedAt: null })).toBe('b');
  });
});

describe('「どれくらい前から自分?」(SPEC.md 17.1)', () => {
  const noticed = new Date(2026, 9, 2, 21, 0);

  it('「今」は気づいた時刻、「わからない」は null', () => {
    expect(resolveSwitchedAt({ kind: 'now' }, noticed)).toBe(noticed.toISOString());
    expect(resolveSwitchedAt({ kind: 'unknown' }, noticed)).toBeNull();
  });

  it('時間を指定したときは、気づいた時刻と同じかそれより前だけ', () => {
    const before = new Date(2026, 9, 2, 20, 30);
    expect(resolveSwitchedAt({ kind: 'at', date: before }, noticed)).toBe(before.toISOString());
    expect(resolveSwitchedAt({ kind: 'at', date: noticed }, noticed)).toBe(noticed.toISOString());
    expect(resolveSwitchedAt({ kind: 'at', date: new Date(2026, 9, 2, 21, 1) }, noticed)).toBe('afterNoticed');
  });
});

describe('時間帯の振り分け(SPEC.md 17.5)', () => {
  it('朝5時から3時間ずつ。境界の時刻は後ろの時間帯に入る', () => {
    expect(timeBinIndex(new Date(2026, 9, 2, 5, 0))).toBe(0);
    expect(timeBinIndex(new Date(2026, 9, 2, 7, 59))).toBe(0);
    expect(timeBinIndex(new Date(2026, 9, 2, 8, 0))).toBe(1);
    expect(timeBinIndex(new Date(2026, 9, 2, 22, 59))).toBe(5);
    expect(timeBinIndex(new Date(2026, 9, 2, 23, 0))).toBe(6);
    expect(timeBinIndex(new Date(2026, 9, 3, 1, 59))).toBe(6);
    expect(timeBinIndex(new Date(2026, 9, 3, 2, 0))).toBe(7);
    expect(timeBinIndex(new Date(2026, 9, 3, 4, 59))).toBe(7);
  });
});

describe('月の振り分けと範囲(SPEC.md 17.4)', () => {
  const now = new Date(2026, 9, 2, 12, 0);

  it('論理月で振り分ける(1日 4:59 は前の月)', () => {
    const logs = [
      log('a', null, new Date(2026, 9, 1, 4, 59)),
      log('b', null, new Date(2026, 9, 1, 5, 0)),
      log('c', null, new Date(2026, 9, 2, 9, 0)),
    ];
    expect(switchLogsInMonth(logs, '2026-09').map((l) => l.id)).toEqual(['a']);
    // 新しい順
    expect(switchLogsInMonth(logs, '2026-10').map((l) => l.id)).toEqual(['c', 'b']);
  });

  it('交代した時刻がわからない記録は、気づいた時刻で振り分ける', () => {
    const unknown: SwitchLog = {
      id: 'u',
      alterId: null,
      noticedAt: new Date(2026, 9, 1, 6, 0).toISOString(),
      switchedAt: null,
      tagIds: [],
      fromAlterId: null,
      fromAlterSource: 'guessed',
    };
    expect(switchLogsInMonth([unknown], '2026-10').map((l) => l.id)).toEqual(['u']);
  });

  it('見られる月は、いちばん古い記録の月〜今月。記録がなければ今月だけ', () => {
    expect(switchMonthRange([], now)).toEqual({ oldest: '2026-10', latest: '2026-10' });
    const range = switchMonthRange([log('a', null, new Date(2026, 6, 15, 12, 0))], now);
    expect(range).toEqual({ oldest: '2026-07', latest: '2026-10' });
    expect(clampSwitchMonth(null, range)).toBe('2026-10');
    expect(clampSwitchMonth('2026-05', range)).toBe('2026-07');
    expect(clampSwitchMonth('2026-11', range)).toBe('2026-10');
    expect(clampSwitchMonth('2026-08', range)).toBe('2026-08');
  });

  it('論理日ごとにまとめる(朝5時前は前の日)', () => {
    const logs = switchLogsInMonth(
      [
        log('a', null, new Date(2026, 9, 2, 4, 0)),
        log('b', null, new Date(2026, 9, 2, 6, 0)),
        log('c', null, new Date(2026, 9, 1, 23, 0)),
      ],
      '2026-10',
    );
    expect(groupSwitchLogsByDay(logs).map((day) => [day.logicalDate, day.logs.map((l) => l.id)])).toEqual([
      ['2026-10-02', ['b']],
      ['2026-10-01', ['a', 'c']],
    ]);
  });
});

describe('きっかけの名前', () => {
  it('きっかけの並び順で出し、なければ「わからない」', () => {
    expect(tagNamesOf({ tagIds: ['t-dream', 't-sound'] }, tags)).toEqual(['音', '夢']);
    expect(tagNamesOf({ tagIds: [] }, tags)).toEqual(['わからない']);
    expect(tagNamesOf({ tagIds: ['gone'] }, tags)).toEqual(['(不明なきっかけ)']);
  });

  it('最初のきっかけは決まった ID と並び順で作る', () => {
    expect(buildInitialSwitchTags('x').map((t) => [t.id, t.name, t.order, t.hidden])).toEqual([
      ['switch-tag-sound', '音', 0, false],
      ['switch-tag-smell', 'におい', 1, false],
      ['switch-tag-talk', '人との会話', 2, false],
      ['switch-tag-fatigue', '疲れ', 3, false],
      ['switch-tag-condition', '体調', 4, false],
      ['switch-tag-dream', '夢', 5, false],
    ]);
  });
});

describe('1か月分の集計(SPEC.md 17.5)', () => {
  const alters = [alter('B', 1), alter('A', 0), alter('C', 2, true)];

  it('人格ごと・時間帯ごと・きっかけごとに数える', () => {
    const logs = [
      log('1', 'A', new Date(2026, 9, 2, 21, 0), ['t-sound']),
      log('2', 'B', new Date(2026, 9, 3, 22, 30), ['t-sound', 't-dream']),
      log('3', 'A', new Date(2026, 9, 4, 6, 0)),
      // 非表示の人格も数える
      log('4', 'C', new Date(2026, 9, 5, 2, 30), ['t-dream']),
      // 「わからない」と、見つからない人格は「わからない」として最後に
      log('5', null, new Date(2026, 9, 6, 21, 0)),
      log('6', 'gone', new Date(2026, 9, 6, 22, 0), ['t-sound']),
      // ほかの月は数えない
      log('7', 'A', new Date(2026, 8, 30, 21, 0), ['t-sound']),
    ];
    const stats = buildSwitchStats({ logs, month: '2026-10', alters, tags });
    const simple = (counts: { alter: Alter | null; count: number }[]) =>
      counts.map((c) => [c.alter?.id ?? null, c.count]);

    expect(stats.total).toBe(6);
    expect(simple(stats.byAlter)).toEqual([
      ['A', 2],
      ['B', 1],
      ['C', 1],
      [null, 2],
    ]);
    expect(stats.byTime.map((row) => [row.label, row.total, simple(row.counts)])).toEqual([
      ['5〜8時', 1, [['A', 1]]],
      [
        '20〜23時',
        4,
        [
          ['A', 1],
          ['B', 1],
          [null, 2],
        ],
      ],
      ['翌2〜5時', 1, [['C', 1]]],
    ]);
    // 2つのきっかけがある記録は両方に数える。きっかけなしは「わからない」として最後に
    expect(stats.byTag.map((row) => [row.label, row.total, simple(row.counts)])).toEqual([
      [
        '音',
        3,
        [
          ['A', 1],
          ['B', 1],
          [null, 1],
        ],
      ],
      [
        '夢',
        2,
        [
          ['B', 1],
          ['C', 1],
        ],
      ],
      [
        'わからない',
        2,
        [
          ['A', 1],
          [null, 1],
        ],
      ],
    ]);
  });

  it('記録がない月は、どの欄も空', () => {
    const stats = buildSwitchStats({ logs: [], month: '2026-10', alters, tags });
    expect(stats).toEqual({ total: 0, byAlter: [], byTime: [], byTag: [] });
  });
});

describe('交代前の人格の推測(SPEC.md 17.3)', () => {
  /** 記録の時刻(交代した時刻)と気づいた時刻を別に指定して作る */
  function logAt(id: string, alterId: string | null, switchedAt: Date | null, noticedAt: Date): SwitchLog {
    return {
      id,
      alterId,
      noticedAt: noticedAt.toISOString(),
      switchedAt: switchedAt?.toISOString() ?? null,
      tagIds: [],
      fromAlterId: null,
      fromAlterSource: 'guessed',
    };
  }
  const t = (hour: number, minute = 0) => new Date(2026, 9, 2, hour, minute);

  it('前の記録がなければ「わからない」、あれば、いちばん新しい前の記録の人格', () => {
    const logs = [logAt('a', 'A', t(9), t(9)), logAt('b', 'B', t(11), t(11))];
    expect(guessFromAlterId(logs, logAt('new', 'C', t(8), t(12)))).toBeNull();
    expect(guessFromAlterId(logs, logAt('new', 'C', t(10), t(12)))).toBe('A');
    expect(guessFromAlterId(logs, logAt('new', 'C', t(12), t(12)))).toBe('B');
  });

  it('前の記録が「わからない」なら「わからない」。自分自身は数えない', () => {
    const logs = [logAt('a', null, t(9), t(9)), logAt('b', 'B', t(11), t(11))];
    expect(guessFromAlterId(logs, logAt('new', 'C', t(10), t(12)))).toBeNull();
    expect(guessFromAlterId(logs, logs[1])).toBeNull();
  });

  it('時刻を指定した記録は、交代した時刻で並ぶ。時刻がわからない記録は気づいた時刻で並ぶ', () => {
    // 気づいたのは12時でも、交代したのは8時
    const early = logAt('early', 'A', t(8), t(12));
    // 交代した時刻がわからず、気づいたのは10時
    const unknown = logAt('unknown', 'B', null, t(10));
    const logs = [early, unknown];
    expect(guessFromAlterId(logs, logAt('new', 'C', t(9), t(13)))).toBe('A');
    expect(guessFromAlterId(logs, logAt('new', 'C', t(11), t(13)))).toBe('B');
  });

  it('記録の時刻が同じなら、気づいた時刻の順、それも同じなら ID の順', () => {
    const a = logAt('a', 'A', t(9), t(9, 30));
    const b = logAt('b', 'B', t(9), t(9, 10));
    expect(compareSwitchLogs(b, a)).toBeLessThan(0);
    const c = logAt('c', 'C', t(9), t(9, 10));
    expect(compareSwitchLogs(b, c)).toBeLessThan(0);
    expect(guessFromAlterId([a, b, c], a)).toBe('C');
  });

  it('計算し直しは「推測」の記録だけを変え、変わる記録だけを返す', () => {
    const logs: SwitchLog[] = [
      { ...logAt('a', 'A', t(9), t(9)), fromAlterId: 'X' },
      { ...logAt('b', 'B', t(10), t(10)), fromAlterId: 'A' },
      { ...logAt('c', 'C', t(11), t(11)), fromAlterId: null, fromAlterSource: 'confirmed' },
      { ...logAt('d', 'D', t(12), t(12)), fromAlterId: 'B' },
    ];
    expect(recomputeGuessedFromAlters(logs)).toEqual([
      { id: 'a', fromAlterId: null },
      { id: 'd', fromAlterId: 'C' },
    ]);
  });

  it('版6までの記録には、時刻順に推測を補い、渡した順のまま返す', () => {
    const v6 = [
      { id: 'b', alterId: 'B', noticedAt: t(10).toISOString(), switchedAt: t(10).toISOString(), tagIds: [] },
      { id: 'a', alterId: null, noticedAt: t(9).toISOString(), switchedAt: null, tagIds: [] },
      { id: 'c', alterId: 'C', noticedAt: t(11).toISOString(), switchedAt: t(11).toISOString(), tagIds: [] },
    ];
    expect(fillFromAlters(v6).map((log) => [log.id, log.fromAlterId, log.fromAlterSource])).toEqual([
      ['b', null, 'guessed'],
      ['a', null, 'guessed'],
      ['c', 'B', 'guessed'],
    ]);
  });
});

describe('記録するときの交代前の人格の文(SPEC.md 17.1)', () => {
  const a = alter('A', 0);

  it('推測が人格なら確かめる文、今回と同じ人格なら「前の記録も」の文、わからなければ「わからない」', () => {
    expect(fromAlterNotice(a, 'B', false)).toEqual({ kind: 'ask', alter: a });
    expect(fromAlterNotice(a, 'A', false)).toEqual({ kind: 'same', alter: a });
    expect(fromAlterNotice(null, 'A', false)).toEqual({ kind: 'unknown' });
  });

  it('「交代前の人格を修正」で選んだあとは、選んだ人格(わからないも)をそのまま出す', () => {
    expect(fromAlterNotice(a, 'A', true)).toEqual({ kind: 'confirmed', alter: a });
    expect(fromAlterNotice(null, 'A', true)).toEqual({ kind: 'confirmed', alter: null });
  });

  it('交代前の人格は、非表示の人格も名前と色で出し、見つからなければ「わからない」', () => {
    const hidden = alter('H', 1, true);
    expect(resolveFromAlter({ fromAlterId: 'H' }, [a, hidden])).toBe(hidden);
    expect(resolveFromAlter({ fromAlterId: 'deleted' }, [a])).toBeNull();
    expect(resolveFromAlter({ fromAlterId: null }, [a])).toBeNull();
  });
});

describe('きっかけごとの「誰から誰に」(SPEC.md 17.5)', () => {
  const alters = [alter('B', 1), alter('A', 0), alter('C', 2, true)];
  /** 交代前の人格を指定して記録を作る */
  const pair = (id: string, from: string | null, to: string | null, at: Date, tagIds: string[] = []): SwitchLog => ({
    ...log(id, to, at, tagIds),
    fromAlterId: from,
  });

  it('回数の多い順、同じ回数なら交代前・交代した人格の並び順(「わからない」は最後)', () => {
    const at = new Date(2026, 9, 2, 21, 0);
    const logs = [
      pair('1', 'B', 'A', at),
      pair('2', null, 'A', at),
      pair('3', 'A', 'B', at),
      pair('4', 'A', 'B', at),
      pair('5', 'A', null, at),
      pair('6', 'A', 'C', at),
      // 見つからない人格は「わからない」としてまとめる
      pair('7', 'gone', 'A', at),
    ];
    const simple = countSwitchPairs(logs, alters).map((p) => [p.from?.id ?? null, p.to?.id ?? null, p.count]);
    expect(simple).toEqual([
      ['A', 'B', 2],
      [null, 'A', 2],
      ['A', 'C', 1],
      ['A', null, 1],
      ['B', 'A', 1],
    ]);
  });

  it('集計のきっかけごとの行に、そのきっかけの記録の「誰から誰に」が入る', () => {
    const logs = [
      pair('1', 'A', 'B', new Date(2026, 9, 2, 21, 0), ['t-sound']),
      pair('2', 'B', 'A', new Date(2026, 9, 3, 21, 0), ['t-sound', 't-dream']),
      pair('3', 'B', 'A', new Date(2026, 9, 4, 21, 0)),
    ];
    const stats = buildSwitchStats({ logs, month: '2026-10', alters, tags });
    const simple = stats.byTag.map((row) => [
      row.label,
      row.total,
      row.pairs.map((p) => [p.from?.id ?? null, p.to?.id ?? null, p.count]),
    ]);
    expect(simple).toEqual([
      [
        '音',
        2,
        [
          ['A', 'B', 1],
          ['B', 'A', 1],
        ],
      ],
      ['夢', 1, [['B', 'A', 1]]],
      ['わからない', 1, [['B', 'A', 1]]],
    ]);
  });
});
