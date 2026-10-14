// タブの一番上の画面の見出し(SPEC.md 5章)。見出しはタブの名前にし、
// タブの中で画面を切り替えるとき(リスト・治療)は、その下に横に並んだ切り替えボタンを出す
// 「‹ 戻る」のある画面では出さない(各画面が、一番上の画面のときだけこの部品を出す)
import { useTerm } from '../../hooks/useTerm';

export interface TabSwitchOption<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  /** 見出し(タブの名前など)。「人格」は呼び方に置き換える */
  title: string;
  /** 切り替えの選択肢。ないときは見出しだけ出す */
  options?: readonly TabSwitchOption<K>[];
  current?: K;
  onSelect?: (key: K) => void;
}

export function TabHeader<K extends string>({ title, options, current, onSelect }: Props<K>) {
  const { t } = useTerm();
  return (
    <>
      <header className="screen-header">
        <h1>{t(title)}</h1>
      </header>
      {options && (
        <div className="tab-switch" role="group" aria-label={`${t(title)}の画面の切り替え`}>
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.key === current ? 'tab-switch__button tab-switch__button--current' : 'tab-switch__button'}
              aria-pressed={option.key === current}
              // 選んでいるほうを押しても何もしない(タブバーと同じ)
              onClick={() => option.key !== current && onSelect?.(option.key)}
            >
              {t(option.label)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
