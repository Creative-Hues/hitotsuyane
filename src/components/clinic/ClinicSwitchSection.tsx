// 診察用の表示の「交代記録」の部分(SPEC.md 8.3):選んだ期間の要約と、詳しい一覧(誰から誰に)
// 診察で見せる画面なので、押して編集画面を開く操作は置かない
import { SWITCH_LOG_NOTICE } from '../../lib/about';
import { countText } from '../../lib/stats';
import {
  resolveFromAlter,
  resolveSwitchAlter,
  switchAlterLabel,
  switchLogTime,
  tagNamesOf,
} from '../../lib/switchLog';
import { NO_SWITCH_IN_RANGE_TEXT, switchSummaryTitle, type SwitchSummary } from '../../lib/switchSummary';
import { formatClockInLogicalDay, formatLogicalDateHeading } from '../../lib/timeFormat';
import type { Alter, SwitchTag } from '../../lib/types';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  summary: SwitchSummary;
  /** すべての人格(非表示も含む) */
  alters: readonly Alter[];
  /** すべてのきっかけ(非表示も含む) */
  tags: readonly SwitchTag[];
}

export function ClinicSwitchSection({ summary, alters, tags }: Props) {
  const { t } = useTerm();
  return (
    <section className="clinic-view__switch">
      <h2 className="clinic-view__title">{switchSummaryTitle(summary.range)}</h2>
      {summary.total === 0 ? (
        <p className="empty">{NO_SWITCH_IN_RANGE_TEXT}</p>
      ) : (
        <>
          <dl className="clinic-switch__summary">
            <dt>回数</dt>
            <dd>全{countText(summary.total)}</dd>
            <dt>{t('人格ごと')}</dt>
            <dd className="clinic-switch__alters">
              {summary.byAlter.map((item) => {
                const { name, color } = switchAlterLabel(item.alter);
                return (
                  <span key={item.alter?.id ?? 'unknown'} className="clinic-switch__count">
                    <AlterNameLabel name={name} color={color} /> {countText(item.count)}
                  </span>
                );
              })}
            </dd>
            {summary.topTags.length > 0 && (
              <>
                <dt>多いきっかけ</dt>
                <dd>{summary.topTags.map((item) => `${item.tag.name} ${countText(item.count)}`).join('、')}</dd>
              </>
            )}
          </dl>
          <p className="settings-note">{SWITCH_LOG_NOTICE}</p>
          {summary.days.map((day) => (
            <div key={day.logicalDate}>
              <h3>{formatLogicalDateHeading(day.logicalDate)}</h3>
              <ul className="clinic-switch__lines">
                {day.logs.map((log) => {
                  const from = switchAlterLabel(resolveFromAlter(log, alters));
                  const to = switchAlterLabel(resolveSwitchAlter(log, alters));
                  return (
                    <li key={log.id}>
                      <span className="clinic-switch__time">
                        {formatClockInLogicalDay(switchLogTime(log), day.logicalDate)}
                        {log.switchedAt === null && '(気づいた時刻)'}
                      </span>{' '}
                      <AlterNameLabel name={from.name} color={from.color} /> →{' '}
                      <AlterNameLabel name={to.name} color={to.color} />
                      {log.fromAlterSource === 'guessed' && '(推測)'}{' '}
                      <span className="clinic-switch__tags">きっかけ:{tagNamesOf(log, tags).join('、')}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
