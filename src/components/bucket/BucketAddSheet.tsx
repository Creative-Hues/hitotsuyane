// バケットに出す人格を選ぶシート(SPEC.md 9.1)。切り替えの「+」から開く。下から出る
// まだバケットに出ていない人格と、前に外した人格(「外した人格」)を、並び順で出す
import type { BucketAddChoices } from '../../lib/bucket';
import type { Alter } from '../../lib/types';
import { useTerm } from '../../hooks/useTerm';

interface Props {
  choices: BucketAddChoices;
  /** 人格を選んだとき(外した人格なら再表示する) */
  onSelect: (alterId: string) => void;
  onCancel: () => void;
}

function ChoiceButtons({ alters, onSelect }: { alters: Alter[]; onSelect: (alterId: string) => void }) {
  return (
    <div className="picker-buttons">
      {alters.map((alter) => (
        <button
          key={alter.id}
          type="button"
          className="picker-button"
          style={{ backgroundColor: alter.color }}
          onClick={() => onSelect(alter.id)}
        >
          {alter.name}
        </button>
      ))}
    </div>
  );
}

export function BucketAddSheet({ choices, onSelect, onCancel }: Props) {
  const { t } = useTerm();
  return (
    <div className="overlay overlay--bottom">
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="bucket-add-title">
        <h2 id="bucket-add-title" className="sheet__title">
          {t('バケットに出す人格を選んでください')}
        </h2>
        {choices.notAdded.length > 0 && <ChoiceButtons alters={choices.notAdded} onSelect={onSelect} />}
        {choices.removed.length > 0 && (
          <>
            <h3 className="sheet__subtitle">{t('外した人格')}</h3>
            <ChoiceButtons alters={choices.removed} onSelect={onSelect} />
          </>
        )}
        <button type="button" className="sheet__cancel" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
