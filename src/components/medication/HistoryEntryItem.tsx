// 記録の一覧の1行(SPEC.md 7.6)。誰が・いつ・何を・頓服の理由
// 決まった時間は時間帯ごとにまとめて1行、頓服は1件ずつ。タップすると取り消しの確認
import { resolveRecordAlter } from '../../lib/completionLabel';
import type { HistoryEntry } from '../../lib/medication';
import { timingNameOf } from '../../lib/medicationTimings';
import type { LogicalDate } from '../../lib/period';
import { formatClockInLogicalDay } from '../../lib/timeFormat';
import type { Alter, Medication, MedicationIntake, MedicationTiming } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

/** 薬が見つからないとき(ふつうは起きない。記録のある薬は削除できないため)の表示名 */
export const UNKNOWN_MEDICATION_NAME = '(不明な薬)';

interface Props {
  entry: HistoryEntry;
  /** この行を並べている見出しの論理日(朝5時前の記録に「翌」を付けるのに使う) */
  logicalDate: LogicalDate;
  medicationById: ReadonlyMap<string, Medication>;
  /** 時間帯(名前は今の一覧から引くので、名前を変えるとここも変わる) */
  timingById: ReadonlyMap<string, MedicationTiming>;
  alterById: ReadonlyMap<string, Alter>;
  onTap: (entry: HistoryEntry) => void;
}

export function HistoryEntryItem({ entry, logicalDate, medicationById, timingById, alterById, onTap }: Props) {
  const intakes: MedicationIntake[] = entry.kind === 'scheduled' ? entry.intakes : [entry.intake];
  // 時間帯の記録はまとめて記録するので、人格と時刻は最後の記録のものを出す
  const latest = intakes[intakes.length - 1];
  const alter = resolveRecordAlter(latest, alterById);
  const nameOf = (intake: MedicationIntake) => medicationById.get(intake.medicationId)?.name ?? UNKNOWN_MEDICATION_NAME;

  return (
    <button type="button" className="task-item history-entry" onClick={() => onTap(entry)}>
      <span className="history-entry__time">{formatClockInLogicalDay(entry.takenAt, logicalDate)}</span>
      <span className="task-item__body">
        <span className="history-entry__head">
          <span className="item-name">{entry.kind === 'scheduled' ? timingNameOf(entry.timing, timingById) : '頓服'}</span>
          <span className="task-item__done-by">
            <AlterNameLabel name={alter.name} color={alter.color} />
          </span>
        </span>
        {intakes.map((intake) => (
          <span key={intake.id} className="item-row__name history-entry__medication">
            {nameOf(intake)}
          </span>
        ))}
        {entry.kind === 'asNeeded' && entry.intake.reason !== '' && (
          <span className="history-entry__reason">理由:{entry.intake.reason}</span>
        )}
      </span>
    </button>
  );
}
