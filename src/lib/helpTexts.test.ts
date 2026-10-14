import { describe, expect, it } from 'vitest';
import { DATA_NOTICES, MEDICAL_NOTICE } from './about';
import { HELP_TEXTS, type HelpKey } from './helpTexts';
import { withTerm } from './term';

const KEYS: readonly HelpKey[] = ['todo', 'bucket', 'medication', 'clinic', 'clinicView', 'switch', 'board', 'alters'];

describe('各画面のヘルプ(SPEC.md 23章)', () => {
  it('すべての画面にヘルプがあり、見出しは「○○の使い方」、項目は3〜5個', () => {
    expect(Object.keys(HELP_TEXTS).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      const help = HELP_TEXTS[key];
      expect(help.title, key).toMatch(/の使い方$/);
      expect(help.items.length, key).toBeGreaterThanOrEqual(3);
      expect(help.items.length, key).toBeLessThanOrEqual(5);
      expect(help.items.every((item) => item.trim() !== ''), key).toBe(true);
    }
  });

  it('治療の2画面には、医療のアプリではないことと、データは端末の中だけにあることが入っている', () => {
    expect(HELP_TEXTS.medication.items).toContain(MEDICAL_NOTICE);
    expect(HELP_TEXTS.medication.items).toContain(DATA_NOTICES[0]);
    const clinic = HELP_TEXTS.clinic.items.join('');
    expect(clinic).toContain('判断はしません');
    expect(clinic).toContain('この端末の中だけ');
  });

  it('呼び方を変えると、「人格」が置き換わる', () => {
    expect(withTerm(HELP_TEXTS.alters.title, 'メンバー')).toBe('メンバーについての使い方');
    expect(withTerm(HELP_TEXTS.todo.items[0], 'メンバー')).toContain('やったメンバーを選んで');
  });
});
