// 板の設定(SPEC.md 22.2):板の一覧(ホームは一番上に ≡ なしで固定)・追加・編集と、「リアクションの設定」(22.5)の入口
import { useState } from 'react';
import { NamedItemEditScreen } from '../components/board/NamedItemEditScreen';
import { SortableList } from '../components/common/SortableList';
import { ItemRow } from '../components/settings/ItemRow';
import { db } from '../db/db';
import { addBoard, countBoardThreads, deleteBoard, renameBoard, reorderBoards } from '../db/boardRepo';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { HOME_BOARD_ID, isHomeBoard, sortBoards } from '../lib/board';
import type { Board } from '../lib/types';
import { ReactionKindSettingsScreen } from './ReactionKindSettingsScreen';

/** 表示中の画面:一覧 / 板の編集(id が null なら新規追加) / リアクションの設定 */
type View = { kind: 'list' } | { kind: 'board'; id: string | null } | { kind: 'reactions' };

interface Props {
  onBack: () => void;
}

/** 板の編集画面(削除できるかは、スレッドの件数で決める) */
function BoardEditScreen({ board, onBack }: { board?: Board; onBack: () => void }) {
  const threadCount = useLiveQuery(
    () => (board ? countBoardThreads(db, board.id) : Promise.resolve(0)),
    [board?.id],
  );
  if (board && isHomeBoard(board)) {
    return (
      <NamedItemEditScreen
        title="ホームの板"
        fixedNameNote="ホームの板は、名前の変更・並び替え・削除はできません。"
        onSave={async () => null}
        duplicateMessage=""
        onBack={onBack}
      />
    );
  }
  return (
    <NamedItemEditScreen
      title={board ? '板を編集' : '板を追加'}
      initialName={board?.name}
      onSave={async (name) =>
        board ? renameBoard(db, board.id, name) : addBoard(db, name, new Date())
      }
      duplicateMessage="同じ名前の板があります"
      deletion={
        board && {
          label: 'この板を削除する',
          blockedNote:
            threadCount === undefined ? undefined : threadCount > 0 ? 'この板にスレッドがあるため削除できません。' : null,
          confirmMessage: `「${board.name}」を削除しますか?`,
          onDelete: () => deleteBoard(db, board.id),
        }
      }
      onBack={onBack}
    />
  );
}

export function BoardSettingsScreen({ onBack }: Props) {
  const boards = useLiveQuery(() => db.boards.toArray());
  const [view, setView] = useState<View>({ kind: 'list' });
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    rememberScroll();
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!boards) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'reactions') {
    return <ReactionKindSettingsScreen onBack={backToList} />;
  }
  if (view.kind === 'board') {
    const board = boards.find((item) => item.id === view.id);
    if (view.id === null || board) {
      return <BoardEditScreen key={view.id ?? 'new'} board={board} onBack={backToList} />;
    }
  }

  const sorted = sortBoards(boards);
  const home = sorted.find((board) => board.id === HOME_BOARD_ID);
  const others = sorted.filter((board) => board.id !== HOME_BOARD_ID);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>板の設定</h1>
      </header>
      <section className="settings-section">
        <h2>板</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'board', id: null })}>
          ＋ 板を追加
        </button>
        {/* ホームはいつも一番左(一番上)。並び替えない */}
        {home && (
          <ul className="item-list">
            <li className="plain-row">
              <ItemRow name={home.name} hidden={false} onOpen={() => open({ kind: 'board', id: home.id })} />
            </li>
          </ul>
        )}
        <SortableList
          className="item-list"
          items={others}
          onReorder={(ids) => reorderBoards(db, ids)}
          renderItem={(board) => <ItemRow name={board.name} hidden={false} onOpen={() => open({ kind: 'board', id: board.id })} />}
          getLabel={(board) => board.name}
        />
      </section>
      <section className="settings-section">
        <h2>リアクション</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'reactions' })}>
          リアクションの設定
        </button>
      </section>
    </main>
  );
}
