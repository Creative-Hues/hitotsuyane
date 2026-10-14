// 人格ごとのページの集計(SPEC.md 11章)。集計の表示がオンのときだけ出す
// 月ごと(論理月)に「この人格がしたこと」「この人格のためにしてくれたこと」を出し、「前の月」「次の月」で切り替える
// データはこの部品の中で読む(オフのときは部品ごと出さないので、読み込みもしない)
import { db } from '../../db/db';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useNow } from '../../hooks/useNow';
import { clampStatsMonth, nextLogicalMonth, previousLogicalMonth, statsMonthRange } from '../../lib/period';
import {
  buildAlterStats,
  countText,
  didLines,
  isStatsEmpty,
  statsMonthLabel,
  type AlterCount,
} from '../../lib/stats';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  alterId: string;
  /** 選んでいる月('YYYY-MM')。null なら今の論理月 */
  month: string | null;
  onChangeMonth: (month: string) => void;
}

const EMPTY_TEXT = 'この月の記録はありません';

export function AlterStatsSection({ alterId, month, onChangeMonth }: Props) {
  const now = useNow();
  const data = useLiveQuery(async () => ({
    alters: await db.alters.toArray(),
    tasks: await db.tasks.toArray(),
    records: await db.records.toArray(),
    intakes: await db.medicationIntakes.toArray(),
    bucketItems: await db.bucketItems.toArray(),
  }));

  // 範囲の外になった月(月をまたいだとき)は、範囲の中に寄せて出す
  const shownMonth = clampStatsMonth(month, now);
  const { oldest, latest } = statsMonthRange(now);

  return (
    <section className="settings-section stats">
      <h2>集計</h2>
      <div className="stats-month">
        <button
          type="button"
          disabled={shownMonth <= oldest}
          onClick={() => onChangeMonth(previousLogicalMonth(shownMonth))}
        >
          ‹ 前の月
        </button>
        <span className="stats-month__label">{statsMonthLabel(shownMonth)}</span>
        <button
          type="button"
          disabled={shownMonth >= latest}
          onClick={() => onChangeMonth(nextLogicalMonth(shownMonth))}
        >
          次の月 ›
        </button>
      </div>
      {data === undefined ? (
        <p className="empty">読み込み中…</p>
      ) : (
        <StatsBody stats={buildAlterStats({ alterId, month: shownMonth, ...data })} />
      )}
    </section>
  );
}

function StatsBody({ stats }: { stats: ReturnType<typeof buildAlterStats> }) {
  const { t } = useTerm();
  // 全部の項目が0回の月は、欄を出さずにこの文だけを出す
  if (isStatsEmpty(stats)) {
    return <p className="empty">{EMPTY_TEXT}</p>;
  }
  const lines = didLines(stats.did);
  const received = [
    { title: 'ToDo の代行', counts: stats.receivedTodoProxy },
    { title: 'バケットの協力', counts: stats.receivedBucketHelp },
  ].filter((group) => group.counts.length > 0);

  return (
    <>
      <div className="stats-card">
        <h3>{t('この人格がしたこと')}</h3>
        {lines.length === 0 ? (
          <p className="empty">{EMPTY_TEXT}</p>
        ) : (
          <dl className="stats-list">
            {lines.map((line) => (
              <div key={line.label} className="stats-list__row">
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="stats-card">
        <h3>{t('この人格のためにしてくれたこと')}</h3>
        {received.length === 0 ? (
          <p className="empty">{EMPTY_TEXT}</p>
        ) : (
          received.map((group) => (
            <div key={group.title} className="stats-group">
              <h4>{group.title}</h4>
              <AlterCountList counts={group.counts} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

/** 人格ごとの回数(名前ラベル。非表示の人格も同じ見た目で出す) */
function AlterCountList({ counts }: { counts: AlterCount[] }) {
  return (
    <dl className="stats-list">
      {counts.map(({ alter, count }) => (
        <div key={alter.id} className="stats-list__row">
          <dt className="stats-list__alter">
            <AlterNameLabel name={alter.name} color={alter.color} />
          </dt>
          <dd>{countText(count)}</dd>
        </div>
      ))}
    </dl>
  );
}
