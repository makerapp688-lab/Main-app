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
  logoutToGuest,
  syncWithServerSession
} from '../utils/userStorage.ts';

export function useUserData() {
  const [account, setAccount] = useState<UserAccount>(() => getCurrentAccount());
  const [userData, setUserData] = useState<UserData>(() => getUserData());

  useEffect(() => {
    const update = () => {
      setAccount(getCurrentAccount());
      setUserData(getUserData());
    };

    // Ensure state reflects immediate localStorage account
    update();

    // Re-verify session in background on app load to refresh server token and prevent silent guest reverts
    syncWithServerSession().then((syncedAcc) => {
      if (syncedAcc) {
        setAccount(syncedAcc);
        setUserData(getUserData());
      }
    });

    const unsubscribe = subscribeUserStorage(update);
    return () => unsubscribe();
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
    isFavorite,
    isWatchlist,
    isCompleted,
    toggleFavorite: toggleFavAction,
    toggleWatchlist: toggleWatchAction,
    toggleCompleted: toggleCompAction,
    addToHistory,
    clearHistory,
    setTheme: setThemeMode,
    logout: logoutToGuest,
    syncSession: reSyncSession,
    isGuest: account.provider === 'guest'
  };
}
