import { useState, useEffect, useCallback } from 'react';
import { UserAccount, UserData } from '../types.ts';
import {
  getCurrentAccount,
  getUserData,
  subscribeUserStorage,
  toggleFavorite as toggleFavAction,
  toggleWatchlist as toggleWatchAction,
  toggleCompleted as toggleCompAction,
  setThemeMode,
  addToHistory,
  clearHistory,
  logoutFromServer,
  syncWithServerSession
} from '../utils/userStorage.ts';

export function useUserData() {
  const [account, setAccount] = useState<UserAccount>(() => getCurrentAccount());
  const [userData, setUserData] = useState<UserData>(() => getUserData());
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    const update = () => {
      const acc = getCurrentAccount();
      setAccount(acc);
      setUserData(getUserData());
    };

    // Synchronize and verify session with backend server on startup
    syncWithServerSession().then((syncedAcc) => {
      if (!mounted) return;
      if (syncedAcc) {
        setAccount(syncedAcc);
        setUserData(getUserData());
      } else {
        const fallback = getCurrentAccount();
        setAccount(fallback);
        setUserData(getUserData());
      }
      setAuthLoading(false);
    }).catch((err) => {
      console.warn('[useUserData] Session sync warning:', err);
      if (mounted) setAuthLoading(false);
    });

    const unsubscribe = subscribeUserStorage(update);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const isFavorite = (animeId: string) => userData.favorites.includes(animeId);
  const isWatchlist = (animeId: string) => userData.watchlist.includes(animeId);
  const isCompleted = (animeId: string) => userData.completed.includes(animeId);

  const reSyncSession = useCallback(async () => {
    const synced = await syncWithServerSession();
    if (synced) {
      setAccount(synced);
      setUserData(getUserData());
    }
    return synced;
  }, []);

  return {
    account,
    userData,
    authLoading,
    isFavorite,
    isWatchlist,
    isCompleted,
    toggleFavorite: toggleFavAction,
    toggleWatchlist: toggleWatchAction,
    toggleCompleted: toggleCompAction,
    addToHistory,
    clearHistory,
    setTheme: setThemeMode,
    logout: logoutFromServer,
    syncSession: reSyncSession,
    isGuest: account.provider === 'guest'
  };
}
