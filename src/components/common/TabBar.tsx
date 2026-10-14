// 画面下のタブバー(SPEC.md 5章)。[リスト][治療][交代][掲示板][人格] の5つ。アイコン+文字で、今いるタブは色で区別する
// 掲示板のタブには、新着のあるスレッドの数をバッジで出す(SPEC.md 22.4)
// アイコンは外部から読み込まず、SVG をここに直接書く
import type { ReactNode } from 'react';
import { useTerm } from '../../hooks/useTerm';

export type TabKey = 'list' | 'care' | 'switch' | 'board' | 'alters';

/** アイコンの共通の枠(線で描く。色は文字色と同じ) */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="tab-bar__icon"
      // 大きさを直接書いておく(CSS が読み込まれる前でも、SVG が既定の 300×150 に広がらないように)
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** タブの並び(左から)。「人格」は呼び方(SPEC.md 14章③)に置き換える */
const TABS: readonly { key: TabKey; label: string; icon: ReactNode }[] = [
  {
    key: 'list',
    label: 'リスト',
    // チェック付きの四角
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 12l3 3 5-6" />
      </Icon>
    ),
  },
  {
    key: 'care',
    label: '治療',
    // カプセル
    icon: (
      <Icon>
        <rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)" />
        <path d="M8.5 8.5l7 7" />
      </Icon>
    ),
  },
  {
    key: 'switch',
    label: '交代',
    // 向かい合う2つの矢印(入れ替わり)
    icon: (
      <Icon>
        <path d="M4 8h15M15 4l4 4-4 4" />
        <path d="M20 16H5M9 12l-4 4 4 4" />
      </Icon>
    ),
  },
  {
    key: 'board',
    label: '掲示板',
    // 吹き出し
    icon: (
      <Icon>
        <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
        <path d="M8 10h8M8 13h5" />
      </Icon>
    ),
  },
  {
    key: 'alters',
    label: '人格',
    // 2人の人
    icon: (
      <Icon>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M17 14c2.6 0 4.5 1.8 4.5 4.5" />
      </Icon>
    ),
  },
];

interface Props {
  current: TabKey;
  onSelect: (tab: TabKey) => void;
  /** タブごとのバッジの文字(ないタブは出さない) */
  badges?: Partial<Record<TabKey, string>>;
}

export function TabBar({ current, onSelect, badges = {} }: Props) {
  const { t } = useTerm();
  return (
    <nav className="tab-bar" aria-label="画面の切り替え">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={tab.key === current ? 'tab-bar__button tab-bar__button--current' : 'tab-bar__button'}
          aria-current={tab.key === current ? 'page' : undefined}
          onClick={() => onSelect(tab.key)}
        >
          <span className="tab-bar__icon-wrap">
            {tab.icon}
            {badges[tab.key] && (
              <span className="tab-bar__badge" aria-label={`新着 ${badges[tab.key]}件`}>
                {badges[tab.key]}
              </span>
            )}
          </span>
          <span className="tab-bar__label">{t(tab.label)}</span>
        </button>
      ))}
    </nav>
  );
}
