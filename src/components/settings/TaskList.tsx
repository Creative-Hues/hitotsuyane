// タスクの一覧(並び替え・追加・編集画面を開く)
// 選択中(selectedIds を渡したとき)は、チェックボックスで複数選ぶだけにし、並び替え・追加・編集はしない
import { db } from '../../db/db';
import { reorderTasks } from '../../db/taskRepo';
import { cycleLabel } from '../../lib/cycleLabel';
import { sortForSettings } from '../../lib/ordering';
import type { Alter, Task } from '../../lib/types';
import { SortableList } from '../common/SortableList';
import { ItemRow } from './ItemRow';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  tasks: Task[];
  alters: Alter[];
  onAdd: () => void;
  onOpen: (task: Task) => void;
  /** 選択中のとき、選ばれているタスクのID(選択中でなければ渡さない) */
  selectedIds?: ReadonlySet<string>;
  /** 選択中に行をタップしたとき */
  onToggle?: (task: Task) => void;
}

export function TaskList({ tasks, alters, onAdd, onOpen, selectedIds, onToggle }: Props) {
  const { visible, hidden } = sortForSettings(tasks);
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const selecting = selectedIds !== undefined;

  const renderRow = (task: Task) => (
    <ItemRow
      name={task.name}
      hidden={task.hidden}
      sub={
        <>
          <span className="item-sub">{cycleLabel(task.cycle)}</span>
          {task.careAlterIds.map((id) => {
            const alter = alterById.get(id);
            return (
              alter && (
                <AlterNameLabel key={id} name={alter.name} color={alter.color} />
              )
            );
          })}
        </>
      }
      selected={selectedIds?.has(task.id)}
      onOpen={() => (selecting ? onToggle?.(task) : onOpen(task))}
    />
  );

  /** 並び替えのない一覧(非表示の一覧と、選択中の一覧) */
  const renderPlainList = (items: Task[]) => (
    <ul className="item-list">
      {items.map((task) => (
        <li key={task.id} className="plain-row">
          {renderRow(task)}
        </li>
      ))}
    </ul>
  );

  return (
    <section className="settings-section">
      <h2>タスク</h2>
      {!selecting && (
        <button type="button" className="add-button" onClick={onAdd}>
          ＋ タスクを追加
        </button>
      )}
      {visible.length === 0 && <p className="empty">タスクがまだ登録されていません</p>}
      {selecting ? (
        renderPlainList(visible)
      ) : (
        <SortableList
          className="item-list"
          items={visible}
          onReorder={(ids) => reorderTasks(db, ids)}
          renderItem={renderRow}
          getLabel={(task) => task.name}
        />
      )}
      {hidden.length > 0 && (
        <>
          <h3 className="hidden-heading">非表示のタスク</h3>
          {/* 非表示の一覧は並び替えない(選択中は選べる) */}
          {renderPlainList(hidden)}
        </>
      )}
    </section>
  );
}
