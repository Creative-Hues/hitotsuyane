// 交代の記録のカレンダー(SPEC.md 17.7)。週の始まりは日曜
// 各日付のマスに、その日に記録のあった人格の色の円を最大9個(3×3)並べる。10人以上は8個と「+」
// 記録のある日付を押すと、その日の記録の一覧を開く
import type { CalendarDay, CalendarWeek } from '../../lib/switchCalendar';
import type { LogicalDate } from '../../lib/period';
import { UNKNOWN_SEGMENT_COLOR } from './SwitchStatsView';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

interface Props {
  weeks: CalendarWeek[];
  onOpenDate: (logicalDate: LogicalDate) => void;
}

function DayCell({ day, onOpenDate }: { day: CalendarDay; onOpenDate: (logicalDate: LogicalDate) => void }) {
  const content = (
    <>
      <span className="switch-calendar__day">{day.day}</span>
      <span className="switch-calendar__dots" aria-hidden="true">
        {day.dots.map((dot) => (
          <span
            key={dot.alterId ?? 'unknown'}
            className="switch-calendar__dot"
            style={{ backgroundColor: dot.color ?? UNKNOWN_SEGMENT_COLOR }}
          />
        ))}
        {day.more && <span className="switch-calendar__more">+</span>}
      </span>
    </>
  );
  // 記録のない日は押せない
  if (day.count === 0) {
    return <div className="switch-calendar__cell">{content}</div>;
  }
  const [, month, date] = day.logicalDate.split('-').map(Number);
  return (
    <button
      type="button"
      className="switch-calendar__cell switch-calendar__cell--button"
      aria-label={`${month}月${date}日 ${day.count}件`}
      onClick={() => onOpenDate(day.logicalDate)}
    >
      {content}
    </button>
  );
}

export function SwitchCalendarView({ weeks, onOpenDate }: Props) {
  return (
    <div className="switch-calendar" role="grid" aria-label="交代の記録のカレンダー">
      <div className="switch-calendar__row" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="switch-calendar__weekday" role="columnheader">
            {label}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week.find((cell) => cell !== null)?.logicalDate} className="switch-calendar__row" role="row">
          {week.map((cell, index) =>
            cell === null ? (
              <span key={`empty-${index}`} className="switch-calendar__cell switch-calendar__cell--empty" role="gridcell" />
            ) : (
              <span key={cell.logicalDate} role="gridcell">
                <DayCell day={cell} onOpenDate={onOpenDate} />
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
