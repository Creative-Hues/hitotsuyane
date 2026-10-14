// ToDo 画面(SPEC.md 6.1):期限なし・今日・今週・今月の欄と、記録・取り消し。リストタブの中で、バケットと切り替える(5章)
// 「＋ 追加」で、期限なしのタスクの追加画面を開く(ほかの周期は「タスク設定」から足す)
import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { AlterPickerSheet } from '../components/home/AlterPickerSheet';
import { NoDeadlineSection } from '../components/home/NoDeadlineSection';
import { TaskSection } from '../components/home/TaskSection';
import { db } from '../db/db';
import { addRecord, undoCurrentRecord } from '../db/recordRepo';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import { completionLabelText, toCompletionLabel } from '../lib/completionLabel';
import { buildHomeSections, type HomeItem, type HomeSection } from '../lib/home';
import { sortForSettings } from '../lib/ordering';
import { showSaveError } from '../lib/showError';
import type { Cycle, Task } from '../lib/types';
import { TaskEditScreen } from './TaskEditScreen';

/** 「＋ 追加」で足すタスクの周期(SPEC.md 6.1) */
const NO_DEADLINE: Cycle = { type: 'none' };

/** 開いているシート・確認:なし / 人格の選択 / 取り消しの確認 */
type Modal = null | { kind: 'pick'; task: Task } | { kind: 'undo'; task: Task; labelText: string };

interface Props {
  onOpenTaskSettings: () => void;
  /** タブの見出しと、タブの中の切り替えボタン(SPEC.md 5章) */
  tabHeader: ReactNode;
}

export function HomeScreen({ onOpenTaskSettings, tabHeader }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const tasks = useLiveQuery(() => db.tasks.toArray());
  const records = useLiveQuery(() => db.records.toArray());
  const now = useNow();
  const [modal, setModal] = useState<Modal>(null);
  // 並び替えモード中か(SPEC.md 6.1)
  const [reordering, setReordering] = useState(false);
  // 期限なしの「完了済み」を開いているか(アプリを開いたときは閉じている。SPEC.md 6.1)
  const [noDeadlineDoneOpen, setNoDeadlineDoneOpen] = useState(false);
  // 「＋ 追加」の画面を開いているか
  const [adding, setAdding] = useState(false);

  const alterById = new Map((alters ?? []).map((alter) => [alter.id, alter]));

  const handleTap = (item: HomeItem, section: HomeSection) => {
    // 並び替えモード中は記録も取り消しもしない
    if (reordering) {
      return;
    }
    if (item.status === 'done' && item.currentRecord) {
      const label = toCompletionLabel(item.currentRecord, section.key, alterById);
      setModal({ kind: 'undo', task: item.task, labelText: completionLabelText(label) });
    } else {
      setModal({ kind: 'pick', task: item.task });
    }
  };

  // 記録・取り消しの時刻は、ボタンを押した瞬間の時刻を使う
  const handleSelect = async (task: Task, alterId: string | null) => {
    try {
      await addRecord(db, task, alterId, new Date());
      setModal(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const handleUndo = async (task: Task) => {
    try {
      await undoCurrentRecord(db, task, new Date());
      setModal(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const renderContent = () => {
    if (!alters || !tasks || !records) {
      return <p>読み込み中…</p>;
    }
    const sections = buildHomeSections(tasks, records, now);
    if (sections.length === 0) {
      return <p className="empty">表示するタスクはありません</p>;
    }
    return sections.map((section) =>
      section.key === 'none' ? (
        <NoDeadlineSection
          key={section.key}
          section={section}
          alters={alters}
          alterById={alterById}
          reordering={reordering}
          doneOpen={noDeadlineDoneOpen}
          onToggleDone={() => setNoDeadlineDoneOpen((current) => !current)}
          onTap={handleTap}
        />
      ) : (
        <TaskSection
          key={section.key}
          section={section}
          alters={alters}
          alterById={alterById}
          reordering={reordering}
          onTap={handleTap}
        />
      ),
    );
  };

  if (adding && alters) {
    return <TaskEditScreen alters={alters} fixedCycle={NO_DEADLINE} onBack={() => setAdding(false)} />;
  }

  return (
    <main className="app">
      {tabHeader}
      <div className="screen-actions">
        <button type="button" disabled={reordering} onClick={() => setAdding(true)}>
          ＋ 追加
        </button>
        <button type="button" onClick={() => setReordering((current) => !current)}>
          {reordering ? '完了' : '並び替え'}
        </button>
        <button type="button" onClick={onOpenTaskSettings}>
          タスク設定
        </button>
      </div>
      {renderContent()}
      {modal?.kind === 'pick' && (
        <AlterPickerSheet
          task={modal.task}
          alters={sortForSettings(alters ?? []).visible}
          onSelect={(alterId) => handleSelect(modal.task, alterId)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.kind === 'undo' && (
        <ConfirmDialog
          message={`${modal.labelText} の記録を取り消しますか?`}
          confirmLabel="取り消す"
          onConfirm={() => handleUndo(modal.task)}
          onCancel={() => setModal(null)}
        />
      )}
    </main>
  );
}
