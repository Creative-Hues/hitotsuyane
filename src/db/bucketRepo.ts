// バケットの項目の保存・更新・削除(SPEC.md 9章)
// 本人確認は画面で出す。ここでは確認が済んだあとの保存だけを行う
import type { AppDatabase } from './db';
import { normalizeHelperIds } from '../lib/bucket';
import { nextOrder, reorderSubset } from '../lib/ordering';
import type { BucketItem } from '../lib/types';

/**
 * 人格をバケットに出す(「+」から選んだとき。SPEC.md 9.1)。
 * 前に外した人格なら再表示する(追加した日時はそのまま。リストの項目もそのまま戻る)
 */
export async function showAlterInBucket(database: AppDatabase, alterId: string, now: Date): Promise<void> {
  await database.transaction('rw', database.bucketAlters, async () => {
    const entry = await database.bucketAlters.get(alterId);
    await database.bucketAlters.put(
      entry ? { ...entry, hidden: false } : { alterId, hidden: false, addedAt: now.toISOString() },
    );
  });
}

/** 人格をバケットから外す(SPEC.md 9.1)。消さずに印を付けるだけなので、リストの項目は変わらない */
export async function hideAlterFromBucket(database: AppDatabase, alterId: string): Promise<void> {
  await database.bucketAlters.update(alterId, { hidden: true });
}

/** 項目をその人格のリストの「まだ」に追加し、追加した項目を返す(内容はチェック済みのもの) */
export async function addBucketItem(
  database: AppDatabase,
  alterId: string,
  body: string,
  now: Date,
): Promise<BucketItem> {
  return database.transaction('rw', database.bucketItems, async () => {
    const all = await database.bucketItems.toArray();
    const item: BucketItem = {
      id: crypto.randomUUID(),
      alterId,
      body,
      order: nextOrder(all),
      createdAt: now.toISOString(),
      achievedAt: null,
      helperAlterIds: [],
    };
    await database.bucketItems.add(item);
    return item;
  });
}

/**
 * 内容と協力者を変える(SPEC.md 9.1)。書いた日・叶った日は変えない。
 * 協力者は叶った項目のときだけ保存する(「まだ」の項目は協力者を持たない)
 */
export async function updateBucketItem(
  database: AppDatabase,
  id: string,
  input: { body: string; helperAlterIds: readonly string[] },
): Promise<void> {
  await database.transaction('rw', database.bucketItems, async () => {
    const item = await database.bucketItems.get(id);
    if (!item) {
      return;
    }
    await database.bucketItems.update(id, {
      body: input.body,
      helperAlterIds: item.achievedAt === null ? [] : normalizeHelperIds(input.helperAlterIds, item.alterId),
    });
  });
}

/**
 * 叶ったことにする(SPEC.md 9.2)。叶った日時と協力者を記録する(本人は協力者に入れない)。
 * 項目が見つからない・削除済み・すでに叶っているときは何もせず false を返す
 */
export async function achieveBucketItem(
  database: AppDatabase,
  id: string,
  helperAlterIds: readonly string[],
  now: Date,
): Promise<boolean> {
  return database.transaction('rw', database.bucketItems, async () => {
    const item = await database.bucketItems.get(id);
    if (!item || item.deletedAt !== undefined || item.achievedAt !== null) {
      return false;
    }
    await database.bucketItems.update(id, {
      achievedAt: now.toISOString(),
      helperAlterIds: normalizeHelperIds(helperAlterIds, item.alterId),
    });
    return true;
  });
}

/** 「まだ」に戻す(SPEC.md 9.2)。叶った日と協力者を消す */
export async function unachieveBucketItem(database: AppDatabase, id: string): Promise<void> {
  await database.bucketItems.update(id, { achievedAt: null, helperAlterIds: [] });
}

/**
 * 選んだ項目を削除する(SPEC.md 9.3。1件の削除にも使う)。
 * 協力の記録を集計に残すため、項目は消さずに削除済みの印(deletedAt)を付ける。
 * すでに削除済みの項目の印は付け直さない
 */
export async function deleteBucketItems(database: AppDatabase, ids: readonly string[], now: Date): Promise<void> {
  await database.transaction('rw', database.bucketItems, async () => {
    const items = await database.bucketItems.bulkGet([...ids]);
    for (const item of items) {
      if (item && item.deletedAt === undefined) {
        await database.bucketItems.update(item.id, { deletedAt: now.toISOString() });
      }
    }
  });
}

/**
 * 項目を並べ替える(「まだ」「叶ったこと」それぞれの欄の中で)。
 * @param orderedIds 並べ替えた後の順番に並んだ項目のID(対象でない項目の順番は変えない)
 */
export async function reorderBucketItems(database: AppDatabase, orderedIds: readonly string[]): Promise<void> {
  await database.transaction('rw', database.bucketItems, async () => {
    const changes = reorderSubset(await database.bucketItems.toArray(), orderedIds);
    for (const change of changes) {
      await database.bucketItems.update(change.id, { order: change.order });
    }
  });
}
