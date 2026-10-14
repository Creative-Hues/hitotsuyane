// テスト用の疑似データベース(fake-indexeddb)を使う
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import {
  addBoard,
  addComment,
  addReactionKind,
  addThread,
  deleteBoard,
  deleteComment,
  deleteReactionKind,
  deleteThread,
  markThreadSeen,
  renameBoard,
  renameReactionKind,
  reorderBoards,
  toggleReaction,
  updateComment,
  updateThread,
} from './boardRepo';
import { buildThreadSummaries, HOME_BOARD_ID, sortBoards } from '../lib/board';

describe('掲示板の保存(SPEC.md 22章)', () => {
  let database: AppDatabase;
  const now = new Date(2026, 9, 14, 12, 0);
  const later = new Date(2026, 9, 14, 13, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-board');
  });

  afterEach(async () => {
    await database.delete();
  });

  const newThread = (boardId = HOME_BOARD_ID) =>
    addThread(database, { boardId, alterId: 'alter-a', title: '週末', body: '出かける?' }, now);

  it('板:追加・同じ名前は保存できない・ホームは名前を変えられず削除できない・並び替えてもホームは一番左', async () => {
    const added = await addBoard(database, '家のこと', now);
    expect(added.ok).toBe(true);
    expect(await addBoard(database, 'ホーム', now)).toEqual({ ok: false, reason: 'duplicateName' });
    expect(await renameBoard(database, HOME_BOARD_ID, '家')).toBeNull();
    expect(await deleteBoard(database, HOME_BOARD_ID)).toBe(false);
    const second = await addBoard(database, '病院のこと', now);
    if (!added.ok || !second.ok) {
      throw new Error('追加できませんでした');
    }
    await reorderBoards(database, [second.item.id, HOME_BOARD_ID, added.item.id]);
    expect(sortBoards(await database.boards.toArray()).map((b) => b.name)).toEqual(['ホーム', '病院のこと', '家のこと']);
  });

  it('板:スレッドがある板は削除できず、スレッドを消せば削除できる', async () => {
    const added = await addBoard(database, '家のこと', now);
    if (!added.ok) {
      throw new Error('追加できませんでした');
    }
    const thread = await newThread(added.item.id);
    expect(await deleteBoard(database, added.item.id)).toBe(false);
    await deleteThread(database, thread.id);
    expect(await deleteBoard(database, added.item.id)).toBe(true);
  });

  it('自分で書いたスレッド・コメントは新着にならない。ほかの書き込みのあと開くと新着が消える', async () => {
    const thread = await newThread();
    const summary = async () => buildThreadSummaries({
      boardId: HOME_BOARD_ID,
      threads: await database.boardThreads.toArray(),
      comments: await database.boardComments.toArray(),
      seens: await database.boardSeen.toArray(),
    })[0];
    expect((await summary()).hasNew).toBe(false);
    await addComment(database, { threadId: thread.id, alterId: 'alter-b', body: '行く' }, later);
    expect((await summary()).hasNew).toBe(false);
    // ほかの端末の操作の代わりに、「見た」より新しいコメントを直接入れる
    await database.boardComments.add({
      id: 'other',
      threadId: thread.id,
      alterId: null,
      body: 'あとで',
      createdAt: new Date(2026, 9, 14, 14, 0).toISOString(),
      editedAt: null,
    });
    expect((await summary()).hasNew).toBe(true);
    await markThreadSeen(database, thread.id);
    expect((await summary()).hasNew).toBe(false);
  });

  it('直すと「編集済み」の日時が入り、書いた日時は変わらない', async () => {
    const thread = await newThread();
    await updateThread(database, thread.id, { title: '週末の予定', body: '日曜は?' }, later);
    expect(await database.boardThreads.get(thread.id)).toMatchObject({
      title: '週末の予定',
      createdAt: now.toISOString(),
      editedAt: later.toISOString(),
    });
    const comment = await addComment(database, { threadId: thread.id, alterId: null, body: '行く' }, now);
    await updateComment(database, comment.id, '行きたい', later);
    expect(await database.boardComments.get(comment.id)).toMatchObject({ body: '行きたい', editedAt: later.toISOString() });
  });

  it('スレッドを消すと、コメント・リアクション・「見た」の記録も消える。コメントを消すとそのリアクションも消える', async () => {
    const thread = await newThread();
    const keep = await newThread();
    const c1 = await addComment(database, { threadId: thread.id, alterId: null, body: '1' }, now);
    const c2 = await addComment(database, { threadId: thread.id, alterId: null, body: '2' }, now);
    const react = (targetType: 'thread' | 'comment', targetId: string) =>
      toggleReaction(database, { targetType, targetId, kindId: 'reaction-read', alterId: 'alter-a' }, now);
    await react('thread', thread.id);
    await react('comment', c1.id);
    await react('comment', c2.id);
    await react('thread', keep.id);

    await deleteComment(database, c1.id);
    expect(await database.reactions.count()).toBe(3);
    await deleteThread(database, thread.id);
    expect(await database.boardComments.count()).toBe(0);
    expect((await database.reactions.toArray()).map((r) => r.targetId)).toEqual([keep.id]);
    expect((await database.boardSeen.toArray()).map((s) => s.threadId)).toEqual([keep.id]);
  });

  it('リアクション:同じ人格・同じリアクションをもう一度選ぶと外れる', async () => {
    const thread = await newThread();
    const input = { targetType: 'thread' as const, targetId: thread.id, kindId: 'reaction-read', alterId: 'alter-a' };
    expect(await toggleReaction(database, input, now)).toBe(true);
    expect(await toggleReaction(database, { ...input, alterId: 'alter-b' }, now)).toBe(true);
    expect(await database.reactions.count()).toBe(2);
    expect(await toggleReaction(database, input, now)).toBe(false);
    expect((await database.reactions.toArray()).map((r) => r.alterId)).toEqual(['alter-b']);
  });

  it('リアクションの選択肢:同じ名前は保存できない・付いている選択肢は削除できず、名前は変えられる', async () => {
    expect(await addReactionKind(database, '既読', now)).toEqual({ ok: false, reason: 'duplicateName' });
    const thread = await newThread();
    await toggleReaction(database, { targetType: 'thread', targetId: thread.id, kindId: 'reaction-agree', alterId: 'a' }, now);
    expect(await deleteReactionKind(database, 'reaction-agree')).toBe(false);
    expect((await renameReactionKind(database, 'reaction-agree', 'いいね'))?.ok).toBe(true);
    expect(await deleteReactionKind(database, 'reaction-disagree')).toBe(true);
    expect((await database.reactionKinds.orderBy('order').toArray()).map((k) => k.name)).toEqual(['既読', '理解', 'いいね']);
  });
});
