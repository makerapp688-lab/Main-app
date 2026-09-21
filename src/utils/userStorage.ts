import { UserAccount, UserData, ThemeMode } from '../types.ts';

export interface StoredAccountRecord extends UserAccount {
  passwordHash?: string;
  salt?: string;
  lastLoginAt: string;
}

const GUEST_ACCOUNT: UserAccount = {
  id: 'guest_user',
  username: 'AnimeExplorer',
  name: 'Guest Explorer',
  provider: 'guest',
  createdAt: '2025-01-01T00:00:00.000Z'
};

const DEFAULT_USER_DATA: UserData = {
  favorites: [],
  watchlist: [],
  completed: [],
  history: [],
  theme: 'dark'
};

export const STORAGE_KEYS = {
  CURRENT_SESSION: 'anivault_current_session',
  CURRENT_ACCOUNT: 'anivault_current_account',
  ACCOUNTS_DB: 'anivault_accounts_db',
  ACCOUNTS_LIST: 'anivault_accounts_list',
  GUEST_DATA: 'anivault_guest_data',
  USER_DATA_PREFIX: 'anivault_user_data_'
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (err) {
      console.error('Error notifying userStorage listener:', err);
    }
  });
}

export function subscribeUserStorage(callback: Listener): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Retrieve the accounts registry from persistent storage
 */
export function getAccountsDb(): Record<string, StoredAccountRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_DB);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse accounts db:', err);
  }
  return {};
}

function saveAccountsDb(db: Record<string, StoredAccountRecord>): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS_DB, JSON.stringify(db));
  } catch (err) {
    console.warn('Failed to save accounts db:', err);
  }
}

/**
 * Gets the current active account. Restores session before render.
 * Guarantees that refreshing or reopening the app keeps the user signed in.
 */
export function getCurrentAccount(): UserAccount {
  try {
    // 1. Check current session token/accountId
    const sessionRaw = localStorage.getItem(STORAGE_KEYS.CURRENT_SESSION);
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      if (session?.accountId && session.accountId !== 'guest_user') {
        const db = getAccountsDb();
        if (db[session.accountId]) {
          const rec = db[session.accountId];
          return {
            id: rec.id,
            username: rec.username || rec.name || 'AnimeExplorer',
            name: rec.name,
            email: rec.email,
            avatar: rec.avatar,
            provider: rec.provider,
            createdAt: rec.createdAt
          };
        }
      }
    }

    // 2. Check legacy current account key
    const raw = localStorage.getItem(STORAGE_KEYS.CURRENT_ACCOUNT);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id && parsed.id !== 'guest_user') {
        if (!parsed.username) {
          parsed.username = parsed.name || 'AnimeExplorer';
        }
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to get current account:', err);
  }

  return GUEST_ACCOUNT;
}

/**
 * Update the username and persist it permanently with the user's account
 */
export function updateUsername(newUsername: string): UserAccount {
  const current = getCurrentAccount();
  const trimmed = newUsername.trim() || 'AnimeExplorer';
  const updatedAccount: UserAccount = {
    ...current,
    username: trimmed
  };

  try {
    // Update active session and account
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(updatedAccount));

    // Update in Accounts DB
    if (current.id !== 'guest_user') {
      const db = getAccountsDb();
      if (db[current.id]) {
        db[current.id].username = trimmed;
        saveAccountsDb(db);
      }
    }

    // Update in saved accounts list
    const rawList = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    if (rawList) {
      const list: UserAccount[] = JSON.parse(rawList);
      const updatedList = list.map(a => (a.id === updatedAccount.id ? updatedAccount : a));
      localStorage.setItem(STORAGE_KEYS.ACCOUNTS_LIST, JSON.stringify(updatedList));
    }
  } catch (err) {
    console.warn('Failed to update username:', err);
  }

  notifyListeners();
  return updatedAccount;
}

/**
 * Retrieves isolated UserData for an account
 */
