// 交代の記録の編集画面(SPEC.md 17.4):人格・交代した時刻・きっかけ・交代前の人格を直す。削除もここから
// 気づいた時刻は直せない(表示だけ)
// 交代前の人格を選ぶと「確認した」にする(推測と同じ人格を選び直しても)。選ばなければ今の決め方のまま
import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { TagChoices } from '../components/switch/TagChoices';
import { UNKNOWN_SEGMENT_COLOR } from '../components/switch/SwitchStatsView';
import { db } from '../db/db';
import { deleteSwitchLog, updateSwitchLog, type FromAlterChoice } from '../db/switchLogRepo';
import { UNKNOWN_ALTER_NAME } from '../lib/completionLabel';
import { parseDateTimeLocal, toDateTimeLocalValue } from '../lib/period';
import { showSaveError } from '../lib/showError';
import { resolveFromAlter, resolveSwitchedAt, switchAlterLabel } from '../lib/switchLog';
import { formatDateTime } from '../lib/timeFormat';
import type { Alter, SwitchLog, SwitchTag } from '../lib/types';
import { useTerm } from '../hooks/useTerm';

interface Props {
  log: SwitchLog;
  /** すべての人格(非表示も含む) */
  alters: Alter[];
  /** すべてのきっかけ(非表示も含む) */
  tags: SwitchTag[];
  onBack: () => void;
}

/** 人格の選択肢の値(「わからない」は '') */
const UNKNOWN_VALUE = '';

