// 早見表の表(SPEC.md 10.6)。画面(QuickTableScreen)と印刷(PrintDocument)で共通
// 画面では名前を名前ラベルにする(SPEC.md 5章)。印刷は今の見た目(色の丸+名前)のまま
import type { QuickTableRow } from '../../lib/alterInfo';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  rows: QuickTableRow[];
  /** 名前を名前ラベルにするか(画面のとき true。印刷では使わない) */
  nameLabels?: boolean;
}

export function QuickTable({ rows, nameLabels = false }: Props) {
  return (
    <table className="quick-table">
      <thead>
        <tr>
          <th scope="col">名前</th>
          <th scope="col">区分</th>
          <th scope="col">体感年齢</th>
          <th scope="col">性別(感)</th>
          <th scope="col">見分け方</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.alterId}>
            <th scope="row">
              {nameLabels ? (
                <AlterNameLabel name={row.name} color={row.color} />
              ) : (
                <span className="quick-table__name">
                  <span className="color-dot" style={{ backgroundColor: row.color }} />
                  {row.name}
                </span>
              )}
            </th>
            <td className="quick-table__category">{row.category}</td>
            <td className="quick-table__age">{row.age}</td>
            <td className="quick-table__gender">{row.gender}</td>
            {/* 見分け方の改行はそのまま出す */}
            <td className="quick-table__identify">{row.identify}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
