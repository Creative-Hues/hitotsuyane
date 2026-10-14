// 早見表の画面(SPEC.md 10.6)。まず画面に一覧表を出す(交代した人格が、見分け方などをさっと確かめられるように)
// 「PDFに」で、早見表だけを印刷する
import { PrintOverflowNotice } from '../components/print/PrintOverflowNotice';
import { QuickTable } from '../components/profile/QuickTable';
import type { PrintContent, QuickTableRow } from '../lib/alterInfo';
import { useTerm } from '../hooks/useTerm';

interface Props {
  rows: QuickTableRow[];
  onBack: () => void;
  onPrint: () => void;
  /** 印刷したときの早見表(1ページに収まるかを測るため) */
  printPreview: PrintContent;
}

export function QuickTableScreen({ rows, onBack, onPrint, printPreview }: Props) {
  const { t } = useTerm();
  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>早見表</h1>
        <button type="button" onClick={onPrint} disabled={rows.length === 0}>
          PDFに
        </button>
      </header>
      {rows.length > 0 && <PrintOverflowNotice content={printPreview} part="quickTable" label="早見表" />}
      {rows.length === 0 ? (
        <p className="empty">{t('人格がまだ登録されていません')}</p>
      ) : (
        // 画面の横幅に入らないときは、表だけを横にスクロールする
        <div className="quick-table-scroll">
          <QuickTable rows={rows} nameLabels />
        </div>
      )}
    </main>
  );
}
