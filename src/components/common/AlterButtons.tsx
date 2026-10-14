// 記録する人格を選ぶボタンの並び(ToDo の SPEC.md 6.2、服薬の 7.4・7.5 で共通)
// 色つきの大きなボタンを order 順に並べ、最後に「わからない」を置く(掲示板のリアクションでは置かない。SPEC.md 22.5)
import { UNKNOWN_ALTER_NAME } from '../../lib/completionLabel';
import type { Alter } from '../../lib/types';

interface Props {
  /** 選択肢に出す人格(非表示でない人格を order 順に並べたもの) */
  alters: Alter[];
  /** 人格を選んだとき。「わからない」は null */
  onSelect: (alterId: string | null) => void;
  /** true のとき、どのボタンも押せない */
  disabled?: boolean;
  /** 「わからない」のボタンを置くか(ふつうは置く) */
  showUnknown?: boolean;
  /** 「✓」を付ける人格(すでに選んでいる人格。掲示板のリアクション) */
  checkedIds?: ReadonlySet<string>;
}

export function AlterButtons({ alters, onSelect, disabled = false, showUnknown = true, checkedIds }: Props) {
  return (
    <div className="picker-buttons">
      {alters.map((alter) => (
        <button
          key={alter.id}
          type="button"
          className="picker-button"
          style={{ backgroundColor: alter.color }}
          disabled={disabled}
          onClick={() => onSelect(alter.id)}
        >
          {checkedIds?.has(alter.id) && '✓ '}
          {alter.name}
        </button>
      ))}
      {showUnknown && (
        <button
          type="button"
          className="picker-button picker-button--unknown"
          disabled={disabled}
          onClick={() => onSelect(null)}
        >
          {UNKNOWN_ALTER_NAME}
        </button>
      )}
    </div>
  );
}
