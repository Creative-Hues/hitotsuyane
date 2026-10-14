// 「更新前のデータを保存しました」の帯(SPEC.md 18.4)。データベースの版を上げたあと、画面の上に出す
// 書き出すか「閉じる」を押すまで、開くたびに出す
import { useState } from 'react';
import { beforeUpdateDb, dismissBeforeUpdateNotice } from '../../db/beforeUpdate';
import { useBeforeUpdateSnapshot } from '../../hooks/useBeforeUpdateSnapshot';

export function BeforeUpdateNoticeBar() {
  const { snapshot, exportSnapshot } = useBeforeUpdateSnapshot();
  const [failed, setFailed] = useState(false);

  if (!snapshot?.noticePending) {
    return null;
  }

  const handleExport = async () => {
    setFailed(false);
    try {
      await exportSnapshot();
    } catch (error) {
      console.error('更新前のデータの書き出しに失敗しました', error);
      setFailed(true);
    }
  };

  return (
    <div className="update-notice" role="status">
      <p className="update-notice__text">更新前のデータを保存しました。書き出しておくと安心です。</p>
      {failed && <p className="update-notice__text">書き出しに失敗しました。もう一度お試しください。</p>}
      <div className="update-notice__buttons">
        <button type="button" className="update-notice__backup" onClick={handleExport}>
          書き出す
        </button>
        <button
          type="button"
          onClick={() => {
            dismissBeforeUpdateNotice(beforeUpdateDb).catch((error: unknown) => {
              console.error('帯を閉じられませんでした', error);
            });
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
