// テスト版の帯(SPEC.md 21章)。テスト版のときだけ、画面の一番上にいつも出す
// 本番のビルドでは App の IS_TEST_SITE の分かれ道ごと消えるので、この部品も文字も入らない
export function TestSiteBanner() {
  return (
    <div className="test-site-banner" role="note">
      <strong>テスト版</strong>
      <span className="test-site-banner__note">本番とは別のデータです</span>
    </div>
  );
}
