// 移行前のバックアップ(SPEC.md 18.4)を保存できなかったときの画面。
// データベースの版は上げていないので、データは古い形のまま残っている
export function StartupErrorScreen() {
  return (
    <main className="app">
      <h1>データの準備ができませんでした</h1>
      <p className="empty">データは前の形のまま残っています。アプリを完全に閉じてから、もう一度開いてください。</p>
    </main>
  );
}
