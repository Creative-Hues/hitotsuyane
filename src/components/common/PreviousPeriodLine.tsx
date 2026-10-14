// 前の期間の結果の1行(ToDo の SPEC.md 6.5、服薬の「昨日」「前回」7.4・7.5 で共通)
// 記録ありは小さく薄い文字、記録なし・予定日から○日は小さい文字でふつうの文字色(警告の色は使わない)
import type { PreviousPeriodLabel } from '../../lib/previousPeriod';
import { AlterNameLabel } from './AlterNameLabel';

export function PreviousPeriodLine({ label }: { label: PreviousPeriodLabel }) {
  if (label.kind === 'missing') {
    return <span className="task-item__previous task-item__previous--missing">{label.text}</span>;
  }
  return (
    <span className="task-item__previous">
      {label.prefix}:<AlterNameLabel name={label.name} color={label.color} />・{label.time}
    </span>
  );
}
