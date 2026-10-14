// 画面の切り替え(SPEC.md 5章):画面下のタブバーで5つのタブ [リスト][治療][交代][掲示板][人格] を切り替える
// リストタブは [ToDo][バケット]、治療タブは [服薬][受診メモ] を、タブの上部の切り替えボタンで切り替える
// タブ・切り替えで戻ったとき、前に開いていた画面・スクロール位置・入力中の内容がそのまま残るよう、
// すべての画面は作ったままにして、今の画面以外は隠しておく
// タブバーのすぐ上に、どのタブからでも押せる「変わったことに気づいた」ボタンを置く(SPEC.md 17.1)
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BeforeUpdateNoticeBar } from './components/common/BeforeUpdateNoticeBar';
import { TabBar, type TabKey } from './components/common/TabBar';
import { TabHeader, type TabSwitchOption } from './components/common/TabHeader';
import { TestSiteBanner } from './components/common/TestSiteBanner';
import { UpdateNoticeBar } from './components/common/UpdateNoticeBar';
import { SwitchRecordSheet } from './components/switch/SwitchRecordSheet';
import { useLiveQuery } from './hooks/useLiveQuery';
import { useUpdateNotice } from './hooks/useUpdateNotice';
import { db } from './db/db';
import { IS_TEST_SITE } from './lib/appTarget';
import { IntroScreen } from './screens/IntroScreen';
import { AlterInfoScreen } from './screens/AlterInfoScreen';
import { BoardScreen } from './screens/BoardScreen';
import { badgeText, countNewThreads } from './lib/board';
import { BucketScreen } from './screens/BucketScreen';
import { ClinicNoteScreen } from './screens/ClinicNoteScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MedicationHistoryScreen } from './screens/MedicationHistoryScreen';
import { MedicationScreen } from './screens/MedicationScreen';
import { MedicationSettingsScreen } from './screens/MedicationSettingsScreen';
import { SwitchLogScreen } from './screens/SwitchLogScreen';
import { TaskSettingsScreen } from './screens/TaskSettingsScreen';

/** リストタブの中の画面:ToDo / バケット */
type ListView = 'todo' | 'bucket';

/** 治療タブの中の画面:服薬 / 受診メモ */
type CareView = 'medication' | 'clinic';

/** ToDo の中の画面:ToDo 画面 / タスク設定 */
type TodoView = 'home' | 'taskSettings';

/** 服薬の中の画面:記録画面 / 記録の一覧 / 薬の設定 */
type MedicationView = 'record' | 'history' | 'settings';

const LIST_OPTIONS: readonly TabSwitchOption<ListView>[] = [
  { key: 'todo', label: 'ToDo' },
  { key: 'bucket', label: 'バケット' },
];

const CARE_OPTIONS: readonly TabSwitchOption<CareView>[] = [
  { key: 'medication', label: '服薬' },
  { key: 'clinic', label: '受診メモ' },
];

/** 「記録しました」を出しておく時間 */
const RECORDED_MESSAGE_MS = 2500;

