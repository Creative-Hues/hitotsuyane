// 受診の履歴(SPEC.md 8.5):受診の記録の一覧(新しい順)と、編集画面・話した相手の設定(8.6)の入口
import { useState } from 'react';
import { AlterNameLabel } from '../components/common/AlterNameLabel';
import { db } from '../db/db';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { sortClinicVisits, visitAlters, visitStaffNames } from '../lib/clinicVisits';
import { UNKNOWN_ALTER_NAME } from '../lib/completionLabel';
import { formatLogicalDateHeading } from '../lib/timeFormat';
import { ClinicStaffSettingsScreen } from './ClinicStaffSettingsScreen';
import { ClinicVisitEditScreen } from './ClinicVisitEditScreen';

/** 表示中の画面:一覧 / 記録の編集 / 話した相手の設定 */
type View = { kind: 'list' } | { kind: 'edit'; id: string } | { kind: 'staff' };

interface Props {
  onBack: () => void;
}

export function ClinicVisitHistoryScreen({ onBack }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const staff = useLiveQuery(() => db.clinicStaff.toArray());
  const visits = useLiveQuery(() => db.clinicVisits.toArray());
  const [view, setView] = useState<View>({ kind: 'list' });
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    rememberScroll();
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!alters || !staff || !visits) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'staff') {
    return <ClinicStaffSettingsScreen onBack={backToList} />;
  }
  if (view.kind === 'edit') {
    const visit = visits.find((item) => item.id === view.id);
    // 削除済みなら一覧を出す
    if (visit) {
      return <ClinicVisitEditScreen key={visit.id} visit={visit} alters={alters} staff={staff} onBack={backToList} />;
    }
  }

  const sorted = sortClinicVisits(visits);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>受診の履歴</h1>
      </header>
      {sorted.length === 0 ? (
        <p className="empty">まだ受診の記録がありません</p>
      ) : (
        <ul className="item-list">
          {sorted.map((visit) => {
            const visited = visitAlters(visit, alters);
            return (
              <li key={visit.id}>
                <button type="button" className="switch-entry" onClick={() => open({ kind: 'edit', id: visit.id })}>
                  <span className="history-entry__time">{formatLogicalDateHeading(visit.visitedOn)}</span>
                  <span className="switch-entry__body">
                    <span className="stats-list__alter switch-entry__alters">
                      {visited.length === 0 ? (
                        <AlterNameLabel name={UNKNOWN_ALTER_NAME} color={null} />
                      ) : (
                        visited.map((alter) => <AlterNameLabel key={alter.id} name={alter.name} color={alter.color} />)
                      )}
                    </span>
                    <span className="switch-entry__sub">{visitStaffNames(visit, staff).join('、')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <section className="settings-section">
        <h2>話した相手</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'staff' })}>
          話した相手の設定
        </button>
      </section>
    </main>
  );
}
