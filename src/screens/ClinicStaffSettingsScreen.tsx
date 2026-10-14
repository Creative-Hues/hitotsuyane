// 話した相手の設定(SPEC.md 8.6):「受診の履歴」の画面から開く一覧と編集画面
// 選択肢には非表示がないので、すべてを1つの一覧で並び替える
import { useState } from 'react';
import { SortableList } from '../components/common/SortableList';
import { ItemRow } from '../components/settings/ItemRow';
import { db } from '../db/db';
import { reorderClinicStaff } from '../db/clinicStaffRepo';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { ClinicStaffEditScreen } from './ClinicStaffEditScreen';

/** 表示中の画面:一覧 / 選択肢の編集(id が null なら新規追加) */
type View = { kind: 'list' } | { kind: 'staff'; id: string | null };

interface Props {
  onBack: () => void;
}

export function ClinicStaffSettingsScreen({ onBack }: Props) {
  const staff = useLiveQuery(() => db.clinicStaff.toArray());
  const [view, setView] = useState<View>({ kind: 'list' });
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    rememberScroll();
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!staff) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'staff') {
    const target = staff.find((item) => item.id === view.id);
    // 新規追加か、編集する選択肢が見つかるときだけ編集画面を出す(削除済みなら一覧を出す)
    if (view.id === null || target) {
      return <ClinicStaffEditScreen key={view.id ?? 'new'} staff={target} onBack={backToList} />;
    }
  }

  const sorted = [...staff].sort((a, b) => a.order - b.order);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>話した相手の設定</h1>
      </header>
      <section className="settings-section">
        <h2>話した相手</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'staff', id: null })}>
          ＋ 話した相手を追加
        </button>
        {sorted.length === 0 && <p className="empty">選択肢はまだありません</p>}
        <SortableList
          className="item-list"
          items={sorted}
          onReorder={(ids) => reorderClinicStaff(db, ids)}
          renderItem={(item) => <ItemRow name={item.name} hidden={false} onOpen={() => open({ kind: 'staff', id: item.id })} />}
          getLabel={(item) => item.name}
        />
      </section>
    </main>
  );
}
