// 人格の一覧(区分ごとの見出し・並び替え・追加・人格を開く。SPEC.md 10.1)
// 並び替え(≡)は同じ区分の中だけ。非表示の人格は区分ごとに分けず、一覧の下にまとめる
// 見出しは、入れ物の折りたたみ<人格の情報>が出す
import { db } from '../../db/db';
import { reorderAlters } from '../../db/alterRepo';
import { groupAltersByCategory } from '../../lib/alterInfo';
import type { Alter, AlterCategory } from '../../lib/types';
import { SortableList } from '../common/SortableList';
import { ItemRow } from './ItemRow';
import { useTerm } from '../../hooks/useTerm';
import { AlterNameLabel } from '../common/AlterNameLabel';

interface Props {
  alters: Alter[];
  categories: AlterCategory[];
  onAdd: () => void;
  onOpen: (alter: Alter) => void;
}

export function AlterList({ alters, categories, onAdd, onOpen }: Props) {
  const { t } = useTerm();
  const { groups, hidden } = groupAltersByCategory(alters, categories);

  const renderRow = (alter: Alter) => (
    <ItemRow
      name={alter.name}
      hidden={alter.hidden}
      nameLabel={<AlterNameLabel name={alter.name} color={alter.color} />}
      onOpen={() => onOpen(alter)}
    />
  );

  return (
    <div className="settings-section">
      {groups.length === 0 && <p className="empty">{t('人格がまだ登録されていません')}</p>}
      {groups.map((group) => (
        <div key={group.categoryId ?? 'uncategorized'} className="alter-group">
          <h3 className="alter-group__heading">{group.name}</h3>
          <SortableList
            className="item-list"
            items={group.alters}
            onReorder={(ids) => reorderAlters(db, ids)}
            renderItem={renderRow}
            getLabel={(alter) => alter.name}
          />
        </div>
      ))}
      <button type="button" className="add-button" onClick={onAdd}>
        {t('＋ 人格を追加')}
      </button>
      {hidden.length > 0 && (
        <>
          <h3 className="hidden-heading">{t('非表示の人格')}</h3>
          {/* 非表示の一覧は並び替えない */}
          <ul className="item-list">
            {hidden.map((alter) => (
              <li key={alter.id} className="plain-row">
                {renderRow(alter)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
