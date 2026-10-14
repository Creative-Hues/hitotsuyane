import { describe, expect, it } from 'vitest';
import {
  badgeText,
  boardsWithNew,
  buildHomeBoard,
  buildViewerOverride,
  buildInitialReactionKinds,
  buildThreadSummaries,
  commentsOfThread,
  countNewThreads,
  deletePostConfirmMessage,
  editPostConfirmMessage,
  HOME_BOARD_ID,
  isDuplicateBoardName,
  latestPostAt,
  reactionGroups,
  resolveBoardViewer,
  resolveSelectedBoard,
  sortBoards,
  validatePostBody,
  validateThreadTitle,
} from './board';
import type { Alter, Board, BoardComment, BoardThread } from './types';

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

function thread(id: string, boardId: string, createdAt: string): BoardThread {
  return { id, boardId, alterId: null, title: id, body: id, createdAt, editedAt: null };
}

function comment(
  id: string,
  threadId: string,
  createdAt: string,
  editedAt: string | null = null,
  alterId: string | null = null,
): BoardComment {
  return { id, threadId, alterId, body: id, createdAt, editedAt };
}

const home = buildHomeBoard('2026-09-01T00:00:00.000Z');
const boardB: Board = { id: 'b', name: '家のこと', order: 2, createdAt: '' };
const boardC: Board = { id: 'c', name: '病院のこと', order: 1, createdAt: '' };

describe('板(SPEC.md 22.2)', () => {
  it('ホームはいつも一番左、ほかは並び順', () => {
    expect(sortBoards([boardB, { ...home, order: 9 }, boardC]).map((b) => b.id)).toEqual([HOME_BOARD_ID, 'c', 'b']);
  });

  it('選んでいた板が削除されたらホームに戻す', () => {
    expect(resolveSelectedBoard([home, boardB], 'b')).toBe('b');
    expect(resolveSelectedBoard([home], 'b')).toBe(HOME_BOARD_ID);
    expect(resolveSelectedBoard([home], null)).toBe(HOME_BOARD_ID);
  });

  it('同じ名前の板(ホームも含む)は保存できない', () => {
    expect(isDuplicateBoardName('ホーム', [home, boardB])).toBe(true);
    expect(isDuplicateBoardName('家のこと', [home, boardB], 'b')).toBe(false);
  });
});

