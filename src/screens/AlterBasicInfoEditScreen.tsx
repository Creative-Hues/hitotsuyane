// 基本情報の編集画面(SPEC.md 10.3)。読み・体感年齢・性別(感)・見分け方を直す
// 区分は人格の編集画面で選ぶ
import { useState, type FormEvent } from 'react';
import { db } from '../db/db';
import { updateAlterBasicInfo } from '../db/alterRepo';
import { showSaveError } from '../lib/showError';
import type { Alter } from '../lib/types';
import { AlterNameLabel } from '../components/common/AlterNameLabel';

interface Props {
  alter: Alter;
  onBack: () => void;
}

export function AlterBasicInfoEditScreen({ alter, onBack }: Props) {
  const [reading, setReading] = useState(alter.reading);
  const [age, setAge] = useState(alter.age);
  const [gender, setGender] = useState(alter.gender);
  const [identify, setIdentify] = useState(alter.identify);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      // どの項目も空欄でよい。前後の空白だけ取り除く
      await updateAlterBasicInfo(db, alter.id, {
        reading: reading.trim(),
        age: age.trim(),
        gender: gender.trim(),
        identify: identify.trim(),
      });
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
        <h1>基本情報を編集</h1>
      </header>
      <p className="author-heading">
        <AlterNameLabel name={alter.name} color={alter.color} />のページ
      </p>
      <form className="edit-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="field">
          <span>読み</span>
          <input type="text" value={reading} onChange={(event) => setReading(event.target.value)} />
        </label>
        <label className="field">
          <span>体感年齢</span>
          <input type="text" value={age} onChange={(event) => setAge(event.target.value)} />
        </label>
        <label className="field">
          <span>性別(感)</span>
          <input type="text" value={gender} onChange={(event) => setGender(event.target.value)} />
        </label>
        <label className="field">
          <span>見分け方</span>
          <textarea className="note-textarea" value={identify} onChange={(event) => setIdentify(event.target.value)} />
        </label>
        <div className="form-buttons">
          <button type="button" onClick={onBack}>
            キャンセル
          </button>
          <button type="submit" className="primary">
            保存
          </button>
        </div>
      </form>
    </main>
  );
}
