// 掲示板(SPEC.md 22章):板の切り替え・スレッドの一覧(新しい書き込みがあった順)・新着の印
// 「掲示板」タブを開くと出る(タブの一番上の画面なので「‹ 戻る」は出さない)
// 板の設定・スレッドの画面・書き込みの入力と編集は、この画面の中で開く
// 一番上に「[人格A]として見ています」を出す。新着は、いま見ている人格にとってのもの(SPEC.md 22.4)
import { useState } from 'react';
import { AlterButtons } from '../components/common/AlterButtons';
import { AlterNameLabel } from '../components/common/AlterNameLabel';
import { db } from '../db/db';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { boardsWithNew, buildThreadSummaries, resolveSelectedBoard, sortBoards } from '../lib/board';
import { resolveRecordAlter } from '../lib/completionLabel';
import { useTerm } from '../hooks/useTerm';
import { formatPostDateTime } from '../lib/timeFormat';
import { BoardPostEditScreen, type PostTarget } from './BoardPostEditScreen';
import { BoardSettingsScreen } from './BoardSettingsScreen';
import { BoardThreadScreen } from './BoardThreadScreen';

/**
 * 表示中の画面:一覧 / 板の設定 / スレッド / 書き込みの入力・編集
 * 書き込みの returnTo は、戻る先(一覧か、スレッドの画面)
 */
type View =
  | { kind: 'list' }
  | { kind: 'settings' }
  | { kind: 'thread'; id: string }
  | { kind: 'post'; target: PostTargetRef; returnTo: View };

/** 書き込みの入力・編集の対象(ID で持ち、開くたびに今のデータから探す) */
type PostTargetRef =
  | { kind: 'newThread'; boardId: string }
  | { kind: 'editThread'; threadId: string }
  | { kind: 'newComment'; threadId: string }
  | { kind: 'editComment'; threadId: string; commentId: string };

interface Props {
  /** いま見ている人格(「わからない」は null) */
  viewerAlterId: string | null;
  /** 「[人格A]として見ています」から選び直したとき */
  onChangeViewer: (alterId: string | null) => void;
}

