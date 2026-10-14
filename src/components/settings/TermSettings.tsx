// 「人格」の呼び方の設定(SPEC.md 14章③)。人格タブの折りたたみ<区分と呼び方の設定>の中に置く
// 選択肢から選ぶと、すぐ保存する。「自分で入力」は、入力して「保存」を押したときに保存する
import { useState, type FormEvent } from 'react';
import { db } from '../../db/db';
import { setAltersTerm } from '../../db/settingsRepo';
import { useTerm } from '../../hooks/useTerm';
import { showSaveError } from '../../lib/showError';
import { normalizeTerm, TERM_MAX_LENGTH, TERM_PRESETS } from '../../lib/term';

export function TermSettings() {
  const { term } = useTerm();
  const isPreset = TERM_PRESETS.includes(term);
  // 「自分で入力」を選んだか。null のあいだは、保存されている呼び方から決める
  // (呼び方の読み込みが終わる前に画面が出ても、読み込んだ呼び方に合わせられるように)
  const [customChoice, setCustomChoice] = useState<boolean | null>(null);
  const custom = customChoice ?? !isPreset;
  // 入力中の文字。null のあいだは、保存されている呼び方(選択肢にないとき)を出す
  const [customInput, setCustomInput] = useState<string | null>(null);
  const customText = customInput ?? (isPreset ? '' : term);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async (value: string) => {
    try {
      await setAltersTerm(db, value);
      setSaved(true);
    } catch (saveError) {
      showSaveError(saveError);
    }
  };

  const handleCustomSubmit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeTerm(customText);
    if (normalized === null) {
      setError(`1〜${TERM_MAX_LENGTH}文字で入力してください`);
      return;
    }
    setError(null);
    setCustomInput(normalized);
    void save(normalized);
  };

  return (
    <section className="settings-section">
      <h3 className="settings-subheading">呼び方</h3>
      <p className="settings-note">画面に出る「{term}」という言葉を、自分たちの言葉に変えられます。</p>
      <fieldset className="field">
        <legend className="visually-hidden">呼び方</legend>
        {TERM_PRESETS.map((preset) => (
          <label key={preset} className="choice">
            <input
              type="radio"
              name="alters-term"
              checked={!custom && term === preset}
              onChange={() => {
                setCustomChoice(false);
                setError(null);
                void save(preset);
              }}
            />
            {preset}
          </label>
        ))}
        <label className="choice">
          <input
            type="radio"
            name="alters-term"
            checked={custom}
            onChange={() => {
              setCustomChoice(true);
              setSaved(false);
            }}
          />
          自分で入力
        </label>
      </fieldset>
      {custom && (
        <form className="term-form" onSubmit={handleCustomSubmit}>
          <input
            type="text"
            value={customText}
            placeholder={`例:みんな(${TERM_MAX_LENGTH}文字まで)`}
            aria-label="呼び方"
            onChange={(event) => {
              setCustomInput(event.target.value);
              setSaved(false);
            }}
          />
          <button type="submit">保存</button>
        </form>
      )}
      {error && <p className="form-error">{error}</p>}
      {saved && !error && <p className="backup-success">「{term}」にしました</p>}
    </section>
  );
}
