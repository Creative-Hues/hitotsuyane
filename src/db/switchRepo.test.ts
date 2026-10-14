// 交代のきっかけ・交代の記録の保存(SPEC.md 17.2・17.3)
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import { addSwitchLog, deleteSwitchLog, updateSwitchLog, type FromAlterChoice } from './switchLogRepo';

/** 交代前の人格を推測のまま記録する */
const GUESS: FromAlterChoice = { kind: 'guess' };
import {
  addSwitchTag,
  countSwitchTagUsage,
  deleteSwitchTag,
  renameSwitchTag,
  reorderSwitchTags,
  setSwitchTagHidden,
} from './switchTagRepo';

describe('交代のきっかけと記録', () => {
  let database: AppDatabase;
  const now = new Date(2026, 9, 2, 21, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-switch');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('新しく入れたときは、最初のきっかけが6つある', async () => {
    expect((await database.switchTags.orderBy('order').toArray()).map((t) => t.name)).toEqual([
      '音',
      'におい',
      '人との会話',
      '疲れ',
      '体調',
      '夢',
    ]);
  });

  it('きっかけを最後に追加でき、同じ名前(非表示のものも含む)は保存できない', async () => {
    const added = await addSwitchTag(database, '人混み', now);
    expect(added.ok && added.tag.order).toBe(6);
    if (!added.ok) {
      return;
    }
    await setSwitchTagHidden(database, added.tag.id, true);
    expect(await addSwitchTag(database, '人混み', now)).toEqual({ ok: false, reason: 'duplicateName' });
    expect(await renameSwitchTag(database, 'switch-tag-sound', '人混み')).toEqual({
      ok: false,
      reason: 'duplicateName',
    });
    // 自分と同じ名前のままの保存はできる
    expect((await renameSwitchTag(database, added.tag.id, '人混み'))?.ok).toBe(true);
  });

  it('並べ替えた順番で保存される', async () => {
    await reorderSwitchTags(database, ['switch-tag-dream', 'switch-tag-sound']);
    const ordered = (await database.switchTags.orderBy('order').toArray()).map((t) => t.id);
    expect(ordered.indexOf('switch-tag-dream')).toBeLessThan(ordered.indexOf('switch-tag-sound'));
  });

  it('使っている記録があるきっかけは削除できず、記録を消せば削除できる', async () => {
    const log = await addSwitchLog(
      database,
      { alterId: null, switchedAt: null, tagIds: ['switch-tag-sound', 'switch-tag-sound'] },
      GUESS,
      now,
    );
    // 同じきっかけは1つにまとめて保存する
    expect(log.tagIds).toEqual(['switch-tag-sound']);
    expect(await countSwitchTagUsage(database, 'switch-tag-sound')).toBe(1);
    expect(await deleteSwitchTag(database, 'switch-tag-sound')).toBe(false);
    expect(await database.switchTags.get('switch-tag-sound')).toBeDefined();

    await deleteSwitchLog(database, log.id);
    expect(await deleteSwitchTag(database, 'switch-tag-sound')).toBe(true);
    expect(await database.switchTags.get('switch-tag-sound')).toBeUndefined();
  });

  it('記録を直しても、気づいた時刻は変わらない', async () => {
    const log = await addSwitchLog(database, { alterId: 'alter-a', switchedAt: now.toISOString(), tagIds: [] }, GUESS, now);
    await updateSwitchLog(database, log.id, { alterId: null, switchedAt: null, tagIds: ['switch-tag-dream'] }, GUESS);
    expect(await database.switchLogs.get(log.id)).toEqual({
      id: log.id,
      alterId: null,
      noticedAt: now.toISOString(),
      switchedAt: null,
      tagIds: ['switch-tag-dream'],
      fromAlterId: null,
      fromAlterSource: 'guessed',
    });
  });

  describe('交代前の人格(SPEC.md 17.3)', () => {
    /** 時刻 hour 時に交代した記録を足す(気づいた時刻は now) */
    const addAt = (alterId: string | null, hour: number, from: FromAlterChoice = GUESS) =>
      addSwitchLog(database, { alterId, switchedAt: new Date(2026, 9, 2, hour, 0).toISOString(), tagIds: [] }, from, now);

    /** [id, 交代前, 決め方] を記録の時刻の順で */
    async function fromRows() {
      const logs = await database.switchLogs.toArray();
      return logs
        .sort((a, b) => (a.switchedAt ?? a.noticedAt).localeCompare(b.switchedAt ?? b.noticedAt))
        .map((log) => [log.alterId, log.fromAlterId, log.fromAlterSource]);
    }

    it('推測のまま記録すると、前の記録の人格が入る。最初の記録は「わからない」', async () => {
      await addAt('alter-a', 9);
      await addAt('alter-b', 10);
      expect(await fromRows()).toEqual([
        ['alter-a', null, 'guessed'],
        ['alter-b', 'alter-a', 'guessed'],
      ]);
    });

    it('間に記録を足すと、あとの「推測」の記録だけ計算し直し、「確認した」記録は変えない', async () => {
      await addAt('alter-a', 9);
      await addAt('alter-b', 12);
      await addAt('alter-c', 13, { kind: 'confirmed', alterId: 'alter-a' });
      // 11時の記録をあとから足す
      await addAt(null, 11);
      expect(await fromRows()).toEqual([
        ['alter-a', null, 'guessed'],
        [null, 'alter-a', 'guessed'],
        ['alter-b', null, 'guessed'],
        ['alter-c', 'alter-a', 'confirmed'],
      ]);
    });

    it('時刻を直したとき・削除したときも、「推測」の記録を計算し直す', async () => {
      const first = await addAt('alter-a', 9);
      const second = await addAt('alter-b', 10);
      await addAt('alter-c', 11);
      // 人格Bの記録を12時に動かす → 並びは A(9時)→ C(11時)→ B(12時)
      await updateSwitchLog(database, second.id, { alterId: 'alter-b', switchedAt: new Date(2026, 9, 2, 12, 0).toISOString(), tagIds: [] }, GUESS);
      expect(await fromRows()).toEqual([
        ['alter-a', null, 'guessed'],
        ['alter-c', 'alter-a', 'guessed'],
        ['alter-b', 'alter-c', 'guessed'],
      ]);
      await deleteSwitchLog(database, first.id);
      expect(await fromRows()).toEqual([
        ['alter-c', null, 'guessed'],
        ['alter-b', 'alter-c', 'guessed'],
      ]);
    });

    it('編集で交代前の人格を選ぶと「確認した」になる(推測と同じ人格でも)', async () => {
      await addAt('alter-a', 9);
      const log = await addAt('alter-b', 10);
      await updateSwitchLog(database, log.id, { alterId: 'alter-b', switchedAt: log.switchedAt, tagIds: [] }, { kind: 'confirmed', alterId: 'alter-a' });
      expect(await database.switchLogs.get(log.id)).toMatchObject({ fromAlterId: 'alter-a', fromAlterSource: 'confirmed' });
    });
  });
});
