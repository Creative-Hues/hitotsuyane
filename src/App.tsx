// 画面の切り替え(SPEC.md 5章):画面下のタブバーで5つのタブを切り替える
// タブを切り替えて戻ったとき、前に開いていた画面・スクロール位置・入力中の内容がそのまま残るよう、
// 5つのタブの画面は作ったままにして、今のタブ以外は隠しておく
// タブバーのすぐ上に、どのタブからでも押せる「変わったことに気づいた」ボタンを置く(SPEC.md 17.1)
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { TabBar, type TabKey } from './components/common/TabBar';
import { TestSiteBanner } from './components/common/TestSiteBanner';
import { UpdateNoticeBar } from './components/common/UpdateNoticeBar';
import { IS_TEST_SITE } from './lib/appTarget';
import { SwitchRecordSheet } from './components/switch/SwitchRecordSheet';
import { useLiveQuery } from './hooks/useLiveQuery';
import { useUpdateNotice } from './hooks/useUpdateNotice';
import { db } from './db/db';
import { IntroScreen } from './screens/IntroScreen';
import { AlterInfoScreen } from './screens/AlterInfoScreen';
import { BucketScreen } from './screens/BucketScreen';
import { ClinicNoteScreen } from './screens/ClinicNoteScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MedicationHistoryScreen } from './screens/MedicationHistoryScreen';
import { MedicationScreen } from './screens/MedicationScreen';
import { MedicationSettingsScreen } from './screens/MedicationSettingsScreen';
import { TaskSettingsScreen } from './screens/TaskSettingsScreen';

/** ToDo タブの中の画面:ToDo 画面 / タスク設定 */
type TodoView = 'home' | 'taskSettings';

/** 服薬タブの中の画面:記録画面 / 記録の一覧 / 薬の設定 */
type MedicationView = 'record' | 'history' | 'settings';

/** 「記録しました」を出しておく時間 */
const RECORDED_MESSAGE_MS = 2500;

function App() {
  const [tab, setTab] = useState<TabKey>('todo');
  const [todoView, setTodoView] = useState<TodoView>('home');
  const [medicationView, setMedicationView] = useState<MedicationView>('record');
  // タブごとのスクロール位置(ページのスクロールは全タブで共通なので、切り替えのたびに覚えて戻す)
  const scrollByTab = useRef<Partial<Record<TabKey, number>>>({});
  // 交代の記録のシート:開いているときは、気づいた時刻(ボタンを押した時刻)。閉じているときは null
  const [switchNoticedAt, setSwitchNoticedAt] = useState<Date | null>(null);
  const [showRecorded, setShowRecorded] = useState(false);
  // 更新のお知らせ(SPEC.md 18章)
  const updateNotice = useUpdateNotice();
  // 「バックアップを書き出す」を押した回数(押すたびに、人格情報タブでバックアップ画面を開く)
  const [backupRequest, setBackupRequest] = useState(0);
  // 「はじめに」(SPEC.md 14章⑤):人格が1人もいない間、開くたびに出す。閉じたら、この起動の間は出さない
  const alterCount = useLiveQuery(() => db.alters.count());
  const [introClosed, setIntroClosed] = useState(false);
  // 「人格を登録する」を押した回数(押すたびに、人格情報タブで人格の追加の画面を開く)
  const [addAlterRequest, setAddAlterRequest] = useState(0);

  // 「記録しました」は少したったら消す
  useEffect(() => {
    if (!showRecorded) {
      return;
    }
    const timer = window.setTimeout(() => setShowRecorded(false), RECORDED_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [showRecorded]);

  // タブを切り替えたら、そのタブで前に見ていた位置に戻す(初めてなら一番上)
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByTab.current[tab] ?? 0);
  }, [tab]);

  // 今のタブを押したときは何もしない(入力の途中の内容を誤って消さないため)
  const handleSelectTab = (next: TabKey) => {
    if (next === tab) {
      return;
    }
    scrollByTab.current[tab] = window.scrollY;
    setTab(next);
  };

  const panels: Record<TabKey, ReactNode> = {
    todo:
      todoView === 'taskSettings' ? (
        <TaskSettingsScreen onBack={() => setTodoView('home')} />
      ) : (
        <HomeScreen onOpenTaskSettings={() => setTodoView('taskSettings')} />
      ),
    medication: {
      record: (
        <MedicationScreen
          onOpenHistory={() => setMedicationView('history')}
          onOpenSettings={() => setMedicationView('settings')}
        />
      ),
      history: <MedicationHistoryScreen onBack={() => setMedicationView('record')} />,
      settings: <MedicationSettingsScreen onBack={() => setMedicationView('record')} />,
    }[medicationView],
    clinic: <ClinicNoteScreen />,
    bucket: <BucketScreen />,
    alters: <AlterInfoScreen backupRequest={backupRequest} addAlterRequest={addAlterRequest} />,
  };

  return (
    <>
      {/* 画面の上の帯(テスト版の帯・更新のお知らせ)。スクロールしても上に残す */}
      {(IS_TEST_SITE || updateNotice.visible) && (
        <div className="top-bars">
          {IS_TEST_SITE && <TestSiteBanner />}
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
      )}
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
      <TabBar current={tab} onSelect={handleSelectTab} />
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
