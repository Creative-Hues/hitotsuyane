// 移行前のバックアップ(SPEC.md 18.4)を読み、ファイルに書き出すフック。
// 更新した直後の帯と、バックアップ画面の「更新前のデータ」の欄で使う
import { beforeUpdateDb, dismissBeforeUpdateNotice, getBeforeUpdateSnapshot, type BeforeUpdateSnapshot } from '../db/beforeUpdate';
import { IS_TEST_SITE } from '../lib/appTarget';
import { beforeUpdateFileName } from '../lib/backup';
import { browserSaveDeps, saveFile, type SaveResult } from '../lib/saveFile';
import { useLiveQuery } from './useLiveQuery';

export interface BeforeUpdateSnapshotState {
  /** 読み込み中は undefined、写しがなければ null */
  snapshot: BeforeUpdateSnapshot | null | undefined;
  /**
   * 写しをファイルにする(iPhone では共有シート)。書き出せたら、帯はもう出さない。
   * 失敗したときはエラーを投げる
   */
  exportSnapshot: () => Promise<SaveResult>;
}

export function useBeforeUpdateSnapshot(): BeforeUpdateSnapshotState {
  // 写しは先に読んでおく。iPhone では、ボタンを押してから共有シートを開くまでに
  // 時間がかかると共有が拒否されるため、押した瞬間にすぐファイルを作れるようにする
  const snapshot = useLiveQuery(() => getBeforeUpdateSnapshot(beforeUpdateDb));

  const exportSnapshot = async (): Promise<SaveResult> => {
    if (!snapshot) {
      return 'cancelled';
    }
    const file = new File([snapshot.text], beforeUpdateFileName(new Date(snapshot.savedAt), IS_TEST_SITE), {
      type: 'application/json',
    });
    const result = await saveFile(file, browserSaveDeps());
    if (result !== 'cancelled') {
      await dismissBeforeUpdateNotice(beforeUpdateDb);
    }
    return result;
  };

  return { snapshot, exportSnapshot };
}
