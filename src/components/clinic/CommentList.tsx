// メモの下のコメントの並び(SPEC.md 8.4)。古い順に、書いた人格(色つき)・内容・書いた日時を出す
// コメントをタップすると編集画面、「＋ コメント」で新しく書く画面を開く
import { resolveRecordAlter } from '../../lib/completionLabel';
import { formatClockOf, formatMonthDay } from '../../lib/timeFormat';
import type { Alter, ClinicNoteComment } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  /** そのメモのコメント(古い順に並べたもの) */
  comments: ClinicNoteComment[];
  alterById: ReadonlyMap<string, Alter>;
  onOpen: (comment: ClinicNoteComment) => void;
  onAdd: () => void;
}

export function CommentList({ comments, alterById, onOpen, onAdd }: Props) {
  return (
    <div className="comment-list">
      {comments.map((comment) => {
        const author = resolveRecordAlter(comment, alterById);
        return (
          <button key={comment.id} type="button" className="comment-item" onClick={() => onOpen(comment)}>
            <span className="comment-item__meta">
              <AlterNameLabel name={author.name} color={author.color} />
              <span>
                {formatMonthDay(comment.createdAt)} {formatClockOf(comment.createdAt)}
              </span>
            </span>
            <span className="note-item__text">{comment.body}</span>
          </button>
        );
      })}
      <button type="button" className="comment-add" onClick={onAdd}>
        ＋ コメント
      </button>
    </div>
  );
}
