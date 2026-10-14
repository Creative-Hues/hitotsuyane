// 掲示板の書き込み1件(スレッドの本文・コメント。SPEC.md 22.3)
// 書いた人格(名前ラベル)・書いた日時・「編集済み」・「編集」ボタン・内容(改行もそのまま)・リアクション
import type { ReactNode } from 'react';
import { resolveRecordAlter } from '../../lib/completionLabel';
import { formatPostDateTime } from '../../lib/timeFormat';
import type { Alter } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  post: { alterId: string | null; body: string; createdAt: string; editedAt: string | null };
  alterById: ReadonlyMap<string, Alter>;
  /** 題名(スレッドの本文のときだけ) */
  title?: string;
  onEdit: () => void;
  /** リアクション(ReactionBar) */
  reactions: ReactNode;
}

export function PostCard({ post, alterById, title, onEdit, reactions }: Props) {
  const author = resolveRecordAlter(post, alterById);
  return (
    <article className={title ? 'post-card post-card--thread' : 'post-card'}>
      {title && <h2 className="post-card__title">{title}</h2>}
      <div className="post-card__head">
        <AlterNameLabel name={author.name} color={author.color} />
        <span className="post-card__time">{formatPostDateTime(post.createdAt)}</span>
        {post.editedAt !== null && <span className="post-card__edited">編集済み</span>}
        <button type="button" className="post-card__edit" onClick={onEdit}>
          編集
        </button>
      </div>
      <p className="post-card__body">{post.body}</p>
      {reactions}
    </article>
  );
}
