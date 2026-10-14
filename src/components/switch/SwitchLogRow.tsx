// 交代の記録の一覧の1行(SPEC.md 17.4):「時刻・[交代前の人格] → [交代した人格]・きっかけ」
// 行をタップすると編集画面を開く。月の一覧と、カレンダーの日ごとの一覧で使う
import { resolveFromAlter, resolveSwitchAlter, switchAlterLabel, switchLogTime, tagNamesOf } from '../../lib/switchLog';
import { formatClockInLogicalDay } from '../../lib/timeFormat';
import type { LogicalDate } from '../../lib/period';
import type { Alter, SwitchLog, SwitchTag } from '../../lib/types';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  log: SwitchLog;
  /** 見出しの論理日(朝5時前の時刻に「翌」を付けるため) */
  logicalDate: LogicalDate;
  /** すべての人格(非表示も含む) */
  alters: readonly Alter[];
  /** すべてのきっかけ(非表示も含む) */
  tags: readonly SwitchTag[];
  onOpen: (log: SwitchLog) => void;
}

export function SwitchLogRow({ log, logicalDate, alters, tags, onOpen }: Props) {
  const from = switchAlterLabel(resolveFromAlter(log, alters));
  const to = switchAlterLabel(resolveSwitchAlter(log, alters));
  return (
    <button type="button" className="switch-entry" onClick={() => onOpen(log)}>
      <span className="history-entry__time">{formatClockInLogicalDay(switchLogTime(log), logicalDate)}</span>
      <span className="switch-entry__body">
        <span className="stats-list__alter switch-entry__alters">
          <AlterNameLabel name={from.name} color={from.color} />
          <span aria-label="から">→</span>
          <AlterNameLabel name={to.name} color={to.color} />
        </span>
        <span className="switch-entry__sub">
          きっかけ:{tagNamesOf(log, tags).join('、')}
          {log.switchedAt === null && '(時刻は気づいた時刻)'}
        </span>
      </span>
    </button>
  );
}
