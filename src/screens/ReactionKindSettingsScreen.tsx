// リアクションの設定(SPEC.md 22.5):「板の設定」から開く。追加・名前の変更・並び替え・削除(付いていない選択肢だけ)
import { useState } from 'react';
import { NamedItemEditScreen } from '../components/board/NamedItemEditScreen';
import { SortableList } from '../components/common/SortableList';
import { ItemRow } from '../components/settings/ItemRow';
import { db } from '../db/db';
import {
  addReactionKind,
  countReactionKindUsage,
  deleteReactionKind,
  renameReactionKind,
  reorderReactionKinds,
} from '../db/boardRepo';
import { useListScroll } from '../hooks/useListScroll';
import { useLiveQuery } from '../hooks/useLiveQuery';
import type { ReactionKind } from '../lib/types';

/** 表示中の画面:一覧 / 選択肢の編集(id が null なら新規追加) */
type View = { kind: 'list' } | { kind: 'reaction'; id: string | null };

interface Props {
  onBack: () => void;
}

function ReactionKindEditScreen({ reactionKind, onBack }: { reactionKind?: ReactionKind; onBack: () => void }) {
  const usage = useLiveQuery(
    () => (reactionKind ? countReactionKindUsage(db, reactionKind.id) : Promise.resolve(0)),
    [reactionKind?.id],
  );
  return (
    <NamedItemEditScreen
      title={reactionKind ? 'リアクションを編集' : 'リアクションを追加'}
      initialName={reactionKind?.name}
      onSave={async (name) =>
        reactionKind ? renameReactionKind(db, reactionKind.id, name) : addReactionKind(db, name, new Date())
      }
      duplicateMessage="同じ名前のリアクションがあります"
      deletion={
        reactionKind && {
          label: 'このリアクションを削除する',
          blockedNote:
            usage === undefined
              ? undefined
              : usage > 0
                ? 'このリアクションが付いている書き込みがあるため削除できません。'
                : null,
          confirmMessage: `「${reactionKind.name}」を削除しますか?`,
          onDelete: () => deleteReactionKind(db, reactionKind.id),
        }
      }
      onBack={onBack}
    />
  );
}

export function ReactionKindSettingsScreen({ onBack }: Props) {
  const kinds = useLiveQuery(() => db.reactionKinds.toArray());
  const [view, setView] = useState<View>({ kind: 'list' });
  const rememberScroll = useListScroll(view.kind === 'list');

  const open = (next: View) => {
    rememberScroll();
    setView(next);
  };
  const backToList = () => setView({ kind: 'list' });

  if (!kinds) {
    return (
      <main className="app">
        <p>読み込み中…</p>
      </main>
    );
  }

  if (view.kind === 'reaction') {
    const target = kinds.find((item) => item.id === view.id);
    if (view.id === null || target) {
      return <ReactionKindEditScreen key={view.id ?? 'new'} reactionKind={target} onBack={backToList} />;
    }
  }

  const sorted = [...kinds].sort((a, b) => a.order - b.order);

  return (
    <main className="app">
      <header className="screen-header">
        <button type="button" onClick={onBack}>
          ‹ 戻る
        </button>
        <h1>リアクションの設定</h1>
      </header>
      <section className="settings-section">
        <h2>リアクション</h2>
        <button type="button" className="add-button" onClick={() => open({ kind: 'reaction', id: null })}>
          ＋ リアクションを追加
        </button>
        {sorted.length === 0 && <p className="empty">リアクションはまだありません</p>}
        <SortableList
          className="item-list"
          items={sorted}
          onReorder={(ids) => reorderReactionKinds(db, ids)}
          renderItem={(item) => (
            <ItemRow name={item.name} hidden={false} onOpen={() => open({ kind: 'reaction', id: item.id })} />
          )}
          getLabel={(item) => item.name}
        />
      </section>
    </main>
  );
}
