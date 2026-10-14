// 記録するときの、交代前の人格の文と「交代前の人格を修正」ボタン(SPEC.md 17.1)
// 人格の名前は名前ラベルにする
import type { FromAlterNotice } from '../../lib/switchLog';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';
import { UNKNOWN_ALTER_NAME } from '../../lib/completionLabel';

interface Props {
  notice: FromAlterNotice;
  /** 「交代前の人格を修正」を押したとき */
  onFix: () => void;
}

function NoticeText({ notice }: { notice: FromAlterNotice }) {
  switch (notice.kind) {
    case 'ask':
      return (
        <>
          <AlterNameLabel name={notice.alter.name} color={notice.alter.color} />
          さんからの交代で合っていますか?
        </>
      );
    case 'same':
      return (
        <>
          前の記録も
          <AlterNameLabel name={notice.alter.name} color={notice.alter.color} />
          さんです。間にほかの人がいたら修正してください。
        </>
      );
    case 'unknown':
      return <>交代前:{UNKNOWN_ALTER_NAME}</>;
    case 'confirmed':
      return notice.alter === null ? (
        <>交代前:{UNKNOWN_ALTER_NAME}</>
      ) : (
        <>
          交代前:
          <AlterNameLabel name={notice.alter.name} color={notice.alter.color} />
        </>
      );
  }
}

export function FromAlterNoticeView({ notice, onFix }: Props) {
  const { t } = useTerm();
  return (
    <div className="from-alter">
      <p className="from-alter__text">
        <NoticeText notice={notice} />
      </p>
      <button type="button" onClick={onFix}>
        {t('交代前の人格を修正')}
      </button>
    </div>
  );
}
