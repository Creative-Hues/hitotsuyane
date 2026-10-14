// 見出しの行の右端に置く「?」(ヘルプ)ボタン(SPEC.md 23章)
// 押すと、下からその画面の使い方のシートを出す。シートの外(暗いところ)を押しても閉じる(ヘルプのシートだけ)
import { useState, type ReactNode } from 'react';
import { HELP_TEXTS, type HelpKey } from '../../lib/helpTexts';
import { useTerm } from '../../hooks/useTerm';

interface Props {
  helpKey: HelpKey;
  /** 箇条書きの下に出すもの(人格についての「はじめに」をもう一度見るボタン) */
  footer?: (close: () => void) => ReactNode;
}

export function HelpButton({ helpKey, footer }: Props) {
  const { t } = useTerm();
  const [open, setOpen] = useState(false);
  const help = HELP_TEXTS[helpKey];
  const close = () => setOpen(false);

  return (
    <>
      <button type="button" className="help-button" aria-label="この画面の使い方" onClick={() => setOpen(true)}>
        ?
      </button>
      {open && (
        <div
          className="overlay overlay--bottom"
          // シートの外(暗いところ)を押したときだけ閉じる(シートの中を押しても閉じない)
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div className="sheet help-sheet" role="dialog" aria-modal="true" aria-labelledby={`help-${helpKey}`}>
            <h2 id={`help-${helpKey}`} className="sheet__title">
              {t(help.title)}
            </h2>
            <ul className="help-sheet__items">
              {help.items.map((item) => (
                <li key={item}>{t(item)}</li>
              ))}
            </ul>
            {footer?.(close)}
            <button type="button" className="sheet__cancel" onClick={close}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </>
  );
}
