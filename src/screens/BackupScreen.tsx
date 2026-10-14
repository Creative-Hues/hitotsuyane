// バックアップ画面(SPEC.md 12章):書き出し・読み込み・最後に書き出した日時・更新前のデータ(18.4)
import { useRef, useState, type ChangeEvent } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { db } from '../db/db';
import { getLastExportedAt, readAllData, readBackupSettings, replaceAllData, setLastExportedAt } from '../db/backupRepo';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useBeforeUpdateSnapshot } from '../hooks/useBeforeUpdateSnapshot';
import { useNow } from '../hooks/useNow';
import { useTerm } from '../hooks/useTerm';
import {
  backupFileName,
  backupReminderText,
  buildBackup,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '../lib/backup';
import { IS_TEST_SITE } from '../lib/appTarget';
import { browserSaveDeps, saveFile } from '../lib/saveFile';
import { formatDateTime, formatMonthDayKanji } from '../lib/timeFormat';

interface Props {
  onBack: () => void;
}

/** 画面の下に出すお知らせ(成功・失敗) */
type Notice = { kind: 'success' | 'error'; text: string } | null;

export function BackupScreen({ onBack }: Props) {
  const now = useNow();
  const lastExportedAt = useLiveQuery(() => getLastExportedAt(db));
  // 書き出すデータは先に読んでおく。iPhone では、ボタンを押してから共有シートを開くまでに
  // 時間がかかると共有が拒否されるため、押した瞬間にすぐファイルを作れるようにする
  const currentData = useLiveQuery(() => readAllData(db));
  const currentSettings = useLiveQuery(() => readBackupSettings(db));
  const { t } = useTerm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const { snapshot, exportSnapshot } = useBeforeUpdateSnapshot();

  /** 更新前のデータを書き出す。今のデータの書き出しではないので、最後に書き出した日時は変えない(SPEC.md 12章) */
  const handleExportSnapshot = async () => {
    setNotice(null);
    try {
      if ((await exportSnapshot()) !== 'cancelled') {
        setNotice({ kind: 'success', text: '更新前のデータを書き出しました' });
      }
    } catch (error) {
      console.error('更新前のデータの書き出しに失敗しました', error);
      setNotice({ kind: 'error', text: '書き出しに失敗しました。もう一度お試しください。' });
    }
  };

  const handleExport = async () => {
    if (!currentData || !currentSettings) {
      return;
    }
    setNotice(null);
    const exportedAt = new Date();
    const file = new File([serializeBackup(buildBackup(currentData, exportedAt, currentSettings))], backupFileName(exportedAt, IS_TEST_SITE), {
      type: 'application/json',
    });
    try {
      // 共有シートを閉じた(キャンセルした)ときは、何もしない
      if ((await saveFile(file, browserSaveDeps())) === 'cancelled') {
        return;
      }
      // 保存できたときだけ、最後に書き出した日時を記録する
      await setLastExportedAt(db, exportedAt);
      setNotice({ kind: 'success', text: 'バックアップを書き出しました' });
    } catch (error) {
      console.error('バックアップの書き出しに失敗しました', error);
      setNotice({ kind: 'error', text: '書き出しに失敗しました。もう一度お試しください。' });
    }
  };

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルをもう一度選んでも反応するように、選択を空に戻す
    event.target.value = '';
    if (!file) {
      return;
    }
    setNotice(null);
    let text: string;
    try {
      text = await file.text();
    } catch (error) {
      console.error('ファイルを開けませんでした', error);
      setNotice({ kind: 'error', text: 'ファイルを開けませんでした' });
      return;
    }
    const result = parseBackup(text);
    if (result.ok) {
      setPendingImport(result.backup);
    } else {
      // 理由の文には利用者が付けた名前が入らないので、呼び方に置き換えてよい
      setNotice({ kind: 'error', text: `読み込めませんでした:${t(result.reason)}` });
    }
  };

  const handleImport = async (backup: BackupFile) => {
    setPendingImport(null);
    try {
      await replaceAllData(db, backup.data, backup.settings);
      setNotice({ kind: 'success', text: 'バックアップを読み込みました' });
    } catch (error) {
      console.error('バックアップの読み込みに失敗しました', error);
      setNotice({ kind: 'error', text: '読み込みに失敗しました。今のデータは変わっていません。' });
    }
  };

  const reminder = lastExportedAt === undefined ? null : backupReminderText(lastExportedAt, now);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>バックアップ</h1>
      </header>

      <section className="settings-section">
        <h2>書き出し</h2>
        <p className="backup-text">すべてのデータを1つのファイルにして保存します。</p>
        <p className="backup-text">
          最後に書き出した日時:
          {lastExportedAt === undefined ? '…' : lastExportedAt === null ? 'まだありません' : formatDateTime(lastExportedAt)}
        </p>
        {reminder && <p className="backup-reminder">{reminder}</p>}
        <button type="button" className="add-button" disabled={!currentData || !currentSettings} onClick={handleExport}>
          書き出す
        </button>
      </section>

      <section className="settings-section">
        <h2>読み込み</h2>
        <p className="backup-text">書き出したファイルを選ぶと、今のデータをすべてファイルの中身に置き換えます。</p>
        <button type="button" className="add-button" onClick={() => fileInput.current?.click()}>
          ファイルを選んで読み込む
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={handleFileChosen}
        />
      </section>

      {snapshot && (
        <section className="settings-section">
          <h2>更新前のデータ({formatMonthDayKanji(snapshot.savedAt)})</h2>
          <p className="backup-text">
            アプリを更新してデータの形が変わる前に、端末の中に保存しておいたデータです。書き出したファイルは、ふつうのバックアップと同じように読み込めます。
          </p>
          <button type="button" className="add-button" onClick={handleExportSnapshot}>
            書き出す
          </button>
        </section>
      )}

      {notice && (
        <p className={notice.kind === 'error' ? 'form-error' : 'backup-success'} role="status">
          {notice.text}
        </p>
      )}

      {pendingImport && (
        <ConfirmDialog
          message={`${formatDateTime(pendingImport.exportedAt)} に書き出したバックアップです。今のデータはすべて置き換わります。読み込みますか?`}
          confirmLabel="置き換える"
          onConfirm={() => handleImport(pendingImport)}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </main>
  );
}
