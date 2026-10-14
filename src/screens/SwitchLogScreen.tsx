// 交代の記録の画面(SPEC.md 17.4):月ごとの集計・記録の一覧・受診用の書き出し・きっかけの設定の入口
// 「交代」タブを開くと出る(SPEC.md 5章。タブの一番上の画面なので「‹ 戻る」は出さない)
// [一覧][カレンダー] で、集計と記録の一覧か、その月のカレンダー(SPEC.md 17.7)かを切り替える
// カレンダーの日付を押すと、その日の記録だけの一覧を開く
import { useState } from 'react';
import { HelpButton } from '../components/common/HelpButton';
import { SwitchCalendarView } from '../components/switch/SwitchCalendarView';
import { SwitchReportDocument } from '../components/switch/SwitchReportDocument';
import { SwitchStatsView } from '../components/switch/SwitchStatsView';
import { db } from '../db/db';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import { usePrintNode } from '../hooks/usePrintNode';
import { nextLogicalMonth, previousLogicalMonth, type LogicalDate } from '../lib/period';
import { buildSwitchCalendar, switchLogsOnDate } from '../lib/switchCalendar';
import { statsMonthLabel } from '../lib/stats';
import {
  buildSwitchStats,
  clampSwitchMonth,
  groupSwitchLogsByDay,
  switchLogsInMonth,
  switchMonthRange,
} from '../lib/switchLog';
import { formatLogicalDateHeading } from '../lib/timeFormat';
import { SWITCH_LOG_NOTICE } from '../lib/about';
import { SwitchLogEditScreen } from './SwitchLogEditScreen';
import { SwitchTagSettingsScreen } from './SwitchTagSettingsScreen';
import { SwitchLogRow } from '../components/switch/SwitchLogRow';

/** 表示中の画面:一覧 / その日の記録の一覧(カレンダーから) / 記録の編集(returnTo は戻る先) / きっかけの設定 */
type View =
  | { kind: 'list' }
  | { kind: 'day'; date: LogicalDate }
  | { kind: 'edit'; id: string; returnTo: View }
  | { kind: 'tags' };

/** 一覧(集計と記録の一覧)/ カレンダー */
type Mode = 'list' | 'calendar';

const MODE_OPTIONS: readonly { key: Mode; label: string }[] = [
  { key: 'list', label: '一覧' },
  { key: 'calendar', label: 'カレンダー' },
];

const EMPTY_TEXT = 'この月の記録はありません';

export function SwitchLogScreen() {
  const alters = useLiveQuery(() => db.alters.toArray());
  const tags = useLiveQuery(() => db.switchTags.toArray());
  const logs = useLiveQuery(() => db.switchLogs.toArray());
  const now = useNow();
  const { print, printView } = usePrintNode();
  const [view, setView] = useState<View>({ kind: 'list' });
  // 選んでいる月(null なら今の論理月)。編集画面へ行って戻っても保つ
  const [month, setMonth] = useState<string | null>(null);
  // アプリを開いたときは一覧。開いている間は、最後に選んだほうを覚える(保存はしない)
  const [mode, setMode] = useState<Mode>('list');
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    rememberScroll();
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!alters || !tags || !logs) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'tags') {
    return <SwitchTagSettingsScreen onBack={backToList} />;
  }
  if (view.kind === 'edit') {
    const log = logs.find((item) => item.id === view.id);
    // 削除済みなら一覧を出す
    if (log) {
      return (
        <SwitchLogEditScreen key={log.id} log={log} alters={alters} tags={tags} onBack={() => setView(view.returnTo)} />
      );
    }
  }
  if (view.kind === 'day') {
    const dayLogs = switchLogsOnDate(logs, view.date);
    return (
      <main className="app">
        <header className="screen-header">
          <button type="button" onClick={backToList}>
            ‹ 戻る
          </button>
          <h1>{formatLogicalDateHeading(view.date)}</h1>
        </header>
        {dayLogs.length === 0 ? (
          <p className="empty">この日の記録はありません</p>
        ) : (
          <ul className="item-list">
            {dayLogs.map((log) => (
              <li key={log.id}>
                <SwitchLogRow
                  log={log}
                  logicalDate={view.date}
                  alters={alters}
                  tags={tags}
                  onOpen={(target) => open({ kind: 'edit', id: target.id, returnTo: view })}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  const range = switchMonthRange(logs, now);
  const shownMonth = clampSwitchMonth(month, range);
  const stats = buildSwitchStats({ logs, month: shownMonth, alters, tags });
  const days = groupSwitchLogsByDay(switchLogsInMonth(logs, shownMonth));

  return (
    <main className="app">
      <header className="screen-header">
        <h1>交代の記録</h1>
        <HelpButton helpKey="switch" />
      </header>
      <div className="stats-month">
        <button type="button" disabled={shownMonth <= range.oldest} onClick={() => setMonth(previousLogicalMonth(shownMonth))}>
          ‹ 前の月
        </button>
        <span className="stats-month__label">{statsMonthLabel(shownMonth)}</span>
        <button type="button" disabled={shownMonth >= range.latest} onClick={() => setMonth(nextLogicalMonth(shownMonth))}>
          次の月 ›
        </button>
      </div>
      {/* 見出しの行の右端は「?」なので、月の切り替えの下に横いっぱいで置く(SPEC.md 17.4) */}
      <button
        type="button"
        className="add-button"
        disabled={stats.total === 0}
        onClick={() =>
          print(
            <SwitchReportDocument
              month={shownMonth}
              stats={stats}
              logs={logs}
              alters={alters}
              tags={tags}
              createdAt={new Date()}
            />,
          )
        }
      >
        受診用にPDF
      </button>

      <div className="tab-switch" role="group" aria-label="一覧とカレンダーの切り替え">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={option.key === mode ? 'tab-switch__button tab-switch__button--current' : 'tab-switch__button'}
            aria-pressed={option.key === mode}
            onClick={() => setMode(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {stats.total === 0 ? (
        <p className="empty">{EMPTY_TEXT}</p>
      ) : mode === 'calendar' ? (
        <SwitchCalendarView
          weeks={buildSwitchCalendar({ logs, month: shownMonth, alters })}
          onOpenDate={(date) => open({ kind: 'day', date })}
        />
      ) : (
        <>
          <section className="settings-section">
            <h2>集計(全{stats.total}回)</h2>
            <SwitchStatsView stats={stats} />
          </section>
          <section className="settings-section">
            <h2>記録</h2>
            {days.map((day) => (
              <div key={day.logicalDate} className="switch-day">
                <h3 className="alter-group__heading">{formatLogicalDateHeading(day.logicalDate)}</h3>
                <ul className="item-list">
                  {day.logs.map((log) => (
                    <li key={log.id}>
                      <SwitchLogRow
                        log={log}
                        logicalDate={day.logicalDate}
                        alters={alters}
                        tags={tags}
                        onOpen={(target) => open({ kind: 'edit', id: target.id, returnTo: { kind: 'list' } })}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="settings-section">
        <h2>きっかけ</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'tags' })}>
          きっかけの設定
        </button>
      </section>
      {/* 診断ではないこと(SPEC.md 14章④) */}
      <p className="settings-note">{SWITCH_LOG_NOTICE}</p>
      {printView}
    </main>
  );
}
