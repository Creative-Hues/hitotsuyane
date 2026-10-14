// タスクの追加・編集画面(SPEC.md 6.4)。編集のときは非表示/再表示と削除もここから行う
// fixedCycle を渡すと、その周期だけのタスクの追加画面になる(ToDo 画面の「+ 追加」=期限なし。SPEC.md 6.1)
import { useState } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { TaskForm } from '../components/settings/TaskForm';
import { db } from '../db/db';
import { addTask, deleteTask, setTaskHidden, updateTask, type TaskInput } from '../db/taskRepo';
import { sortForSettings } from '../lib/ordering';
import { showSaveError } from '../lib/showError';
import type { Alter, Cycle, Task } from '../lib/types';

interface Props {
  /** 編集するタスク(追加のときは undefined) */
  task?: Task;
  alters: Alter[];
  /** 追加するタスクの周期を決めておくとき(周期を選ぶ欄を出さない) */
  fixedCycle?: Cycle;
  onBack: () => void;
}

export function TaskEditScreen({ task, alters, fixedCycle, onBack }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const selectableAlters = sortForSettings(alters).visible;

  const handleSubmit = async (input: TaskInput) => {
    try {
      if (task) {
        await updateTask(db, task.id, input);
      } else {
        await addTask(db, input, new Date());
      }
      onBack();
    } catch (error) {
      showSaveError(error);
    }
  };

  const handleToggleHidden = async (target: Task) => {
    try {
      await setTaskHidden(db, target.id, !target.hidden);
      onBack();
    } catch (error) {
      showSaveError(error);
    }
  };

  const handleDelete = async (target: Task) => {
    try {
      await deleteTask(db, target.id);
      onBack();
    } catch (error) {
      showSaveError(error);
    }
  };

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>{task ? 'タスクを編集' : fixedCycle?.type === 'none' ? '期限なしのタスクを追加' : 'タスクを追加'}</h1>
      </header>
      <TaskForm
        initial={task}
        selectableAlters={selectableAlters}
        fixedCycle={fixedCycle}
        onSubmit={handleSubmit}
        onCancel={onBack}
      />
      {task && (
        <section className="edit-actions">
          <button type="button" onClick={() => handleToggleHidden(task)}>
            {task.hidden ? '再表示する' : '非表示にする'}
          </button>
          <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>
            このタスクを削除する
          </button>
        </section>
      )}
      {task && confirmingDelete && (
        <ConfirmDialog
          message={`「${task.name}」を削除しますか?これまでの完了記録は残ります。`}
          confirmLabel="削除する"
          onConfirm={() => handleDelete(task)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
