// 設定の一覧の1行の中身(人格・タスク・薬で共通)。タップすると編集画面を開く。右端に「編集」ボタン
// selected を渡すと、チェックボックス付きの「選択」の行になる(タップで選択を切り替える。「編集」ボタンは出さない)
import type { ReactNode } from 'react';

interface Props {
  name: string;
  /** 名前の代わりに出すもの(人格の名前ラベル)。ないときは name を文字で出す */
  nameLabel?: ReactNode;
  hidden: boolean;
  /** 名前の左に出すもの(人格の色など) */
  leading?: ReactNode;
  /** 名前の下の段に出すもの(周期・人格ラベル) */
  sub?: ReactNode;
  /** 選択中のとき、この行が選ばれているか(選択中でなければ渡さない) */
  selected?: boolean;
  /** タップしたとき(ふだんは編集画面を開く。選択中は選択を切り替える) */
  onOpen: () => void;
}

export function ItemRow({ name, nameLabel, hidden, leading, sub, selected, onOpen }: Props) {
  const className = hidden ? 'item-row item-row--hidden' : 'item-row';
  const content = (
    <>
      <span className="item-row__main">
        {leading}
        {/* 長い名前は1行で「…」に省略し、行の形を崩さない */}
        <span className="item-name item-row__name">{nameLabel ?? name}</span>
      </span>
      {sub && <span className="item-row__sub">{sub}</span>}
    </>
  );

  if (selected !== undefined) {
    return (
      <label className={`${className} item-row--selectable`}>
        <input type="checkbox" className="item-row__checkbox" checked={selected} onChange={onOpen} />
        <span className="item-row__content">{content}</span>
      </label>
    );
  }
  // 行のどこをタップしても編集画面が開く。はじめて見た人にもわかるよう、右端に「編集」ボタンも置く
  // (ボタンの中にボタンは入れられないので、行と「編集」を横に並べる)
  return (
    <div className="item-row-wrap">
      <button type="button" className={className} onClick={onOpen}>
        {content}
      </button>
      <button type="button" className="edit-button" onClick={onOpen} aria-label={`「${name}」を編集`}>
        編集
      </button>
    </div>
  );
}
