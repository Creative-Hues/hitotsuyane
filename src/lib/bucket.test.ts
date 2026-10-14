import { describe, expect, it } from 'vitest';
import {
  achieveConfirmMessage,
  addConfirmMessage,
  bucketAddChoices,
  buildInitialBucketAlters,
  deleteConfirmMessage,
  editConfirmMessage,
  helperChoices,
  isBucketItemChanged,
  normalizeHelperIds,
  removeFromBucketMessage,
  resolveSelectedOwner,
  splitBucketItems,
  switchableAlters,
  unachieveConfirmMessage,
  validateBucketBody,
} from './bucket';
import type { Alter, BucketAlter, BucketItem } from './types';

function alterOf(id: string, order: number, hidden = false): Alter {
  return {
    id,
    name: `人格${id}`,
    color: '#4a90d9',
    hidden,
    order,
    createdAt: '2026-09-01T00:00:00.000Z',
    reading: '',
    categoryId: null,
    age: '',
    gender: '',
    identify: '',
  };
}

function itemOf(id: string, overrides: Partial<BucketItem> = {}): BucketItem {
  return {
    id,
    alterId: 'A',
    body: `願い${id}`,
    order: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    achievedAt: null,
    helperAlterIds: [],
    ...overrides,
  };
}

describe('リストの分け方(SPEC.md 9.1)', () => {
  it('その人格の項目を「まだ」と「叶ったこと」に分け、それぞれ order 順に並べる', () => {
    const items = [
      itemOf('p2', { order: 3 }),
      itemOf('a1', { order: 1, achievedAt: '2026-09-20T00:00:00.000Z' }),
      itemOf('p1', { order: 2 }),
      itemOf('a2', { order: 0, achievedAt: '2026-09-25T00:00:00.000Z' }),
      // ほかの人格の項目は入れない
      itemOf('other', { alterId: 'B', order: -1 }),
    ];
    const { pending, achieved } = splitBucketItems(items, 'A');
    expect(pending.map((item) => item.id)).toEqual(['p1', 'p2']);
    expect(achieved.map((item) => item.id)).toEqual(['a2', 'a1']);
  });

  it('削除済みの項目は、どちらにも入れない', () => {
    const items = [
      itemOf('p', { deletedAt: '2026-09-27T00:00:00.000Z' }),
      itemOf('a', { achievedAt: '2026-09-20T00:00:00.000Z', deletedAt: '2026-09-27T00:00:00.000Z' }),
      itemOf('keep'),
    ];
    const { pending, achieved } = splitBucketItems(items, 'A');
    expect(pending.map((item) => item.id)).toEqual(['keep']);
    expect(achieved).toEqual([]);
  });
});

describe('人格の切り替え(SPEC.md 9.1)', () => {
  const alters = [alterOf('C', 2), alterOf('A', 0), alterOf('H', 1, true), alterOf('B', 1), alterOf('D', 3)];
  // D はまだバケットに出ていない。E はもう削除した人格
  const bucketAlters: BucketAlter[] = ['A', 'B', 'C', 'H', 'E'].map((alterId) => ({ alterId, hidden: false, addedAt: '' }));

  it('バケットに出す人格のうち、非表示でない人格を並び順で出す', () => {
    expect(switchableAlters(alters, bucketAlters).map((alter) => alter.id)).toEqual(['A', 'B', 'C']);
  });

  it('バケットから外した人格は出さない', () => {
    const removedB = bucketAlters.map((entry) => (entry.alterId === 'B' ? { ...entry, hidden: true } : entry));
    expect(switchableAlters(alters, removedB).map((alter) => alter.id)).toEqual(['A', 'C']);
    expect(resolveSelectedOwner(alters, removedB, 'B')).toBe('A');
  });

  it('選んでいた人格が出せればその人格、非表示・削除・バケットに出ていないなら先頭の人格', () => {
    expect(resolveSelectedOwner(alters, bucketAlters, 'B')).toBe('B');
    expect(resolveSelectedOwner(alters, bucketAlters, null)).toBe('A');
    expect(resolveSelectedOwner(alters, bucketAlters, 'H')).toBe('A');
    expect(resolveSelectedOwner(alters, bucketAlters, 'deleted')).toBe('A');
    expect(resolveSelectedOwner(alters, bucketAlters, 'D')).toBe('A');
  });

  it('出せる人格が1人もいないときは null', () => {
    expect(resolveSelectedOwner([], [], null)).toBeNull();
    expect(resolveSelectedOwner(alters, [], null)).toBeNull();
    expect(resolveSelectedOwner([alterOf('H', 0, true)], bucketAlters, 'H')).toBeNull();
  });
});

