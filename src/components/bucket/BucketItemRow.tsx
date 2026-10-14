// バケットの一覧の1件(SPEC.md 9.1)。タップすると編集画面を開く
// 内容は全文(改行もそのまま)。叶った項目には「叶った日:9/28」と協力してくれた人格のラベルを出す
// 「まだ」の項目は、右に「叶った」ボタンを出す(SPEC.md 9.2)
// selected を渡すと、チェックボックス付きの「選択」の行になる(タップで選択を切り替える。SPEC.md 9.3)
import { formatMonthDay } from '../../lib/timeFormat';
import type { Alter, BucketItem } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  item: BucketItem;
  alterById: ReadonlyMap<string, Alter>;
  /** タップしたとき(ふだんは編集画面を開く。選択中は選択を切り替える) */
  onOpen: (item: BucketItem) => void;
  /** 「叶った」ボタンを押したとき(渡したときだけボタンを出す) */
  onAchieve?: (item: BucketItem) => void;
  /** 選択中のとき、この項目が選ばれているか(選択中でなければ渡さない) */
  selected?: boolean;
}

export function BucketItemRow({ item, alterById, onOpen, onAchieve, selected }: Props) {
  const content = (
    <>
      <span className="note-item__text">{item.body}</span>
      {item.achievedAt !== null && (
        <span className="bucket-item__achieved">
          {/* 叶った日(実際の日付) */}
          <span>叶った日:{formatMonthDay(item.achievedAt)}</span>
          {item.helperAlterIds.map((id) => {
            const helper = alterById.get(id);
            return (
              helper && (
                <AlterNameLabel key={id} name={helper.name} color={helper.color} />
              )
            );
          })}
        </span>
      )}
    </>
  );

  if (selected !== undefined) {
    return (
      <label className="bucket-item bucket-item--selectable">
        <input type="checkbox" className="item-row__checkbox" checked={selected} onChange={() => onOpen(item)} />
        <span className="item-row__content">{content}</span>
      </label>
    );
  }

  const body = (
    <button type="button" className="bucket-item" onClick={() => onOpen(item)}>
      {content}
    </button>
  );
  if (!onAchieve) {
    return body;
  }
  // ボタンの中にボタンは入れられないので、中身と「叶った」を横に並べる
  return (
    <div className="bucket-row">
      {body}
      <button
        type="button"
        className="bucket-row__achieve"
        onClick={() => onAchieve(item)}
        aria-label={`「${item.body}」を叶ったことにする`}
      >
        叶った
      </button>
    </div>
  );
}
