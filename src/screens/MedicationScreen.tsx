// 服薬の最初の画面(SPEC.md 7章):記録画面。治療タブの中で、受診メモと切り替える(5章)
// 上に時間帯ごと(朝食後/昼食後/夕食後/寝る前)の欄、その下に頓服。中止した薬は出さない(7.7)
// 画面の上に「記録の一覧」(7.6)と「薬の設定」のボタン
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AsNeededIntakeSheet } from '../components/medication/AsNeededIntakeSheet';
import { AsNeededItem } from '../components/medication/AsNeededItem';
import { ScheduledIntakeSheet } from '../components/medication/ScheduledIntakeSheet';
import { TimingSectionItem } from '../components/medication/TimingSectionItem';
import { db } from '../db/db';
import { recordAsNeededIntake, recordScheduledIntakes, undoScheduledIntakes } from '../db/medicationRepo';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import {
  buildTimingSections,
  findLastAsNeeded,
  intakeLabelText,
  sortMedications,
  type TimingSection,
} from '../lib/medication';
import { sortForSettings } from '../lib/ordering';
import { toLogicalDate } from '../lib/period';
import { showSaveError } from '../lib/showError';
import type { Medication, MedicationTiming, MedicationTimingId } from '../lib/types';
import { MEDICAL_NOTICE } from '../lib/about';

/** 開いているシート・確認:なし / 時間帯の記録 / 時間帯の取り消しの確認 / 頓服の記録 */
type Modal =
  | null
  | { kind: 'scheduled'; timingId: MedicationTimingId }
  | { kind: 'undo'; timing: MedicationTiming; labelText: string }
  | { kind: 'asNeeded'; medicationId: string };

interface Props {
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  /** タブの見出しと、タブの中の切り替えボタン(SPEC.md 5章) */
  tabHeader: ReactNode;
}

export function MedicationScreen({ onOpenHistory, onOpenSettings, tabHeader }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const medications = useLiveQuery(() => db.medications.toArray());
  const intakes = useLiveQuery(() => db.medicationIntakes.toArray());
  const timings = useLiveQuery(() => db.medicationTimings.toArray());
  const now = useNow();
  const [modal, setModal] = useState<Modal>(null);

  const alterById = new Map((alters ?? []).map((alter) => [alter.id, alter]));
  const pickerAlters = sortForSettings(alters ?? []).visible;
  const sections = medications && timings && intakes ? buildTimingSections(medications, timings, intakes, now) : [];
  const asNeeded = sortMedications(medications ?? []).active.filter((m) => m.kind === 'asNeeded');

  const handleTapSection = (section: TimingSection) => {
    if (section.latestToday) {
      setModal({
        kind: 'undo',
        timing: section.timing,
        labelText: intakeLabelText(section.latestToday, alterById),
      });
    } else {
      setModal({ kind: 'scheduled', timingId: section.timing.id });
    }
  };

  // 記録・取り消しの時刻は、ボタンを押した瞬間の時刻を使う
  const handleRecordScheduled = async (
    timing: MedicationTimingId,
    medicationIds: string[],
    alterId: string | null,
  ) => {
    try {
      // 別の人格が先に記録していたときは記録されない(null)。どちらでもシートは閉じる
      await recordScheduledIntakes(db, timing, medicationIds, alterId, new Date());
      setModal(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const handleUndoScheduled = async (timing: MedicationTimingId) => {
    try {
      await undoScheduledIntakes(db, timing, toLogicalDate(new Date()));
      setModal(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const handleRecordAsNeeded = async (medication: Medication, alterId: string | null, reason: string) => {
    try {
      await recordAsNeededIntake(db, medication.id, alterId, reason, new Date());
      setModal(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const renderContent = () => {
    if (!alters || !medications || !timings || !intakes) {
      return <p>読み込み中…</p>;
    }
    if (sections.length === 0 && asNeeded.length === 0) {
      return <p className="empty">使用中の薬はありません。「薬の設定」から登録できます</p>;
    }
    return (
      <>
        {sections.map((section) => (
          <section key={section.timing.id} className="home-section">
            <h2>{section.timing.name}</h2>
            <TimingSectionItem section={section} alterById={alterById} onTap={handleTapSection} />
          </section>
        ))}
        {asNeeded.length > 0 && (
          <section className="home-section">
            <h2>頓服</h2>
            <ul className="task-list">
              {asNeeded.map((medication) => (
                <li key={medication.id}>
                  <AsNeededItem
                    medication={medication}
                    last={findLastAsNeeded(medication.id, intakes)}
                    now={now}
                    alterById={alterById}
                    onTap={() => setModal({ kind: 'asNeeded', medicationId: medication.id })}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    );
  };

  // シートを開いている間に薬が中止・削除されたら、シートを出さない
  const scheduledSection =
    modal?.kind === 'scheduled' ? sections.find((section) => section.timing.id === modal.timingId) : undefined;
  const asNeededMedication =
    modal?.kind === 'asNeeded' ? asNeeded.find((medication) => medication.id === modal.medicationId) : undefined;

  return (
    <main className="app">
      {tabHeader}
      <div className="screen-actions">
        <button type="button" onClick={onOpenHistory}>
          記録の一覧
        </button>
        <button type="button" onClick={onOpenSettings}>
          薬の設定
        </button>
      </div>
      {renderContent()}
      {/* 医療のアプリではないこと(SPEC.md 14章④) */}
      <p className="settings-note medical-notice">{MEDICAL_NOTICE}</p>
      {scheduledSection && (
        <ScheduledIntakeSheet
          timing={scheduledSection.timing}
          medications={scheduledSection.medications}
          alters={pickerAlters}
          onSelect={(medicationIds, alterId) =>
            handleRecordScheduled(scheduledSection.timing.id, medicationIds, alterId)
          }
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.kind === 'undo' && (
        <ConfirmDialog
          message={`${modal.timing.name}の「${modal.labelText}」の記録を取り消しますか?この時間帯の薬の記録がまとめて取り消され、残りの錠数も戻ります。`}
          confirmLabel="取り消す"
          onConfirm={() => handleUndoScheduled(modal.timing.id)}
          onCancel={() => setModal(null)}
        />
      )}
      {asNeededMedication && (
        <AsNeededIntakeSheet
          medication={asNeededMedication}
          alters={pickerAlters}
          onSelect={(alterId, reason) => handleRecordAsNeeded(asNeededMedication, alterId, reason)}
          onCancel={() => setModal(null)}
        />
      )}
    </main>
  );
}
