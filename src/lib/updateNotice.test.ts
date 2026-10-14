import { describe, expect, it } from 'vitest';
import {
  buildVersionInfo,
  parseVersionInfo,
  serviceWorkerUpdateState,
  updateNoticeKind,
  updateNoticeText,
} from './updateNotice';

describe('新しい版の情報(version.json。SPEC.md 18.3)', () => {
  it('作った中身は、そのまま読み取れる', () => {
    const info = buildVersionInfo(7);
    expect(parseVersionInfo(JSON.parse(JSON.stringify(info)))).toEqual({ dbVersion: 7 });
  });

  it('形が正しくなければ null(知らない項目は捨てる)', () => {
    expect(parseVersionInfo({ dbVersion: 7, extra: 'x' })).toEqual({ dbVersion: 7 });
    expect(parseVersionInfo(null)).toBeNull();
    expect(parseVersionInfo('7')).toBeNull();
    expect(parseVersionInfo({})).toBeNull();
    expect(parseVersionInfo({ dbVersion: '7' })).toBeNull();
    expect(parseVersionInfo({ dbVersion: 6.5 })).toBeNull();
    expect(parseVersionInfo({ dbVersion: 0 })).toBeNull();
  });
});

describe('お知らせの種類(SPEC.md 18.2・18.3)', () => {
  it('新しい版のデータベースの版が大きいときだけ、強めのお知らせ', () => {
    expect(updateNoticeKind(6, { dbVersion: 7 })).toBe('dataChange');
    expect(updateNoticeKind(6, { dbVersion: 6 })).toBe('normal');
    // ふつうは起きないが、小さくても強めにはしない
    expect(updateNoticeKind(6, { dbVersion: 5 })).toBe('normal');
  });

  it('新しい版の情報が読めなかったときは、ふつうのお知らせ', () => {
    expect(updateNoticeKind(6, null)).toBe('normal');
  });

  it('文は種類ごとに決まっている', () => {
    expect(updateNoticeText('normal')).toBe('新しい版があります。更新の前に、バックアップの書き出しをおすすめします。');
    expect(updateNoticeText('dataChange')).toBe(
      '今回の更新では、データの形が変わります。必ずバックアップを書き出してから更新してください。',
    );
  });
});

describe('新しい版の状態(SPEC.md 18.2)', () => {
  it('今動いている版があり、取り終えた新しい版が待っていれば waiting', () => {
    expect(serviceWorkerUpdateState({ hasActive: true, hasWaiting: true, hasInstalling: false })).toBe('waiting');
    // 待っている版のあとに、さらに新しい版を取っている途中でも、待っている版があれば帯を出す
    expect(serviceWorkerUpdateState({ hasActive: true, hasWaiting: true, hasInstalling: true })).toBe('waiting');
  });

  it('新しい版を取っている途中なら installing', () => {
    expect(serviceWorkerUpdateState({ hasActive: true, hasWaiting: false, hasInstalling: true })).toBe('installing');
  });

  it('新しい版がなければ none', () => {
    expect(serviceWorkerUpdateState({ hasActive: true, hasWaiting: false, hasInstalling: false })).toBe('none');
  });

  it('今動いている版がないとき(初めて入れたとき)は、新しい版とみなさない', () => {
    expect(serviceWorkerUpdateState({ hasActive: false, hasWaiting: true, hasInstalling: false })).toBe('none');
    expect(serviceWorkerUpdateState({ hasActive: false, hasWaiting: false, hasInstalling: true })).toBe('none');
  });
});