export function SwitchLogEditScreen({ log, alters, tags, onBack }: Props) {
  const noticedAt = new Date(log.noticedAt);
  const [alterValue, setAlterValue] = useState(log.alterId ?? UNKNOWN_VALUE);
  const [timeKnown, setTimeKnown] = useState(log.switchedAt !== null);
  const [timeValue, setTimeValue] = useState(toDateTimeLocalValue(new Date(log.switchedAt ?? log.noticedAt)));
  const [tagIds, setTagIds] = useState<string[]>(log.tagIds);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { t } = useTerm();
  // 交代前の人格。選んだら(同じ人格を押し直しても)「確認した」にする
  const [fromValue, setFromValue] = useState(log.fromAlterId ?? UNKNOWN_VALUE);
  const [fromTouched, setFromTouched] = useState(false);
  const currentFrom = switchAlterLabel(resolveFromAlter(log, alters));

  // 交代前の人格の選択肢:非表示でない人格と、この記録の交代前の人格(非表示でも)。並び順
  const fromChoices = alters
    .filter((alter) => !alter.hidden || alter.id === log.fromAlterId)
    .sort((a, b) => a.order - b.order);
  const chooseFrom = (value: string) => {
    setFromValue(value);
    setFromTouched(true);
  };

  // 選択肢:非表示でない人格と、この記録の人格(非表示でも)。並び順
  const alterChoices = alters
    .filter((alter) => !alter.hidden || alter.id === log.alterId)
    .sort((a, b) => a.order - b.order);
  // 選択肢:非表示でないきっかけと、この記録のきっかけ(非表示でも)。並び順
  const tagChoices = tags.filter((tag) => !tag.hidden || log.tagIds.includes(tag.id)).sort((a, b) => a.order - b.order);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    let switchedAt: string | null = null;
    if (timeKnown) {
      const date = parseDateTimeLocal(timeValue);
      if (date === null) {
        setError('日付と時刻を選んでください');
        return;
      }
      // 気づいた時刻と同じ分のまま保存したときは、気づいた時刻(秒まで)をそのまま使う
      const resolved =
        toDateTimeLocalValue(date) === toDateTimeLocalValue(noticedAt)
          ? noticedAt.toISOString()
          : resolveSwitchedAt({ kind: 'at', date }, noticedAt);
      if (resolved === 'afterNoticed') {
        setError('気づいた時刻より後の時刻は選べません');
        return;
      }
      switchedAt = resolved;
    }
    // 交代前の人格を選んでいなければ、今の決め方(推測なら計算し直す)のまま
    const from: FromAlterChoice = fromTouched
      ? { kind: 'confirmed', alterId: fromValue === UNKNOWN_VALUE ? null : fromValue }
      : { kind: 'guess' };
    try {
      await updateSwitchLog(
        db,
        log.id,
        {
          alterId: alterValue === UNKNOWN_VALUE ? null : alterValue,
          switchedAt,
          // 見つからないきっかけは外す
          tagIds: tagIds.filter((id) => tags.some((tag) => tag.id === id)),
        },
        from,
      );
      onBack();
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSwitchLog(db, log.id);
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
        <h1>記録を編集</h1>
      </header>
      <form className="edit-form" onSubmit={(event) => void handleSubmit(event)}>
        <p className="settings-note">気づいた時刻:{formatDateTime(log.noticedAt)}</p>
        <fieldset className="field">
          <legend>誰に変わった?</legend>
          {alterChoices.map((alter) => (
            <label key={alter.id} className="choice">
              <input
                type="radio"
                name="switch-alter"
                checked={alterValue === alter.id}
                onChange={() => setAlterValue(alter.id)}
              />
              <span className="color-dot" style={{ backgroundColor: alter.color }} />
              {alter.name}
              {alter.hidden && '(非表示)'}
            </label>
          ))}
          <label className="choice">
            <input
              type="radio"
              name="switch-alter"
              checked={alterValue === UNKNOWN_VALUE}
              onChange={() => setAlterValue(UNKNOWN_VALUE)}
            />
            <span className="color-dot" style={{ backgroundColor: UNKNOWN_SEGMENT_COLOR }} />
            {UNKNOWN_ALTER_NAME}
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>{t('交代前の人格')}</legend>
          <p className="settings-note">
            交代前:{currentFrom.name}
            {log.fromAlterSource === 'guessed' && '(推測)'}
          </p>
          {fromChoices.map((alter) => (
            <label key={alter.id} className="choice">
              <input
                type="radio"
                name="switch-from"
                checked={fromValue === alter.id}
                // 選んである人格を押し直したときも「確認した」にするため、onClick でも受ける
                onChange={() => chooseFrom(alter.id)}
                onClick={() => chooseFrom(alter.id)}
              />
              <span className="color-dot" style={{ backgroundColor: alter.color }} />
              {alter.name}
              {alter.hidden && '(非表示)'}
            </label>
          ))}
          <label className="choice">
            <input
              type="radio"
              name="switch-from"
              checked={fromValue === UNKNOWN_VALUE}
              onChange={() => chooseFrom(UNKNOWN_VALUE)}
              onClick={() => chooseFrom(UNKNOWN_VALUE)}
            />
            <span className="color-dot" style={{ backgroundColor: UNKNOWN_SEGMENT_COLOR }} />
            {UNKNOWN_ALTER_NAME}
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>いつから自分?</legend>
          <label className="choice">
            <input type="radio" name="switch-time" checked={timeKnown} onChange={() => setTimeKnown(true)} />
            時刻がわかる
          </label>
          {timeKnown && (
            <input
              type="datetime-local"
              value={timeValue}
              max={toDateTimeLocalValue(noticedAt)}
              onChange={(event) => {
                setTimeValue(event.target.value);
                setError(null);
              }}
            />
          )}
          <label className="choice">
            <input type="radio" name="switch-time" checked={!timeKnown} onChange={() => setTimeKnown(false)} />
            わからない
          </label>
        </fieldset>
        <fieldset className="field">
          <legend>きっかけ(選ばなければ「わからない」)</legend>
          <TagChoices tags={tagChoices} selectedIds={tagIds} onChange={setTagIds} />
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
      <section className="edit-actions">
        <button type="button" className="danger-button" onClick={() => setConfirmingDelete(true)}>
          この記録を削除する
        </button>
      </section>
      {confirmingDelete && (
        <ConfirmDialog
          message={`${formatDateTime(log.noticedAt)}に気づいた記録を削除しますか?`}
          confirmLabel="削除する"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </main>
  );
}
