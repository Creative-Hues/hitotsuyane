import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { prepareDatabase } from './db/beforeUpdate';
import { TermProvider } from './hooks/useTerm';
import { StartupErrorScreen } from './screens/StartupErrorScreen';
import { runStartup } from './startup';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root が見つかりません');
}
const root = createRoot(rootElement);

// データベースの版を上げる前に、今のデータを写しておく(SPEC.md 18.4)。
// 写し終わるまでは、アプリのデータベースに触れない(画面を出すと、データベースが開いて版が上がるため)
prepareDatabase(new Date())
  .then(() => {
    // 起動時の処理(失敗しても画面は表示する)
    runStartup(new Date()).catch((error: unknown) => {
      console.error('起動時の処理に失敗しました', error);
    });
    root.render(
      <StrictMode>
        {/* 「人格」の呼び方を、どの画面からでも使えるようにする(SPEC.md 14章③) */}
        <TermProvider>
          <App />
        </TermProvider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // 写しを保存できなかったときは、版を上げずに止める(データは古い形のまま残る)
    console.error('移行前のバックアップを保存できませんでした', error);
    root.render(
      <StrictMode>
        <StartupErrorScreen />
      </StrictMode>,
    );
  });
