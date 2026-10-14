// 診察用の表示(SPEC.md 8.3):まだ話していないメモだけを、人格ごと → 分類ごとに並べる
// 医師に画面を見せても読みやすいよう、文字を大きめにする。「文字としてコピー」で同じ内容をクリップボードに入れる
// (クリップボードは端末の中だけ。外への通信はしない)
import { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { useNow } from '../hooks/useNow';
import { buildClinicView, buildClinicViewText, clinicViewTitle } from '../lib/clinicNotes';
import { AlterNameLabel } from '../components/common/AlterNameLabel';

/** コピーの結果の表示 */
type CopyResult = null | 'copied' | 'failed';

interface Props {
  onBack: () => void;
}

export function ClinicViewScreen({ onBack }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const categories = useLiveQuery(() => db.clinicNoteCategories.toArray());
  const notes = useLiveQuery(() => db.clinicNotes.toArray());
  const comments = useLiveQuery(() => db.clinicNoteComments.toArray());
  // 表題の日付は、表示したときの実際の日付(日付をまたいでも古い日付が残らないよう取り直す)
  const now = useNow();
  const [copyResult, setCopyResult] = useState<CopyResult>(null);

  if (!alters || !categories || !notes || !comments) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  const groups = buildClinicView(notes, comments, alters, categories);

  // コピーの文の表題の日付は、コピーしたときの実際の日付
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildClinicViewText(groups, new Date()));
      setCopyResult('copied');
    } catch {
      // クリップボードが使えない環境(許可されていない・古い端末など)
      setCopyResult('failed');
    }
  };

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>診察用の表示</h1>
      </header>
      {groups.length > 0 && (
        <>
          <button type="button" className="add-button" onClick={() => void handleCopy()}>
            文字としてコピー
          </button>
          {copyResult === 'copied' && <p className="backup-success">コピーしました</p>}
          {copyResult === 'failed' && <p className="form-error">コピーできませんでした</p>}
        </>
      )}
      <article className="clinic-view">
        <h2 className="clinic-view__title">{clinicViewTitle(now)}</h2>
        {groups.length === 0 && <p className="empty">まだ話していないメモはありません</p>}
        {groups.map((group) => (
          <section key={group.alterId ?? 'unknown'} className="clinic-view__group">
            {/* 人格の名前は、その人格の色の名前ラベルにする(SPEC.md 5章・8.3) */}
            <h3>
              <AlterNameLabel name={group.name} color={group.color} size="large" />
            </h3>
            {group.categories.map((category) => (
              <div key={category.categoryId}>
                <h4>【{category.name}】</h4>
                <ul className="clinic-view__notes">
                  {category.notes.map(({ note, comments: noteComments }) => (
                    <li key={note.id}>
                      <span className="clinic-view__text">{note.body}</span>
                      {noteComments.length > 0 && (
                        <ul className="clinic-view__comments">
                          {noteComments.map(({ comment, authorName, authorColor }) => (
                            <li key={comment.id} className="clinic-view__text">
                              └ <AlterNameLabel name={authorName} color={authorColor} />:{comment.body}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </article>
    </main>
  );
}
