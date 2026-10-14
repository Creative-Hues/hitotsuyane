// 書き込み(スレッドの本文・コメント)のリアクション(SPEC.md 22.5)
// 選択肢のボタン(付いている数つき)を並べ、押すと人格を選ぶシートを出す。すでに付けている人格を選ぶと外れる
// 付いているリアクションごとに、付けた人格を名前ラベルで並べる
import { useState } from 'react';
import { db } from '../../db/db';
import { toggleReaction } from '../../db/boardRepo';
import { reactionGroups, type ReactionGroup } from '../../lib/board';
import { showSaveError } from '../../lib/showError';
import type { Alter, Reaction, ReactionKind, ReactionTargetType } from '../../lib/types';
import { AlterButtons } from '../common/AlterButtons';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  targetType: ReactionTargetType;
  targetId: string;
  reactions: readonly Reaction[];
  kinds: readonly ReactionKind[];
  /** すべての人格(非表示も含む) */
  alters: readonly Alter[];
}

export function ReactionBar({ targetType, targetId, reactions, kinds, alters }: Props) {
  // 人格を選ぶシートを出しているリアクション
  const [picking, setPicking] = useState<ReactionGroup | null>(null);
  const groups = reactionGroups({ targetType, targetId, reactions, kinds, alters });
  // 付ける人格の選択肢:非表示でない人格(「わからない」は出さない)
  const choosable = [...alters].filter((alter) => !alter.hidden).sort((a, b) => a.order - b.order);

  const handleSelect = async (group: ReactionGroup, alterId: string | null) => {
    if (alterId === null) {
      return;
    }
    try {
      await toggleReaction(db, { targetType, targetId, kindId: group.kind.id, alterId }, new Date());
      setPicking(null);
    } catch (error) {
      showSaveError(error);
    }
  };

  const used = groups.filter((group) => group.alters.length > 0);

  return (
    <div className="reaction-bar">
      <div className="reaction-bar__buttons">
        {groups.map((group) => (
          <button
            key={group.kind.id}
            type="button"
            className={group.alters.length > 0 ? 'reaction-button reaction-button--used' : 'reaction-button'}
            onClick={() => setPicking(group)}
          >
            {group.kind.name}
            {group.alters.length > 0 && ` ${group.alters.length}`}
          </button>
        ))}
      </div>
      {used.length > 0 && (
        <ul className="reaction-bar__who">
          {used.map((group) => (
            <li key={group.kind.id}>
              <span className="reaction-bar__kind">{group.kind.name}:</span>
              {group.alters.map((alter) => (
                <AlterNameLabel key={alter.id} name={alter.name} color={alter.color} />
              ))}
            </li>
          ))}
        </ul>
      )}
      {picking && (
        <div className="overlay overlay--bottom">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="reaction-picker-title">
            <h2 id="reaction-picker-title" className="sheet__title">
              「{picking.kind.name}」を付けるのは?
            </h2>
            <p className="settings-note">✓ が付いている人を選ぶと、外します。</p>
            <AlterButtons
              alters={choosable}
              showUnknown={false}
              checkedIds={new Set(picking.alters.map((alter) => alter.id))}
              onSelect={(alterId) => void handleSelect(picking, alterId)}
            />
            <button type="button" className="sheet__cancel" onClick={() => setPicking(null)}>
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
