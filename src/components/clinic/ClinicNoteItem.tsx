// 受診メモの一覧の1件(SPEC.md 8.2)
// 左に「話した?」のチェックボックス。それ以外の部分をタップすると編集画面を開く
import { resolveRecordAlter } from '../../lib/completionLabel';
import { UNKNOWN_CATEGORY_NAME } from '../../lib/clinicNotes';
import { formatClockOf, formatMonthDay } from '../../lib/timeFormat';
import type { Alter, ClinicNote, ClinicNoteCategory } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  note: ClinicNote;
  alterById: ReadonlyMap<string, Alter>;
  categoryById: ReadonlyMap<string, ClinicNoteCategory>;
  /** 「話した」のチェックを切り替えたとき */
  onToggleDiscussed: (note: ClinicNote, discussed: boolean) => void;
  onOpen: (note: ClinicNote) => void;
}

export function ClinicNoteItem({ note, alterById, categoryById, onToggleDiscussed, onOpen }: Props) {
  const author = resolveRecordAlter(note, alterById);
  const categoryName = categoryById.get(note.categoryId)?.name ?? UNKNOWN_CATEGORY_NAME;

  return (
    <div className="note-item">
      {/* 何のチェックかわかるよう、下に「話した?」と出す(読み上げの名前にもなる)。
          文字を押しても切り替わる(SPEC.md 8.2) */}
      <label className="note-item__check">
        <input
          type="checkbox"
          checked={note.discussedAt !== null}
          onChange={(event) => onToggleDiscussed(note, event.target.checked)}
        />
        <span>話した?</span>
      </label>
      <button type="button" className="note-item__body" onClick={() => onOpen(note)}>
        <span className="note-item__meta">
          <AlterNameLabel name={author.name} color={author.color} />
          <span>{categoryName}</span>
          {/* 書いた日時(実際の日時) */}
          <span>
            {formatMonthDay(note.createdAt)} {formatClockOf(note.createdAt)}
          </span>
        </span>
        {/* 内容は全文。改行もそのまま出す */}
        <span className="note-item__text">{note.body}</span>
        {note.discussedAt !== null && (
          <span className="note-item__discussed">話した日:{formatMonthDay(note.discussedAt)}</span>
        )}
      </button>
    </div>
  );
}
