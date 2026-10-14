// 記録画面の時間帯の欄(SPEC.md 7.4)。欄をタップすると、未記録なら記録のシート、記録済みなら取り消しの確認
// 記録済みの欄は薄く表示するが、残りの目立つ色・「残りの数を確認してください」・「この回は記録なし」は薄くしない
// (欄全体を薄くすると中身も全部薄くなるので、薄くする部分だけに CSS をあてる)
import { resolveRecordAlter } from '../../lib/completionLabel';
import { findSkippedMedicationIds, toYesterdayLabel, type TimingSection } from '../../lib/medication';
import { formatClockOf } from '../../lib/timeFormat';
import type { Alter } from '../../lib/types';
import { PreviousPeriodLine } from '../common/PreviousPeriodLine';
import { StockLine } from './StockLine';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  section: TimingSection;
  alterById: ReadonlyMap<string, Alter>;
  onTap: (section: TimingSection) => void;
}

export function TimingSectionItem({ section, alterById, onTap }: Props) {
  const latest = section.latestToday;
  const doneBy = latest ? resolveRecordAlter(latest, alterById) : null;
  const yesterday = toYesterdayLabel(section.yesterday, alterById);
  const skippedIds = findSkippedMedicationIds(section);

  return (
    <button
      type="button"
      className={latest ? 'task-item intake-section--done' : 'task-item'}
      onClick={() => onTap(section)}
    >
      <span className="task-item__status" aria-hidden="true">
        {latest ? '✓' : '○'}
      </span>
      <span className="task-item__body">
        {section.medications.map((medication) => (
          <span key={medication.id} className="intake-medication">
            <span className="intake-medication__head">
              <span className="item-name item-row__name intake-medication__name">{medication.name}</span>
              {/* シートでチェックを外した薬。責める言葉・警告の色は使わない(SPEC.md 14章①) */}
              {skippedIds.has(medication.id) && <span className="intake-skipped">この回は記録なし</span>}
            </span>
            <StockLine medication={medication} />
          </span>
        ))}
        {/* 完了表示「人格A・21:30」 */}
        {latest && doneBy && (
          <span className="task-item__done-by">
            <AlterNameLabel name={doneBy.name} color={doneBy.color} />・
            {formatClockOf(latest.takenAt)}
          </span>
        )}
        {yesterday && <PreviousPeriodLine label={yesterday} />}
      </span>
    </button>
  );
}
