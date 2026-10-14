// ホーム画面のタスク1件の中身。タップで記録(未完了)または取り消し(完了)
// 並び替えモード中は onTap を渡さず、タップしても何もしない表示だけにする
import { resolveCareAlters } from '../../lib/careAlters';
import { toCompletionLabel } from '../../lib/completionLabel';
import type { HomeItem, SectionKey } from '../../lib/home';
import { toPreviousPeriodLabel } from '../../lib/previousPeriod';
import type { Alter } from '../../lib/types';
import { PreviousPeriodLine } from '../common/PreviousPeriodLine';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  item: HomeItem;
  section: SectionKey;
  alters: Alter[];
  alterById: ReadonlyMap<string, Alter>;
  /** 渡さないとタップできない表示になる(並び替えモード) */
  onTap?: (item: HomeItem) => void;
}

export function TaskItem({ item, section, alters, alterById, onTap }: Props) {
  const careAlters = resolveCareAlters(item.task.careAlterIds, alters);
  const done = item.status === 'done' && item.currentRecord !== null;
  const label = item.currentRecord ? toCompletionLabel(item.currentRecord, section, alterById) : null;
  const className = done ? 'task-item task-item--done' : 'task-item';
  const previous = toPreviousPeriodLabel(item.previous, item.task.cycle, alterById);

  const content = (
    <>
      <span className="task-item__status" aria-hidden="true">
        {done ? '✓' : '○'}
      </span>
      <span className="task-item__body">
        <span className="item-name">{item.task.name}</span>
        {careAlters.length > 0 && (
          <span className="alter-labels">
            {careAlters.map((alter) => (
              <AlterNameLabel key={alter.id} name={alter.name} color={alter.color} />
            ))}
          </span>
        )}
        {done && label && (
          <span className="task-item__done-by">
            <AlterNameLabel name={label.name} color={label.color} />・{label.time}
          </span>
        )}
        {previous && <PreviousPeriodLine label={previous} />}
      </span>
    </>
  );

  if (!onTap) {
    return <div className={className}>{content}</div>;
  }
  return (
    <button type="button" className={className} onClick={() => onTap(item)}>
      {content}
    </button>
  );
}
