// 掲示板の保存・更新・削除(SPEC.md 22章):板・スレッド・コメント・「見た」の記録・リアクション・リアクションの選択肢
// 本人確認は画面で出す。ここでは確認が済んだあとの保存だけを行う
import type { AppDatabase } from './db';
import {
  HOME_BOARD_ID,
  isDuplicateBoardName,
  isDuplicateReactionKindName,
  latestPostAt,
} from '../lib/board';
import { nextOrder, reorderSubset } from '../lib/ordering';
import type { Board, BoardComment, BoardThread, Reaction, ReactionKind, ReactionTargetType } from '../lib/types';

/** 追加・名前の変更の結果。同じ名前があるときは保存しない */
export type SaveNamedResult<T> = { ok: true; item: T } | { ok: false; reason: 'duplicateName' };

// ---- 板(SPEC.md 22.2) ----

/**
 * 板を一覧の最後に追加する。同じ名前の板(ホームも含む)があれば追加しない
 * @param name normalizeName 済みの名前
 */
export async function addBoard(database: AppDatabase, name: string, now: Date): Promise<SaveNamedResult<Board>> {
  return database.transaction('rw', database.boards, async () => {
    const all = await database.boards.toArray();
    if (isDuplicateBoardName(name, all)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    const board: Board = { id: crypto.randomUUID(), name, order: nextOrder(all), createdAt: now.toISOString() };
    await database.boards.add(board);
    return { ok: true, item: board } as const;
  });
}

/** 板の名前を変える。ホームの板・見つからない板は変えず null。同じ名前があれば変えない */
export async function renameBoard(
  database: AppDatabase,
  id: string,
  name: string,
): Promise<SaveNamedResult<Board> | null> {
  return database.transaction('rw', database.boards, async () => {
    const all = await database.boards.toArray();
    const target = all.find((board) => board.id === id);
    if (!target || id === HOME_BOARD_ID) {
      return null;
    }
    if (isDuplicateBoardName(name, all, id)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    await database.boards.update(id, { name });
    return { ok: true, item: { ...target, name } } as const;
  });
}

/** 板を並べ替える(ホームはいつも一番左なので、渡されても順番を変えない) */
export async function reorderBoards(database: AppDatabase, orderedIds: readonly string[]): Promise<void> {
  await database.transaction('rw', database.boards, async () => {
    const others = (await database.boards.toArray()).filter((board) => board.id !== HOME_BOARD_ID);
    const changes = reorderSubset(
      others,
      orderedIds.filter((id) => id !== HOME_BOARD_ID),
    );
    for (const change of changes) {
      await database.boards.update(change.id, { order: change.order });
    }
  });
}

/** その板のスレッドの件数 */
export async function countBoardThreads(database: AppDatabase, boardId: string): Promise<number> {
  return database.boardThreads.where('boardId').equals(boardId).count();
}

/** 板を削除する。ホームの板・スレッドが1件でもある板は削除せず false(削除したら true) */
export async function deleteBoard(database: AppDatabase, id: string): Promise<boolean> {
  return database.transaction('rw', [database.boards, database.boardThreads], async () => {
    if (id === HOME_BOARD_ID || (await countBoardThreads(database, id)) > 0) {
      return false;
    }
    await database.boards.delete(id);
    return true;
  });
}

// ---- 「見た」の記録(SPEC.md 22.4) ----

/**
 * いま見ている人格について、スレッドを「見た」にする(いちばん新しい書き込みの日時を記録する。SPEC.md 22.4)。
 * 「わからない」(null)として見ているときは記録しない
 */
export async function markThreadSeen(database: AppDatabase, threadId: string, viewerAlterId: string | null): Promise<void> {
  if (viewerAlterId === null) {
    return;
  }
  await database.transaction('rw', [database.boardThreads, database.boardComments, database.boardSeen], async () => {
    const thread = await database.boardThreads.get(threadId);
    if (!thread) {
      return;
    }
    const seenPostAt = latestPostAt(thread, await database.boardComments.where('threadId').equals(threadId).toArray());
    const current = await database.boardSeen.get([viewerAlterId, threadId]);
    if (current?.seenPostAt !== seenPostAt) {
      await database.boardSeen.put({ alterId: viewerAlterId, threadId, seenPostAt });
    }
  });
}

// ---- スレッドとコメント(SPEC.md 22.3) ----

/** スレッドの入力内容(題名・内容はチェック済みのもの) */
export interface ThreadInput {
  boardId: string;
  alterId: string | null;
  title: string;
  body: string;
}

/** スレッドを立てる(自分が書いたものは、新着の判定で数えない。SPEC.md 22.4) */
export async function addThread(database: AppDatabase, input: ThreadInput, now: Date): Promise<BoardThread> {
  const thread: BoardThread = {
    id: crypto.randomUUID(),
    boardId: input.boardId,
    alterId: input.alterId,
    title: input.title,
    body: input.body,
    createdAt: now.toISOString(),
    editedAt: null,
  };
  await database.boardThreads.add(thread);
  return thread;
}

/** 題名と内容を直す。「編集済み」の日時を記録し、書いた日時は変えない */
export async function updateThread(
  database: AppDatabase,
  id: string,
  input: { title: string; body: string },
  now: Date,
): Promise<void> {
  await database.boardThreads.update(id, { title: input.title, body: input.body, editedAt: now.toISOString() });
}

/** スレッドを削除する。コメントと、スレッド・コメントに付いたリアクション、「見た」の記録も一緒に消す */
export async function deleteThread(database: AppDatabase, id: string): Promise<void> {
  const tables = [database.boardThreads, database.boardComments, database.reactions, database.boardSeen];
  await database.transaction('rw', tables, async () => {
    const commentIds = (await database.boardComments.where('threadId').equals(id).toArray()).map((c) => c.id);
    await database.reactions.where('targetId').anyOf([id, ...commentIds]).delete();
    await database.boardComments.bulkDelete(commentIds);
    await database.boardSeen.where('threadId').equals(id).delete();
    await database.boardThreads.delete(id);
  });
}

/** コメントを書く(自分が書いたものは、新着の判定で数えない。SPEC.md 22.4) */
export async function addComment(
  database: AppDatabase,
  input: { threadId: string; alterId: string | null; body: string },
  now: Date,
): Promise<BoardComment> {
  const comment: BoardComment = {
    id: crypto.randomUUID(),
    threadId: input.threadId,
    alterId: input.alterId,
    body: input.body,
    createdAt: now.toISOString(),
    editedAt: null,
  };
  await database.boardComments.add(comment);
  return comment;
}

/** コメントを直す。「編集済み」の日時を記録し、書いた日時は変えない */
export async function updateComment(database: AppDatabase, id: string, body: string, now: Date): Promise<void> {
  await database.boardComments.update(id, { body, editedAt: now.toISOString() });
}

/** コメントを削除する。そのコメントのリアクションも消す */
export async function deleteComment(database: AppDatabase, id: string): Promise<void> {
  await database.transaction('rw', [database.boardComments, database.reactions], async () => {
    await database.reactions.where('targetId').equals(id).delete();
    await database.boardComments.delete(id);
  });
}

// ---- リアクション(SPEC.md 22.5) ----

/**
 * リアクションを付ける。同じ人格・同じ書き込み・同じリアクションがすでにあれば外す(取り消し)。
 * 付けたら true、外したら false
 */
export async function toggleReaction(
  database: AppDatabase,
  input: { targetType: ReactionTargetType; targetId: string; kindId: string; alterId: string },
  now: Date,
): Promise<boolean> {
  return database.transaction('rw', database.reactions, async () => {
    const existing = await database.reactions
      .where('targetId')
      .equals(input.targetId)
      .filter((r) => r.targetType === input.targetType && r.kindId === input.kindId && r.alterId === input.alterId)
      .toArray();
    if (existing.length > 0) {
      await database.reactions.bulkDelete(existing.map((r) => r.id));
      return false;
    }
    const reaction: Reaction = { id: crypto.randomUUID(), ...input, createdAt: now.toISOString() };
    await database.reactions.add(reaction);
    return true;
  });
}

/**
 * リアクションの選択肢を一覧の最後に追加する。同じ名前があれば追加しない
 * @param name normalizeName 済みの名前
 */
export async function addReactionKind(
  database: AppDatabase,
  name: string,
  now: Date,
): Promise<SaveNamedResult<ReactionKind>> {
  return database.transaction('rw', database.reactionKinds, async () => {
    const all = await database.reactionKinds.toArray();
    if (isDuplicateReactionKindName(name, all)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    const kind: ReactionKind = { id: crypto.randomUUID(), name, order: nextOrder(all), createdAt: now.toISOString() };
    await database.reactionKinds.add(kind);
    return { ok: true, item: kind } as const;
  });
}

/** リアクションの選択肢の名前を変える(付けたリアクションの表示も新しい名前になる)。見つからないときは null */
export async function renameReactionKind(
  database: AppDatabase,
  id: string,
  name: string,
): Promise<SaveNamedResult<ReactionKind> | null> {
  return database.transaction('rw', database.reactionKinds, async () => {
    const all = await database.reactionKinds.toArray();
    const target = all.find((kind) => kind.id === id);
    if (!target) {
      return null;
    }
    if (isDuplicateReactionKindName(name, all, id)) {
      return { ok: false, reason: 'duplicateName' } as const;
    }
    await database.reactionKinds.update(id, { name });
    return { ok: true, item: { ...target, name } } as const;
  });
}

/** リアクションの選択肢を並べ替える */
export async function reorderReactionKinds(database: AppDatabase, orderedIds: readonly string[]): Promise<void> {
  await database.transaction('rw', database.reactionKinds, async () => {
    const changes = reorderSubset(await database.reactionKinds.toArray(), orderedIds);
    for (const change of changes) {
      await database.reactionKinds.update(change.id, { order: change.order });
    }
  });
}

/** そのリアクションが付いている件数 */
export async function countReactionKindUsage(database: AppDatabase, id: string): Promise<number> {
  return database.reactions.filter((reaction) => reaction.kindId === id).count();
}

/** リアクションの選択肢を削除する。1件でも付いていれば削除せず false(削除したら true) */
export async function deleteReactionKind(database: AppDatabase, id: string): Promise<boolean> {
  return database.transaction('rw', [database.reactionKinds, database.reactions], async () => {
    if ((await countReactionKindUsage(database, id)) > 0) {
      return false;
    }
    await database.reactionKinds.delete(id);
    return true;
  });
}
