// 交代の記録の集計(SPEC.md 17.5):人格ごと・時間帯ごと・きっかけごと
// 時間帯・きっかけは、人格ごとの回数を色の帯(横に積み重ねた棒)と数で出す
import { switchAlterLabel, type SwitchAlterCount, type SwitchStats, type SwitchStatsRow } from '../../lib/switchLog';
import { countText } from '../../lib/stats';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';

/** 「わからない」の帯の色(どの人格の色とも区別しやすい灰色) */
export const UNKNOWN_SEGMENT_COLOR = '#9a9a9a';

export function SwitchStatsView({ stats }: { stats: SwitchStats }) {
  const { t } = useTerm();
  return (
    <>
      <div className="stats-card">
        <h3>{t('人格ごと')}</h3>
        <AlterCounts counts={stats.byAlter} />
      </div>
      <div className="stats-card">
        <h3>時間帯ごと</h3>
        <StatsRows rows={stats.byTime} />
      </div>
      <div className="stats-card">
        <h3>きっかけごと</h3>
        <p className="settings-note">1つの記録に2つのきっかけがあれば、両方に数えます。</p>
        <StatsRows rows={stats.byTag} />
      </div>
    </>
  );
}

function AlterName({ item }: { item: SwitchAlterCount }) {
  const { name, color } = switchAlterLabel(item.alter);
  return (
    <span className="stats-list__alter">
      <AlterNameLabel name={name} color={color} />
    </span>
  );
}

function AlterCounts({ counts }: { counts: SwitchAlterCount[] }) {
  return (
    <dl className="stats-list">
      {counts.map((item) => (
        <div key={item.alter?.id ?? 'unknown'} className="stats-list__row">
          <dt>
            <AlterName item={item} />
          </dt>
          <dd>{countText(item.count)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 時間帯・きっかけの行。帯の長さは、いちばん多い行を100%として比べる */
function StatsRows({ rows }: { rows: SwitchStatsRow[] }) {
  const max = rows.reduce((value, row) => Math.max(value, row.total), 0);
  return (
    <ul className="switch-rows">
      {rows.map((row) => (
        <li key={row.label} className="switch-row">
          <div className="switch-row__head">
            <span className="switch-row__label">{row.label}</span>
            <span>{countText(row.total)}</span>
          </div>
          <div className="switch-bar" style={{ width: `${(row.total / max) * 100}%` }} aria-hidden="true">
            {row.counts.map((item) => (
              <span
                key={item.alter?.id ?? 'unknown'}
                className="switch-bar__segment"
                style={{
                  flexGrow: item.count,
                  backgroundColor: switchAlterLabel(item.alter).color ?? UNKNOWN_SEGMENT_COLOR,
                }}
              />
            ))}
          </div>
          <p className="switch-row__detail">
            {row.counts.map((item) => (
              <span key={item.alter?.id ?? 'unknown'} className="switch-row__count">
                <AlterName item={item} /> {item.count}
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  );
}