describe('バケットに出す人格(SPEC.md 9.1)', () => {
  const alters = [alterOf('C', 2), alterOf('A', 0), alterOf('H', 1, true), alterOf('B', 1), alterOf('D', 3)];

  it('最初の中身は、非表示でない人格全員(版7に上げるとき・古いバックアップ)', () => {
    expect(buildInitialBucketAlters(alters, 'at')).toEqual(
      ['C', 'A', 'B', 'D'].map((alterId) => ({ alterId, hidden: false, addedAt: 'at' })),
    );
  });

  it('「+」の一覧は、まだ出ていない人格と、外した人格に分けて並び順で出す(非表示の人格は出さない)', () => {
    const bucketAlters: BucketAlter[] = [
      { alterId: 'A', hidden: false, addedAt: '' },
      { alterId: 'C', hidden: true, addedAt: '' },
      { alterId: 'H', hidden: true, addedAt: '' },
    ];
    const choices = bucketAddChoices(alters, bucketAlters);
    expect(choices.notAdded.map((alter) => alter.id)).toEqual(['B', 'D']);
    expect(choices.removed.map((alter) => alter.id)).toEqual(['C']);
  });

  it('外すときの確認文', () => {
    expect(removeFromBucketMessage('人格A')).toBe(
      '人格Aをバケットから外しますか?リストの項目は消えず、「+」からまた出せます。',
    );
  });
});

describe('協力してくれた人格(SPEC.md 9.2)', () => {
  const alters = [alterOf('C', 2), alterOf('A', 0), alterOf('H', 1, true), alterOf('B', 1)];

  it('本人と非表示の人格は選択肢に出さない', () => {
    expect(helperChoices(alters, 'A').map((alter) => alter.id)).toEqual(['B', 'C']);
  });

  it('すでに選ばれている非表示の人格は、並び順の位置に出す', () => {
    expect(helperChoices(alters, 'A', ['H']).map((alter) => alter.id)).toEqual(['H', 'B', 'C']);
  });

  it('保存する協力者から本人と重複を除く', () => {
    expect(normalizeHelperIds(['B', 'A', 'C', 'B'], 'A')).toEqual(['B', 'C']);
  });
});

describe('入力と変更のチェック(SPEC.md 9.1)', () => {
  it('内容の前後の空白を除く。空なら保存できない', () => {
    expect(validateBucketBody('  海を見に行く\n夏に  ')).toEqual({ ok: true, input: '海を見に行く\n夏に' });
    expect(validateBucketBody(' \n ')).toEqual({ ok: false, error: '内容を入力してください' });
  });

  it('内容か協力者が変わったときだけ「変わった」とする(協力者の並びの違いは変更ではない)', () => {
    const item = itemOf('1', { achievedAt: '2026-09-20T00:00:00.000Z', helperAlterIds: ['B', 'C'] });
    expect(isBucketItemChanged(item, item.body, ['C', 'B'])).toBe(false);
    expect(isBucketItemChanged(item, '別の願い', ['B', 'C'])).toBe(true);
    expect(isBucketItemChanged(item, item.body, ['B'])).toBe(true);
    expect(isBucketItemChanged(item, item.body, ['B', 'D'])).toBe(true);
  });
});

describe('本人確認の文(SPEC.md 9章)', () => {
  it('追加・変更・叶った・「まだ」に戻す・削除', () => {
    expect(addConfirmMessage('人格A')).toBe('これは人格Aのリストです。人格A本人として追加しますか?');
    expect(editConfirmMessage('人格A')).toBe('これは人格Aのリストです。人格A本人として、変更しますか?');
    expect(achieveConfirmMessage('人格A')).toBe('これは人格Aのリストです。人格A本人として、叶ったことにしますか?');
    expect(unachieveConfirmMessage('人格A')).toBe(
      'これは人格Aのリストです。人格A本人として、「まだ」に戻しますか?叶った日と協力してくれた人格の記録は消えます。',
    );
    expect(deleteConfirmMessage('人格A', 3)).toBe('これは人格Aのリストです。人格A本人として、3件を削除しますか?');
  });
});
