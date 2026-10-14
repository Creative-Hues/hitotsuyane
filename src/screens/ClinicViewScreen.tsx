// 診察用の表示(SPEC.md 8.3):まだ話していないメモだけを、人格ごと → 分類ごとに並べる
// [メモだけ][メモ+交代記録] で、メモの下に選んだ期間の交代の記録(要約と詳しい一覧)を出せる
// 期間は [前回の受診日から][今月][今週][今日]。期間は交代記録の部分だけに効く(メモはまだ話していないもの全部)
// 医師に画面を見せても読みやすいよう、文字を大きめにする。「文字としてコピー」で同じ内容をクリップボードに入れる
// (クリップボードは端末の中だけ。外への通信はしない)
import { useState } from 'react';
import { ClinicSwitchSection } from '../components/clinic/ClinicSwitchSection';
import { HelpButton } from '../components/common/HelpButton';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import { buildClinicView, buildClinicViewText, clinicViewTitle, NO_PENDING_NOTES_TEXT } from '../lib/clinicNotes';
import { latestVisitDate } from '../lib/clinicVisits';
import { clinicPeriodRange, toLogicalDate, type ClinicPeriodKind, type LogicalDate } from '../lib/period';
import { buildSwitchSummary, buildSwitchSummaryText } from '../lib/switchSummary';
import { formatLogicalDateKanji } from '../lib/timeFormat';
import { AlterNameLabel } from '../components/common/AlterNameLabel';

/** コピーの結果の表示 */
type CopyResult = null | 'copied' | 'failed';

/** 表示する中身:メモだけ / メモ+交代記録 */
export type ClinicViewContent = 'memo' | 'memoAndSwitch';

/** 中身・期間・変えた基準の日(アプリを開いている間だけ覚える。受診メモ画面が持つ) */
export interface ClinicViewOptions {
  content: ClinicViewContent;
  period: ClinicPeriodKind;
  /** 「変える」で選んだ基準の日。null なら前回の受診日(いちばん新しい受診の記録の日) */
  baseDate: LogicalDate | null;
}

/** アプリを開いたときの中身・期間 */
export const DEFAULT_CLINIC_VIEW_OPTIONS: ClinicViewOptions = { content: 'memo', period: 'sinceVisit', baseDate: null };

const CONTENT_OPTIONS: readonly { key: ClinicViewContent; label: string }[] = [
  { key: 'memo', label: 'メモだけ' },
  { key: 'memoAndSwitch', label: 'メモ+交代記録' },
];

const PERIOD_OPTIONS: readonly { key: ClinicPeriodKind; label: string }[] = [
  { key: 'sinceVisit', label: '前回の受診日から' },
  { key: 'month', label: '今月' },
  { key: 'week', label: '今週' },
  { key: 'today', label: '今日' },
];

interface Props {
  options: ClinicViewOptions;
  onChangeOptions: (options: ClinicViewOptions) => void;
  onBack: () => void;
}

