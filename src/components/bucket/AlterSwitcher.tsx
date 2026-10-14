// バケットの画面上部の人格の切り替え(SPEC.md 9.1)
// バケットに出す人格を、並び順で色つきのボタンで並べる。選んでいる人格は色で塗る
// 並びの最後に「+」を置き、バケットに出す人格を足す(SPEC.md 9.1)
import type { Alter } from '../../lib/types';
import { useTerm } from '../../hooks/useTerm';

interface Props {
  /** 切り替えに出す人格(switchableAlters で作ったもの) */
  alters: Alter[];
  /** 選んでいる人格のID(出せる人格がいないときは null) */
  selectedId: string | null;
  onSelect: (alterId: string) => void;
  /** 「+」を押したとき */
  onAdd: () => void;
  /** 「+」から出せる人格がいないときは true(「+」を押せなくする) */
  addDisabled: boolean;
}

export function AlterSwitcher({ alters, selectedId, onSelect, onAdd, addDisabled }: Props) {
  const { t } = useTerm();
  return (
    <div className="alter-switcher" role="group" aria-label="誰のリストを見るか">
      {alters.map((alter) => {
        const selected = alter.id === selectedId;
        return (
          <button
            key={alter.id}
            type="button"
            className={selected ? 'alter-switcher__button alter-switcher__button--selected' : 'alter-switcher__button'}
            // 選んでいる人格は色で塗り、ほかは色の枠だけにする
            style={selected ? { backgroundColor: alter.color, borderColor: alter.color } : { borderColor: alter.color }}
            aria-pressed={selected}
            onClick={() => onSelect(alter.id)}
          >
            {alter.name}
          </button>
        );
      })}
      <button
        type="button"
        className="alter-switcher__button alter-switcher__add"
        disabled={addDisabled}
        aria-label={t('バケットに出す人格を追加する')}
        onClick={onAdd}
      >
        +
      </button>
    </div>
  );
}
