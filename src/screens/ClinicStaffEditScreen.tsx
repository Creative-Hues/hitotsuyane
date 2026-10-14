// 話した相手の選択肢の追加・編集画面(SPEC.md 8.6)
// 編集のときは、削除もここから行う(使っている受診の記録がない選択肢だけ)
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { db } from '../db/db';
import {
  addClinicStaff,
  countClinicStaffUsage,
  deleteClinicStaff,
  renameClinicStaff,
  type SaveStaffResult,
} from '../db/clinicStaffRepo';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { showSaveError } from '../lib/showError';
import type { ClinicStaff } from '../lib/types';
import { normalizeName } from '../lib/validation';

interface Props {
  /** 編集する選択肢(追加のときは undefined) */
  staff?: ClinicStaff;
  onBack: () => void;
}

export function ClinicStaffEditScreen({ staff, onBack }: Props) {
  const [name, setName] = useState(staff?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // その選択肢を使っている受診の記録の件数(1件以上あると削除できない)
  const usage = useLiveQuery(
    () => (staff ? countClinicStaffUsage(db, staff.id) : Promise.resolve(0)),
    [staff?.id],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeName(name);
    if (normalized === null) {
      setError('名前を入力してください');
      return;
    }
    try {
      const result: SaveStaffResult | null = staff
        ? await renameClinicStaff(db, staff.id, normalized)
        : await addClinicStaff(db, normalized, new Date());
      if (result && !result.ok) {
        setError('同じ名前の選択肢があります');
        return;
      }
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleDelete = async (target: ClinicStaff) => {
    try {
      const deleted = await deleteClinicStaff(db, target.id);
      setConfirmingDelete(false);
      // 確認中に受診の記録が増えて削除できなかった場合は、この画面に残って理由を表示する
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
        <h1>{staff ? '話した相手を編集' : '話した相手を追加'}</h1>
      </header>
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
      {staff && (
        <section className="edit-actions">
          <button
            type="button"
            className="danger-button"
            // 件数を読み込み中のときも押せないようにする
            disabled={usage !== 0}
            onClick={() => setConfirmingDelete(true)}
          >
            この選択肢を削除する
          </button>
          {usage !== undefined && usage > 0 && (
            <p className="edit-actions__note">この選択肢を使っている受診の記録があるため削除できません。</p>
          )}
        </section>
      )}
      {staff && confirmingDelete && (
        <ConfirmDialog
          message={`「${staff.name}」を削除しますか?`}
          confirmLabel="削除する"
          onConfirm={() => handleDelete(staff)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
