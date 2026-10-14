// 更新のお知らせ(SPEC.md 18章)のフック。
// 新しい版が届いても自動では切り替えず(vite-plugin-pwa の prompt の形)、帯を出すための状態を返す。
// - アプリを開いたとき:サービスワーカー(オフライン用の仕組み)の登録のときに、新しい版がないか確かめる
// - 画面に戻ったとき・開いたままで30分たったとき:もう一度確かめる。「あとで」で閉じた帯は、画面に戻ったときにまた出す
// - 新しい版が待っているときは、同じサイトの version.json を読み、データの形が変わる更新かを決める
//
// 使っている部品(workbox-window)は、部品の準備ができる前にブラウザが新しい版を取り始めると、その合図を見落とす。
// そのあとは「新しい版が見つかった」合図が二度と出ないので、帯が出ないままになる(2026年10月、本番で起きた)。
// そのため、登録の状態(待っている版・取っている途中の版)をアプリ自身でも確かめる
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { DB_VERSION } from '../db/dbVersion';
import {
  parseVersionInfo,
  serviceWorkerUpdateState,
  UPDATE_CHECK_INTERVAL_MS,
  updateNoticeKind,
  VERSION_FILE_NAME,
  type UpdateNoticeKind,
} from '../lib/updateNotice';

/** サイトに置いてある新しい版の情報を読む。読めなければ null(オフラインなど) */
async function fetchLatestVersionInfo() {
  try {
    // 同じサイトのファイルだけを読む(外のサイトとは通信しない)。いつも最新を読むよう、保存されたものは使わない
    const response = await fetch(`${import.meta.env.BASE_URL}${VERSION_FILE_NAME}`, { cache: 'no-store' });
    return response.ok ? parseVersionInfo(await response.json()) : null;
  } catch {
    return null;
  }
}

export interface UpdateNotice {
  /** 帯を出すか */
  visible: boolean;
  kind: UpdateNoticeKind;
  /** 「更新する」:新しい版に切り替える(アプリが読み込み直される) */
  update: () => void;
  /** 「あとで」:帯を閉じる(画面に戻ったとき・次に開いたときに、また出す) */
  dismiss: () => void;
}

export function useUpdateNotice(): UpdateNotice {
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  // 取り終わるのを見届けている途中の版(同じ版に何度も見張りを付けないため)
  const watchedRef = useRef(new WeakSet<ServiceWorker>());
  // 帯を出す(部品の合図と、アプリ自身の確認のどちらからでも呼ぶ)
  const setNeedRefreshRef = useRef<(value: boolean) => void>(() => {});

  /** 登録の状態を確かめ、新しい版が待っていれば帯を出す。取っている途中なら、取り終わるのを見届ける */
  const checkRegistration = useCallback((registration: ServiceWorkerRegistration) => {
    const state = serviceWorkerUpdateState({
      hasActive: registration.active !== null,
      hasWaiting: registration.waiting !== null,
      hasInstalling: registration.installing !== null,
    });
    if (state === 'waiting') {
      setNeedRefreshRef.current(true);
      return;
    }
    const installing = registration.installing;
    if (state === 'installing' && installing && !watchedRef.current.has(installing)) {
      watchedRef.current.add(installing);
      installing.addEventListener('statechange', () => checkRegistration(registration));
    }
  }, []);

  /** サイトの sw.js を確かめてから、登録の状態を確かめる */
  const checkForUpdate = useCallback(() => {
    const registration = registrationRef.current;
    if (!registration) {
      return;
    }
    registration
      .update()
      .catch((error: unknown) => {
        console.error('新しい版の確認に失敗しました', error);
      })
      .finally(() => checkRegistration(registration));
  }, [checkRegistration]);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration ?? null;
      if (registration) {
        // これから見つかる新しい版も、部品とは別に見届ける
        registration.addEventListener('updatefound', () => checkRegistration(registration));
        // 登録した時点で、すでに待っている版・取っている途中の版があるか
        checkRegistration(registration);
      }
    },
    onRegisterError(error: unknown) {
      console.error('オフライン用の仕組みの登録に失敗しました', error);
    },
  });
  setNeedRefreshRef.current = setNeedRefresh;
  const [dismissed, setDismissed] = useState(false);
  const [kind, setKind] = useState<UpdateNoticeKind>('normal');
  // 画面に戻った回数(戻るたびに version.json を読み直すため)
  const [visibleCount, setVisibleCount] = useState(0);

  // 画面に戻ったら、新しい版がないか確かめ、閉じた帯もまた出す
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      setDismissed(false);
      setVisibleCount((count) => count + 1);
      checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [checkForUpdate]);

  // 開いたままのときも、ときどき確かめる(画面に出ていないときは確かめない)
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    }, UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkForUpdate]);

  // 新しい版が待っているときは、データの形が変わる更新かを確かめる
  useEffect(() => {
    if (!needRefresh) {
      return;
    }
    let cancelled = false;
    void fetchLatestVersionInfo().then((latest) => {
      if (!cancelled) {
        setKind(updateNoticeKind(DB_VERSION, latest));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needRefresh, visibleCount]);

  return {
    visible: needRefresh && !dismissed,
    kind,
    update: () => {
      // 新しい版に切り替わったら、必ず読み込み直す
      // (部品も読み込み直すが、部品が合図を見落としたときは読み込み直さないため)
      navigator.serviceWorker?.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      void updateServiceWorker(true);
    },
    dismiss: () => setDismissed(true),
  };
}