export function getUserData(accountId?: string): UserData {
  const currentId = accountId || getCurrentAccount().id;
  try {
    const key =
      currentId === 'guest_user'
        ? STORAGE_KEYS.GUEST_DATA
        : `${STORAGE_KEYS.USER_DATA_PREFIX}${currentId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
        completed: Array.isArray(parsed.completed) ? parsed.completed : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        theme: parsed.theme === 'light' || parsed.theme === 'system' ? parsed.theme : 'dark'
      };
    }
  } catch (err) {
    console.warn('Failed to load user data:', err);
  }
  return { ...DEFAULT_USER_DATA };
}

/**
 * Saves isolated UserData for an account
 */
export function saveUserData(data: UserData, accountId?: string): void {
  const currentId = accountId || getCurrentAccount().id;
  try {
    const key =
      currentId === 'guest_user'
        ? STORAGE_KEYS.GUEST_DATA
        : `${STORAGE_KEYS.USER_DATA_PREFIX}${currentId}`;
    localStorage.setItem(key, JSON.stringify(data));
    notifyListeners();
  } catch (err) {
    console.warn('Failed to save user data:', err);
  }
}

export function toggleFavorite(animeId: string): boolean {
  const data = getUserData();
  const exists = data.favorites.includes(animeId);
  const updatedFavorites = exists
    ? data.favorites.filter(id => id !== animeId)
    : [...data.favorites, animeId];
  saveUserData({ ...data, favorites: updatedFavorites });
  return !exists;
}

export function toggleWatchlist(animeId: string): boolean {
  const data = getUserData();
  const exists = data.watchlist.includes(animeId);
  const updatedWatchlist = exists
    ? data.watchlist.filter(id => id !== animeId)
    : [...data.watchlist, animeId];
  saveUserData({ ...data, watchlist: updatedWatchlist });
  return !exists;
}

export function toggleCompleted(animeId: string): boolean {
  const data = getUserData();
  const exists = data.completed.includes(animeId);
  const updatedCompleted = exists
    ? data.completed.filter(id => id !== animeId)
    : [...data.completed, animeId];
  saveUserData({ ...data, completed: updatedCompleted });
  return !exists;
}

export function addToHistory(animeId: string): void {
  const data = getUserData();
  const filtered = data.history.filter(h => h.animeId !== animeId);
  const updatedHistory = [{ animeId, timestamp: Date.now() }, ...filtered].slice(0, 30);
  saveUserData({ ...data, history: updatedHistory });
}

export function clearHistory(): void {
  const data = getUserData();
  saveUserData({ ...data, history: [] });
}

export function setThemeMode(theme: ThemeMode): void {
  const data = getUserData();
  saveUserData({ ...data, theme });
  applyThemeClass(theme);
}

let systemThemeMediaQuery: MediaQueryList | null = null;
let systemThemeHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function applyThemeClass(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;

  if (!systemThemeMediaQuery) {
    systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeHandler = () => {
      const currentTheme = getUserData().theme;
      if (currentTheme === 'system') {
        applyThemeClass('system');
      }
    };
    try {
      systemThemeMediaQuery.addEventListener('change', systemThemeHandler);
    } catch {
      systemThemeMediaQuery.addListener(systemThemeHandler);
    }
  }

  let isDark = true;
  if (theme === 'system') {
    isDark = systemThemeMediaQuery.matches;
  } else {
    isDark = theme === 'dark';
  }

  if (isDark) {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.classList.add('light');
    root.style.colorScheme = 'light';
  }
}

export function getGuestData(): UserData {
  return getUserData('guest_user');
}

export function hasGuestDataToMigrate(): boolean {
  const guestData = getGuestData();
  return (
    guestData.favorites.length > 0 ||
    guestData.watchlist.length > 0 ||
    guestData.completed.length > 0
  );
}

export function migrateGuestDataToAccount(targetAccountId: string): {
  favoritesCount: number;
  watchlistCount: number;
  completedCount: number;
} {
  const guestData = getGuestData();
  const targetData = getUserData(targetAccountId);

  const mergedFavorites = Array.from(new Set([...targetData.favorites, ...guestData.favorites]));
  const mergedWatchlist = Array.from(new Set([...targetData.watchlist, ...guestData.watchlist]));
  const mergedCompleted = Array.from(new Set([...targetData.completed, ...guestData.completed]));

  const historyMap = new Map<string, number>();
  for (const h of [...targetData.history, ...guestData.history]) {
    if (!historyMap.has(h.animeId) || historyMap.get(h.animeId)! < h.timestamp) {
      historyMap.set(h.animeId, h.timestamp);
    }
  }
  const mergedHistory = Array.from(historyMap.entries())
    .map(([animeId, timestamp]) => ({ animeId, timestamp }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 30);

  saveUserData(
    {
      ...targetData,
      favorites: mergedFavorites,
      watchlist: mergedWatchlist,
      completed: mergedCompleted,
      history: mergedHistory
    },
    targetAccountId
  );

  // Reset guest data after migration
  saveUserData({ ...DEFAULT_USER_DATA }, 'guest_user');

  return {
    favoritesCount: mergedFavorites.length,
    watchlistCount: mergedWatchlist.length,
    completedCount: mergedCompleted.length
  };
}

/**
 * Register or Sign In with Email & Password
 */
export function authenticateWithEmail(
  email: string,
  password?: string,
  customUsername?: string
): { success: boolean; account?: UserAccount; error?: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  const id = `user_${btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const db = getAccountsDb();
  const existing = db[id];

  if (existing) {
    // If account exists and password was set, verify password
    if (existing.passwordHash && password && existing.passwordHash !== password) {
      return { success: false, error: 'Incorrect password for this account.' };
    }

    // Update username if explicitly changed
    if (customUsername?.trim()) {
      existing.username = customUsername.trim();
    }
    existing.lastLoginAt = new Date().toISOString();
    db[id] = existing;
    saveAccountsDb(db);

    const userAcc: UserAccount = {
      id: existing.id,
      username: existing.username,
      name: existing.name,
      email: existing.email,
      provider: existing.provider,
      createdAt: existing.createdAt
    };

    saveSession(userAcc);
    return { success: true, account: userAcc };
  }

  // Create new account
  const defaultUsername = customUsername?.trim() || cleanEmail.split('@')[0] || 'AnimeExplorer';
  const newAccountRecord: StoredAccountRecord = {
    id,
    username: defaultUsername,
    name: cleanEmail.split('@')[0],
    email: cleanEmail,
    passwordHash: password || undefined,
    provider: 'email',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  db[id] = newAccountRecord;
  saveAccountsDb(db);

  const userAcc: UserAccount = {
    id: newAccountRecord.id,
    username: newAccountRecord.username,
    name: newAccountRecord.name,
    email: newAccountRecord.email,
    provider: newAccountRecord.provider,
    createdAt: newAccountRecord.createdAt
  };

  saveSession(userAcc);
  return { success: true, account: userAcc };
}

/**
 * Sign In with Verified 3P Provider (Google / Apple)
 */
export function authenticateWithProvider(
  provider: 'google' | 'apple',
  email: string,
  providerName: string,
  customUsername?: string
): { success: boolean; account: UserAccount } {
  const cleanEmail = email.trim().toLowerCase();
  const id = `${provider}_${btoa(cleanEmail).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
  const db = getAccountsDb();
  const existing = db[id];

  let chosenName = customUsername?.trim();
  if (!chosenName && existing?.username) {
    chosenName = existing.username;
  }
  if (!chosenName) {
    chosenName = cleanEmail.split('@')[0] || 'AnimeExplorer';
  }

  const accountRecord: StoredAccountRecord = {
    id,
    username: chosenName,
    name: providerName || (provider === 'google' ? 'Google User' : 'Apple User'),
    email: cleanEmail,
    provider,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };

  db[id] = accountRecord;
  saveAccountsDb(db);

  const userAcc: UserAccount = {
    id: accountRecord.id,
    username: accountRecord.username,
    name: accountRecord.name,
    email: accountRecord.email,
    provider: accountRecord.provider,
    createdAt: accountRecord.createdAt
  };

  saveSession(userAcc);
  return { success: true, account: userAcc };
}

/**
 * Save active session securely in localStorage
 */
function saveSession(account: UserAccount) {
  try {
    localStorage.setItem(
      STORAGE_KEYS.CURRENT_SESSION,
      JSON.stringify({
        accountId: account.id,
        timestamp: Date.now()
      })
    );
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(account));

    // Save in accounts list for account switcher
    const rawList = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    let list: UserAccount[] = [];
    if (rawList) {
      try {
        list = JSON.parse(rawList);
      } catch {
        list = [];
      }
    }
    const filtered = list.filter(a => a.id !== account.id);
    filtered.push(account);
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS_LIST, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to persist session:', err);
  }
  notifyListeners();
}

export function getSavedAccounts(): UserAccount[] {
  try {
    const db = getAccountsDb();
    const accounts = Object.values(db).map(r => ({
      id: r.id,
      username: r.username,
      name: r.name,
      email: r.email,
      avatar: r.avatar,
      provider: r.provider,
      createdAt: r.createdAt
    }));
    if (accounts.length > 0) return accounts;

    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS_LIST);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return [];
}

export function switchAccount(account: UserAccount): void {
  saveSession(account);
}

/**
 * Explicit logout ending the session and returning to Guest
 */
export function logoutToGuest(): void {
  try {
    localStorage.setItem(
      STORAGE_KEYS.CURRENT_SESSION,
      JSON.stringify({
        accountId: 'guest_user',
        timestamp: Date.now()
      })
    );
    localStorage.setItem(STORAGE_KEYS.CURRENT_ACCOUNT, JSON.stringify(GUEST_ACCOUNT));
  } catch (err) {
    console.warn('Failed to log out:', err);
  }
  notifyListeners();
}

/**
 * Set active session from server verified account
 */
export function setSessionAccount(account: UserAccount, sessionToken?: string): void {
  if (sessionToken) {
    try {
      localStorage.setItem('anivault_user_session_token', sessionToken);
    } catch {}
  }
  saveSession(account);
}

/**
 * Check and synchronize session with backend server
 */
export async function syncWithServerSession(): Promise<UserAccount | null> {
  try {
    const token = localStorage.getItem('anivault_user_session_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch('/api/auth/session', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        const serverAcc: UserAccount = {
          id: data.user.id,
          username: data.user.username,
          name: data.user.name || data.user.username,
          email: data.user.email,
          provider: data.user.provider,
          createdAt: data.user.createdAt
        };
        saveSession(serverAcc);
        return serverAcc;
      }
    }
  } catch (err) {
    console.warn('Failed to sync server session:', err);
  }
  return null;
}

/**
 * Terminate server session and local session
 */
export async function logoutFromServer(): Promise<void> {
  try {
    const token = localStorage.getItem('anivault_user_session_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    await fetch('/api/auth/logout', { method: 'POST', headers });
    localStorage.removeItem('anivault_user_session_token');
  } catch (err) {
    console.warn('Error during server logout:', err);
  }
  logoutToGuest();
}

// Backwards compatibility aliases
export const loginWithEmail = (email: string, customUsername?: string) =>
  authenticateWithEmail(email, undefined, customUsername).account!;

export const loginWithProvider = (
  provider: 'google' | 'apple',
  email: string,
  providerName: string,
  customUsername?: string
) => authenticateWithProvider(provider, email, providerName, customUsername).account;
