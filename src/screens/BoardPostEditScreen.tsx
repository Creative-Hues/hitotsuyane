// 掲示板の書き込み(スレッド・コメント)の入力・編集画面(SPEC.md 22.3)
// 書くときは、最初に「いま書いている人格」を選び(非表示でない人格+「わからない」)、そのあと入力欄を出す
// 直す・消すときは、アプリは操作している人格を知らないので、バケットと同じく本人確認の文を出す
import { useState, type FormEvent } from 'react';
import { AlterButtons } from '../components/common/AlterButtons';
import { AlterNameLabel } from '../components/common/AlterNameLabel';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { db } from '../db/db';
import { addComment, addThread, deleteComment, deleteThread, updateComment, updateThread } from '../db/boardRepo';
import { useTerm } from '../hooks/useTerm';
import {
  deletePostConfirmMessage,
  editPostConfirmMessage,
  validatePostBody,
  validateThreadTitle,
} from '../lib/board';
import { resolveRecordAlter } from '../lib/completionLabel';
import { showSaveError } from '../lib/showError';
import type { Alter, BoardComment, BoardThread } from '../lib/types';

/** 何を書く・直すか */
export type PostTarget =
  | { kind: 'newThread'; boardId: string }
  | { kind: 'editThread'; thread: BoardThread; commentCount: number }
  | { kind: 'newComment'; thread: BoardThread }
  | { kind: 'editComment'; thread: BoardThread; comment: BoardComment };

interface Props {
  target: PostTarget;
  /** すべての人格(非表示も含む) */
  alters: Alter[];
  onBack: () => void;
  /** スレッドを削除したとき(スレッドの画面ではなく一覧に戻るため) */
  onThreadDeleted: () => void;
}

/** 開いている確認:なし / 変更の本人確認 / 削除の本人確認 */
type Confirming = null | 'edit' | 'delete';

export function BoardPostEditScreen({ target, alters, onBack, onThreadDeleted }: Props) {
  const { t } = useTerm();
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const editing = target.kind === 'editThread' || target.kind === 'editComment';
  const isThread = target.kind === 'newThread' || target.kind === 'editThread';
  const original =
    target.kind === 'editThread' ? target.thread : target.kind === 'editComment' ? target.comment : null;
  // 書いた人格。新しく書くときは、選ぶまで undefined(「わからない」は null)
  const [authorId, setAuthorId] = useState<string | null | undefined>(original ? original.alterId : undefined);
  const [title, setTitle] = useState(target.kind === 'editThread' ? target.thread.title : '');
  const [body, setBody] = useState(original?.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  // 本人確認のあとに保存する内容
  const [pendingInput, setPendingInput] = useState<{ title: string; body: string } | null>(null);

  const author = authorId === undefined ? null : resolveRecordAlter({ alterId: authorId }, alterById);
  // 本人確認の文に入れる名前(「わからない」・見つからない人格は null)
  const authorName = authorId === null || authorId === undefined ? null : (alterById.get(authorId)?.name ?? null);
  const heading = {
    newThread: 'スレッドを立てる',
    editThread: 'スレッドを編集',
    newComment: 'コメントを書く',
    editComment: 'コメントを編集',
  }[target.kind];

  const save = async (input: { title: string; body: string }) => {
    const now = new Date();
    switch (target.kind) {
      case 'newThread':
        await addThread(db, { boardId: target.boardId, alterId: authorId ?? null, ...input }, now);
        return;
      case 'editThread':
        await updateThread(db, target.thread.id, input, now);
        return;
      case 'newComment':
        await addComment(db, { threadId: target.thread.id, alterId: authorId ?? null, body: input.body }, now);
        return;
      case 'editComment':
        await updateComment(db, target.comment.id, input.body, now);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const titleResult = isThread ? validateThreadTitle(title) : ({ ok: true, input: '' } as const);
    if (!titleResult.ok) {
      setError(titleResult.error);
      return;
    }
    const bodyResult = validatePostBody(body);
    if (!bodyResult.ok) {
      setError(bodyResult.error);
      return;
    }
    const input = { title: titleResult.input, body: bodyResult.input };
    if (editing) {
      // 何も変えていないときは、確認を出さずに戻る
      const unchanged =
        input.body === original?.body && (target.kind !== 'editThread' || input.title === target.thread.title);
      if (unchanged) {
        onBack();
        return;
      }
      setPendingInput(input);
      setConfirming('edit');
      return;
    }
    try {
      await save(input);
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleConfirmEdit = async () => {
    if (!pendingInput) {
      return;
    }
    try {
      await save(pendingInput);
      setConfirming(null);
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (target.kind === 'editThread') {
        await deleteThread(db, target.thread.id);
        setConfirming(null);
        onThreadDeleted();
      } else if (target.kind === 'editComment') {
        await deleteComment(db, target.comment.id);
        setConfirming(null);
        onBack();
      }
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  // 新しく書くときは、最初に「いま書いている人格」を選ぶ
  if (authorId === undefined) {
    const visible = alters.filter((alter) => !alter.hidden).sort((a, b) => a.order - b.order);
    return (
      <main className="app">
        <header className="screen-header">
          <button type="button" onClick={onBack}>
            ‹ 戻る
          </button>
          <h1>{heading}</h1>
        </header>
        {target.kind === 'newComment' && <p className="settings-note">「{target.thread.title}」へのコメント</p>}
        <h2 className="sheet__title">{t('いま書いている人格は?')}</h2>
        <AlterButtons alters={visible} onSelect={setAuthorId} />
      </main>
    );
  }

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={editing ? onBack : () => setAuthorId(undefined)}>
          ‹ 戻る
        </button>
        <h1>{heading}</h1>
      </header>
      {(target.kind === 'newComment' || target.kind === 'editComment') && (
        <p className="settings-note">「{target.thread.title}」へのコメント</p>
      )}
      {/* 誰の書き込みかがわかるよう、書いた人格を名前ラベルで出す */}
      <p className="author-heading">
        {authorId !== null && author ? (
          <>
            <AlterNameLabel name={author.name} color={author.color} />
            の書き込み
          </>
        ) : (
          t('書いた人格:わからない')
        )}
      </p>
      <form className="edit-form" onSubmit={(event) => void handleSubmit(event)}>
        {isThread && (
          <label className="field">
            <span>題名</span>
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
        )}
        <label className="field">
          <span>内容</span>
          <textarea className="note-textarea" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="form-buttons">
          <button type="button" onClick={onBack}>
            キャンセル
          </button>
          <button type="submit" className="primary">
            {editing ? '保存' : '書き込む'}
          </button>
        </div>
      </form>
      {editing && (
        <section className="edit-actions">
          <button type="button" className="danger-button" onClick={() => setConfirming('delete')}>
            {isThread ? 'このスレッドを削除する' : 'このコメントを削除する'}
          </button>
        </section>
      )}
      {confirming === 'edit' && (
        <ConfirmDialog
          message={editPostConfirmMessage(authorName)}
          confirmLabel="変更する"
          danger={false}
          onConfirm={() => void handleConfirmEdit()}
          onCancel={() => setConfirming(null)}
        />
      )}
      {confirming === 'delete' && (
        <ConfirmDialog
          message={deletePostConfirmMessage(authorName, target.kind === 'editThread' ? target.commentCount : 0)}
          confirmLabel="削除する"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirming(null)}
        />
      )}
    </main>
  );
}
