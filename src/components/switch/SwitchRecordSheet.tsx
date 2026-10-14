// 交代の記録のシート(SPEC.md 17.1)。「変わったことに気づいた」を押すと下から出る
// 人格 → どれくらい前から自分? →(時間を指定)→ きっかけ、の順に進む。どの段階でも「戻る」「やめる」を押せる
import { useState } from 'react';
import { db } from '../../db/db';
import { addSwitchLog } from '../../db/switchLogRepo';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { parseDateTimeLocal, toDateTimeLocalValue } from '../../lib/period';
import { showSaveError } from '../../lib/showError';
import { resolveSwitchedAt, type SinceAnswer } from '../../lib/switchLog';
import { AlterButtons } from '../common/AlterButtons';
import { TagChoices } from './TagChoices';

/**
 * 今の段階
 * - alter:人格を選ぶ
 * - since:どれくらい前から自分?
 * - time:時間を指定
 * - trigger:きっかけ(fromTime は「時間を指定」から来たか。戻る先を決めるため)
 */
type Step =
  | { kind: 'alter' }
  | { kind: 'since'; alterId: string | null }
  | { kind: 'time'; alterId: string | null; value: string; error: string | null }
  | { kind: 'trigger'; alterId: string | null; switchedAt: string | null; fromTime: boolean; timeValue: string };

interface Props {
  /** 気づいた時刻(「変わったことに気づいた」を押した時刻) */
  noticedAt: Date;
  /** 記録したとき */
  onRecorded: () => void;
  /** やめたとき(何も記録しない) */
  onCancel: () => void;
}

export function SwitchRecordSheet({ noticedAt, onRecorded, onCancel }: Props) {
  const alters = useLiveQuery(() => db.alters.toArray());
  const tags = useLiveQuery(() => db.switchTags.toArray());
  const [step, setStep] = useState<Step>({ kind: 'alter' });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const noticedValue = toDateTimeLocalValue(noticedAt);

  const goToTrigger = (alterId: string | null, answer: SinceAnswer, fromTime: boolean, timeValue: string) => {
    const switchedAt = resolveSwitchedAt(answer, noticedAt);
    if (switchedAt === 'afterNoticed') {
      setStep({ kind: 'time', alterId, value: timeValue, error: '気づいた時刻より後の時刻は選べません' });
      return;
    }
    setStep({ kind: 'trigger', alterId, switchedAt, fromTime, timeValue });
  };

  const save = async (alterId: string | null, switchedAt: string | null, tagIds: string[]) => {
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      await addSwitchLog(db, { alterId, switchedAt, tagIds }, { kind: 'guess' }, noticedAt);
      onRecorded();
    } catch (error) {
      setSaving(false);
      showSaveError(error);
    }
  };

  const back = () => {
    switch (step.kind) {
      case 'alter':
        return;
      case 'since':
        setStep({ kind: 'alter' });
        return;
      case 'time':
        setStep({ kind: 'since', alterId: step.alterId });
        return;
      case 'trigger':
        setStep(
          step.fromTime
            ? { kind: 'time', alterId: step.alterId, value: step.timeValue, error: null }
            : { kind: 'since', alterId: step.alterId },
        );
    }
  };

  const title = {
    alter: '誰に変わった?',
    since: 'どれくらい前から自分?',
    time: '何時ごろから自分?',
    trigger: 'きっかけ',
  }[step.kind];

  const renderBody = () => {
    if (!alters || !tags) {
      return <p>読み込み中…</p>;
    }
    switch (step.kind) {
      case 'alter': {
        const visible = alters.filter((alter) => !alter.hidden).sort((a, b) => a.order - b.order);
        return <AlterButtons alters={visible} onSelect={(alterId) => setStep({ kind: 'since', alterId })} />;
      }
      case 'since':
        return (
          <div className="picker-buttons">
            <button
              type="button"
              className="choice-button"
              onClick={() => goToTrigger(step.alterId, { kind: 'now' }, false, noticedValue)}
            >
              今
            </button>
            <button
              type="button"
              className="choice-button"
              onClick={() => setStep({ kind: 'time', alterId: step.alterId, value: noticedValue, error: null })}
            >
              時間を指定
            </button>
            <button
              type="button"
              className="choice-button"
              onClick={() => goToTrigger(step.alterId, { kind: 'unknown' }, false, noticedValue)}
            >
              わからない
            </button>
          </div>
        );
      case 'time': {
        const date = parseDateTimeLocal(step.value);
        return (
          <form
            className="switch-time"
            onSubmit={(event) => {
              event.preventDefault();
              if (date === null) {
                setStep({ ...step, error: '日付と時刻を選んでください' });
                return;
              }
              goToTrigger(step.alterId, { kind: 'at', date }, true, step.value);
            }}
          >
            <label className="field">
              <span>日付と時刻</span>
              <input
                type="datetime-local"
                value={step.value}
                max={noticedValue}
                onChange={(event) => setStep({ ...step, value: event.target.value, error: null })}
              />
            </label>
            <p className="settings-note">気づいた時刻:{noticedValue.replace('T', ' ')}</p>
            {step.error && <p className="form-error">{step.error}</p>}
            <button type="submit" className="primary sheet__wide-button">
              次へ
            </button>
          </form>
        );
      }
      case 'trigger': {
        const choosable = tags.filter((tag) => !tag.hidden).sort((a, b) => a.order - b.order);
        return (
          <>
            <p className="switch-sheet__note">きっかけがわかる場合は選択してください</p>
            <TagChoices tags={choosable} selectedIds={selectedTagIds} onChange={setSelectedTagIds} />
            <div className="switch-sheet__actions">
              <button
                type="button"
                className="primary sheet__wide-button"
                disabled={selectedTagIds.length === 0 || saving}
                onClick={() => void save(step.alterId, step.switchedAt, selectedTagIds)}
              >
                記録する
              </button>
              <button
                type="button"
                className="sheet__wide-button"
                disabled={saving}
                onClick={() => void save(step.alterId, step.switchedAt, [])}
              >
                わからない
              </button>
            </div>
          </>
        );
      }
    }
  };

  return (
    <div className="overlay overlay--bottom">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="switch-sheet-title">
        <div className="switch-sheet__head">
          {step.kind !== 'alter' ? (
            <button type="button" onClick={back}>
              ‹ 戻る
            </button>
          ) : (
            <span className="switch-sheet__spacer" />
          )}
          <h2 id="switch-sheet-title" className="sheet__title switch-sheet__title">
            {title}
          </h2>
          <span className="switch-sheet__spacer" />
        </div>
        {renderBody()}
        <button type="button" className="sheet__cancel" onClick={onCancel}>
          やめる
        </button>
      </div>
    </div>
  );
}