export function BoardScreen({ viewerAlterId, onChangeViewer }: Props) {
  const { t } = useTerm();
  // 「いま見ている人格」を選び直すシートを出しているか
  const [pickingViewer, setPickingViewer] = useState(false);
  const alters = useLiveQuery(() => db.alters.toArray());
  const boards = useLiveQuery(() => db.boards.toArray());
  const threads = useLiveQuery(() => db.boardThreads.toArray());
  const comments = useLiveQuery(() => db.boardComments.toArray());
  const reactions = useLiveQuery(() => db.reactions.toArray());
  const kinds = useLiveQuery(() => db.reactionKinds.toArray());
  const seens = useLiveQuery(() => db.boardSeen.toArray());
  const [view, setView] = useState<View>({ kind: 'list' });
  // 見ている板(アプリを開いている間だけ覚える。null ならホーム)
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    if (view.kind === 'list') {
      rememberScroll();
    }
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!alters || !boards || !threads || !comments || !reactions || !kinds || !seens) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'settings') {
    return <BoardSettingsScreen onBack={backToList} />;
  }

  const findThread = (id: string) => threads.find((thread) => thread.id === id);

  /** 書き込みの対象を、今のデータから探す(消えていたら null) */
  const resolvePostTarget = (ref: PostTargetRef): PostTarget | null => {
    if (ref.kind === 'newThread') {
      return { kind: 'newThread', boardId: ref.boardId };
    }
    const thread = findThread(ref.threadId);
    if (!thread) {
      return null;
    }
    switch (ref.kind) {
      case 'editThread':
        return {
          kind: 'editThread',
          thread,
          commentCount: comments.filter((comment) => comment.threadId === thread.id).length,
        };
      case 'newComment':
        return { kind: 'newComment', thread };
      case 'editComment': {
        const comment = comments.find((item) => item.id === ref.commentId);
        return comment ? { kind: 'editComment', thread, comment } : null;
      }
    }
  };

  if (view.kind === 'post') {
    const target = resolvePostTarget(view.target);
    if (target) {
      return (
        <BoardPostEditScreen
          key={JSON.stringify(view.target)}
          target={target}
          alters={alters}
          onBack={() => setView(view.returnTo)}
          onThreadDeleted={backToList}
        />
      );
    }
  }

  if (view.kind === 'thread') {
    const thread = findThread(view.id);
    // 削除されたスレッドなら一覧を出す
    if (thread) {
      return (
        <BoardThreadScreen
          thread={thread}
          comments={comments}
          reactions={reactions}
          kinds={kinds}
          alters={alters}
          viewerAlterId={viewerAlterId}
          onBack={backToList}
          onEditThread={() => setView({ kind: 'post', target: { kind: 'editThread', threadId: thread.id }, returnTo: view })}
          onEditComment={(comment) =>
            setView({
              kind: 'post',
              target: { kind: 'editComment', threadId: thread.id, commentId: comment.id },
              returnTo: view,
            })
          }
          onAddComment={() => setView({ kind: 'post', target: { kind: 'newComment', threadId: thread.id }, returnTo: view })}
        />
      );
    }
  }

  const sortedBoards = sortBoards(boards);
  const boardId = resolveSelectedBoard(boards, selectedBoardId);
  const withNew = boardsWithNew({ threads, comments, seens, viewerAlterId });
  const summaries = buildThreadSummaries({ boardId, threads, comments, seens, viewerAlterId });
  const alterById = new Map(alters.map((alter) => [alter.id, alter]));
  const viewer = resolveRecordAlter({ alterId: viewerAlterId }, alterById);
  const visibleAlters = alters.filter((alter) => !alter.hidden).sort((a, b) => a.order - b.order);

  return (
    <main className="app">
      <header className="screen-header">
        <h1>掲示板</h1>
      </header>
      <div className="screen-actions">
        <button type="button" onClick={() => open({ kind: 'settings' })}>
          板の設定
        </button>
      </div>
      {/* いま見ている人格。押すと選び直せる(交代の記録は作らない) */}
      <button type="button" className="board-viewer" onClick={() => setPickingViewer(true)}>
        <AlterNameLabel name={viewer.name} color={viewer.color} />
        <span>として見ています</span>
        <span className="board-viewer__change">変える</span>
      </button>
      <div className="board-switcher" role="group" aria-label="板の切り替え">
        {sortedBoards.map((board) => {
          const selected = board.id === boardId;
          return (
            <button
              key={board.id}
              type="button"
              className={selected ? 'board-switcher__button board-switcher__button--selected' : 'board-switcher__button'}
              aria-pressed={selected}
              onClick={() => setSelectedBoardId(board.id)}
            >
              {withNew.has(board.id) && (
                <span className="board-switcher__new" aria-label="新着あり">
                  ●
                </span>
              )}
              {board.name}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="add-button"
        onClick={() => open({ kind: 'post', target: { kind: 'newThread', boardId }, returnTo: { kind: 'list' } })}
      >
        ＋ スレッドを立てる
      </button>
      {summaries.length === 0 ? (
        <p className="empty">まだスレッドはありません</p>
      ) : (
        <ul className="item-list">
          {summaries.map(({ thread, latestPostAt, commentCount, hasNew }) => {
            const author = resolveRecordAlter(thread, alterById);
            return (
              <li key={thread.id}>
                <button type="button" className="thread-row" onClick={() => open({ kind: 'thread', id: thread.id })}>
                  <span className="thread-row__title">
                    {hasNew && <span className="thread-row__new">● 新着</span>}
                    {thread.title}
                  </span>
                  <span className="thread-row__meta">
                    <AlterNameLabel name={author.name} color={author.color} />
                    <span>{formatPostDateTime(thread.createdAt)}</span>
                    <span>
                      コメント{commentCount}件{commentCount > 0 && `・最終 ${formatPostDateTime(latestPostAt)}`}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pickingViewer && (
        <div className="overlay overlay--bottom">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="board-viewer-title">
            <h2 id="board-viewer-title" className="sheet__title">
              {t('いま見ている人格は?')}
            </h2>
            <p className="settings-note">{t('交代の記録は作りません。新しい交代の記録が入ると、その人格に切り替わります。')}</p>
            <AlterButtons
              alters={visibleAlters}
              onSelect={(alterId) => {
                onChangeViewer(alterId);
                setPickingViewer(false);
              }}
            />
            <button type="button" className="sheet__cancel" onClick={() => setPickingViewer(false)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
