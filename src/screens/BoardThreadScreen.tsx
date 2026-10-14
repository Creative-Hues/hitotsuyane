// スレッドの画面(SPEC.md 22.3):題名と本文、コメント(古い順)、それぞれのリアクション、「＋ コメントを書く」
// 開いたら、いま見ている人格について「見た」にする。開いている間に書き込みが増えたときも「見た」にする(SPEC.md 22.4)
// 「わからない」として見ているときは「見た」を記録しない
import { useEffect } from 'react';
import { PostCard } from '../components/board/PostCard';
import { ReactionBar } from '../components/board/ReactionBar';
import { db } from '../db/db';
import { markThreadSeen } from '../db/boardRepo';
import { commentsOfThread, latestPostAt } from '../lib/board';
import type { Alter, BoardComment, BoardThread, Reaction, ReactionKind } from '../lib/types';

interface Props {
  thread: BoardThread;
  comments: readonly BoardComment[];
  reactions: readonly Reaction[];
  kinds: readonly ReactionKind[];
  /** すべての人格(非表示も含む) */
  alters: Alter[];
  /** いま見ている人格(「わからない」は null) */
  viewerAlterId: string | null;
  onBack: () => void;
  onEditThread: () => void;
  onEditComment: (comment: BoardComment) => void;
  onAddComment: () => void;
}

export function BoardThreadScreen({
  thread,
  comments,
  reactions,
  kinds,
  alters,
  viewerAlterId,
  onBack,
  onEditThread,
  onEditComment,
  onAddComment,
}: Props) {
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const own = commentsOfThread(thread.id, comments);
  const latest = latestPostAt(thread, own);

  // 開いたとき・書き込みが増えたときに「見た」にする
  useEffect(() => {
    markThreadSeen(db, thread.id, viewerAlterId).catch((error: unknown) => {
      console.error('「見た」を記録できませんでした', error);
    });
  }, [thread.id, latest, viewerAlterId]);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>スレッド</h1>
      </header>
      <PostCard
        post={thread}
        title={thread.title}
        alterById={alterById}
        onEdit={onEditThread}
        reactions={<ReactionBar targetType="thread" targetId={thread.id} reactions={reactions} kinds={kinds} alters={alters} />}
      />
      <section className="post-comments">
        <h2>コメント({own.length}件)</h2>
        {own.length === 0 && <p className="empty">まだコメントはありません</p>}
        {own.map((comment) => (
          <PostCard
            key={comment.id}
            post={comment}
            alterById={alterById}
            onEdit={() => onEditComment(comment)}
            reactions={
              <ReactionBar targetType="comment" targetId={comment.id} reactions={reactions} kinds={kinds} alters={alters} />
            }
          />
        ))}
        <button type="button" className="add-button" onClick={onAddComment}>
          ＋ コメントを書く
        </button>
      </section>
    </main>
  );
}
