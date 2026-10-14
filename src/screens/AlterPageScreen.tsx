// 人格ごとのページ(SPEC.md 10.3)。読むための表示で、直すときはカードをタップして編集画面を開く
// 上から:名前・色・区分 →「この人のページをPDFに」→ 基本情報 → プロフィール → 集計(11章。オンのときだけ)
import { AlterStatsSection } from '../components/profile/AlterStatsSection';
import { ProfileSectionList } from '../components/profile/ProfileSectionList';
import { basicInfoItems, categoryLabel } from '../lib/alterInfo';
import type { Alter, AlterCategory, ProfileSection } from '../lib/types';
import { AlterNameLabel } from '../components/common/AlterNameLabel';

interface Props {
  alter: Alter;
  categories: AlterCategory[];
  /** この人格の見出し(並び順どおり) */
  sections: ProfileSection[];
  onBack: () => void;
  /** 「この人のページをPDFに」(SPEC.md 10.7) */
  onPrint: () => void;
  /** 名前・色・区分のカードをタップしたとき */
  onEditAlter: () => void;
  /** 基本情報のカードをタップしたとき */
  onEditBasicInfo: () => void;
  onOpenSection: (section: ProfileSection) => void;
  onAddSection: () => void;
  /** 集計を表示するか(SPEC.md 11章。全員分で1つの設定) */
  showStats: boolean;
  /** 集計で選んでいる月('YYYY-MM')。null なら今の論理月 */
  statsMonth: string | null;
  onChangeStatsMonth: (month: string) => void;
}

export function AlterPageScreen({
  alter,
  categories,
  sections,
  onBack,
  onPrint,
  onEditAlter,
  onEditBasicInfo,
  onOpenSection,
  onAddSection,
  showStats,
  statsMonth,
  onChangeStatsMonth,
}: Props) {
  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
      </header>

      <button type="button" className="info-card alter-card" onClick={onEditAlter} aria-label={`「${alter.name}」を編集`}>
        <span className="alter-card__name">
          <AlterNameLabel name={alter.name} color={alter.color} size="large" />
        </span>
        <span className="alter-card__category">{categoryLabel(alter, categories)}</span>
        <span className="info-card__chevron" aria-hidden="true">
          ›
        </span>
      </button>

      <button type="button" className="add-button" onClick={onPrint}>
        この人のページをPDFに
      </button>

      <section className="settings-section">
        <h2 className="section-heading">
          基本情報<span className="section-heading__note">早見表にも使われます</span>
        </h2>
        <button type="button" className="info-card" onClick={onEditBasicInfo} aria-label="基本情報を編集">
          <dl className="basic-info">
            {basicInfoItems(alter, categories).map((item) => (
              <div key={item.label} className="basic-info__row">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <span className="info-card__chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </section>

      <section className="settings-section">
        <h2>プロフィール</h2>
        <ProfileSectionList sections={sections} onOpen={onOpenSection} onAdd={onAddSection} />
      </section>

      {showStats && <AlterStatsSection alterId={alter.id} month={statsMonth} onChangeMonth={onChangeStatsMonth} />}
    </main>
  );
}
