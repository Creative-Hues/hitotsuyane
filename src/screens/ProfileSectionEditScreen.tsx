// プロフィールの見出しの追加・編集画面(SPEC.md 10.4・10.5)
// 項目は見出しと中身。編集のときは、削除もここから行う
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { db } from '../db/db';
import { addProfileSection, deleteProfileSection, updateProfileSection } from '../db/profileSectionRepo';
import { validateProfileSectionForm } from '../lib/alterInfo';
import { showSaveError } from '../lib/showError';
import type { Alter, ProfileSection } from '../lib/types';
import { AlterNameLabel } from '../components/common/AlterNameLabel';

interface Props {
  /** 誰のページの見出しか(null なら「全体のこと」) */
  owner: Alter | null;
  /** 編集する見出し(追加のときは undefined) */
  section?: ProfileSection;
  onBack: () => void;
}

export function ProfileSectionEditScreen({ owner, section, onBack }: Props) {
  const [title, setTitle] = useState(section?.title ?? '');
  const [body, setBody] = useState(section?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const result = validateProfileSectionForm({ title, body });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      if (section) {
        await updateProfileSection(db, section.id, result.input);
      } else {
        await addProfileSection(db, owner?.id ?? null, result.input, new Date());
      }
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleDelete = async (target: ProfileSection) => {
    try {
      await deleteProfileSection(db, target.id);
      onBack();
    } catch (saveError) {
      setConfirmingDelete(false);
      showSaveError(saveError);
    }
  };

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>{section ? '見出しを編集' : '見出しを追加'}</h1>
      </header>
      {/* 誰のページの見出しかがわかるようにする */}
      <p className="author-heading">
        {owner ? (
          <>
            <AlterNameLabel name={owner.name} color={owner.color} />のページ
          </>
        ) : (
          '全体のこと'
        )}
      </p>
      <form className="edit-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          <span>見出し</span>
          <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span>中身</span>
          <textarea className="note-textarea" value={body} onChange={(event) => setBody(event.target.value)} />
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
      {section && (
        <section className="edit-actions">
          <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>
            この見出しを削除する
          </button>
        </section>
      )}
      {section && confirmingDelete && (
        <ConfirmDialog
          message={`見出し「${section.title}」を削除しますか?`}
          confirmLabel="削除する"
          onConfirm={() => handleDelete(section)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
