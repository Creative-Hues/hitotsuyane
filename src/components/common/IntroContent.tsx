// 「はじめに」の中身(SPEC.md 14章⑤)。「はじめに」の画面と「このアプリについて」で同じものを出す
import { useState } from 'react';
import { useTerm } from '../../hooks/useTerm';
import { APP_NAME, DATA_NOTICES, MEDICAL_NOTICE } from '../../lib/about';
import { installGuideKind, installGuideText, readDeviceInfo } from '../../lib/install';

/** 主な機能のかんたんな紹介 */
const FEATURES: readonly string[] = [
  'ToDo・服薬・受診メモ・いつかやりたいこと(バケット)を、人格どうしで共有して記録できます。',
  '誰がいつやったかが残るので、ほかの人格がもうやったかがわかります。',
  '交代に気づいたら、右下の「変わったことに気づいた」ボタンで記録できます。',
];

export function IntroContent() {
  const { t } = useTerm();
  // 端末の情報は1回だけ読む
  const [guide] = useState(() => installGuideKind(readDeviceInfo()));

  return (
    <>
      <section className="settings-section about">
        <h2>{APP_NAME}でできること</h2>
        <ul className="about-list">
          {FEATURES.map((text) => (
            <li key={text}>{t(text)}</li>
          ))}
        </ul>
      </section>
      <section className="settings-section about">
        <h2>データの扱い</h2>
        <ul className="about-list">
          {DATA_NOTICES.map((text) => (
            <li key={text}>{t(text)}</li>
          ))}
        </ul>
      </section>
      <section className="settings-section about">
        <h2>医療のアプリではありません</h2>
        <p>{MEDICAL_NOTICE}</p>
      </section>
      {guide !== 'none' && (
        <section className="settings-section about">
          <h2>ホーム画面に追加する</h2>
          <p>{installGuideText(guide)}</p>
        </section>
      )}
      <section className="settings-section about">
        <h2>最初にやること</h2>
        <p>{t('「人格」タブの「＋ 人格を追加」で、人格を登録してください。')}</p>
      </section>
    </>
  );
}
