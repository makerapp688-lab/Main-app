import { useState, useEffect } from 'react';
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

/**
 * Keeps the rendered account synchronized with the server-validated session.
 * The server remains authoritative; localStorage is only an initialization hint.
 */
export function useUserData() {
  const [account, setAccount] = useState<UserAccount>(() => getCurrentAccount());
  const [userData, setUserData] = useState<UserData>(() => getUserData());

  useEffect(() => {
    let mounted = true;

    const update = () => {
      if (!mounted) return;
      const nextAccount = getCurrentAccount();
      setAccount(nextAccount);
      setUserData(getUserData(nextAccount.id));
    };

    const unsubscribe = subscribeUserStorage(update);
    update();

    // Revalidate persisted cookies/tokens after the app has mounted. A network
    // failure is not treated as logout; only an explicit server rejection is.
    syncWithServerSession()
      .then(() => update())
      .catch(() => {
        // Keep the existing state during transient startup/network failures.
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const isFavorite = (animeId: string) => userData.favorites.includes(animeId);
  const isWatchlist = (animeId: string) => userData.watchlist.includes(animeId);
  const isCompleted = (animeId: string) => userData.completed.includes(animeId);

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
    logout: logoutFromServer,
    isGuest: account.provider === 'guest'
  };
}
