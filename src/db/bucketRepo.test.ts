// テスト用の疑似データベース(fake-indexeddb)を使う
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { splitBucketItems } from '../lib/bucket';
import { AppDatabase } from './db';
import {
  achieveBucketItem,
  addBucketItem,
  deleteBucketItems,
  hideAlterFromBucket,
  reorderBucketItems,
  showAlterInBucket,
  unachieveBucketItem,
  updateBucketItem,
} from './bucketRepo';

describe('バケットの保存', () => {
  let database: AppDatabase;
  const now = new Date(2026, 8, 28, 21, 30);
  const later = new Date(2026, 8, 29, 10, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-bucket');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('追加した項目は「まだ」に入り、順番に order が付く', async () => {
    const first = await addBucketItem(database, 'A', '海を見に行く', now);
    const second = await addBucketItem(database, 'B', '山に登る', now);
    expect(await database.bucketItems.get(first.id)).toEqual({
      id: first.id,
      alterId: 'A',
      body: '海を見に行く',
      order: 0,
      createdAt: now.toISOString(),
      achievedAt: null,
      helperAlterIds: [],
    });
    expect(second.order).toBe(1);
  });

  it('叶ったことにすると、叶った日時と協力者(本人を除く)を記録する', async () => {
    const item = await addBucketItem(database, 'A', '海を見に行く', now);
    expect(await achieveBucketItem(database, item.id, ['B', 'A', 'C'], later)).toBe(true);
    const saved = await database.bucketItems.get(item.id);
    expect(saved?.achievedAt).toBe(later.toISOString());
    expect(saved?.helperAlterIds).toEqual(['B', 'C']);
    // もう叶っている項目は、叶え直さない
    expect(await achieveBucketItem(database, item.id, [], now)).toBe(false);
    expect((await database.bucketItems.get(item.id))?.achievedAt).toBe(later.toISOString());
  });

  it('削除済みの項目・ない項目は、叶ったことにしない', async () => {
    const item = await addBucketItem(database, 'A', '海を見に行く', now);
    await deleteBucketItems(database, [item.id], now);
    expect(await achieveBucketItem(database, item.id, [], later)).toBe(false);
    expect(await achieveBucketItem(database, 'none', [], later)).toBe(false);
    expect((await database.bucketItems.get(item.id))?.achievedAt).toBeNull();
  });

  it('「まだ」に戻すと、叶った日と協力者が消える', async () => {
    const item = await addBucketItem(database, 'A', '海を見に行く', now);
    await achieveBucketItem(database, item.id, ['B'], later);
    await unachieveBucketItem(database, item.id);
    const saved = await database.bucketItems.get(item.id);
    expect(saved?.achievedAt).toBeNull();
    expect(saved?.helperAlterIds).toEqual([]);
  });

  it('編集で内容と協力者を変えられる(書いた日・叶った日は変えない。「まだ」の項目は協力者を持たない)', async () => {
    const achieved = await addBucketItem(database, 'A', '海を見に行く', now);
    await achieveBucketItem(database, achieved.id, ['B'], later);
    await updateBucketItem(database, achieved.id, { body: '夏の海を見に行く', helperAlterIds: ['C', 'A'] });
    const saved = await database.bucketItems.get(achieved.id);
    expect(saved?.body).toBe('夏の海を見に行く');
    expect(saved?.helperAlterIds).toEqual(['C']);
    expect(saved?.createdAt).toBe(now.toISOString());
    expect(saved?.achievedAt).toBe(later.toISOString());

    const pending = await addBucketItem(database, 'A', '山に登る', now);
    await updateBucketItem(database, pending.id, { body: '山に登る', helperAlterIds: ['B'] });
    expect((await database.bucketItems.get(pending.id))?.helperAlterIds).toEqual([]);
  });

  it('整理:選んだ項目が一覧から消え、協力者と叶った日は残る(集計に残すため)', async () => {
    const keep = await addBucketItem(database, 'A', '本を読む', now);
    const pending = await addBucketItem(database, 'A', '海を見に行く', now);
    const achieved = await addBucketItem(database, 'A', '山に登る', now);
    await achieveBucketItem(database, achieved.id, ['B'], later);

    await deleteBucketItems(database, [pending.id, achieved.id], later);

    // 一覧(「まだ」「叶ったこと」)からは消える
    const { pending: shownPending, achieved: shownAchieved } = splitBucketItems(await database.bucketItems.toArray(), 'A');
    expect(shownPending.map((item) => item.id)).toEqual([keep.id]);
    expect(shownAchieved).toEqual([]);
    // 項目そのものは残り、削除済みの印が付く
    const saved = await database.bucketItems.get(achieved.id);
    expect(saved?.deletedAt).toBe(later.toISOString());
    expect(saved?.helperAlterIds).toEqual(['B']);
    expect(saved?.achievedAt).toBe(later.toISOString());
    expect(await database.bucketItems.count()).toBe(3);
    // 選んでいない項目には印が付かない
    expect((await database.bucketItems.get(keep.id))?.deletedAt).toBeUndefined();
  });

  it('すでに削除済みの項目の印は付け直さない', async () => {
    const item = await addBucketItem(database, 'A', '海を見に行く', now);
    await deleteBucketItems(database, [item.id], now);
    await deleteBucketItems(database, [item.id, 'none'], later);
    expect((await database.bucketItems.get(item.id))?.deletedAt).toBe(now.toISOString());
  });

  it('並べ替えた順番で保存され、ほかの項目の順番は変わらない', async () => {
    const a = await addBucketItem(database, 'A', '1', now);
    const other = await addBucketItem(database, 'B', 'ほかの人格', now);
    const b = await addBucketItem(database, 'A', '2', now);
    const c = await addBucketItem(database, 'A', '3', now);
    await reorderBucketItems(database, [c.id, a.id, b.id]);
    const { pending } = splitBucketItems(await database.bucketItems.toArray(), 'A');
    expect(pending.map((item) => item.id)).toEqual([c.id, a.id, b.id]);
    expect((await database.bucketItems.get(other.id))?.order).toBe(other.order);
  });
});

describe('バケットに出す人格(SPEC.md 9.1)', () => {
  let database: AppDatabase;
  const now = new Date(2026, 9, 14, 9, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-bucket-alters');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('追加・外す・再表示しても、リストの項目は変わらず、追加した日時もそのまま', async () => {
    const item = await addBucketItem(database, 'alter-a', '海に行く', now);
    await showAlterInBucket(database, 'alter-a', now);
    await hideAlterFromBucket(database, 'alter-a');
    expect(await database.bucketAlters.get('alter-a')).toEqual({ alterId: 'alter-a', hidden: true, addedAt: now.toISOString() });
    await showAlterInBucket(database, 'alter-a', new Date(2026, 9, 20));
    expect(await database.bucketAlters.get('alter-a')).toEqual({ alterId: 'alter-a', hidden: false, addedAt: now.toISOString() });
    expect(await database.bucketItems.toArray()).toEqual([item]);
  });
});