function App() {
  const [tab, setTab] = useState<TabKey>('list');
  // タブの中の切り替え。アプリを開いたときは ToDo・服薬。開いている間は最後に選んだほうを覚える(保存はしない)
  const [listView, setListView] = useState<ListView>('todo');
  const [careView, setCareView] = useState<CareView>('medication');
  const [todoView, setTodoView] = useState<TodoView>('home');
  const [medicationView, setMedicationView] = useState<MedicationView>('record');
  // 画面ごとのスクロール位置(ページのスクロールは全画面で共通なので、切り替えのたびに覚えて戻す)
  const scrollByScreen = useRef<Record<string, number>>({});
  // 交代の記録のシート:開いているときは、気づいた時刻(ボタンを押した時刻)。閉じているときは null
  const [switchNoticedAt, setSwitchNoticedAt] = useState<Date | null>(null);
  const [showRecorded, setShowRecorded] = useState(false);
  // 更新のお知らせ(SPEC.md 18章)
  const updateNotice = useUpdateNotice();
  // 「バックアップを書き出す」を押した回数(押すたびに、人格タブでバックアップ画面を開く)
  const [backupRequest, setBackupRequest] = useState(0);
  // 「はじめに」(SPEC.md 14章⑤):人格が1人もいない間、開くたびに出す。閉じたら、この起動の間は出さない
  const alterCount = useLiveQuery(() => db.alters.count());
  const [introClosed, setIntroClosed] = useState(false);
  // 「人格を登録する」を押した回数(押すたびに、人格タブで人格の追加の画面を開く)
  const [addAlterRequest, setAddAlterRequest] = useState(0);
  // 掲示板のタブのバッジ:新着のあるスレッドの数(SPEC.md 22.4)
  const newThreadCount = useLiveQuery(async () =>
    countNewThreads({
      threads: await db.boardThreads.toArray(),
      comments: await db.boardComments.toArray(),
      seens: await db.boardSeen.toArray(),
    }),
  );
  const boardBadge = badgeText(newThreadCount ?? 0);

  // 今見ている画面の名前(スクロール位置を覚える単位)
  const screenKey = tab === 'list' ? `list:${listView}` : tab === 'care' ? `care:${careView}` : tab;

  // 「記録しました」は少したったら消す
  useEffect(() => {
    if (!showRecorded) {
      return;
    }
    const timer = window.setTimeout(() => setShowRecorded(false), RECORDED_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [showRecorded]);

  // 画面を切り替えたら、その画面で前に見ていた位置に戻す(初めてなら一番上)
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByScreen.current[screenKey] ?? 0);
  }, [screenKey]);

  /** 画面を切り替える直前に、今の画面のスクロール位置を覚える */
  const rememberScroll = () => {
    scrollByScreen.current[screenKey] = window.scrollY;
  };

  // 今のタブを押したときは何もしない(入力の途中の内容を誤って消さないため)
  const handleSelectTab = (next: TabKey) => {
    if (next === tab) {
      return;
    }
    rememberScroll();
    setTab(next);
  };

  const listHeader = (
    <TabHeader
      title="リスト"
      options={LIST_OPTIONS}
      current={listView}
      onSelect={(next) => {
        rememberScroll();
        setListView(next);
      }}
    />
  );
  const careHeader = (
    <TabHeader
      title="治療"
      options={CARE_OPTIONS}
      current={careView}
      onSelect={(next) => {
        rememberScroll();
        setCareView(next);
      }}
    />
  );

  const panels: Record<TabKey, ReactNode> = {
    list: (
      <>
        <div hidden={listView !== 'todo'}>
          {todoView === 'taskSettings' ? (
            <TaskSettingsScreen onBack={() => setTodoView('home')} />
          ) : (
            <HomeScreen tabHeader={listHeader} onOpenTaskSettings={() => setTodoView('taskSettings')} />
          )}
        </div>
        <div hidden={listView !== 'bucket'}>
          <BucketScreen tabHeader={listHeader} />
        </div>
      </>
    ),
    care: (
      <>
        <div hidden={careView !== 'medication'}>
          {
            {
              record: (
                <MedicationScreen
                  tabHeader={careHeader}
                  onOpenHistory={() => setMedicationView('history')}
                  onOpenSettings={() => setMedicationView('settings')}
                />
              ),
              history: <MedicationHistoryScreen onBack={() => setMedicationView('record')} />,
              settings: <MedicationSettingsScreen onBack={() => setMedicationView('record')} />,
            }[medicationView]
          }
        </div>
        <div hidden={careView !== 'clinic'}>
          <ClinicNoteScreen tabHeader={careHeader} />
        </div>
      </>
    ),
    switch: <SwitchLogScreen />,
    board: <BoardScreen />,
    alters: <AlterInfoScreen backupRequest={backupRequest} addAlterRequest={addAlterRequest} />,
  };

  return (
    <>
      {/* 画面の上の帯(テスト版の帯・更新のお知らせ・更新前のデータ)。スクロールしても上に残す */}
      <div className="top-bars">
        {IS_TEST_SITE && <TestSiteBanner />}
        {/* 更新前のデータを保存したときだけ出る(SPEC.md 18.4) */}
        <BeforeUpdateNoticeBar />
        {updateNotice.visible && (
          <UpdateNoticeBar
            kind={updateNotice.kind}
            onOpenBackup={() => {
              handleSelectTab('alters');
              setBackupRequest((count) => count + 1);
            }}
            onUpdate={updateNotice.update}
            onDismiss={updateNotice.dismiss}
          />
        )}
      </div>
      {(Object.keys(panels) as TabKey[]).map((key) => (
        <div key={key} hidden={key !== tab}>
          {panels[key]}
        </div>
      ))}
      <button
        type="button"
        className="switch-button"
        onClick={() => {
          setShowRecorded(false);
          setSwitchNoticedAt(new Date());
        }}
      >
        変わったことに気づいた
      </button>
      {showRecorded && (
        <p className="switch-toast" role="status">
          記録しました
        </p>
      )}
      <TabBar current={tab} onSelect={handleSelectTab} badges={boardBadge === null ? {} : { board: boardBadge }} />
      {alterCount === 0 && !introClosed && (
        <IntroScreen
          onAddAlter={() => {
            setIntroClosed(true);
            handleSelectTab('alters');
            setAddAlterRequest((count) => count + 1);
          }}
          onClose={() => setIntroClosed(true)}
        />
      )}
      {switchNoticedAt !== null && (
        <SwitchRecordSheet
          noticedAt={switchNoticedAt}
          onRecorded={() => {
            setSwitchNoticedAt(null);
            setShowRecorded(true);
          }}
          onCancel={() => setSwitchNoticedAt(null)}
        />
      )}
    </>
  );
}

export default App;
