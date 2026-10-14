// 編集画面の上に出す「人格Aが書いたメモ」(SPEC.md 8.1・8.4)。人格の名前は名前ラベルにする
// 受診メモは書いた人格の「自分の言葉」なので、ほかの人格が直すときに誰のものかがわかるようにする
import { authorHeading, type AuthoredKind } from '../../lib/clinicNotes';
import type { Alter } from '../../lib/types';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  alterId: string | null;
  kind: AuthoredKind;
  alterById: ReadonlyMap<string, Alter>;
}

export function AuthorHeading({ alterId, kind, alterById }: Props) {
  const { term } = useTerm();
  const { alter, text } = authorHeading(alterId, kind, alterById, term);
  return (
    <p className="author-heading">
      {alter ? (
        <>
          <AlterNameLabel name={alter.name} color={alter.color} />が書いた{kind}
        </>
      ) : (
        text
      )}
    </p>
  );
}
