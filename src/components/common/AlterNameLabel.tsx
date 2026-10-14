// 人格の名前ラベル(SPEC.md 5章)。人格の名前を表示するところは、すべてこの部品を使う
// 背景はその人格の色、文字は読みやすい白か黒。「わからない」(color が null)は灰色
// 選ぶための部品(大きな色のボタン・チェックボックスの横の丸)と印刷には使わない
import { nameLabelColors } from '../../lib/labelColor';

interface Props {
  name: string;
  /** 人格の色。「わからない」のときは null */
  color: string | null;
  /** 大きさ。large は診察用の表示の見出しなど */
  size?: 'normal' | 'large';
}

export function AlterNameLabel({ name, color, size = 'normal' }: Props) {
  const { background, text } = nameLabelColors(color);
  return (
    <span
      className={size === 'large' ? 'alter-label alter-label--large' : 'alter-label'}
      style={{ backgroundColor: background, color: text }}
    >
      {name}
    </span>
  );
}
