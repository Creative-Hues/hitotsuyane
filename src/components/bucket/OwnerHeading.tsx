// 入力・編集画面の上に出す「人格Aのリスト」(SPEC.md 9.1)。人格の名前は名前ラベルにする
// バケットは「その人格の願い」なので、誰のリストを触っているかがわかるようにする
import type { Alter } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  owner: Alter;
}

export function OwnerHeading({ owner }: Props) {
  return (
    <p className="author-heading">
      <AlterNameLabel name={owner.name} color={owner.color} />のリスト
    </p>
  );
}