export function ClinicViewScreen({ options, onChangeOptions, onBack }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const categories = useLiveQuery(() => db.clinicNoteCategories.toArray());
  const notes = useLiveQuery(() => db.clinicNotes.toArray());
  const comments = useLiveQuery(() => db.clinicNoteComments.toArray());
  const visits = useLiveQuery(() => db.clinicVisits.toArray());
  const logs = useLiveQuery(() => db.switchLogs.toArray());
  const tags = useLiveQuery(() => db.switchTags.toArray());
  // 表題の日付は、表示したときの実際の日付(日付をまたいでも古い日付が残らないよう取り直す)
  const now = useNow();
  const [copyResult, setCopyResult] = useState<CopyResult>(null);
  // 「変える」で基準の日を選んでいる途中か
  const [editingBase, setEditingBase] = useState(false);

  if (!alters || !categories || !notes || !comments || !visits || !logs || !tags) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  const groups = buildClinicView(notes, comments, alters, categories);
  const latest = latestVisitDate(visits);
  // 受診の記録が1件もないときは、「前回の受診日から」を選べず、今月を出す
  const period: ClinicPeriodKind = options.period === 'sinceVisit' && latest === null ? 'month' : options.period;
  const baseDate = options.baseDate ?? latest;
  const showSwitch = options.content === 'memoAndSwitch';
  const summary = showSwitch
    ? buildSwitchSummary({ logs, range: clinicPeriodRange(period, now, baseDate), alters, tags })
    : null;
  const change = (next: Partial<ClinicViewOptions>) => {
    setCopyResult(null);
    onChangeOptions({ ...options, ...next });
  };

  // コピーの文の表題の日付と期間は、コピーしたときの実際の日時で作り直す
  const handleCopy = async () => {
    const copiedAt = new Date();
    const switchText = showSwitch
      ? buildSwitchSummaryText(
          buildSwitchSummary({ logs, range: clinicPeriodRange(period, copiedAt, baseDate), alters, tags }),
          alters,
          tags,
        )
      : undefined;
    try {
      await navigator.clipboard.writeText(buildClinicViewText(groups, copiedAt, switchText));
      setCopyResult('copied');
    } catch {
      // クリップボードが使えない環境(許可されていない・古い端末など)
      setCopyResult('failed');
    }
  };

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>診察用の表示</h1>
        <HelpButton helpKey="clinicView" />
      </header>
      <div className="tab-switch" role="group" aria-label="表示する中身">
        {CONTENT_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={option.key === options.content ? 'tab-switch__button tab-switch__button--current' : 'tab-switch__button'}
            aria-pressed={option.key === options.content}
            onClick={() => change({ content: option.key })}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/* 期間は交代記録の部分だけに効くので、「メモ+交代記録」のときだけ出す */}
      {showSwitch && (
        <section className="clinic-period">
          <div className="clinic-period__buttons" role="group" aria-label="交代記録の期間">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={option.key === period ? 'clinic-period__button clinic-period__button--current' : 'clinic-period__button'}
                aria-pressed={option.key === period}
                disabled={option.key === 'sinceVisit' && latest === null}
                onClick={() => change({ period: option.key })}
              >
                {option.label}
              </button>
            ))}
          </div>
          {latest === null && <p className="settings-note">まだ受診の記録がありません</p>}
          {period === 'sinceVisit' && baseDate !== null && (
            <div className="clinic-period__base">
              {editingBase ? (
                <label className="field">
                  <span>前回の受診日</span>
                  <input
                    type="date"
                    value={baseDate}
                    max={toLogicalDate(now)}
                    onChange={(event) => {
                      // 今日より後の日は選べない(空にしたときは前回の受診日に戻す)
                      const value = event.target.value;
                      const today = toLogicalDate(new Date());
                      change({ baseDate: value === '' ? null : value > today ? today : value });
                    }}
                    onBlur={() => setEditingBase(false)}
                  />
                </label>
              ) : (
                <>
                  <span>前回の受診日:{formatLogicalDateKanji(baseDate)}</span>
                  <button type="button" onClick={() => setEditingBase(true)}>
                    変える
                  </button>
                </>
              )}
            </div>
          )}
        </section>
      )}
      <button type="button" className="add-button" onClick={() => void handleCopy()}>
        文字としてコピー
      </button>
      {copyResult === 'copied' && <p className="backup-success">コピーしました</p>}
      {copyResult === 'failed' && <p className="form-error">コピーできませんでした</p>}
      <article className="clinic-view">
        <h2 className="clinic-view__title">{clinicViewTitle(now)}</h2>
        {groups.length === 0 && <p className="empty">{NO_PENDING_NOTES_TEXT}</p>}
        {groups.map((group) => (
          <section key={group.alterId ?? 'unknown'} className="clinic-view__group">
            {/* 人格の名前は、その人格の色の名前ラベルにする(SPEC.md 5章・8.3) */}
            <h3>
              <AlterNameLabel name={group.name} color={group.color} size="large" />
            </h3>
            {group.categories.map((category) => (
              <div key={category.categoryId}>
                <h4>【{category.name}】</h4>
                <ul className="clinic-view__notes">
                  {category.notes.map(({ note, comments: noteComments }) => (
                    <li key={note.id}>
                      <span className="clinic-view__text">{note.body}</span>
                      {noteComments.length > 0 && (
                        <ul className="clinic-view__comments">
                          {noteComments.map(({ comment, authorName, authorColor }) => (
                            <li key={comment.id} className="clinic-view__text">
                              └ <AlterNameLabel name={authorName} color={authorColor} />:{comment.body}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
        {summary && <ClinicSwitchSection summary={summary} alters={alters} tags={tags} />}
      </article>
    </main>
  );
}
