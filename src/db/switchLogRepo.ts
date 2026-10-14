// 交代の記録の保存・更新・削除(SPEC.md 17.1・17.3・17.4)
// 交代前の人格が「推測」の記録は、記録を足す・直す・消すたびに、同じ1回の処理(トランザクション)の中で計算し直す
import type { AppDatabase } from './db';
import { guessFromAlterId, recomputeGuessedFromAlters } from '../lib/switchLog';
import type { SwitchLog } from '../lib/types';

/** 記録の入力内容(交代した時刻は resolveSwitchedAt で決めたもの) */
export interface SwitchLogInput {
  alterId: string | null;
  switchedAt: string | null;
  tagIds: string[];
}

/**
 * 交代前の人格の決め方(SPEC.md 17.1・17.4)
 * - guess:推測のまま(記録の時刻から計算する)
 * - confirmed:「交代前の人格を修正」で選んだ人格(「わからない」は null)
 */
export type FromAlterChoice = { kind: 'guess' } | { kind: 'confirmed'; alterId: string | null };

/** 「推測」の記録の交代前の人格を計算し直す(トランザクションの中で呼ぶ) */
async function recomputeGuessed(database: AppDatabase): Promise<void> {
  const changes = recomputeGuessedFromAlters(await database.switchLogs.toArray());
  for (const change of changes) {
    await database.switchLogs.update(change.id, { fromAlterId: change.fromAlterId });
  }
}

/**
 * 交代の記録を足して、足した記録を返す
 * @param noticedAt 気づいた時刻(「変わったことに気づいた」ボタンを押した時刻)
 */
export async function addSwitchLog(
  database: AppDatabase,
  input: SwitchLogInput,
  from: FromAlterChoice,
  noticedAt: Date,
): Promise<SwitchLog> {
  return database.transaction('rw', database.switchLogs, async () => {
    const base = {
      id: crypto.randomUUID(),
      alterId: input.alterId,
      noticedAt: noticedAt.toISOString(),
      switchedAt: input.switchedAt,
      tagIds: [...new Set(input.tagIds)],
    };
    const log: SwitchLog =
      from.kind === 'confirmed'
        ? { ...base, fromAlterId: from.alterId, fromAlterSource: 'confirmed' }
        : { ...base, fromAlterId: guessFromAlterId(await database.switchLogs.toArray(), base), fromAlterSource: 'guessed' };
    await database.switchLogs.add(log);
    // あとの記録の「推測」が、この記録を前の記録として指すように直す
    await recomputeGuessed(database);
    return (await database.switchLogs.get(log.id)) ?? log;
  });
}

/**
 * 人格・交代した時刻・きっかけ・交代前の人格を直す(気づいた時刻は変えない)。
 * 交代前の人格は、confirmed を渡したときだけ変える(guess のときは今の決め方のまま)
 */
export async function updateSwitchLog(
  database: AppDatabase,
  id: string,
  input: SwitchLogInput,
  from: FromAlterChoice,
): Promise<void> {
  await database.transaction('rw', database.switchLogs, async () => {
    await database.switchLogs.update(id, {
      alterId: input.alterId,
      switchedAt: input.switchedAt,
      tagIds: [...new Set(input.tagIds)],
      ...(from.kind === 'confirmed' ? { fromAlterId: from.alterId, fromAlterSource: 'confirmed' as const } : {}),
    });
    await recomputeGuessed(database);
  });
}

export async function deleteSwitchLog(database: AppDatabase, id: string): Promise<void> {
  await database.transaction('rw', database.switchLogs, async () => {
    await database.switchLogs.delete(id);
    await recomputeGuessed(database);
  });
}
