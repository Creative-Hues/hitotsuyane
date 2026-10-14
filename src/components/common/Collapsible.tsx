// 見出しを押すと中身を開いたり閉じたりできるまとまり(折りたたみ。SPEC.md 10.1)
// 開け閉めの状態は呼び出し側が持つ(画面を行き来しても、アプリを開いている間は覚えておくため)
import { useId, type ReactNode } from 'react';

interface Props {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export function Collapsible({ title, open, onToggle, children }: Props) {
  const bodyId = useId();
  return (
    <section className="collapsible">
      <h2 className="collapsible__heading">
        <button
          type="button"
          className="collapsible__toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span className="collapsible__mark" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
        </button>
      </h2>
      <div id={bodyId} className="collapsible__body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
