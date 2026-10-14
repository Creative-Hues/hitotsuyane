// タスクの追加・編集フォーム
// fixedCycle を渡すと、周期を選ぶ欄を出さず、その周期で保存する(ToDo 画面の「+ 追加」=期限なし。SPEC.md 6.1)
import { useState, type FormEvent } from 'react';
import type { TaskInput } from '../../db/taskRepo';
import { mergeCareAlterIds } from '../../lib/careAlters';
import { cycleLabel } from '../../lib/cycleLabel';
import { normalizeName, parseEveryNDays } from '../../lib/validation';
import type { Alter, Cycle, Task } from '../../lib/types';
import { useTerm } from '../../hooks/useTerm';

type CycleType = Cycle['type'];

const CYCLE_OPTIONS: { type: CycleType; label: string }[] = [
  { type: 'daily', label: cycleLabel({ type: 'daily' }) },
  { type: 'everyNDays', label: '○日ごと' },
  { type: 'weekly', label: cycleLabel({ type: 'weekly' }) },
  { type: 'monthly', label: cycleLabel({ type: 'monthly' }) },
  { type: 'none', label: cycleLabel({ type: 'none' }) },
];

interface Props {
  /** 編集するときの元のタスク(追加のときは undefined) */
  initial?: Task;
  /** 選択肢に出す人格(非表示でない人格、order 順) */
  selectableAlters: Alter[];
  /** 周期を決めておくとき(選ぶ欄を出さない) */
  fixedCycle?: Cycle;
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}

export function TaskForm({ initial, selectableAlters, fixedCycle, onSubmit, onCancel }: Props) {
  const { t } = useTerm();
  const selectableIds = selectableAlters.map((alter) => alter.id);
  const [name, setName] = useState(initial?.name ?? '');
  const [cycleType, setCycleType] = useState<CycleType>(initial?.cycle.type ?? 'daily');
  const [nText, setNText] = useState(initial?.cycle.type === 'everyNDays' ? String(initial.cycle.n) : '2');
  const [selected, setSelected] = useState<string[]>(
    (initial?.careAlterIds ?? []).filter((id) => selectableIds.includes(id)),
  );
  const [error, setError] = useState<string | null>(null);

  const toggleAlter = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeName(name);
    if (normalized === null) {
      setError('タスク名を入力してください');
      return;
    }
    let cycle: Cycle;
    if (fixedCycle) {
      cycle = fixedCycle;
    } else if (cycleType === 'everyNDays') {
      const n = parseEveryNDays(nText);
      if (n === null) {
        setError('日数は2以上の整数で入力してください');
        return;
      }
      cycle = { type: 'everyNDays', n };
    } else {
      cycle = { type: cycleType };
    }
    // 非表示の人格は選択肢に出ないが、元々入っていればそのまま残す
    const careAlterIds = mergeCareAlterIds(initial?.careAlterIds ?? [], selected, selectableIds);
    void onSubmit({ name: normalized, cycle, careAlterIds });
  };

  return (
    <form className="edit-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>タスク名</span>
        <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      {!fixedCycle && (
        <fieldset className="field">
          <legend>周期</legend>
          {CYCLE_OPTIONS.map((option) => (
            <label key={option.type} className="choice">
              <input
                type="radio"
                name="cycle"
                checked={cycleType === option.type}
                onChange={() => setCycleType(option.type)}
              />
              {option.label}
            </label>
          ))}
          {cycleType === 'everyNDays' && (
            <label className="choice">
              <input
                type="text"
                inputMode="numeric"
                className="days-input"
                value={nText}
                onChange={(event) => setNText(event.target.value)}
              />
              日ごと(2以上)
            </label>
          )}
        </fieldset>
      )}

      <fieldset className="field">
        <legend>{t('気にしている人格')}</legend>
        {selectableAlters.length === 0 && <p className="empty">{t('表示中の人格がいません')}</p>}
        {selectableAlters.map((alter) => (
          <label key={alter.id} className="choice">
            <input type="checkbox" checked={selected.includes(alter.id)} onChange={() => toggleAlter(alter.id)} />
            <span className="color-dot" style={{ backgroundColor: alter.color }} />
            {alter.name}
          </label>
        ))}
      </fieldset>

      {error && <p className="form-error">{error}</p>}
      <div className="form-buttons">
        <button type="button" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="primary">
          保存
        </button>
      </div>
    </form>
  );
}
