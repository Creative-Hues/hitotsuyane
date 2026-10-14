// テスト用の疑似データベース(fake-indexeddb)を使う
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './db';
import {
  addAlter,
  countAlterRecords,
  countFilledProfileSections,
  deleteAlter,
  reorderAlters,
  setAlterHidden,
  updateAlter,
  updateAlterBasicInfo,
} from './alterRepo';
import { addTask } from './taskRepo';

describe('人格の保存', () => {
  let database: AppDatabase;
  const now = new Date(2026, 8, 25, 10, 0);

  beforeEach(() => {
    database = new AppDatabase('did-todo-test-alters');
  });

  afterEach(async () => {
    await database.delete();
  });

  it('追加した人格が保存され、順番に order が付く', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: null }, now);
    const b = await addAlter(database, { name: '人格B', color: '#d94a4a', categoryId: null }, now);

    // 別の接続で開き直しても残っている(再起動の代わり)
    const reopened = new AppDatabase('did-todo-test-alters');
    const saved = await reopened.alters.get(a.id);
    reopened.close();
    expect(saved).toEqual({
      id: a.id,
      name: '人格A',
      color: '#4a90d9',
      hidden: false,
      order: 0,
      createdAt: now.toISOString(),
      // 基本情報は空欄・未分類で始まる
      reading: '',
      categoryId: null,
      age: '',
      gender: '',
      identify: '',
    });
    expect(b.order).toBe(1);
  });

  it('名前・色・区分を変更できる', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: null }, now);
    await updateAlter(database, a.id, { name: '人格A2', color: '#000000', categoryId: 'cat-1' });
    const saved = await database.alters.get(a.id);
    expect(saved?.name).toBe('人格A2');
    expect(saved?.color).toBe('#000000');
    expect(saved?.categoryId).toBe('cat-1');
  });

  it('追加のときに区分を選べる', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: 'cat-1' }, now);
    expect((await database.alters.get(a.id))?.categoryId).toBe('cat-1');
  });

  it('基本情報を変更でき、ほかの項目は変わらない', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: 'cat-1' }, now);
    await updateAlterBasicInfo(database, a.id, {
      reading: 'じんかくえー',
      age: '20代',
      gender: '女性',
      identify: '話し方がていねい\n左利き',
    });
    expect(await database.alters.get(a.id)).toEqual({
      ...a,
      reading: 'じんかくえー',
      age: '20代',
      gender: '女性',
      identify: '話し方がていねい\n左利き',
    });
  });

  it('追加した人格には基本の見出しが中身の空で入り、「経緯」だけ自分たちだけになる', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: null }, now);
    const sections = await database.profileSections.where('alterId').equals(a.id).sortBy('order');
    expect(sections.map((s) => [s.title, s.body, s.includeInPdf, s.order])).toEqual([
      ['機能・役割', '', true, 0],
      ['特徴', '', true, 1],
      ['記憶', '', true, 2],
      ['身体・感覚', '', true, 3],
      ['対応のお願い', '', true, 4],
      ['交代の傾向', '', true, 5],
      ['経緯', '', false, 6],
      ['その他', '', true, 7],
    ]);
  });

  it('非表示にしても削除されず、再表示できる', async () => {
    const a = await addAlter(database, { name: '人格A', color: '#4a90d9', categoryId: null }, now);
    await setAlterHidden(database, a.id, true);
    expect((await database.alters.get(a.id))?.hidden).toBe(true);
    await setAlterHidden(database, a.id, false);
    expect((await database.alters.get(a.id))?.hidden).toBe(false);
  });

  it('並べ替えた順番で保存される', async () => {
    const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
    const b = await addAlter(database, { name: 'B', color: '#222222', categoryId: null }, now);
    const c = await addAlter(database, { name: 'C', color: '#333333', categoryId: null }, now);
    await reorderAlters(database, [c.id, a.id, b.id]);
    const ordered = await database.alters.orderBy('order').toArray();
    expect(ordered.map((alter) => alter.id)).toEqual([c.id, a.id, b.id]);
  });

  describe('削除', () => {
    const recordOf = (alterId: string | null) => ({
      id: crypto.randomUUID(),
      taskId: 't',
      alterId,
      completedAt: now.toISOString(),
    });

    it('記録がない人格は削除でき、タスクの「気にしている人格」からも外れる', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      const b = await addAlter(database, { name: 'B', color: '#222222', categoryId: null }, now);
      const withA = await addTask(database, { name: '掃除', cycle: { type: 'daily' }, careAlterIds: [a.id, b.id] }, now);
      const withoutA = await addTask(database, { name: '洗濯', cycle: { type: 'daily' }, careAlterIds: [b.id] }, now);
      // ほかの人格の記録や「わからない」の記録があっても、A は削除できる
      await database.records.bulkAdd([recordOf(b.id), recordOf(null)]);

      expect(await countAlterRecords(database, a.id)).toBe(0);
      expect(await deleteAlter(database, a.id)).toBe(true);
      expect(await database.alters.get(a.id)).toBeUndefined();
      expect((await database.tasks.get(withA.id))?.careAlterIds).toEqual([b.id]);
      expect((await database.tasks.get(withoutA.id))?.careAlterIds).toEqual([b.id]);
      expect(await database.records.count()).toBe(2);
    });

    it('人格を削除すると、その人格の見出しも消え、ほかの人格と「全体のこと」の見出しは残る', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      const b = await addAlter(database, { name: 'B', color: '#222222', categoryId: null }, now);
      const commonCount = await database.profileSections.filter((s) => s.alterId === null).count();
      const [first] = await database.profileSections.where('alterId').equals(a.id).sortBy('order');
      await database.profileSections.update(first.id, { body: '書いた中身' });
      const second = (await database.profileSections.where('alterId').equals(a.id).sortBy('order'))[1];
      // 空白だけの中身は「空」として数える
      await database.profileSections.update(second.id, { body: '  \n ' });

      expect(await countFilledProfileSections(database, a.id)).toBe(1);
      // 見出しは、削除できるかどうかの判断に使わない
      expect(await countAlterRecords(database, a.id)).toBe(0);
      expect(await deleteAlter(database, a.id)).toBe(true);
      expect(await database.profileSections.where('alterId').equals(a.id).count()).toBe(0);
      expect(await database.profileSections.where('alterId').equals(b.id).count()).toBe(8);
      expect(await database.profileSections.filter((s) => s.alterId === null).count()).toBe(commonCount);
    });

    it('記録がある人格は削除されない', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      const task = await addTask(database, { name: '掃除', cycle: { type: 'daily' }, careAlterIds: [a.id] }, now);
      await database.records.add(recordOf(a.id));

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
      expect(await database.alters.get(a.id)).toBeDefined();
      expect((await database.tasks.get(task.id))?.careAlterIds).toEqual([a.id]);
    });

    it('受診メモだけ、またはコメントだけがある人格も削除されない', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      const b = await addAlter(database, { name: 'B', color: '#222222', categoryId: null }, now);
      await database.clinicNotes.add({
        id: 'n1',
        alterId: a.id,
        categoryId: 'nc-1',
        body: '頭痛',
        createdAt: now.toISOString(),
        discussedAt: null,
      });
      await database.clinicNoteComments.add({
        id: 'c1',
        noteId: 'n1',
        alterId: b.id,
        body: '私も',
        createdAt: now.toISOString(),
      });

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
      expect(await countAlterRecords(database, b.id)).toBe(1);
      expect(await deleteAlter(database, b.id)).toBe(false);
      expect(await database.alters.count()).toBe(2);
    });

    it('バケットのリストの項目がある人格・協力者に入っている人格は削除されない(削除済みの項目も数える)', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      const b = await addAlter(database, { name: 'B', color: '#222222', categoryId: null }, now);
      const c = await addAlter(database, { name: 'C', color: '#333333', categoryId: null }, now);
      // A のリストの削除済みの項目で、B が協力者。C はどこにも出てこない
      await database.bucketItems.add({
        id: 'b1',
        alterId: a.id,
        body: '海を見に行く',
        order: 0,
        createdAt: now.toISOString(),
        achievedAt: now.toISOString(),
        helperAlterIds: [b.id],
        deletedAt: now.toISOString(),
      });

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
      expect(await countAlterRecords(database, b.id)).toBe(1);
      expect(await deleteAlter(database, b.id)).toBe(false);
      expect(await countAlterRecords(database, c.id)).toBe(0);
      expect(await deleteAlter(database, c.id)).toBe(true);
      expect(await database.alters.count()).toBe(2);
      expect(await database.bucketItems.count()).toBe(1);
    });

    it('交代の記録だけがある人格も削除されない(SPEC.md 3.1・17.3)', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      await database.switchLogs.add({
        id: 'sw1',
        alterId: a.id,
        noticedAt: now.toISOString(),
        switchedAt: null,
        tagIds: [],
        fromAlterId: null,
        fromAlterSource: 'guessed',
      });

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
      expect(await database.alters.get(a.id)).toBeDefined();
    });

    it('バケットに出しているだけの人格は削除でき、バケットに出す人格からも外れる(SPEC.md 3.1)', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      await database.bucketAlters.add({ alterId: a.id, hidden: false, addedAt: now.toISOString() });

      expect(await countAlterRecords(database, a.id)).toBe(0);
      expect(await deleteAlter(database, a.id)).toBe(true);
      expect(await database.bucketAlters.count()).toBe(0);
    });

    it('交代前の人格になっている人格も削除されない(SPEC.md 3.1)', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      await database.switchLogs.add({
        id: 'sw1',
        alterId: null,
        noticedAt: now.toISOString(),
        switchedAt: null,
        tagIds: [],
        fromAlterId: a.id,
        fromAlterSource: 'confirmed',
      });

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
    });

    it('服薬記録だけがある人格も削除されない', async () => {
      const a = await addAlter(database, { name: 'A', color: '#111111', categoryId: null }, now);
      await database.medicationIntakes.add({
        id: 'i1',
        medicationId: 'med-1',
        alterId: a.id,
        takenAt: now.toISOString(),
        timing: 'morning',
        deducted: 1,
        reason: '',
      });

      expect(await countAlterRecords(database, a.id)).toBe(1);
      expect(await deleteAlter(database, a.id)).toBe(false);
      expect(await database.alters.get(a.id)).toBeDefined();
    });
  });
});
