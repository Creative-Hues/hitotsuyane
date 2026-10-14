// 受診の記録の入力・編集画面(SPEC.md 8.5):受診した日・受診した人格・話した相手
// 人格と話した相手は複数選べる。「わからない」を選ぶとほかの選択を外し、ほかを選ぶと「わからない」を外す
// 何も選ばずに保存したときも「わからない」(空)として保存する。編集のときは、削除もここから行う
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { UNKNOWN_SEGMENT_COLOR } from '../components/switch/SwitchStatsView';
import { db } from '../db/db';
import { addClinicVisit, deleteClinicVisit, updateClinicVisit } from '../db/clinicVisitRepo';
import { useTerm } from '../hooks/useTerm';
import { validateVisitDate } from '../lib/clinicVisits';
import { UNKNOWN_ALTER_NAME } from '../lib/completionLabel';
import { toLogicalDate } from '../lib/period';
import { showSaveError } from '../lib/showError';
import { formatLogicalDateHeading } from '../lib/timeFormat';
import type { Alter, ClinicStaff, ClinicVisit } from '../lib/types';

interface Props {
  /** 編集する記録(追加のときは undefined) */
  visit?: ClinicVisit;
  /** すべての人格(非表示も含む) */
  alters: Alter[];
  /** すべての話した相手の選択肢 */
  staff: ClinicStaff[];
  onBack: () => void;
}

/** 複数選べる選択と「わからない」 */
interface MultiChoice {
  ids: string[];
  /** 「わからない」を選んでいるか */
  unknown: boolean;
}

/** 選択を切り替える(ほかを選ぶと「わからない」を外す) */
function toggleId(choice: MultiChoice, id: string): MultiChoice {
  const ids = choice.ids.includes(id) ? choice.ids.filter((item) => item !== id) : [...choice.ids, id];
  return { ids, unknown: false };
}

/** 「わからない」を切り替える(選ぶとほかの選択を外す) */
function toggleUnknown(choice: MultiChoice): MultiChoice {
  return choice.unknown ? { ids: choice.ids, unknown: false } : { ids: [], unknown: true };
}

/** 保存した記録から選択を作る(空なら「わからない」を選んだ状態にする) */
function initialChoice(ids: readonly string[] | undefined): MultiChoice {
  if (ids === undefined) {
    return { ids: [], unknown: false };
  }
  return { ids: [...ids], unknown: ids.length === 0 };
}

export function ClinicVisitEditScreen({ visit, alters, staff, onBack }: Props) {
  const { t } = useTerm();
  const [visitedOn, setVisitedOn] = useState(visit?.visitedOn ?? toLogicalDate(new Date()));
  const [alterChoice, setAlterChoice] = useState(() => initialChoice(visit?.alterIds));
  const [staffChoice, setStaffChoice] = useState(() => initialChoice(visit?.staffIds));
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const today = toLogicalDate(new Date());

  // 人格の選択肢:非表示でない人格と、この記録の人格(非表示でも)。並び順
  const alterChoices = alters
    .filter((alter) => !alter.hidden || visit?.alterIds.includes(alter.id))
    .sort((a, b) => a.order - b.order);
  const staffChoices = [...staff].sort((a, b) => a.order - b.order);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // 今日(論理日)より後の日は選べない。今日は保存の時点で取り直す
    const dateError = validateVisitDate(visitedOn, toLogicalDate(new Date()));
    if (dateError) {
      setError(dateError);
      return;
    }
    // 何も選ばなかったときと「わからない」は、どちらも空で保存する
    const input = { visitedOn, alterIds: alterChoice.ids, staffIds: staffChoice.ids };
    try {
      if (visit) {
        await updateClinicVisit(db, visit.id, input);
      } else {
        await addClinicVisit(db, input, new Date());
      }
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleDelete = async (target: ClinicVisit) => {
    try {
      await deleteClinicVisit(db, target.id);
      setConfirmingDelete(false);
      onBack();
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
        <h1>{visit ? '受診の記録を編集' : '受診した'}</h1>
      </header>
      {/* 今日より後の日は、ブラウザの確認ではなくアプリの文で知らせる(noValidate) */}
      <form className="edit-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          <span>受診した日</span>
          <input
            type="date"
            value={visitedOn}
            max={today}
            onChange={(event) => {
              setVisitedOn(event.target.value);
              setError(null);
            }}
          />
        </label>
        <fieldset className="field">
          <legend>{t('受診した人格')}</legend>
          {alterChoices.map((alter) => (
            <label key={alter.id} className="choice">
              <input
                type="checkbox"
                checked={alterChoice.ids.includes(alter.id)}
                onChange={() => setAlterChoice((current) => toggleId(current, alter.id))}
              />
              <span className="color-dot" style={{ backgroundColor: alter.color }} />
              {alter.name}
              {alter.hidden && '(非表示)'}
            </label>
          ))}
          <label className="choice">
            <input type="checkbox" checked={alterChoice.unknown} onChange={() => setAlterChoice(toggleUnknown)} />
            <span className="color-dot" style={{ backgroundColor: UNKNOWN_SEGMENT_COLOR }} />
            {UNKNOWN_ALTER_NAME}
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>話した相手</legend>
          {staffChoices.map((item) => (
            <label key={item.id} className="choice">
              <input
                type="checkbox"
                checked={staffChoice.ids.includes(item.id)}
                onChange={() => setStaffChoice((current) => toggleId(current, item.id))}
              />
              {item.name}
            </label>
          ))}
          <label className="choice">
            <input type="checkbox" checked={staffChoice.unknown} onChange={() => setStaffChoice(toggleUnknown)} />
            わからない
          </label>
        </fieldset>
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
      {visit && (
        <section className="edit-actions">
          <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>
            この記録を削除する
          </button>
        </section>
      )}
      {visit && confirmingDelete && (
        <ConfirmDialog
          message={`${formatLogicalDateHeading(visit.visitedOn)}の受診の記録を削除しますか?`}
          confirmLabel="削除する"
          onConfirm={() => void handleDelete(visit)}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
