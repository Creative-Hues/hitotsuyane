// 名前だけの項目(掲示板の板・リアクションの選択肢)の追加・編集画面(SPEC.md 22.2・22.5)
// 編集のときは、削除もここから行う(使われていない項目だけ)。名前を変えられない項目(ホームの板)は、名前の欄を出さない
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { showSaveError } from '../../lib/showError';
import { normalizeName } from '../../lib/validation';

/** 保存の結果:保存できた / 同じ名前がある / 見つからない(null) */
type SaveResult = { ok: true } | { ok: false; reason: 'duplicateName' } | null;

interface Props {
  /** 画面の見出し(例:「板を追加」「板を編集」) */
  title: string;
  /** 編集するときの今の名前(追加のときは undefined) */
  initialName?: string;
  /** 名前を変えられないときの説明(ホームの板)。渡すと名前の欄と「保存」を出さない */
  fixedNameNote?: string;
  onSave: (name: string) => Promise<SaveResult>;
  /** 同じ名前があるときの文(例:「同じ名前の板があります」) */
  duplicateMessage: string;
  /**
   * 削除(編集のときだけ)。label はボタンの文言、blockedNote は削除できないときの説明(削除できるときは null)、
   * confirmMessage は確認文。onDelete は削除できたら true
   */
  deletion?: {
    label: string;
    blockedNote: string | null | undefined;
    confirmMessage: string;
    onDelete: () => Promise<boolean>;
  };
  onBack: () => void;
}

export function NamedItemEditScreen({
  title,
  initialName,
  fixedNameNote,
  onSave,
  duplicateMessage,
  deletion,
  onBack,
}: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeName(name);
    if (normalized === null) {
      setError('名前を入力してください');
      return;
    }
    try {
      const result = await onSave(normalized);
      if (result && !result.ok) {
        setError(duplicateMessage);
        return;
      }
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleDelete = async () => {
    if (!deletion) {
      return;
    }
    try {
      const deleted = await deletion.onDelete();
      setConfirmingDelete(false);
      // 確認中に使われて削除できなかった場合は、この画面に残って理由を表示する
      if (deleted) {
        onBack();
      }
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>{title}</h1>
      </header>
      {fixedNameNote ? (
        <p className="settings-note">{fixedNameNote}</p>
      ) : (
        <form className="edit-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span>名前</span>
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="form-buttons">
            <button type="button" onClick={onBack}>
              キャンセル
            </button>
            <button type="submit" className="primary">
              保存
            </button>
          </div>
        </form>
      )}
      {deletion && (
        <section className="edit-actions">
          <button
            type="button"
            className="danger-button"
            // 削除できるか読み込み中(undefined)のときも押せないようにする
            disabled={deletion.blockedNote !== null}
            onClick={() => setConfirmingDelete(true)}
          >
            {deletion.label}
          </button>
          {deletion.blockedNote && <p className="edit-actions__note">{deletion.blockedNote}</p>}
        </section>
      )}
      {deletion && confirmingDelete && (
        <ConfirmDialog
          message={deletion.confirmMessage}
          confirmLabel="削除する"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
