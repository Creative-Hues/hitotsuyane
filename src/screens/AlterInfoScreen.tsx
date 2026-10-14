// 人格タブ「人格について」(SPEC.md 10.1)。上から:
// 折りたたみ<人格の情報>(区分ごとの人格の一覧)・<システム全体について>(「全体のこと」の入口)、
// 「人格情報/早見表」「全員分を/PDF資料に」(10.6・10.7)、折りたたみ<区分と呼び方の設定>、
// 集計の表示の切り替え、バックアップの入口、このアプリについて
// 人格の行をタップすると人格ごとのページ(10.3)が開き、そこから各編集画面を開く
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Collapsible } from '../components/common/Collapsible';
import { HelpButton } from '../components/common/HelpButton';
import { AlterList } from '../components/settings/AlterList';
import { TermSettings } from '../components/settings/TermSettings';
import { db } from '../db/db';
import { getLastExportedAt } from '../db/backupRepo';
import { getShowStats, setShowStats } from '../db/settingsRepo';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import { usePrint } from '../hooks/usePrint';
import {
  buildAllPrint,
  buildAlterPrint,
  buildQuickTablePrint,
  buildQuickTableRows,
  sectionsOf,
  type PrintContent,
} from '../lib/alterInfo';
import { backupReminderText } from '../lib/backup';
import { showSaveError } from '../lib/showError';
import { AlterBasicInfoEditScreen } from './AlterBasicInfoEditScreen';
import { AlterCategorySettingsScreen } from './AlterCategorySettingsScreen';
import { AlterEditScreen } from './AlterEditScreen';
import { AlterPageScreen } from './AlterPageScreen';
import { AboutScreen } from './AboutScreen';
import { BackupScreen } from './BackupScreen';
import { CommonInfoScreen } from './CommonInfoScreen';
import { ProfileSectionEditScreen } from './ProfileSectionEditScreen';
import { QuickTableScreen } from './QuickTableScreen';
import { useTerm } from '../hooks/useTerm';

/**
 * 表示中の画面
 * - list:一覧
 * - page:人格ごとのページ
 * - alterEdit:人格の編集(id が null なら新規追加)
 * - basicInfo:基本情報の編集
 * - common:全体のこと
 * - section:見出しの編集(ownerId が null なら「全体のこと」、sectionId が null なら追加)
 * - categories:区分の設定
 * - backup:バックアップ
 * - about:このアプリについて(SPEC.md 14章⑥)
 */
type View =
  | { kind: 'list' }
  | { kind: 'page'; id: string }
  | { kind: 'alterEdit'; id: string | null }
  | { kind: 'basicInfo'; id: string }
  | { kind: 'common' }
  | { kind: 'section'; ownerId: string | null; sectionId: string | null }
  | { kind: 'categories' }
  | { kind: 'quickTable' }
  | { kind: 'backup' }
  | { kind: 'about' };

/** 折りたたみ:人格の情報 / システム全体について / 区分と呼び方の設定 */
type FoldKey = 'alters' | 'system' | 'settings';

interface Props {
  /**
   * 更新のお知らせの「バックアップを書き出す」を押した回数(SPEC.md 18.2)。
   * 増えるたびに、バックアップ画面を開く(0 のときは何もしない)
   */
  backupRequest?: number;
  /** 「はじめに」の「人格を登録する」を押した回数(SPEC.md 14章⑤)。増えるたびに、人格の追加の画面を開く */
  addAlterRequest?: number;
  /** ヘルプの「「はじめに」をもう一度見る」を押したとき(SPEC.md 23章) */
  onOpenIntro?: () => void;
}

export function AlterInfoScreen({ backupRequest = 0, addAlterRequest = 0, onOpenIntro }: Props) {
  const { print, printView, clearPrint } = usePrint();
  return (
    <>
      <AlterInfoContent
        print={print}
        clearPrint={clearPrint}
        backupRequest={backupRequest}
        addAlterRequest={addAlterRequest}
        onOpenIntro={onOpenIntro}
      />
      {/* 印刷用の中身(画面には見えない。印刷のときだけ出る) */}
      {printView}
    </>
  );
}

interface ContentProps {
  print: (content: PrintContent) => void;
  clearPrint: () => void;
  backupRequest: number;
  addAlterRequest: number;
  onOpenIntro?: () => void;
}

