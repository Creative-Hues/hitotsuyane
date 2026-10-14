// 受診用の書き出し(PDF。SPEC.md 17.6)。画面には出さず、印刷のときだけ出す(index.css の @media print)
import { formatCalendarDateSlash, formatClockInLogicalDay, formatLogicalDateHeading } from '../../lib/timeFormat';
import { countText, statsMonthLabel } from '../../lib/stats';
import {
  groupSwitchLogsByDay,
  resolveFromAlter,
  resolveSwitchAlter,
  switchAlterLabel,
  switchLogsInMonth,
  switchLogTime,
  tagNamesOf,
  type SwitchStats,
  type SwitchStatsRow,
} from '../../lib/switchLog';
import type { Alter, SwitchLog, SwitchTag } from '../../lib/types';
import { SWITCH_LOG_NOTICE } from '../../lib/about';
import { UNKNOWN_SEGMENT_COLOR } from './SwitchStatsView';
import { useTerm } from '../../hooks/useTerm';

/** 書き出しの注記(SPEC.md 17.6) */
export const SWITCH_REPORT_NOTE = '時刻は、交代した時刻がわからないときは、交代に気づいた時刻です(目安です)。';

interface Props {
  month: string;
  stats: SwitchStats;
  logs: readonly SwitchLog[];
  alters: readonly Alter[];
  tags: readonly SwitchTag[];
  /** 作成日(実際の日付) */
  createdAt: Date;
}

export function SwitchReportDocument({ month, stats, logs, alters, tags, createdAt }: Props) {
  const { t } = useTerm();
  const days = groupSwitchLogsByDay(switchLogsInMonth(logs, month));
  return (
    <div className="print-doc switch-report">
      <header className="print-doc__header">
        <h1>交代の記録 {statsMonthLabel(month)}</h1>
        <p>作成日:{formatCalendarDateSlash(createdAt)}</p>
        <p>{SWITCH_REPORT_NOTE}</p>
        <p>{SWITCH_LOG_NOTICE}</p>
      </header>

      <section className="print-part">
        <h2>
          {t('人格ごと')}(全{countText(stats.total)})
        </h2>
        <table className="switch-report__table">
          <tbody>
            {stats.byAlter.map((item) => (
              <tr key={item.alter?.id ?? 'unknown'}>
                <th scope="row">
                  <AlterLabel alter={item.alter} />
                </th>
                <td className="switch-report__count">{countText(item.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <RowsTable title="時間帯ごと" rows={stats.byTime} />
      <RowsTable title="きっかけごと(1つの記録に2つのきっかけがあれば、両方に数えます)" rows={stats.byTag} />

      <section className="print-part">
        <h2>記録の一覧</h2>
        {days.map((day) => (
          <div key={day.logicalDate} className="switch-report__day">
            <h3>{formatLogicalDateHeading(day.logicalDate)}</h3>
            <table className="switch-report__table">
              <tbody>
                {day.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="switch-report__time">
                      {formatClockInLogicalDay(switchLogTime(log), day.logicalDate)}
                      {log.switchedAt === null && '(気づいた時刻)'}
                    </td>
                    <td>
                      {/* 誰から誰に(SPEC.md 17.6)。推測のままの記録は「(推測)」を添える */}
                      <AlterLabel alter={resolveFromAlter(log, alters)} /> → <AlterLabel alter={resolveSwitchAlter(log, alters)} />
                      {log.fromAlterSource === 'guessed' && '(推測)'}
                    </td>
                    <td>{tagNamesOf(log, tags).join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}

function AlterLabel({ alter }: { alter: Alter | null }) {
  const { name, color } = switchAlterLabel(alter);
  return (
    <span className="switch-report__alter">
      <span className="color-dot" style={{ backgroundColor: color ?? UNKNOWN_SEGMENT_COLOR }} />
      {name}
    </span>
  );
}

function RowsTable({ title, rows }: { title: string; rows: SwitchStatsRow[] }) {
  return (
    <section className="print-part">
      <h2>{title}</h2>
      <table className="switch-report__table">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className="switch-report__count">{countText(row.total)}</td>
              <td>{row.counts.map((item) => `${switchAlterLabel(item.alter).name} ${item.count}`).join('、')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
