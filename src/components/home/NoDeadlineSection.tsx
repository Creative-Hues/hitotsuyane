// ToDo 画面の「期限なし」の欄(SPEC.md 6.1)
// 未完了を order 順に並べ、完了したタスクは欄の一番下の「完了済み」(折りたたみ)に、完了した日時の新しい順で出す
// 完了済みは「選択」で複数選び、確認のあとまとめて削除できる(完了記録は残す)
// 並び替えモード中は、未完了だけを ≡ のドラッグで並び替える
import { useState } from 'react';
import { db } from '../../db/db';
import { deleteTasks, reorderTasks } from '../../db/taskRepo';
import { sortSectionByOrder, type HomeItem, type HomeSection } from '../../lib/home';
import { showSaveError } from '../../lib/showError';
import type { Alter } from '../../lib/types';
import { Collapsible } from '../common/Collapsible';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SortableList } from '../common/SortableList';
import { TaskItem } from './TaskItem';

interface Props {
  section: HomeSection;
  alters: Alter[];
  alterById: ReadonlyMap<string, Alter>;
  /** 並び替えモード中か */
  reordering: boolean;
  /** 「完了済み」を開いているか(アプリを開いたときは閉じている。開け閉めは ToDo 画面が覚える) */
  doneOpen: boolean;
  onToggleDone: () => void;
  onTap: (item: HomeItem, section: HomeSection) => void;
}

export function NoDeadlineSection({
  section,
  alters,
  alterById,
  reordering,
  doneOpen,
  onToggleDone,
  onTap,
}: Props) {
  // 選択中なら、選んだタスクのID。選択中でなければ null
  const [checkedIds, setCheckedIds] = useState<ReadonlySet<string> | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (reordering) {
    // SortableList は id を持つ項目を扱うので、タスクのIDを付けて渡す
    const rows = sortSectionByOrder(section).items.map((item) => ({ id: item.task.id, item }));
    return (
      <section className="home-section">
        <h2>{section.title}</h2>
        <SortableList
          className="task-list"
          items={rows}
          // 未完了のタスクの順番だけを変え、ほかのタスクの順番は変えない
          onReorder={(ids) => reorderTasks(db, ids)}
          renderItem={(row) => <TaskItem item={row.item} section={section.key} alters={alters} alterById={alterById} />}
          getLabel={(row) => row.item.task.name}
        />
      </section>
    );
  }

  const todo = section.items.filter((item) => item.status === 'todo');
  const done = section.items.filter((item) => item.status === 'done');
  const selecting = checkedIds !== null;
  // 選んだもののうち、今も完了済みに出ているタスクだけを数える(ほかの画面で消えた・戻した場合に備える)
  const checkedTasks = checkedIds ? done.filter((item) => checkedIds.has(item.task.id)) : [];

  const toggle = (item: HomeItem) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(item.task.id)) {
        next.delete(item.task.id);
      } else {
        next.add(item.task.id);
      }
      return next;
    });
  };

  // タスクの削除と同じく、完了記録は残す(SPEC.md 3.2・6.4)
  const handleDelete = async () => {
    try {
      await deleteTasks(
        db,
        checkedTasks.map((item) => item.task.id),
      );
      setConfirmingDelete(false);
      setCheckedIds(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  return (
    <section className="home-section">
      <h2>{section.title}</h2>
      {todo.length > 0 && (
        <ul className="task-list">
          {todo.map((item) => (
            <li key={item.task.id}>
              <TaskItem
                item={item}
                section={section.key}
                alters={alters}
                alterById={alterById}
                onTap={(tapped) => onTap(tapped, section)}
              />
            </li>
          ))}
        </ul>
      )}
      {done.length > 0 && (
        <Collapsible title={`完了済み(${done.length}件)`} open={doneOpen} onToggle={onToggleDone}>
          <div className="screen-actions">
            {selecting ? (
              <>
                <button type="button" onClick={() => setCheckedIds(null)}>
                  キャンセル
                </button>
                <button
                  type="button"
                  className="danger-button"
                  disabled={checkedTasks.length === 0}
                  onClick={() => setConfirmingDelete(true)}
                >
                  {checkedTasks.length}件を削除
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setCheckedIds(new Set())}>
                選択
              </button>
            )}
          </div>
          <ul className="task-list">
            {done.map((item) => (
              <li key={item.task.id}>
                {selecting ? (
                  // 選択中は、タップで取り消しをしない
                  <TaskItem
                    item={item}
                    section={section.key}
                    alters={alters}
                    alterById={alterById}
                    onTap={toggle}
                    selected={checkedIds.has(item.task.id)}
                  />
                ) : (
                  <TaskItem
                    item={item}
                    section={section.key}
                    alters={alters}
                    alterById={alterById}
                    onTap={(tapped) => onTap(tapped, section)}
                  />
                )}
              </li>
            ))}
          </ul>
        </Collapsible>
      )}
      {confirmingDelete && (
        <ConfirmDialog
          message={`${checkedTasks.length}件のタスクを削除しますか?これまでの完了記録は残ります。`}
          confirmLabel="削除する"
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </section>
  );
}
