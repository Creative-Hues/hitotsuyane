// 掲示板(SPEC.md 22章)。すべて純粋関数(同じ入力なら同じ結果)。
// アプリは操作している人格を知らないので、直す・消すときは本人確認の文を出す(バケットと同じ)
import type { FormResult } from './clinicNotes';
import { latestSwitchLog } from './switchLog';
import type {
  Alter,
  Board,
  BoardComment,
  BoardSeen,
  BoardThread,
  Reaction,
  ReactionKind,
  ReactionTargetType,
  SwitchLog,
} from './types';
import { isDuplicateName } from './validation';

/** ホームの板の ID と名前(SPEC.md 22.2)。この ID は変えないこと */
export const HOME_BOARD_ID = 'board-home';
export const HOME_BOARD_NAME = 'ホーム';

/** ホームの板を作る(データベースの版上げ・新規インストール・古いバックアップの読み込みで使う) */
export function buildHomeBoard(createdAt: string): Board {
  return { id: HOME_BOARD_ID, name: HOME_BOARD_NAME, order: 0, createdAt };
}

/** ホームの板か */
export function isHomeBoard(board: Pick<Board, 'id'>): boolean {
  return board.id === HOME_BOARD_ID;
}

/**
 * リアクションの最初の選択肢(SPEC.md 22.5)。文字だけ。
 * ID は決まった値にしておく(古いバックアップを読み込むときにも同じものを作れるように。この ID は変えないこと)
 */
export const DEFAULT_REACTION_KINDS: readonly { id: string; name: string }[] = [
  { id: 'reaction-read', name: '既読' },
  { id: 'reaction-understand', name: '理解' },
  { id: 'reaction-agree', name: '賛成' },
  { id: 'reaction-disagree', name: '反対' },
];

/** リアクションの最初の選択肢を作る */
export function buildInitialReactionKinds(createdAt: string): ReactionKind[] {
  return DEFAULT_REACTION_KINDS.map(({ id, name }, index) => ({ id, name, order: index, createdAt }));
}

/** 板の並び:ホームがいつも一番左、ほかは並び順 */
export function sortBoards(boards: readonly Board[]): Board[] {
  return [...boards].sort((a, b) => Number(isHomeBoard(b)) - Number(isHomeBoard(a)) || a.order - b.order);
}

/** 表示する板の ID。選んでいた板が削除されたら(見つからなければ)ホームに戻す */
export function resolveSelectedBoard(boards: readonly Board[], selectedId: string | null): string {
  return boards.some((board) => board.id === selectedId) && selectedId !== null ? selectedId : HOME_BOARD_ID;
}

/** 同じ名前の板がほかにあるか(ホームも含めて比べる) */
export function isDuplicateBoardName(name: string, boards: readonly Board[], exceptId?: string): boolean {
  return isDuplicateName(name, boards, exceptId);
}

/** 同じ名前のリアクションの選択肢がほかにあるか */
export function isDuplicateReactionKindName(name: string, kinds: readonly ReactionKind[], exceptId?: string): boolean {
  return isDuplicateName(name, kinds, exceptId);
}

