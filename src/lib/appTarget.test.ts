import { describe, expect, it } from 'vitest';
import { DB_NAME, IS_TEST_SITE, storageKey } from './appTarget';

// テストは本番のビルドと同じ設定(__TEST_SITE__ = false)で動く(vitest.config.ts)
describe('本番の保存の名前', () => {
  it('テスト版ではない', () => {
    expect(IS_TEST_SITE).toBe(false);
  });

  it('データベースの名前は以前のまま did-todo(変えると今のデータを読めなくなる)', () => {
    expect(DB_NAME).toBe('did-todo');
  });

  it('キー名の頭は hitotsuyane:', () => {
    expect(storageKey('example')).toBe('hitotsuyane:example');
  });
});
