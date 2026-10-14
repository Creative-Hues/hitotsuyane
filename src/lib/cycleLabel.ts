// 周期の表示文字列
import type { Cycle } from './types';

/** 周期を「毎日」「3日ごと」のような日本語にする */
export function cycleLabel(cycle: Cycle): string {
  switch (cycle.type) {
    case 'daily':
      return '毎日';
    case 'everyNDays':
      return `${cycle.n}日ごと`;
    case 'weekly':
      return '毎週';
    case 'monthly':
      return '毎月';
    case 'none':
      return '期限なし';
  }
}