function AlterInfoContent({ print, clearPrint, backupRequest, addAlterRequest, onOpenIntro }: ContentProps) {
  const { t, term } = useTerm();
  const alters = useLiveQuery(() => db.alters.toArray());
  const categories = useLiveQuery(() => db.categories.toArray());
  const sections = useLiveQuery(() => db.profileSections.toArray());
  const lastExportedAt = useLiveQuery(() => getLastExportedAt(db));
  const showStats = useLiveQuery(() => getShowStats(db));
  const now = useNow();
  const [view, setView] = useState<View>({ kind: 'list' });
  // 折りたたみの開け閉め。<人格の情報>だけ最初から開いておく。
  // アプリを開いている間だけ覚える(保存はしない。SPEC.md 10.1)
  const [openSections, setOpenSections] = useState<Record<FoldKey, boolean>>({
    alters: true,
    system: false,
    settings: false,
  });
  const toggleSection = (key: FoldKey) => setOpenSections((current) => ({ ...current, [key]: !current[key] }));
  // 人格のページの集計で選んでいる月(null なら今の論理月)。
  // 編集画面へ行って戻っても保ち、一覧から人格のページを開いたときは今月に戻す(SPEC.md 11章)
  const [statsMonth, setStatsMonth] = useState<string | null>(null);
  const rememberScroll = useListScroll(view.kind === 'list');
  // 人格のページ・全体のことから編集画面を開いたときの、ページのスクロール位置(戻ったら元の位置に戻す)
  const pageScrollY = useRef<number | null>(null);

  // 一覧以外の画面に切り替わったら、一番上を出す(ページに戻ったときは覚えた位置へ)
  // 一覧のスクロール位置は useListScroll が戻す
  const viewKey = JSON.stringify(view);
  useLayoutEffect(() => {
    if (view.kind === 'list') {
      return;
    }
    const isPage = view.kind === 'page' || view.kind === 'common';
    window.scrollTo(0, isPage && pageScrollY.current !== null ? pageScrollY.current : 0);
    if (isPage) {
      pageScrollY.current = null;
    }
    // viewKey は view の中身が変わったときだけ変わる
  }, [viewKey]);

  // 更新のお知らせの「バックアップを書き出す」を押したら、バックアップ画面を開く
  useEffect(() => {
    if (backupRequest > 0) {
      pageScrollY.current = null;
      setView({ kind: 'backup' });
    }
  }, [backupRequest]);

  // 「はじめに」の「人格を登録する」を押したら、人格の追加の画面を開く
  useEffect(() => {
    if (addAlterRequest > 0) {
      pageScrollY.current = null;
      setView({ kind: 'alterEdit', id: null });
    }
  }, [addAlterRequest]);

  // 別の画面に移ったら、前に印刷した中身を片付ける
  useEffect(() => {
    clearPrint();
  }, [viewKey]);

  /** 一覧から別の画面を開く */
  const open = (next: View) => {
    rememberScroll();
    pageScrollY.current = null;
    setStatsMonth(null);
    setView(next);
  };
  /** 人格のページ・全体のことから編集画面を開く */
  const openFromPage = (next: View) => {
    pageScrollY.current = window.scrollY;
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!alters || !categories || !sections) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  const findAlter = (id: string | null) => alters.find((a) => a.id === id);
  /** 見出しの持ち主のページ(人格のページ、または「全体のこと」)に戻る */
  const backToOwner = (ownerId: string | null) =>
    setView(ownerId === null ? { kind: 'common' } : { kind: 'page', id: ownerId });

  switch (view.kind) {
    case 'backup':
      return <BackupScreen onBack={backToList} />;
    case 'about':
      return <AboutScreen onBack={backToList} />;
    case 'categories':
      return <AlterCategorySettingsScreen onBack={backToList} />;
    case 'quickTable':
      return (
        <QuickTableScreen
          rows={buildQuickTableRows(alters, categories)}
          onBack={backToList}
          onPrint={() => print(buildQuickTablePrint(alters, categories, new Date()))}
          printPreview={buildQuickTablePrint(alters, categories, new Date())}
        />
      );
    case 'common':
      return (
        <CommonInfoScreen
          sections={sectionsOf(sections, null)}
          onBack={backToList}
          onOpenSection={(section) => openFromPage({ kind: 'section', ownerId: null, sectionId: section.id })}
          onAddSection={() => openFromPage({ kind: 'section', ownerId: null, sectionId: null })}
          // 全員分の PDF の1ページ目(表題・作成日と全体のこと)だけを測る
          printPreview={{ ...buildAllPrint(alters, categories, sections, new Date(), term), quickTable: null, alterPages: [] }}
        />
      );
    case 'page': {
      const alter = findAlter(view.id);
      // 削除済みなら一覧を出す
      if (!alter) {
        break;
      }
      return (
        <AlterPageScreen
          alter={alter}
          categories={categories}
          sections={sectionsOf(sections, alter.id)}
          onBack={backToList}
          onPrint={() => print(buildAlterPrint(alter, categories, sections, new Date()))}
          onEditAlter={() => openFromPage({ kind: 'alterEdit', id: alter.id })}
          onEditBasicInfo={() => openFromPage({ kind: 'basicInfo', id: alter.id })}
          onOpenSection={(section) => openFromPage({ kind: 'section', ownerId: alter.id, sectionId: section.id })}
          onAddSection={() => openFromPage({ kind: 'section', ownerId: alter.id, sectionId: null })}
          showStats={showStats === true}
          statsMonth={statsMonth}
          onChangeStatsMonth={setStatsMonth}
        />
      );
    }
    case 'alterEdit': {
      const alter = findAlter(view.id);
      // 新規追加か、編集する人格が見つかるときだけ編集画面を出す(削除済みなら一覧を出す)
      if (view.id !== null && !alter) {
        break;
      }
      return (
        <AlterEditScreen
          key={view.id ?? 'new'}
          alter={alter}
          categories={categories}
          // 編集はその人格のページへ、追加のキャンセルは一覧へ戻る
          onBack={() => (alter ? setView({ kind: 'page', id: alter.id }) : backToList())}
          onAdded={(added) => {
            setStatsMonth(null);
            setView({ kind: 'page', id: added.id });
          }}
          onDeleted={backToList}
        />
      );
    }
    case 'basicInfo': {
      const alter = findAlter(view.id);
      if (!alter) {
        break;
      }
      return <AlterBasicInfoEditScreen alter={alter} onBack={() => setView({ kind: 'page', id: alter.id })} />;
    }
    case 'section': {
      const owner = view.ownerId === null ? null : findAlter(view.ownerId);
      const section = sections.find((s) => s.id === view.sectionId);
      // 持ち主の人格や、編集する見出しが見つからない(削除済み)なら一覧を出す
      if (owner === undefined || (view.sectionId !== null && !section)) {
        break;
      }
      return (
        <ProfileSectionEditScreen
          key={view.sectionId ?? 'new'}
          owner={owner}
          section={section}
          onBack={() => backToOwner(view.ownerId)}
        />
      );
    }
    case 'list':
      break;
  }

  // 書き出しをすすめる表示(読み込み中は出さない)
  const reminder = lastExportedAt === undefined ? null : backupReminderText(lastExportedAt, now);

  return (
    <main className="app">
      <header className="screen-header">
        <h1>{t('人格について')}</h1>
        <HelpButton
          helpKey="alters"
          footer={(close) => (
            <button
              type="button"
              className="sheet__wide-button help-sheet__intro"
              onClick={() => {
                close();
                onOpenIntro?.();
              }}
            >
              「はじめに」をもう一度見る
            </button>
          )}
        />
      </header>
      <Collapsible title={t('人格の情報')} open={openSections.alters} onToggle={() => toggleSection('alters')}>
        <AlterList
          alters={alters}
          categories={categories}
          onAdd={() => open({ kind: 'alterEdit', id: null })}
          onOpen={(alter) => open({ kind: 'page', id: alter.id })}
        />
      </Collapsible>
      <Collapsible title="システム全体について" open={openSections.system} onToggle={() => toggleSection('system')}>
        {/* 特定の人格ではない情報のページへの入口(SPEC.md 10.1・10.5) */}
        <button type="button" className="add-button common-entry" onClick={() => open({ kind: 'common' })}>
          <span>全体のこと</span>
          <span aria-hidden="true">›</span>
        </button>
      </Collapsible>
      {/* 早見表と全員分の PDF(SPEC.md 10.6・10.7)。ボタンの中で改行する */}
      <div className="alter-info-actions">
        <button type="button" onClick={() => open({ kind: 'quickTable' })}>
          {t('人格情報')}
          <br />
          早見表
        </button>
        <button type="button" onClick={() => print(buildAllPrint(alters, categories, sections, new Date(), term))}>
          全員分を
          <br />
          PDF資料に
        </button>
      </div>
      <Collapsible title="区分と呼び方の設定" open={openSections.settings} onToggle={() => toggleSection('settings')}>
        <button type="button" className="add-button" onClick={() => open({ kind: 'categories' })}>
          区分の設定
        </button>
        {/* 「人格」の呼び方(SPEC.md 14章③) */}
        <TermSettings />
      </Collapsible>
      {/* 集計の表示のオン/オフ(SPEC.md 11章・14章②)。全員分で1つの設定。押すとすぐ保存(読み込み中は出さない) */}
      {showStats !== undefined && (
        <section className="settings-section">
          <h2>集計</h2>
          <label className="choice">
            <input
              type="checkbox"
              checked={showStats}
              onChange={(event) => setShowStats(db, event.target.checked).catch(showSaveError)}
            />
            {t('人格ごとのページに集計を表示する')}
          </label>
        </section>
      )}
      <section className="settings-section">
        <h2>バックアップ</h2>
        {reminder && <p className="backup-reminder">{reminder}</p>}
        <button type="button" className="add-button" onClick={() => open({ kind: 'backup' })}>
          バックアップを開く
        </button>
      </section>
      <section className="settings-section">
        <h2>このアプリについて</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'about' })}>
          このアプリについて
        </button>
      </section>
    </main>
  );
}