/** スレッドのコメントを古い順に */
export function commentsOfThread(threadId: string, comments: readonly BoardComment[]): BoardComment[] {
  return comments
    .filter((comment) => comment.threadId === threadId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * いちばん新しい書き込みの日時(スレッドを書いた日時と、コメントを書いた日時のうち、いちばん新しいもの。SPEC.md 22.1)。
 * 直した日時は数えない
 */
export function latestPostAt(thread: Pick<BoardThread, 'id' | 'createdAt'>, comments: readonly BoardComment[]): string {
  return comments.reduce(
    (latest, comment) => (comment.threadId === thread.id && comment.createdAt > latest ? comment.createdAt : latest),
    thread.createdAt,
  );
}

/** スレッドの一覧の1行の中身 */
export interface ThreadSummary {
  thread: BoardThread;
  /** いちばん新しい書き込みの日時 */
  latestPostAt: string;
  commentCount: number;
  /** 新着があるか */
  hasNew: boolean;
}

/**
 * いま見ている人格(SPEC.md 22.4)。人格のID、「わからない」は null。
 * 選び直したときは、そのときのいちばん新しい交代の記録の ID も覚えておき、新しい記録が入ったら選び直しをやめる
 */
export interface BoardViewerOverride {
  alterId: string | null;
  /** 選び直したときの、いちばん新しい交代の記録の ID(記録がなければ null) */
  latestLogId: string | null;
}

/**
 * いま見ている人格を決める(SPEC.md 22.4)。
 * 交代の記録のいちばん新しい記録の人格(記録がなければ「わからない」= null)。
 * 選び直していて、そのあと新しい交代の記録が入っていなければ、選び直した人格
 */
export function resolveBoardViewer(
  logs: readonly Pick<SwitchLog, 'id' | 'noticedAt' | 'switchedAt' | 'alterId'>[],
  override: BoardViewerOverride | null,
): string | null {
  const latest = latestSwitchLog(logs);
  if (override !== null && override.latestLogId === (latest?.id ?? null)) {
    return override.alterId;
  }
  return latest?.alterId ?? null;
}

/** 選び直しを作る(いまのいちばん新しい交代の記録を覚える) */
export function buildViewerOverride(
  logs: readonly Pick<SwitchLog, 'id' | 'noticedAt' | 'switchedAt'>[],
  alterId: string | null,
): BoardViewerOverride {
  return { alterId, latestLogId: latestSwitchLog(logs)?.id ?? null };
}

/**
 * 新着があるか(SPEC.md 22.4)。
 * いま見ている人格の「見た」より新しい、ほかの人格(「わからない」を含む)の書き込みがあれば新着。
 * 自分が書いたものは新着にしない。「わからない」として見ているときは、書き込みがあれば新着
 * @param posts スレッドの本文とコメント(書いた人格と書いた日時)
 * @param seen いま見ている人格の、そのスレッドの「見た」の記録
 */
export function hasNewPost(
  posts: readonly Pick<BoardComment, 'alterId' | 'createdAt'>[],
  viewerAlterId: string | null,
  seen: BoardSeen | undefined,
): boolean {
  if (viewerAlterId === null) {
    return posts.length > 0;
  }
  return posts.some((post) => post.alterId !== viewerAlterId && (seen === undefined || post.createdAt > seen.seenPostAt));
}

/**
 * その板のスレッドの一覧(いちばん新しい書き込みの新しい順。SPEC.md 22.1)。
 * boardId を null にすると、すべての板のスレッド
 */
export function buildThreadSummaries(input: {
  boardId: string | null;
  threads: readonly BoardThread[];
  comments: readonly BoardComment[];
  seens: readonly BoardSeen[];
  /** いま見ている人格(「わからない」は null) */
  viewerAlterId: string | null;
}): ThreadSummary[] {
  const { viewerAlterId } = input;
  const seenById = new Map(
    input.seens.filter((seen) => seen.alterId === viewerAlterId).map((seen) => [seen.threadId, seen]),
  );
  const commentsByThread = new Map<string, BoardComment[]>();
  for (const comment of input.comments) {
    commentsByThread.set(comment.threadId, [...(commentsByThread.get(comment.threadId) ?? []), comment]);
  }
  return input.threads
    .filter((thread) => input.boardId === null || thread.boardId === input.boardId)
    .map((thread) => {
      const own = commentsByThread.get(thread.id) ?? [];
      return {
        thread,
        latestPostAt: latestPostAt(thread, own),
        commentCount: own.length,
        hasNew: hasNewPost([thread, ...own], viewerAlterId, seenById.get(thread.id)),
      };
    })
    .sort((a, b) => b.latestPostAt.localeCompare(a.latestPostAt) || b.thread.createdAt.localeCompare(a.thread.createdAt));
}

/** いま見ている人格にとって、新着のあるスレッドの数(タブのバッジ。SPEC.md 22.4) */
export function countNewThreads(input: {
  threads: readonly BoardThread[];
  comments: readonly BoardComment[];
  seens: readonly BoardSeen[];
  viewerAlterId: string | null;
}): number {
  return buildThreadSummaries({ ...input, boardId: null }).filter((summary) => summary.hasNew).length;
}

/** いま見ている人格にとって、新着のあるスレッドがある板の ID */
export function boardsWithNew(input: {
  threads: readonly BoardThread[];
  comments: readonly BoardComment[];
  seens: readonly BoardSeen[];
  viewerAlterId: string | null;
}): Set<string> {
  return new Set(
    buildThreadSummaries({ ...input, boardId: null })
      .filter((summary) => summary.hasNew)
      .map((summary) => summary.thread.boardId),
  );
}

/** バッジの文字(0なら出さない。99より多いときは「99+」) */
export function badgeText(count: number): string | null {
  if (count <= 0) {
    return null;
  }
  return count > 99 ? '99+' : String(count);
}

/** 1つの書き込みに付いたリアクション(選択肢の並び順。付けた人格は人格の並び順) */
export interface ReactionGroup {
  kind: ReactionKind;
  /** 付けた人格(非表示も名前と色で出す。見つからない人格は出さない) */
  alters: Alter[];
}

/** 書き込みのリアクションを、選択肢ごとにまとめる(付いていない選択肢も、ボタンを出すので入れる) */
export function reactionGroups(input: {
  targetType: ReactionTargetType;
  targetId: string;
  reactions: readonly Reaction[];
  kinds: readonly ReactionKind[];
  alters: readonly Alter[];
}): ReactionGroup[] {
  const own = input.reactions.filter((r) => r.targetType === input.targetType && r.targetId === input.targetId);
  const sortedAlters = [...input.alters].sort((a, b) => a.order - b.order);
  return [...input.kinds]
    .sort((a, b) => a.order - b.order)
    .map((kind) => {
      const alterIds = new Set(own.filter((r) => r.kindId === kind.id).map((r) => r.alterId));
      return { kind, alters: sortedAlters.filter((alter) => alterIds.has(alter.id)) };
    });
}

/** 題名をチェックする(空なら保存できない。SPEC.md 22.3) */
export function validateThreadTitle(title: string): FormResult<string> {
  const trimmed = title.trim();
  return trimmed === '' ? { ok: false, error: '題名を入力してください' } : { ok: true, input: trimmed };
}

/** 内容をチェックする(前後の空白を取り除き、空なら保存できない。途中の改行はそのまま) */
export function validatePostBody(body: string): FormResult<string> {
  const trimmed = body.trim();
  return trimmed === '' ? { ok: false, error: '内容を入力してください' } : { ok: true, input: trimmed };
}

/** 本人確認の文の最初の部分(SPEC.md 22.3)。書いた人格が「わからない」なら null を渡す */
function postPrefix(authorName: string | null): string {
  return authorName === null
    ? '書いた人格がわからない書き込みです。'
    : `これは${authorName}の書き込みです。${authorName}本人として、`;
}

/** 直すときの本人確認(SPEC.md 22.3) */
export function editPostConfirmMessage(authorName: string | null): string {
  return `${postPrefix(authorName)}変更しますか?`;
}

/** 消すときの本人確認(SPEC.md 22.3)。スレッドのときは、一緒に消えるコメントの件数を渡す */
export function deletePostConfirmMessage(authorName: string | null, commentCount = 0): string {
  const tail = commentCount > 0 ? `コメント${commentCount}件も一緒に削除されます。` : '';
  return `${postPrefix(authorName)}削除しますか?${tail}`;
}