describe('スレッドの一覧と新着(SPEC.md 22.1・22.4)', () => {
  const threads = [
    thread('t1', HOME_BOARD_ID, '2026-10-01T00:00:00.000Z'),
    thread('t2', HOME_BOARD_ID, '2026-10-03T00:00:00.000Z'),
    thread('t3', 'b', '2026-10-02T00:00:00.000Z'),
  ];
  // t1 にあとからコメント。直した日時は数えない
  const comments = [
    comment('c2', 't1', '2026-10-05T00:00:00.000Z'),
    comment('c1', 't1', '2026-10-04T00:00:00.000Z'),
    comment('c3', 't2', '2026-10-03T01:00:00.000Z', '2026-10-09T00:00:00.000Z'),
  ];

  it('いちばん新しい書き込みは、スレッドとコメントの書いた日時のうち新しいもの(直した日時は数えない)', () => {
    expect(latestPostAt(threads[0], comments)).toBe('2026-10-05T00:00:00.000Z');
    expect(latestPostAt(threads[1], comments)).toBe('2026-10-03T01:00:00.000Z');
    expect(latestPostAt(threads[2], comments)).toBe('2026-10-02T00:00:00.000Z');
    expect(commentsOfThread('t1', comments).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('板ごとに、新しい書き込みがあった順。コメントの件数も数える', () => {
    const list = buildThreadSummaries({ boardId: HOME_BOARD_ID, threads, comments, seens: [], viewerAlterId: 'A' });
    expect(list.map((s) => [s.thread.id, s.commentCount])).toEqual([
      ['t1', 2],
      ['t2', 1],
    ]);
  });

  it('見たあとに、ほかの人格の新しい書き込みがあれば新着。直しただけなら新着にしない', () => {
    const seens = [
      { alterId: 'A', threadId: 't1', seenPostAt: '2026-10-04T00:00:00.000Z' },
      { alterId: 'A', threadId: 't2', seenPostAt: '2026-10-03T01:00:00.000Z' },
      // ほかの人格の「見た」は数えない
      { alterId: 'B', threadId: 't3', seenPostAt: '2026-10-09T00:00:00.000Z' },
    ];
    const list = buildThreadSummaries({ boardId: null, threads, comments, seens, viewerAlterId: 'A' });
    expect(list.map((s) => [s.thread.id, s.hasNew])).toEqual([
      ['t1', true],
      ['t2', false],
      // 人格A は一度も見ていない
      ['t3', true],
    ]);
    expect(countNewThreads({ threads, comments, seens, viewerAlterId: 'A' })).toBe(2);
    expect([...boardsWithNew({ threads, comments, seens, viewerAlterId: 'A' })].sort()).toEqual(['b', HOME_BOARD_ID].sort());
    expect(countNewThreads({ threads, comments, seens, viewerAlterId: 'B' })).toBe(2);
  });

  it('自分(いま見ている人格)が書いたものは新着にしない。「わからない」として見ているときは、いつも新着', () => {
    const own = [{ ...thread('m', HOME_BOARD_ID, '2026-10-01T00:00:00.000Z'), alterId: 'A' }];
    const ownComments = [comment('mc', 'm', '2026-10-02T00:00:00.000Z', null, 'A')];
    expect(countNewThreads({ threads: own, comments: ownComments, seens: [], viewerAlterId: 'A' })).toBe(0);
    expect(countNewThreads({ threads: own, comments: ownComments, seens: [], viewerAlterId: 'B' })).toBe(1);
    expect(countNewThreads({ threads: own, comments: ownComments, seens: [], viewerAlterId: null })).toBe(1);
  });

  it('タブのバッジ:0は出さない、99より多いときは「99+」', () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(5)).toBe('5');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('いま見ている人格(SPEC.md 22.4)', () => {
  /** 交代した時刻 = 気づいた時刻の記録 */
  const log = (id: string, alterId: string | null, hour: number) => ({
    id,
    alterId,
    noticedAt: new Date(2026, 9, 14, hour).toISOString(),
    switchedAt: new Date(2026, 9, 14, hour).toISOString(),
  });

  it('交代の記録のいちばん新しい記録の人格。記録がなければ「わからない」', () => {
    expect(resolveBoardViewer([log('1', 'A', 9), log('2', 'B', 11), log('3', 'C', 10)], null)).toBe('B');
    expect(resolveBoardViewer([], null)).toBeNull();
    expect(resolveBoardViewer([log('1', null, 9)], null)).toBeNull();
  });

  it('選び直すと、その人格。新しい交代の記録が入ったら、その人格に切り替える', () => {
    const logs = [log('1', 'A', 9)];
    const override = buildViewerOverride(logs, 'B');
    expect(resolveBoardViewer(logs, override)).toBe('B');
    // あとから、前の時刻の記録を足しても、いちばん新しい記録は変わらないので選び直したまま
    expect(resolveBoardViewer([...logs, log('0', 'C', 8)], override)).toBe('B');
    // 新しい記録が入った
    expect(resolveBoardViewer([...logs, log('2', 'C', 12)], override)).toBe('C');
    // 記録が1件もないときに「わからない」以外を選んだ
    expect(resolveBoardViewer([], buildViewerOverride([], 'A'))).toBe('A');
  });
});

describe('リアクション(SPEC.md 22.5)', () => {
  const kinds = buildInitialReactionKinds('');
  const alters = [alter('B', 1), alter('A', 0), alter('H', 2, true)];

  it('選択肢の並び順で、付いていない選択肢も出す。付けた人格は人格の並び順(非表示も)', () => {
    const reactions = [
      { id: '1', targetType: 'thread' as const, targetId: 't1', kindId: 'reaction-read', alterId: 'B', createdAt: '' },
      { id: '2', targetType: 'thread' as const, targetId: 't1', kindId: 'reaction-read', alterId: 'A', createdAt: '' },
      { id: '3', targetType: 'thread' as const, targetId: 't1', kindId: 'reaction-agree', alterId: 'H', createdAt: '' },
      // ほかの書き込み・コメントのリアクションは入れない
      { id: '4', targetType: 'comment' as const, targetId: 't1', kindId: 'reaction-read', alterId: 'H', createdAt: '' },
      { id: '5', targetType: 'thread' as const, targetId: 't2', kindId: 'reaction-read', alterId: 'H', createdAt: '' },
    ];
    const groups = reactionGroups({ targetType: 'thread', targetId: 't1', reactions, kinds, alters });
    expect(groups.map((g) => [g.kind.name, g.alters.map((a) => a.id)])).toEqual([
      ['既読', ['A', 'B']],
      ['理解', []],
      ['賛成', ['H']],
      ['反対', []],
    ]);
  });
});

describe('入力と本人確認(SPEC.md 22.3)', () => {
  it('題名・内容が空なら保存できない', () => {
    expect(validateThreadTitle('  ')).toEqual({ ok: false, error: '題名を入力してください' });
    expect(validateThreadTitle(' 週末 ')).toEqual({ ok: true, input: '週末' });
    expect(validatePostBody('\n')).toEqual({ ok: false, error: '内容を入力してください' });
  });

  it('本人確認の文。わからないときと、一緒に消えるコメントの件数', () => {
    expect(editPostConfirmMessage('人格A')).toBe('これは人格Aの書き込みです。人格A本人として、変更しますか?');
    expect(deletePostConfirmMessage('人格A', 3)).toBe(
      'これは人格Aの書き込みです。人格A本人として、削除しますか?コメント3件も一緒に削除されます。',
    );
    expect(editPostConfirmMessage(null)).toBe('書いた人格がわからない書き込みです。変更しますか?');
    expect(deletePostConfirmMessage(null)).toBe('書いた人格がわからない書き込みです。削除しますか?');
  });
});
